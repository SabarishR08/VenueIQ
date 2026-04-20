const API_BASE = window.location.protocol.startsWith("http")
  ? window.location.origin
  : "http://127.0.0.1:8080";

const FOOD_MENU = [
  { id: 1, name: "Stadium Burger", price: 12.0, desc: "Angus beef, cheddar, brioche" },
  { id: 2, name: "Giant Pretzel", price: 8.5, desc: "Warm salt-crusted with mustard" },
  { id: 3, name: "Craft Soda", price: 5.0, desc: "Small batch botanical flavors" },
];

const bestGateEl = document.getElementById("bestGate");
const bestMetaEl = document.getElementById("bestMeta");
const waitTimeEl = document.getElementById("waitTime");
const confidenceEl = document.getElementById("confidence");
const statusEl = document.getElementById("status");
const forecastEl = document.getElementById("forecast");
const reasonList = document.getElementById("reasonList");
const headline = document.getElementById("headline");
const navGate = document.getElementById("navGate");
const navMeta = document.getElementById("navMeta");
const mapStatus = document.getElementById("mapStatus");
const dealMeta = document.getElementById("dealMeta");
const fanPointsEl = document.getElementById("fanPoints");
const toggleNavBtn = document.getElementById("toggleNav");
const acceptRouteBtn = document.getElementById("acceptRoute");
const toggleQrBtn = document.getElementById("toggleQr");
const qrArea = document.getElementById("qrArea");
const qrHint = document.getElementById("qrHint");
const menuList = document.getElementById("menuList");
const cartPanel = document.getElementById("cartPanel");
const cartTotal = document.getElementById("cartTotal");
const checkoutBtn = document.getElementById("checkoutBtn");
const notificationCard = document.getElementById("notificationCard");
const notifTitle = document.getElementById("notifTitle");
const notifBody = document.getElementById("notifBody");
const notifAction = document.getElementById("notifAction");
const dismissNotif = document.getElementById("dismissNotif");

const tabs = {
  hub: document.getElementById("tabHub"),
  map: document.getElementById("tabMap"),
  eat: document.getElementById("tabEat"),
};

const state = {
  currentTab: "hub",
  bestGate: "Gate A",
  isNavigating: false,
  showQr: false,
  fanPoints: 450,
  activeDiscount: 0,
  cart: [],
  notification: null,
};

function renderTabs() {
  Object.entries(tabs).forEach(([name, el]) => {
    if (!el) return;
    el.classList.toggle("hidden", name !== state.currentTab);
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.currentTab);
  });
}

function setNotification(payload) {
  state.notification = payload;
  if (!payload) {
    notificationCard.classList.add("hidden");
    return;
  }

  notifTitle.textContent = payload.title;
  notifBody.textContent = payload.body;
  notificationCard.classList.remove("hidden");
  if (payload.actionLabel) {
    notifAction.textContent = payload.actionLabel;
    notifAction.classList.remove("hidden");
  } else {
    notifAction.classList.add("hidden");
  }
}

function renderReasons(reasoning) {
  reasonList.innerHTML = "";
  reasoning.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    reasonList.appendChild(item);
  });
}

function renderMapStatus() {
  navGate.textContent = state.bestGate;
  if (state.isNavigating) {
    mapStatus.textContent = `Guidance active to ${state.bestGate}. Estimated walk: 2 min`;
    navMeta.textContent = "Follow highlighted route and keep QR ready.";
    toggleNavBtn.textContent = "End Guidance";
  } else {
    mapStatus.textContent = "Navigation idle";
    navMeta.textContent = "Accept route to begin guidance.";
    toggleNavBtn.textContent = "Start Guidance";
  }
}

function renderQR() {
  qrArea.classList.toggle("hidden", !state.showQr);
  toggleQrBtn.textContent = state.showQr ? "Hide QR" : "Show QR";
  qrHint.textContent = `Scan at ${state.bestGate}`;
}

function renderMenu() {
  menuList.innerHTML = "";
  FOOD_MENU.forEach((item) => {
    const row = document.createElement("div");
    row.className = "menu-item";
    row.innerHTML = `
      <div class="menu-left">
        <p class="menu-name">${item.name}</p>
        <p class="menu-desc">${item.desc}</p>
        <p class="menu-price">$${item.price.toFixed(2)}</p>
      </div>
      <button class="primary-btn" data-menu-id="${item.id}" type="button">Add</button>
    `;
    menuList.appendChild(row);
  });
}

function renderCart() {
  const subtotal = state.cart.reduce((sum, item) => sum + item.price, 0);
  const total = subtotal * (1 - state.activeDiscount / 100);
  cartTotal.textContent = `$${total.toFixed(2)}`;
  cartPanel.classList.toggle("hidden", !state.cart.length);
  if (state.activeDiscount > 0) {
    dealMeta.textContent = `Flash sale active: ${state.activeDiscount}% off live orders`;
    dealMeta.className = "muted good";
  } else {
    dealMeta.textContent = "No active discount.";
    dealMeta.className = "muted";
  }
}

function renderPoints() {
  if (fanPointsEl) {
    fanPointsEl.textContent = `Points: ${state.fanPoints}`;
  }
}

function switchTab(tabName) {
  if (!tabs[tabName]) return;
  state.currentTab = tabName;
  renderTabs();
}

async function refresh() {
  try {
    const fanRes = await fetch(`${API_BASE}/fan/state`);
    const fanData = await fanRes.json();

    const decision = fanData.decision || {};
    const targetGate = fanData.recommended_gate || "Gate A";
    state.bestGate = targetGate;

    const wait = fanData.wait_times?.[targetGate] ?? 0;
    const forecast = fanData.forecast_wait_times?.[targetGate] ?? wait;
    state.activeDiscount = fanData.flash_deal?.active ? Number(fanData.flash_deal.discount_percent || 0) : 0;

    headline.textContent = `Go to ${targetGate} now`;
    bestGateEl.textContent = targetGate;
    bestMetaEl.textContent = (decision.reasoning || ["Live model is warming up"]).join(" • ");
    waitTimeEl.textContent = `${wait.toFixed(1)} min`;
    confidenceEl.textContent = decision.confidence || "Medium";
    statusEl.textContent = fanData.kpi?.system_status || "Stable";
    forecastEl.textContent = `${forecast.toFixed(1)} min`;
    renderReasons(decision.reasoning || ["Routing confidence improves with more movement ticks."]);
    renderMapStatus();
    renderQR();
    renderCart();

    if (state.activeDiscount > 0 && fanData.flash_deal?.remaining_seconds) {
      const minsLeft = Math.max(1, Math.ceil(Number(fanData.flash_deal.remaining_seconds) / 60));
      dealMeta.textContent = `Flash sale active: ${state.activeDiscount}% off for ${minsLeft}m`;
      dealMeta.className = "muted good";
    }

    if (Number(fanData.escalated_count || 0) > 0) {
      setNotification({
        title: "Critical Alert",
        body: `Heavy congestion detected. Use ${targetGate} to skip delays.`,
        actionLabel: "Take Fast Route",
        action: "reroute",
      });
    } else if (!state.notification) {
      setNotification(null);
    }
  } catch (error) {
    console.error("attendee refresh failed", error);
    bestMetaEl.textContent = "Unable to fetch live route guidance.";
  }
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

dismissNotif.addEventListener("click", () => setNotification(null));

notifAction.addEventListener("click", () => {
  if (!state.notification || state.notification.action !== "reroute") return;
  state.fanPoints += 100;
  state.isNavigating = true;
  switchTab("map");
  renderMapStatus();
  renderPoints();
  setNotification({
    title: "Reroute Active",
    body: `Navigation started to ${state.bestGate}. Bonus points awarded: +100`,
  });
});

acceptRouteBtn.addEventListener("click", () => {
  state.fanPoints += 100;
  state.isNavigating = true;
  renderMapStatus();
  renderPoints();
  switchTab("map");
  setNotification({
    title: "Route Accepted",
    body: `You are now routed to ${state.bestGate}. Points: ${state.fanPoints}`,
  });
});

toggleNavBtn.addEventListener("click", () => {
  state.isNavigating = !state.isNavigating;
  renderMapStatus();
});

toggleQrBtn.addEventListener("click", () => {
  state.showQr = !state.showQr;
  renderQR();
});

menuList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-menu-id]");
  if (!button) return;
  const selected = FOOD_MENU.find((item) => item.id === Number(button.dataset.menuId));
  if (!selected) return;
  state.cart.push(selected);
  renderCart();
});

checkoutBtn.addEventListener("click", () => {
  state.cart = [];
  renderCart();
  setNotification({
    title: "Payment Success",
    body: "Order placed. Pickup at Counter 3 in 4 minutes.",
  });
  switchTab("hub");
});

function bootstrap() {
  renderTabs();
  renderMenu();
  renderCart();
  renderPoints();
  renderMapStatus();
  renderQR();
}

bootstrap();
refresh();
setInterval(refresh, 3000);
