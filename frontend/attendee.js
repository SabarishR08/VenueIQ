const API_BASE = window.location.protocol.startsWith("http")
  ? window.location.origin
  : "http://127.0.0.1:8080";

const bestGateEl = document.getElementById("bestGate");
const bestMetaEl = document.getElementById("bestMeta");
const waitTimeEl = document.getElementById("waitTime");
const confidenceEl = document.getElementById("confidence");
const statusEl = document.getElementById("status");
const forecastEl = document.getElementById("forecast");
const reasonList = document.getElementById("reasonList");
const headline = document.getElementById("headline");

function renderReasons(reasoning) {
  reasonList.innerHTML = "";
  reasoning.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    reasonList.appendChild(item);
  });
}

async function refresh() {
  try {
    const [suggestRes, predictRes, kpiRes] = await Promise.all([
      fetch(`${API_BASE}/suggest`),
      fetch(`${API_BASE}/predict`),
      fetch(`${API_BASE}/kpi`),
    ]);

    const suggestData = await suggestRes.json();
    const predictData = await predictRes.json();
    const kpiData = await kpiRes.json();

    const decision = suggestData.decision;
    const gate = decision.decision.split(" to ").pop();
    const gateName = gate.replace("Redirect traffic from ", "");
    const targetGate = gateName.trim();
    const wait = predictData.wait_times?.[targetGate] ?? 0;
    const forecast = predictData.forecast_wait_times?.[targetGate] ?? wait;

    headline.textContent = `Go to ${targetGate} now`;
    bestGateEl.textContent = targetGate;
    bestMetaEl.textContent = decision.reasoning.join(" • ");
    waitTimeEl.textContent = `${wait.toFixed(1)} min`;
    confidenceEl.textContent = decision.confidence;
    statusEl.textContent = kpiData.system_status;
    forecastEl.textContent = `${forecast.toFixed(1)} min`;
    renderReasons(decision.reasoning);
  } catch (error) {
    console.error("attendee refresh failed", error);
    bestMetaEl.textContent = "Unable to fetch live route guidance.";
  }
}

refresh();
setInterval(refresh, 3000);
