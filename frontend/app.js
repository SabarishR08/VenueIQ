const API_BASE = window.location.protocol.startsWith("http")
  ? window.location.origin
  : "http://127.0.0.1:8080";

// DOM Elements
const canvas = document.getElementById("stadiumCanvas");
const ctx = canvas.getContext("2d");
const phaseSelect = document.getElementById("phaseSelect");
const venueSelect = document.getElementById("venueSelect");
const autoPhaseToggle = document.getElementById("autoPhaseToggle");
const ingestZone = document.getElementById("ingestZone");
const ingestCount = document.getElementById("ingestCount");
const ingestSource = document.getElementById("ingestSource");
const ingestBtn = document.getElementById("ingestBtn");
const clearFeedsBtn = document.getElementById("clearFeedsBtn");
const ingestStatus = document.getElementById("ingestStatus");
const ingestFeedList = document.getElementById("ingestFeedList");
const flashDealZone = document.getElementById("flashDealZone");
const flashDealDiscount = document.getElementById("flashDealDiscount");
const flashDealDuration = document.getElementById("flashDealDuration");
const flashDealBtn = document.getElementById("flashDealBtn");
const flashDealClearBtn = document.getElementById("flashDealClearBtn");
const flashDealStatus = document.getElementById("flashDealStatus");
const flashDealBadge = document.getElementById("flashDealBadge");
const replaySlider = document.getElementById("replaySlider");
const replayModeBadge = document.getElementById("replayModeBadge");
const replayTickLabel = document.getElementById("replayTickLabel");
const replayLiveBtn = document.getElementById("replayLiveBtn");
const replayBackBtn = document.getElementById("replayBackBtn");
const replayForwardBtn = document.getElementById("replayForwardBtn");

// KPIs
const kpiAvgWait = document.getElementById("kpiAvgWait");
const kpiMaxCong = document.getElementById("kpiMaxCong");
const kpiThroughput = document.getElementById("kpiThroughput");
const kpiStatus = document.getElementById("kpiStatus");
const statusCard = document.getElementById("statusCard");
const impactText = document.getElementById("impactText");

// AI Panel
const aiConfidence = document.getElementById("aiConfidence");
const aiDecision = document.getElementById("aiDecision");
const aiTimeSaved = document.getElementById("aiTimeSaved");
const aiAffected = document.getElementById("aiAffected");
const aiReasoningList = document.getElementById("aiReasoningList");

// Containers
const gatesContainer = document.getElementById("gatesContainer");
const alertsList = document.getElementById("alertsList");
const historyList = document.getElementById("historyList");
const escalatedBadge = document.getElementById("escalatedBadge");
const opsEventList = document.getElementById("opsEventList");

// State
let gridWidth = 40;
let gridHeight = 24;
let zones = {};
let density = [];
let maxDensity = 1;
let currentPhase = "ENTRY";
let gateFutureCache = {};
let latestAlerts = [];
let latestHistorySnapshots = [];
let replayModeLive = true;
let replayIndex = -1;

function toCanvas(x, y) {
  return {
    x: (x / gridWidth) * canvas.width,
    y: (y / gridHeight) * canvas.height,
  };
}

function drawGrid() {
  const cellW = canvas.width / gridWidth;
  const cellH = canvas.height / gridHeight;
  ctx.strokeStyle = "rgba(56, 189, 248, 0.05)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= gridWidth; x++) {
    const px = x * cellW;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= gridHeight; y++) {
    const py = y * cellH;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
    ctx.stroke();
  }
}

function getThermalColor(value, max) {
  if (value === 0) return null;
  const ratio = Math.min(1, value / Math.max(1, max));
  
  // Blue -> Yellow -> Red
  if (ratio < 0.3) {
    const alpha = 0.2 + (ratio / 0.3) * 0.4;
    return `rgba(56, 189, 248, ${alpha})`; // Blue
  } else if (ratio < 0.7) {
    const alpha = 0.4 + ((ratio - 0.3) / 0.4) * 0.4;
    return `rgba(250, 204, 21, ${alpha})`; // Yellow
  } else {
    const alpha = 0.6 + ((ratio - 0.7) / 0.3) * 0.4;
    return `rgba(239, 68, 68, ${alpha})`; // Red
  }
}

function drawThermalMap() {
  if (!density.length) return;
  const cellW = canvas.width / gridWidth;
  const cellH = canvas.height / gridHeight;

  ctx.globalCompositeOperation = "screen";

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const value = density[y][x] || 0;
      const color = getThermalColor(value, maxDensity);
      
      if (color) {
        // Draw glow
        const cx = x * cellW + cellW / 2;
        const cy = y * cellH + cellH / 2;
        const radius = Math.max(cellW, cellH) * 1.5;
        
        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawZones() {
  ctx.font = "600 12px Inter";
  ctx.lineWidth = 1.5;

  Object.entries(zones).forEach(([name, bounds]) => {
    // Dim the seating zone box so it doesn't clutter
    if (name === "Seating") {
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.fillStyle = "rgba(255,255,255,0.2)";
    } else {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
      ctx.fillStyle = "rgba(248, 250, 252, 0.9)";
    }

    const [x1, y1, x2, y2] = bounds;
    const p1 = toCanvas(x1, y1);
    const p2 = toCanvas(x2 + 1, y2 + 1);
    
    ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    ctx.fillText(name.toUpperCase(), p1.x + 6, p1.y + 18);
  });
}

function renderCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawThermalMap();
  drawZones();
}

function getTrendIcon(val) {
  if (val > 0.1) return `<span style="color:var(--color-red)">↑ +${val}</span>`;
  if (val < -0.1) return `<span style="color:var(--color-green)">↓ ${val}</span>`;
  return `<span style="color:var(--text-muted)">→ 0</span>`;
}

function buildZoneSparklineSeries(historyItems) {
  const zonesToRender = ["Gate A", "Gate B", "Gate C", "Gate D", "Food Court", "Exit"];
  const series = {};
  zonesToRender.forEach((zone) => {
    series[zone] = [];
  });

  historyItems.slice(-12).forEach((item) => {
    zonesToRender.forEach((zone) => {
      const waitVal = item?.waits?.[zone];
      const countVal = item?.counts?.[zone];
      const point = Number.isFinite(waitVal) ? waitVal : Number.isFinite(countVal) ? countVal : 0;
      series[zone].push(point);
    });
  });

  return series;
}

function renderGateCards(waits, trends, utils, forecasts, historyItems = []) {
  gatesContainer.innerHTML = "";
  const sparklineSeries = buildZoneSparklineSeries(historyItems);
  
  const targetZones = ["Gate A", "Gate B", "Gate C", "Gate D", "Food Court", "Exit"];
  
  targetZones.forEach(zone => {
    if (waits[zone] === undefined) return;
    
    const wait = waits[zone];
    const trend = trends[zone] || 0;
    const util = utils[zone] || 0;
    const forecast = forecasts[zone] ?? wait;
    const future = gateFutureCache[zone] || { confidence: "low", predicted_wait: null, trend: "insufficient_data" };
    const futureText = future.predicted_wait === null
      ? "future: collecting history..."
      : `${future.trend === "rising" ? "↑" : future.trend === "falling" ? "↓" : "→"} predicted ${future.predicted_wait.toFixed(1)} min in 5m`;
    const futureOpacity = future.confidence === "high" ? 1 : future.confidence === "medium" ? 0.7 : 0.4;
    
    let utilColor = "var(--color-accent)";
    if (util > 85) utilColor = "var(--color-red)";
    else if (util > 60) utilColor = "var(--color-yellow)";
    else if (util < 35) utilColor = "var(--color-green)";

    const card = document.createElement("div");
    card.className = "gate-card";
    card.innerHTML = `
      <div class="gate-header">
        <span class="gate-name">${zone.toUpperCase()}</span>
        <span class="gate-trend">${getTrendIcon(trend)}</span>
      </div>
      <div class="gate-wait">
        ${wait.toFixed(1)} <span>min wait</span>
      </div>
      <div style="font-size:0.78rem; color:var(--text-muted);">
        5m forecast: ${forecast.toFixed ? forecast.toFixed(1) : forecast} min
      </div>
      <div style="font-size:0.72rem; color:var(--text-muted); opacity:${futureOpacity};">
        ${futureText}
      </div>
      <div style="font-size:0.7rem; color:var(--text-muted); display:flex; justify-content:space-between; margin-top:0.25rem;">
        <span>Load</span>
        <span>${util}%</span>
      </div>
      <div class="util-bar-container">
        <div class="util-bar" style="width: ${Math.min(100, util)}%; background: ${utilColor}"></div>
      </div>
      <div class="spark-wrap">${buildSparkline(sparklineSeries[zone] || [])}</div>
    `;
    gatesContainer.appendChild(card);
  });
}

function buildSparkline(values, width = 60, height = 20) {
  if (!values.length) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><polyline fill="none" stroke="var(--color-accent)" stroke-width="1.5" points="${points}" /></svg>`;
}

function renderHistory(historyItems) {
  historyList.innerHTML = "";

  const items = [...historyItems].slice(-8).reverse();
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "alert-card alert-green";
    const peakZone = item.counts ? Object.entries(item.counts).sort((a, b) => b[1] - a[1])[0] : ["N/A", 0];
    const phaseText = item.phase || currentPhase || "LIVE";
    const maxDensityValue = item.max_density ?? "--";
    card.innerHTML = `
      <div class="ac-header">
        <span class="ac-zone">TICK ${item.tick}</span>
        <span class="ac-eta">${phaseText}</span>
      </div>
      <div class="ac-issue">Peak zone: ${peakZone[0]}</div>
      <div class="ac-action">Max density: ${maxDensityValue} | Zones sampled: ${Object.keys(item.counts || {}).length}</div>
    `;
    historyList.appendChild(card);
  });
}

function waitsToUtilizations(waits = {}) {
  const utils = {};
  Object.entries(waits).forEach(([zone, wait]) => {
    if (zone === "Seating") return;
    utils[zone] = Math.round(Math.min(100, (Number(wait || 0) / 15.0) * 100) * 10) / 10;
  });
  return utils;
}

function updateReplayControls() {
  const maxIndex = Math.max(0, latestHistorySnapshots.length - 1);
  replaySlider.max = String(maxIndex);
  replaySlider.value = String(Math.max(0, replayIndex));

  if (replayModeLive || replayIndex < 0) {
    replayModeBadge.textContent = "Live mode";
    replayTickLabel.textContent = "Latest snapshot";
    return;
  }

  replayModeBadge.textContent = "Replay mode";
  const snap = latestHistorySnapshots[replayIndex];
  replayTickLabel.textContent = snap ? `Replay tick ${snap.tick || replayIndex}` : "Replay snapshot";
}

function renderReplayFrame() {
  const snap = latestHistorySnapshots[replayIndex];
  if (!snap) return;
  const waits = snap.waits || {};
  renderGateCards(waits, {}, waitsToUtilizations(waits), waits, latestHistorySnapshots);
}

function renderOpsEvents(events = []) {
  if (!opsEventList) return;
  opsEventList.innerHTML = "";

  const items = events.slice(0, 14);
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "alert-card alert-green";
    empty.textContent = "No operations events yet.";
    opsEventList.appendChild(empty);
    return;
  }

  items.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "alert-card alert-green";
    const ts = Number(entry.timestamp || 0) * 1000;
    const timeText = Number.isFinite(ts) && ts > 0 ? new Date(ts).toLocaleTimeString() : "just now";
    card.innerHTML = `
      <div class="ac-header">
        <span class="ac-zone">${String(entry.type || "ops").toUpperCase()}</span>
        <span class="ac-eta">${timeText}</span>
      </div>
      <div class="ac-issue">${entry.message || "Operational event"}</div>
    `;
    opsEventList.appendChild(card);
  });
}

function renderKPIs(kpis, aiDecisions) {
  kpiAvgWait.textContent = `${kpis.avg_wait_min} min`;
  kpiMaxCong.textContent = (kpis.max_congestion_zone || "--").toUpperCase();
  kpiThroughput.textContent = `${kpis.throughput} /min`;
  kpiStatus.textContent = (kpis.system_status || "stable").toUpperCase();
  
  kpiStatus.className = "kpi-value";
  if (kpis.system_status === "Critical") kpiStatus.classList.add("status-critical");
  else if (kpis.system_status === "Moderate") kpiStatus.classList.add("status-moderate");
  else kpiStatus.classList.add("status-stable");

  if (aiDecisions && aiDecisions.impact && aiDecisions.impact.total_time_saved) {
      impactText.textContent = `System prevented ~${aiDecisions.impact.total_time_saved} of cumulative waiting today`;
  }
}

function renderAIPanel(ai) {
  if (!ai) return;
  const impact = ai.impact || {};
  aiDecision.textContent = ai.decision || "Monitoring live crowd behavior.";
  aiTimeSaved.textContent = `${Number(impact.time_saved_per_user || 0).toFixed(1)} min`;
  aiAffected.textContent = String(impact.affected_users || 0);
  aiConfidence.textContent = `${ai.confidence || "Medium"} Confidence`;
  
  aiReasoningList.innerHTML = "";
  (ai.reasoning || ["Collecting decision telemetry from active zones."]).forEach(r => {
    const li = document.createElement("li");
    li.textContent = r;
    aiReasoningList.appendChild(li);
  });
}

function renderAlerts(alerts) {
  alertsList.innerHTML = "";
  latestAlerts = alerts;
  
  alerts.forEach(a => {
    const severity = (a.severity || "GREEN").toUpperCase();
    const zone = a.zone || "Unknown zone";
    const rawMessage = a.message || "";
    const issue = a.issue || (rawMessage.includes("|") ? rawMessage.split("|")[0].trim() : rawMessage || "Operational update");
    const action = a.action || (rawMessage.includes("|") ? rawMessage.split("|")[1].trim() : "Monitor this zone");
    const eta = a.eta || "TBD";

    const card = document.createElement("div");
    card.className = `alert-card alert-${severity.toLowerCase()}`;
    card.dataset.alertId = a.alert_id || "";
    
    card.innerHTML = `
      <div class="ac-header">
        <span class="ac-zone">${zone.toUpperCase()}</span>
        <span class="ac-eta">ETA: ${eta}</span>
      </div>
      <div class="ac-issue">${issue}</div>
      <div class="ac-action">Action: ${action}</div>
      <div class="alert-actions">
        ${severity !== "GREEN" && !a.acknowledged ? `<button class="ack-btn" data-alert-id="${a.alert_id || ""}">ACK</button>` : ""}
        ${severity !== "GREEN" ? `<button class="ack-btn resolve-btn" data-alert-id="${a.alert_id || ""}">Resolve</button>` : ""}
        ${a.acknowledged ? `<span class="ack-label">ACK by ${a.acknowledged_by || "staff"}</span>` : ""}
      </div>
    `;
    alertsList.appendChild(card);
  });
}

function renderFlashDealStatus(deal) {
  if (!deal || !deal.active) {
    flashDealBadge.textContent = "No active deal";
    flashDealStatus.textContent = "No active flash deal.";
    return;
  }

  const minsLeft = Math.max(1, Math.ceil((deal.remaining_seconds || 0) / 60));
  flashDealBadge.textContent = `${deal.discount_percent}% live`;
  flashDealStatus.textContent = `${deal.discount_percent}% discount at ${deal.zone} | ${minsLeft}m left`;
}

async function refreshFlashDealStatus() {
  const res = await fetch(`${API_BASE}/ops/flash-deal`);
  if (!res.ok) return;
  const deal = await res.json();
  renderFlashDealStatus(deal);
}

async function launchFlashDeal() {
  const payload = {
    active: true,
    zone: flashDealZone?.value || "Food Court",
    discount_percent: Number(flashDealDiscount?.value || 30),
    duration_minutes: Number(flashDealDuration?.value || 15),
    triggered_by: "dashboard_operator",
  };

  const res = await fetch(`${API_BASE}/ops/flash-deal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return;
  const deal = await res.json();
  renderFlashDealStatus(deal);
}

async function clearFlashDeal() {
  const res = await fetch(`${API_BASE}/ops/flash-deal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active: false }),
  });
  if (!res.ok) return;
  const deal = await res.json();
  renderFlashDealStatus(deal);
}

function renderFeeds(feeds) {
  ingestFeedList.innerHTML = "";
  feeds.forEach((feed) => {
    const badge = document.createElement("span");
    badge.className = "feed-badge";
    if (feed.age_seconds < 10) badge.classList.add("feed-good");
    else if (feed.age_seconds < 20) badge.classList.add("feed-warn");
    else badge.classList.add("feed-bad");
    badge.textContent = `${feed.zone}: ${feed.count} (${feed.source}, ${feed.age_seconds}s)`;
    ingestFeedList.appendChild(badge);
  });
}

async function syncPhase(phase) {
  const res = await fetch(`${API_BASE}/scenario?phase=${encodeURIComponent(phase)}`);
  if (!res.ok) return;
  const data = await res.json();
  if (data.phase) {
    currentPhase = data.phase;
    phaseSelect.value = data.phase;
  }
}

async function syncAutoPhase(enabled) {
  const res = await fetch(`${API_BASE}/scenario?auto=${enabled ? "true" : "false"}`);
  if (!res.ok) return;
  const data = await res.json();
  if (typeof data.auto_phase === "boolean") {
    autoPhaseToggle.checked = data.auto_phase;
  }
}

async function switchVenue(venue) {
  const res = await fetch(`${API_BASE}/venues/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ venue }),
  });
  if (!res.ok) return;
  const data = await res.json();
  if (data.name) {
    ingestStatus.textContent = `Venue switched to ${data.name}.`;
  }
  await refreshData();
}

async function submitIngest() {
  const source = ingestSource?.value || "camera_feed";
  const payload = {
    zone: ingestZone.value,
    count: Number(ingestCount.value || 0),
    source,
  };

  ingestStatus.textContent = "Injecting observation...";
  const res = await fetch(`${API_BASE}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    ingestStatus.textContent = "Ingestion failed.";
    return;
  }

  const data = await res.json();
  ingestStatus.textContent = `Accepted ${data.zone} observation from ${data.source || source} (${data.count}).`;
  await refreshData();
}

async function refreshIngestStatus() {
  const res = await fetch(`${API_BASE}/ingest/status`);
  if (!res.ok) return;
  const data = await res.json();
  const feeds = data.feeds || [];
  renderFeeds(feeds);
  if (!feeds.length) {
    ingestStatus.textContent = "No live feed overrides active.";
  }
}

async function clearAllFeeds() {
  const active = (await (await fetch(`${API_BASE}/ingest/status`)).json()).feeds || [];
  if (!active.length) {
    ingestStatus.textContent = "No active feeds to clear.";
    return;
  }

  await Promise.all(
    active.map((feed) =>
      fetch(`${API_BASE}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone: feed.zone, count: 0, source: "manual_staff" }),
      })
    )
  );

  ingestStatus.textContent = "Cleared feed overrides.";
  await refreshIngestStatus();
}

async function refreshFuturePredictions() {
  const gates = ["Gate A", "Gate B", "Gate C", "Gate D"];
  const results = await Promise.all(
    gates.map(async (zone) => {
      const res = await fetch(`${API_BASE}/predict/future?zone=${encodeURIComponent(zone)}&minutes=5`);
      const data = await res.json();
      return [zone, data];
    })
  );
  gateFutureCache = Object.fromEntries(results);
}

async function refreshData() {
  try {
    const [simRes, heatRes, predRes, sugRes, kpiRes, historyRes, staffRes, escalatedRes, opsEventsRes] = await Promise.all([
      fetch(`${API_BASE}/simulate`),
      fetch(`${API_BASE}/heatmap`),
      fetch(`${API_BASE}/predict`),
      fetch(`${API_BASE}/suggest`),
      fetch(`${API_BASE}/kpi`),
      fetch(`${API_BASE}/history`),
      fetch(`${API_BASE}/staff/alerts`),
      fetch(`${API_BASE}/staff/alerts/escalated`),
      fetch(`${API_BASE}/ops/events`)
    ]);

    const simData = await simRes.json();
    const heatData = await heatRes.json();
    const predData = await predRes.json();
    const sugData = await sugRes.json();
    const kpiData = await kpiRes.json();
    const historyData = await historyRes.json();
    const staffAlerts = await staffRes.json();
    const escalatedAlerts = await escalatedRes.json();
    const opsEventsData = await opsEventsRes.json();

    gridWidth = simData.grid.width;
    gridHeight = simData.grid.height;
    zones = simData.zones;
    
    if (phaseSelect.value !== simData.phase) {
        phaseSelect.value = simData.phase;
    }
    if (typeof simData.auto_phase === "boolean") {
      autoPhaseToggle.checked = simData.auto_phase;
    }

    density = heatData.density;
    maxDensity = heatData.max_density;

    renderCanvas();
    latestHistorySnapshots = historyData.snapshots || historyData.items || [];
    if (replayModeLive || replayIndex < 0) {
      renderGateCards(
        predData.wait_times,
        predData.trends,
        predData.utilizations,
        predData.forecast_wait_times || {},
        latestHistorySnapshots
      );
    } else {
      replayIndex = Math.min(replayIndex, Math.max(0, latestHistorySnapshots.length - 1));
      renderReplayFrame();
    }
    renderKPIs(kpiData, sugData.decision);
    renderAIPanel(sugData.decision);
    renderAlerts((staffAlerts && staffAlerts.length ? staffAlerts : sugData.alerts) || []);
    renderHistory(latestHistorySnapshots);
    renderOpsEvents(opsEventsData.events || []);
    updateReplayControls();
    await refreshIngestStatus();
    await refreshFuturePredictions();
    await refreshFlashDealStatus();

    if (escalatedAlerts && escalatedAlerts.length) {
      alertsList.classList.add("panel-flash");
      escalatedBadge.textContent = `${escalatedAlerts.length} escalated`;
    } else {
      alertsList.classList.remove("panel-flash");
      escalatedBadge.textContent = "No escalations";
    }
    
  } catch (err) {
    console.error("Data refresh failed", err);
  }
}

phaseSelect.addEventListener("change", async (e) => {
  await syncPhase(e.target.value);
  await refreshData();
});

autoPhaseToggle.addEventListener("change", async (e) => {
  await syncAutoPhase(e.target.checked);
  await refreshData();
});

if (venueSelect) {
  venueSelect.addEventListener("change", async (e) => {
    await switchVenue(e.target.value);
  });
}

ingestBtn.addEventListener("click", async () => {
  await submitIngest();
});

if (clearFeedsBtn) {
  clearFeedsBtn.addEventListener("click", async () => {
    await clearAllFeeds();
    await refreshData();
  });
}

document.querySelectorAll("[data-feed-source]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (ingestSource) {
      ingestSource.value = button.dataset.feedSource || "camera_feed";
    }
    await submitIngest();
  });
});

alertsList.addEventListener("click", async (event) => {
  const button = event.target.closest(".ack-btn");
  if (!button) return;
  const alertId = button.dataset.alertId;
  const isResolve = button.classList.contains("resolve-btn");

  if (isResolve) {
    const resolveRes = await fetch(`${API_BASE}/staff/alerts/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_id: alertId }),
    });
    if (!resolveRes.ok) return;
    await refreshData();
    return;
  }

  const staffName = window.prompt("Staff name?");
  if (!staffName) return;

  const response = await fetch(`${API_BASE}/staff/alerts/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alert_id: alertId, staff_name: staffName }),
  });
  if (!response.ok) return;
  await refreshData();
});

if (flashDealBtn) {
  flashDealBtn.addEventListener("click", async () => {
    await launchFlashDeal();
  });
}

if (flashDealClearBtn) {
  flashDealClearBtn.addEventListener("click", async () => {
    await clearFlashDeal();
  });
}

if (replaySlider) {
  replaySlider.addEventListener("input", () => {
    replayModeLive = false;
    replayIndex = Number(replaySlider.value || 0);
    updateReplayControls();
    renderReplayFrame();
  });
}

if (replayLiveBtn) {
  replayLiveBtn.addEventListener("click", () => {
    replayModeLive = true;
    replayIndex = -1;
    updateReplayControls();
  });
}

if (replayBackBtn) {
  replayBackBtn.addEventListener("click", () => {
    if (!latestHistorySnapshots.length) return;
    replayModeLive = false;
    replayIndex = Math.max(0, (replayIndex < 0 ? latestHistorySnapshots.length - 1 : replayIndex - 1));
    updateReplayControls();
    renderReplayFrame();
  });
}

if (replayForwardBtn) {
  replayForwardBtn.addEventListener("click", () => {
    if (!latestHistorySnapshots.length) return;
    replayModeLive = false;
    replayIndex = Math.min(latestHistorySnapshots.length - 1, Math.max(0, replayIndex + 1));
    updateReplayControls();
    renderReplayFrame();
  });
}

refreshData();
setInterval(refreshData, 2500);
