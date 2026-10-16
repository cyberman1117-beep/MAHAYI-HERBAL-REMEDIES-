import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const page = document.querySelector("[data-customer-orders-page]");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function money(amount, currency = "ZAR") {
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(Number(amount || 0));
  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }
}

function date(value) {
  const d = new Date(String(value || "").replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime())
    ? String(value || "")
    : new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

async function loadOrders(user) {
  page.innerHTML = `
    <div class="account-card">
      <div class="settings-heading">
        <div>
          <p class="eyebrow">Order history</p>
          <h1>My Orders</h1>
          <p class="muted">Select an order to view its full details.</p>
        </div>
        <a class="button button-outline" href="account.html">Back to Account</a>
      </div>
      <div class="customer-orders-list" data-orders-list>
        <p class="settings-load-status">Loading your orders…</p>
      </div>
    </div>`;

  const list = page.querySelector("[data-orders-list]");

  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/customer-orders", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load your orders.");

    const orders = Array.isArray(payload.data) ? payload.data : [];
    if (!orders.length) {
      list.innerHTML = '<div class="customer-orders-empty"><h3>No orders yet</h3><p class="muted">Your completed purchases will appear here.</p><a class="button button-primary" href="index.html">Start shopping</a></div>';
      return;
    }

    list.innerHTML = orders.map(order => `
      <a class="customer-order-card" href="customer-order.html?id=${encodeURIComponent(Number(order.id))}" aria-label="View order ${esc(order.order_number)}">
        <span>
          <strong>${esc(order.order_number)}</strong>
          <small>${esc(date(order.created_at))}</small>
        </span>
        <span>
          <strong>${esc(money(order.total, order.currency))}</strong>
          <small>${esc(order.order_status)}</small>
        </span>
        <span class="customer-order-arrow" aria-hidden="true">→</span>
      </a>`).join("");
  } catch (error) {
    list.innerHTML = `<p class="settings-notice">${esc(error.message || "Unable to load your orders.")}</p>`;
  }
}

onAuthStateChanged(auth, user => {
  if (user) {
    loadOrders(user);
  } else {
    page.innerHTML = '<div class="account-card"><p class="eyebrow">Customer account</p><h1>Sign in required</h1><p class="muted">Please sign in to view your orders.</p><a class="button button-primary" href="account.html">Go to Account</a></div>';
  }
});
