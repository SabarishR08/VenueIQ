from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

try:
    from .ingest import IngestPayload, KNOWN_ZONES, LIVE_COUNTS, apply_overrides, clear_stale_overrides, status_payload
    from .predictor import (
        build_kpis,
        compute_trends,
        estimate_throughput,
        forecast_from_history,
        get_history,
        get_utilizations,
        predict_future,
        predict_wait_times,
        record_snapshot,
        generate_suggestions,
    )
    from .simulation import CrowdSimulation
    from .staff import acknowledge_alert, create_alert, get_active_alerts, get_escalated_alerts, resolve_alert
    from .venue_config import VENUE_PRESETS, get_venue
except ImportError:
    from ingest import IngestPayload, KNOWN_ZONES, LIVE_COUNTS, apply_overrides, clear_stale_overrides, status_payload
    from predictor import (
        build_kpis,
        compute_trends,
        estimate_throughput,
        forecast_from_history,
        get_history,
        get_utilizations,
        predict_future,
        predict_wait_times,
        record_snapshot,
        generate_suggestions,
    )
    from simulation import CrowdSimulation
    from staff import acknowledge_alert, create_alert, get_active_alerts, get_escalated_alerts, resolve_alert
    from venue_config import VENUE_PRESETS, get_venue


app = Flask(__name__)

CURRENT_VENUE = "stadium_a"
_venue = get_venue(CURRENT_VENUE)
sim = CrowdSimulation(
    user_count=_venue["user_count"],
    zones=_venue["zones"],
    grid_width=_venue["grid"]["width"],
    grid_height=_venue["grid"]["height"],
)
previous_waits = None
FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/attendee")
def attendee_view():
    return send_from_directory(FRONTEND_DIR, "attendee.html")


@app.get("/<path:path>")
def static_assets(path: str):
    asset = FRONTEND_DIR / path
    if asset.exists() and asset.is_file():
        return send_from_directory(FRONTEND_DIR, path)
    return jsonify({"error": "Not found"}), 404


@app.get("/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/ingest")
def ingest():
    payload = request.get_json(silent=True) or {}
    zone = str(payload.get("zone", "")).strip()
    if zone not in KNOWN_ZONES:
        return jsonify({"error": f"Unknown zone: {zone}"}), 400

    try:
        ingest_payload = IngestPayload(
            zone=zone,
            count=int(payload.get("count", 0)),
            source=str(payload.get("source", "camera_feed")),
            timestamp=float(payload.get("timestamp")) if payload.get("timestamp") is not None else None,
        )
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid ingest payload"}), 400

    LIVE_COUNTS[zone] = {
        "count": ingest_payload.count,
        "source": ingest_payload.source,
        "timestamp": ingest_payload.timestamp,
    }
    return jsonify({"status": "accepted", "zone": zone, "count": ingest_payload.count, "source": ingest_payload.source})


@app.get("/ingest/status")
def ingest_status():
    return jsonify({"feeds": status_payload()})


@app.post("/venues/switch")
def switch_venue():
    global sim, CURRENT_VENUE, previous_waits
    payload = request.get_json(silent=True) or {}
    venue_name = str(payload.get("venue", "")).strip()
    venue = get_venue(venue_name)
    if not venue:
        return jsonify({"error": f"Unknown venue: {venue_name}"}), 400

    CURRENT_VENUE = venue_name
    previous_waits = None
    sim = CrowdSimulation(
        user_count=venue["user_count"],
        zones=venue["zones"],
        grid_width=venue["grid"]["width"],
        grid_height=venue["grid"]["height"],
    )
    return jsonify({"venue": venue_name, **venue})


@app.get("/venues")
def venues():
    return jsonify(
        {
            "current": CURRENT_VENUE,
            "venues": [{"key": key, "name": value["name"]} for key, value in VENUE_PRESETS.items()],
        }
    )


@app.get("/simulate")
def simulate_step():
    state = sim.tick()
    return jsonify(state)


@app.get("/scenario")
def scenario():
    auto_flag = request.args.get("auto")
    if auto_flag is not None:
        enabled = auto_flag.lower() in ("1", "true", "yes", "on")
        sim.set_auto_phase(enabled)

    phase = request.args.get("phase")
    if not phase:
        return jsonify({"phase": sim.phase, "auto_phase": sim.auto_phase, "allowed": ["ENTRY", "MID_GAME", "HALFTIME", "EXIT"]})

    try:
        updated = sim.set_phase(phase)
        return jsonify({"phase": updated, "auto_phase": sim.auto_phase, "allowed": ["ENTRY", "MID_GAME", "HALFTIME", "EXIT"]})
    except ValueError as exc:
        return jsonify({"error": str(exc), "auto_phase": sim.auto_phase, "allowed": ["ENTRY", "MID_GAME", "HALFTIME", "EXIT"]}), 400


@app.get("/heatmap")
def heatmap():
    return jsonify(sim.heatmap())


@app.get("/predict")
def predict():
    global previous_waits
    clear_stale_overrides()
    counts = apply_overrides(sim.fused_zone_counts())
    waits = predict_wait_times(counts)
    trend_map = compute_trends(waits, previous_waits)
    previous_waits = waits
    utils = get_utilizations(waits)
    forecast = forecast_from_history(counts, list(sim.history), horizon_minutes=5)
    record_snapshot(sim.tick_count, counts, waits)

    return jsonify(
        {
            "zone_counts": counts,
            "wait_times": waits,
            "trends": trend_map,
            "utilizations": utils,
            "forecast_wait_times": forecast,
            "model": "Rolling trend predictor",
            "phase": sim.phase,
        }
    )


@app.get("/forecast")
def forecast():
    counts = apply_overrides(sim.fused_zone_counts())
    return jsonify(
        {
            "phase": sim.phase,
            "forecast_wait_times": forecast_from_history(counts, list(sim.history), horizon_minutes=5),
            "model": "Rolling trend predictor",
        }
    )


@app.get("/suggest")
def suggest():
    counts = apply_overrides(sim.fused_zone_counts())
    waits = predict_wait_times(counts)
    trend_map = compute_trends(waits, previous_waits)
    suggestions_data = generate_suggestions(counts, waits, trend_map)

    persisted_alerts = []
    for alert in suggestions_data["alerts"]:
        created = create_alert(alert["zone"], alert["severity"], f"{alert['issue']} | {alert['action']}")
        alert_payload = created.__dict__.copy()
        alert_payload.update({"issue": alert["issue"], "action": alert["action"], "eta": alert["eta"]})
        persisted_alerts.append(alert_payload)

    return jsonify(
        {
            "phase": sim.phase,
            "decision": suggestions_data["decision"],
            "alerts": persisted_alerts,
        }
    )


@app.get("/kpi")
def kpi():
    counts = apply_overrides(sim.fused_zone_counts())
    waits = predict_wait_times(counts)
    trend_map = compute_trends(waits, previous_waits)
    suggestions_data = generate_suggestions(counts, waits, trend_map)
    kpis = build_kpis(waits, suggestions_data["alerts"], estimate_throughput(sim.phase))
    return jsonify({"phase": sim.phase, **kpis})


@app.get("/history")
def history():
    limit = int(request.args.get("limit", 50))
    snapshots = get_history(limit)
    return jsonify(
        {
            "snapshots": snapshots,
            "count": len(snapshots),
            "phase": sim.phase,
            "auto_phase": sim.auto_phase,
            "sensor_sources": list(sim.sensor_feed.values()),
        }
    )


@app.get("/predict/future")
def predict_future_route():
    zone = request.args.get("zone", "").strip()
    minutes = int(request.args.get("minutes", 5))
    counts = apply_overrides(sim.fused_zone_counts())
    waits = predict_wait_times(counts)
    current_wait = waits.get(zone, 0.0)
    forecast = predict_future(zone, minutes)
    return jsonify(
        {
            "zone": zone,
            "current_wait": current_wait,
            **forecast,
        }
    )


@app.get("/staff/alerts")
def staff_alerts():
    return jsonify([alert.__dict__ for alert in get_active_alerts()])


@app.post("/staff/alerts/ack")
def staff_ack():
    payload = request.get_json(silent=True) or {}
    alert = acknowledge_alert(str(payload.get("alert_id", "")), str(payload.get("staff_name", "")))
    if not alert:
        return jsonify({"error": "Alert not found"}), 404
    return jsonify(alert.__dict__)


@app.post("/staff/alerts/resolve")
def staff_resolve():
    payload = request.get_json(silent=True) or {}
    alert = resolve_alert(str(payload.get("alert_id", "")))
    if not alert:
        return jsonify({"error": "Alert not found"}), 404
    return jsonify(alert.__dict__)


@app.get("/staff/alerts/escalated")
def staff_escalated():
    return jsonify([alert.__dict__ for alert in get_escalated_alerts()])


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
