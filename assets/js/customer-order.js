import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const page = document.querySelector("[data-customer-order-page]");
const orderId = new URLSearchParams(window.location.search).get("id");

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

async function loadOrder(user) {
  if (!orderId || !/^\d+$/.test(orderId)) {
    page.innerHTML = '<div class="account-card"><p class="eyebrow">Order</p><h1>Order not found</h1><p class="muted">The order link is missing or invalid.</p><a class="button button-primary" href="customer-orders.html">Back to My Orders</a></div>';
    return;
  }

  page.innerHTML = '<div class="account-card"><p class="eyebrow">Order details</p><h1>Loading order…</h1><p class="settings-load-status">Please wait while we load your order.</p></div>';

  try {
    const token = await user.getIdToken();
    const response = await fetch(`/api/customer-orders?id=${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load this order.");

    const { order, items = [] } = payload.data || {};
    if (!order) throw new Error("Order not found.");

    page.innerHTML = `
      <div class="account-card">
        <div class="settings-heading">
          <div>
            <p class="eyebrow">Order details</p>
            <h1>${esc(order.order_number)}</h1>
            <p class="muted">${esc(date(order.created_at))}</p>
          </div>
          <a class="button button-outline" href="customer-orders.html">Back to My Orders</a>
        </div>

        <div class="customer-order-status-row">
          <span>Payment: <strong>${esc(order.payment_status)}</strong></span>
          <span>Order: <strong>${esc(order.order_status)}</strong></span>
        </div>

        <div class="customer-order-grid">
          <div>
            <p class="settings-readonly">Delivery</p>
            <p>${esc(order.customer_full_name)}<br>${esc(order.customer_phone)}</p>
            <p>${esc(order.shipping_address)}<br>${esc([order.shipping_city, order.shipping_province, order.shipping_postal_code].filter(Boolean).join(", "))}<br>${esc(order.shipping_country)}</p>
            <p class="muted">${esc(order.shipping_method_name)}${order.shipping_option_name ? " · " + esc(order.shipping_option_name) : ""}</p>
          </div>

          <div>
            <p class="settings-readonly">Items</p>
            <div class="customer-order-items">
              ${items.map(item => `
                <div class="customer-order-item">
                  <span>${esc(item.product_name)} × ${Number(item.quantity)}</span>
                  <strong>${esc(money(item.line_total, item.currency))}</strong>
                </div>`).join("")}
            </div>
            <div class="customer-order-total"><span>Subtotal</span><strong>${esc(money(order.subtotal, order.currency))}</strong></div>
            <div class="customer-order-total"><span>Delivery</span><strong>${esc(money(order.shipping_fee, order.currency))}</strong></div>
            <div class="customer-order-total customer-order-grand-total"><span>Total</span><strong>${esc(money(order.total, order.currency))}</strong></div>
          </div>
        </div>

        ${order.customer_notes || order.delivery_landmark ? `
          <div class="customer-order-notes">
            ${order.customer_notes ? `<p><strong>Notes:</strong> ${esc(order.customer_notes)}</p>` : ""}
            ${order.delivery_landmark ? `<p><strong>Landmark:</strong> ${esc(order.delivery_landmark)}</p>` : ""}
          </div>` : ""}
      </div>`;
  } catch (error) {
    page.innerHTML = `<div class="account-card"><p class="eyebrow">Order details</p><h1>Unable to load order</h1><p class="settings-notice">${esc(error.message || "Unable to load this order.")}</p><a class="button button-primary" href="customer-orders.html">Back to My Orders</a></div>`;
  }
}

onAuthStateChanged(auth, user => {
  if (user) {
    loadOrder(user);
  } else {
    page.innerHTML = '<div class="account-card"><p class="eyebrow">Customer account</p><h1>Sign in required</h1><p class="muted">Please sign in to view this order.</p><a class="button button-primary" href="account.html">Go to Account</a></div>';
  }
});
