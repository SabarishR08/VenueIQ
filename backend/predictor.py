import math
import time
from collections import deque
from typing import Any, Dict, List

import numpy as np

# These act as baseline capacities when NOT congested (users per minute)
CAPACITY_PER_MIN = {
    "Gate A": 12,
    "Gate B": 15,
    "Gate C": 12,
    "Gate D": 10,
    "Food Court": 20,
    "Exit": 25,
    "Seating": 500,
}

PHASE_THROUGHPUT = {
    "ENTRY": 52.0,
    "MID_GAME": 46.0,
    "HALFTIME": 34.0,
    "EXIT": 48.0,
}

MODEL_NAME = "Rolling trend predictor"
ZONE_HISTORY = deque(maxlen=60)

def get_utilization(zone: str, wait_time: float) -> float:
    """Return a normalized load score for UI display.

    The raw crowd-to-capacity ratio can exceed 1000% in queue-heavy scenes,
    so the dashboard shows load pressure scaled against a 15-minute critical
    threshold instead of raw queue length.
    """

    if zone == "Seating":
        return 0.0
    return round(min(100.0, (wait_time / 15.0) * 100.0), 1)

def predict_wait_times(zone_counts: Dict[str, int]) -> Dict[str, float]:
    """Estimate wait times with wait_time = queue_length / throughput_rate."""
    wait_times = {}
    for zone, crowd in zone_counts.items():
        wait_times[zone] = estimate_wait_from_count(zone, crowd)
    return wait_times


def estimate_wait_from_count(zone: str, crowd: int) -> float:
    if zone == "Seating":
        return 0.0

    base_capacity = CAPACITY_PER_MIN.get(zone, 20)
    throughput = float(base_capacity)

    # Throughput degradation due to extreme congestion
    if crowd > base_capacity * 4:
        throughput *= 0.6
    elif crowd > base_capacity * 2:
        throughput *= 0.8

    throughput = max(1.0, throughput)
    return round(crowd / throughput, 2)


def forecast_wait_times(wait_times: Dict[str, float], trends: Dict[str, float], horizon_minutes: int = 5) -> Dict[str, float]:
    forecast: Dict[str, float] = {}
    for zone, wait in wait_times.items():
        drift = trends.get(zone, 0.0)
        if zone == "Seating":
            forecast[zone] = 0.0
        else:
            forecast[zone] = round(max(0.0, wait + (drift * horizon_minutes)), 2)
    return forecast


def forecast_from_history(zone_counts: Dict[str, int], history: List[Dict[str, Any]], horizon_minutes: int = 5) -> Dict[str, float]:
    """Forecast wait times using a rolling linear trend over recent history."""

    if not history:
        return predict_wait_times(zone_counts)

    forecast: Dict[str, float] = {}
    for zone, current_count in zone_counts.items():
        if zone == "Seating":
            forecast[zone] = 0.0
            continue

        recent_points = [
            int(snapshot.get("counts", {}).get(zone, current_count))
            for snapshot in history[-10:]
        ]

        if len(recent_points) < 2:
            forecast[zone] = estimate_wait_from_count(zone, current_count)
            continue

        x_values = list(range(len(recent_points)))
        x_mean = sum(x_values) / len(x_values)
        y_mean = sum(recent_points) / len(recent_points)

        numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, recent_points))
        denominator = sum((x - x_mean) ** 2 for x in x_values) or 1.0
        slope = numerator / denominator

        projected_count = max(0.0, current_count + (slope * horizon_minutes))
        forecast[zone] = estimate_wait_from_count(zone, int(round(projected_count)))

    return forecast


def record_snapshot(tick: int, counts: Dict[str, int], waits: Dict[str, float]) -> None:
    ZONE_HISTORY.append(
        {
            "tick": tick,
            "counts": dict(counts),
            "waits": dict(waits),
            "timestamp": time.time(),
        }
    )


def predict_future(zone: str, minutes_ahead: int = 5) -> Dict[str, Any]:
    relevant = [snapshot for snapshot in list(ZONE_HISTORY)[-10:] if zone in snapshot.get("waits", {})]
    if len(relevant) < 3:
        return {
            "zone": zone,
            "predicted_wait": None,
            "confidence": "low",
            "trend": "insufficient_data",
            "slope": 0.0,
            "minutes_ahead": minutes_ahead,
        }

    x = np.array([snapshot["tick"] for snapshot in relevant], dtype=float)
    y = np.array([snapshot["waits"].get(zone, 0.0) for snapshot in relevant], dtype=float)
    slope, intercept = np.polyfit(x, y, 1)
    fitted = slope * x + intercept
    ss_res = float(np.sum((y - fitted) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2)) or 1.0
    r_squared = 1.0 - (ss_res / ss_tot)

    confidence = "high" if r_squared > 0.7 else "medium" if r_squared > 0.4 else "low"
    future_tick = x[-1] + (minutes_ahead * 50)
    predicted = max(0.0, float(slope * future_tick + intercept))

    trend = "rising" if slope > 0.05 else "falling" if slope < -0.05 else "stable"

    return {
        "zone": zone,
        "predicted_wait": round(predicted, 2),
        "slope": round(float(slope), 4),
        "confidence": confidence,
        "minutes_ahead": minutes_ahead,
        "trend": trend,
    }


def get_history(limit: int = 50) -> List[Dict[str, Any]]:
    if limit <= 0:
        return []
    return list(ZONE_HISTORY)[-limit:]


def estimate_throughput(phase: str) -> float:
    return PHASE_THROUGHPUT.get(phase, 42.0)

def compute_trends(current_waits: Dict[str, float], previous_waits: Dict[str, float] | None) -> Dict[str, float]:
    trends: Dict[str, float] = {}
    if not previous_waits:
        return {k: 0.0 for k in current_waits.keys()}

    for zone, now in current_waits.items():
        before = previous_waits.get(zone, now)
        # Smoothing trend slightly
        trends[zone] = round((now - before), 2)
    return trends

def build_kpis(wait_times: Dict[str, float], alerts: List[Dict[str, Any]], throughput: float) -> Dict[str, Any]:
    valid_waits = {k: v for k, v in wait_times.items() if k != "Seating"}
    avg_wait = round(sum(valid_waits.values()) / max(1, len(valid_waits)), 2)
    
    max_zone = max(valid_waits, key=valid_waits.get) if valid_waits else "None"
    
    if any(a.get("severity") == "RED" for a in alerts):
        status = "Critical"
    elif any(a.get("severity") == "YELLOW" for a in alerts):
        status = "Moderate"
    else:
        status = "Stable"

    return {
        "avg_wait_min": avg_wait,
        "max_congestion_zone": max_zone,
        "throughput": round(throughput, 1),
        "system_status": status,
    }

def generate_suggestions(zone_counts: Dict[str, int], wait_times: Dict[str, float], trends: Dict[str, float] | None = None) -> Dict[str, Any]:
    gate_names = ["Gate A", "Gate B", "Gate C", "Gate D"]
    gate_times = {k: wait_times.get(k, 0.0) for k in gate_names}

    best_gate = min(gate_times, key=gate_times.get)
    worst_gate = max(gate_times, key=gate_times.get)
    spread = round(gate_times[worst_gate] - gate_times[best_gate], 2)

    trend_map = trends or {k: 0.0 for k in wait_times.keys()}
    
    worst_gate_util = get_utilization(worst_gate, gate_times[worst_gate])
    best_gate_util = get_utilization(best_gate, gate_times[best_gate])
    worst_trend = trend_map.get(worst_gate, 0.0)
    trend_pct = round((worst_trend / max(1.0, wait_times[worst_gate])) * 100) if wait_times[worst_gate] > 0 else 0

    decision = {
        "decision": f"Redirect traffic from {worst_gate} to {best_gate}",
        "impact": {
            "time_saved_per_user": spread,
            "affected_users": zone_counts.get(worst_gate, 0),
            "total_time_saved": f"{round((spread * zone_counts.get(worst_gate, 0))/60, 1)} hours"
        },
        "reasoning": [
            f"{worst_gate} operating at {worst_gate_util}% capacity",
            f"Queue growth rate {trend_pct}% in last minute",
            f"{best_gate} underutilized at {best_gate_util}%"
        ],
        "confidence": "High" if spread > 3 else "Medium"
    }

    alerts: List[Dict[str, str]] = []
    
    for zone, wait in wait_times.items():
        if zone == "Seating":
            continue
            
        util = get_utilization(zone, zone_counts.get(zone, 0))
        
        if wait >= 15.0:
            fallback = best_gate if zone in gate_names and best_gate != zone else "Alternate Zone"
            action = f"Open auxiliary lanes + reroute via {fallback}" if zone in gate_names else "Deploy overflow management"
            alerts.append({
                "severity": "RED",
                "zone": zone,
                "issue": "Critical congestion detected",
                "action": action,
                "eta": f"{math.ceil(wait * 0.4)} mins"
            })
        elif wait >= 10.0:
            alerts.append({
                "severity": "YELLOW",
                "zone": zone,
                "issue": "Elevated queue length",
                "action": "Meter incoming lanes and monitor",
                "eta": f"{math.ceil(wait * 0.6)} mins"
            })

    if not alerts:
        alerts.append({
            "severity": "GREEN",
            "zone": "All Zones",
            "issue": "Operations normal",
            "action": "Continue standard monitoring",
            "eta": "N/A"
        })

    return {
        "decision": decision,
        "alerts": alerts,
    }

def get_utilizations(wait_times: Dict[str, float]) -> Dict[str, float]:
    return {z: get_utilization(z, float(w)) for z, w in wait_times.items() if z != "Seating"}


def badge_from_load(wait_times: Dict[str, float]) -> str:
    if not wait_times:
        return "Stable"
    peak = max(wait_times.values())
    if peak >= 15:
        return "Critical"
    if peak >= 10:
        return "Moderate"
    return "Stable"
