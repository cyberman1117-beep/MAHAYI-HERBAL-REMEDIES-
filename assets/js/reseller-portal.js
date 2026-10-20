import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const $ = (selector) => document.querySelector(selector);
const panels = ["#loading-panel", "#auth-panel", "#pending-panel", "#dashboard-panel"];
const form = $("#auth-form");
const status = $("#auth-status");
const submit = $("#auth-submit");
const switchMode = $("#switch-mode");
const nameField = $("#name-field");
const phoneField = $("#phone-field");
const emailField = form.elements.email;
const passwordField = form.elements.password;
let mode = "login";
let currentUser = null;
let products = [];
const cart = new Map();

function showPanel(selector) { panels.forEach((panel) => { $(panel).hidden = panel !== selector; }); }
function setMode(nextMode) {
  mode = nextMode;
  const profileOnly = mode === "profile";
  const registering = mode === "register" || profileOnly;
  $("#auth-title").textContent = profileOnly ? "Complete your reseller application" : registering ? "Create your reseller account" : "Sign in to your reseller account";
  $("#auth-intro").textContent = profileOnly ? "Add your contact details to submit your application for M.H.R. approval." : registering ? "Create an account to apply to the M.H.R. reseller programme." : "Sign in to access your reseller account.";
  $("#auth-legend").textContent = profileOnly ? "Your contact details" : "Account details";
  nameField.hidden = !registering;
  phoneField.hidden = !registering;
  emailField.closest(".field").hidden = profileOnly;
  passwordField.closest(".field").hidden = profileOnly;
  if (profileOnly) emailField.value = currentUser?.email || "";
  emailField.disabled = profileOnly;
  passwordField.required = !profileOnly;
  $("#auth-submit").textContent = profileOnly ? "Submit application" : registering ? "Create account & apply" : "Sign in";
  switchMode.hidden = profileOnly;
  switchMode.textContent = registering ? "I already have an account" : "Create reseller account";
  status.textContent = profileOnly ? "Complete your details to submit your application." : registering ? "New applications require M.H.R. approval." : "Sign in or create an account to apply.";
  showPanel("#auth-panel");
}
async function api(action, method = "GET", body) {
  if (!auth.currentUser) throw new Error("Please sign in to continue.");
  const token = await auth.currentUser.getIdToken();
  const url = new URL("/api/reseller-portal", location.origin);
  url.searchParams.set("action", action);
  const response = await fetch(url, { method, headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Request failed. Please try again.");
  return payload;
}
function money(value, currency = "ZAR") {
  try { return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(Number(value || 0)); }
  catch { return "R" + Number(value || 0).toFixed(2); }
}
function makeCard(titleText, lines = []) {
  const card = document.createElement("article");
  card.className = "admin-panel";
  const marker = document.createElement("div");
  marker.className = "panel-icon";
  marker.textContent = "M.H.R.";
  const details = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = titleText;
  details.append(title);
  for (const line of lines) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = line;
    details.append(p);
  }
  card.append(marker, details);
  return card;
}
function renderProducts(data) {
  products = data;
  const list = $("#product-list");
  list.replaceChildren();
  if (!products.length) {
    $("#products-status").textContent = "No active, priced reseller products are available yet. Please check again later.";
    return;
  }
  $("#products-status").textContent = products.length + " reseller product" + (products.length === 1 ? "" : "s") + " available.";
  for (const product of products) {
    const card = document.createElement("article");
    card.className = "admin-panel";
    const marker = document.createElement("div");
    marker.className = "panel-icon";
    marker.textContent = "M.H.R.";
    const details = document.createElement("div");
    const title = document.createElement("h2"); title.textContent = product.name;
    const category = document.createElement("p"); category.className = "muted"; category.textContent = product.category_name || "Reseller product";
    const description = document.createElement("p"); description.className = "muted"; description.textContent = product.description || "Quality product supplied by M.H.R.";
    const price = document.createElement("p"); price.textContent = "Customer selling price: " + money(product.customer_price, product.currency);
    const earnings = document.createElement("p"); earnings.className = "muted"; earnings.textContent = "Your share per unit: " + money(product.reseller_share, product.currency);
    const wholesale = document.createElement("p"); wholesale.className = "muted"; wholesale.textContent = "Upfront stock price per unit: " + money(product.stock_unit_price, product.currency);
    const minimum = document.createElement("p"); minimum.className = "muted"; minimum.textContent = "Minimum quantity: " + product.minimum_order_quantity;
    const stock = document.createElement("p"); stock.className = "muted"; stock.textContent = Number(product.track_stock) === 1 ? "Available company stock: " + product.stock_quantity : "Stock tracked by arrangement";
    details.append(title, category, description, price, earnings, wholesale, minimum, stock);
    const controls = document.createElement("div");
    controls.style.display = "grid"; controls.style.gap = ".5rem"; controls.style.minWidth = "150px";
    const qty = document.createElement("input"); qty.type = "number"; qty.min = String(product.minimum_order_quantity || 1); qty.step = "1"; qty.value = String(product.minimum_order_quantity || 1); qty.setAttribute("aria-label", "Quantity for " + product.name);
    if (Number(product.track_stock) === 1) qty.max = String(product.stock_quantity);
    const add = document.createElement("button"); add.className = "button button-primary"; add.type = "button"; add.textContent = "Add to stock order";
    if (Number(product.track_stock) === 1 && Number(product.stock_quantity) < Number(product.minimum_order_quantity)) { add.disabled = true; qty.disabled = true; add.textContent = "Out of stock"; }
    add.addEventListener("click", () => {
      const quantity = Number(qty.value);
      if (!Number.isSafeInteger(quantity) || quantity < Number(product.minimum_order_quantity || 1)) { $("#cart-status").textContent = "Enter a whole-number quantity that meets the minimum order."; return; }
      if (Number(product.track_stock) === 1 && quantity > Number(product.stock_quantity)) { $("#cart-status").textContent = "That quantity is not currently available."; return; }
      cart.set(Number(product.id), (cart.get(Number(product.id)) || 0) + quantity);
      renderCart();
      $("#cart-status").textContent = product.name + " added to your order.";
    });
    controls.append(qty, add);
    card.append(marker, details, controls);
    list.append(card);
  }
}
function renderCart() {
  const box = $("#cart-items");
  box.replaceChildren();
  let total = 0;
  const chosen = [];
  for (const [id, quantity] of cart) {
    const p = products.find(item => Number(item.id) === id);
    if (!p) continue;
    total += Number(p.stock_unit_price || 0) * quantity;
    chosen.push({ product_id: id, quantity });
    const row = document.createElement("div"); row.className = "admin-panel";
    const details = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = p.name;
    const amount = document.createElement("p"); amount.className = "muted"; amount.textContent = quantity + " × " + money(p.stock_unit_price, p.currency) + " = " + money(Number(p.stock_unit_price) * quantity, p.currency);
    details.append(title, amount);
    const remove = document.createElement("button"); remove.className = "button button-outline"; remove.type = "button"; remove.textContent = "Remove"; remove.addEventListener("click", () => { cart.delete(id); renderCart(); });
    row.append(details, remove); box.append(row);
  }
  if (!chosen.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Your order is empty."; box.append(p); }
  $("#cart-total").textContent = "Total to pay M.H.R.: " + money(total);
  $("#place-order").disabled = !chosen.length;
  return chosen;
}
async function loadInventoryAndOrders() {
  try {
    const inv = await api("inventory");
    const list = $("#inventory-list"); list.replaceChildren();
    const items = inv.data?.inventory || [];
    $("#inventory-status").textContent = items.length ? items.length + " inventory product(s)." : "No stock has been released to your inventory yet.";
    for (const item of items) list.append(makeCard(item.name, ["Available quantity: " + item.quantity_available, "SKU: " + (item.sku || "—"), "Last updated: " + item.updated_at]));
  } catch (e) { $("#inventory-status").textContent = e.message; }
  try {
    const result = await api("stock-orders");
    const orders = result.data?.orders || [];
    const items = result.data?.items || [];
    const list = $("#orders-list"); list.replaceChildren();
    $("#orders-status").textContent = orders.length ? orders.length + " stock order(s)." : "You have not placed a stock order yet.";
    for (const order of orders) {
      const lines = items.filter(item => Number(item.reseller_stock_order_id) === Number(order.id));
      const card = makeCard(order.order_number, ["Total: " + money(order.total_amount, order.currency), "Payment: " + order.payment_status, "Stock order: " + order.order_status, "Submitted: " + order.created_at, ...lines.map(item => item.product_name + " × " + item.quantity), order.payment_reference ? "Payment reference: " + order.payment_reference : "Payment reference: not recorded"]);
      list.append(card);
    }
  } catch (e) { $("#orders-status").textContent = e.message; }
}
async function loadAccount() {
  currentUser = auth.currentUser;
  if (!currentUser) {
    $("[data-account-email]").textContent = "";
    $("[data-logout]").hidden = true;
    setMode("login");
    return;
  }
  $("[data-account-email]").textContent = currentUser.email || "Reseller account";
  $("[data-logout]").hidden = false;
  try {
    const result = await api("me");
    const reseller = result.data?.reseller;
    if (!reseller) { setMode("profile"); return; }
    if (reseller.status !== "active") {
      showPanel("#pending-panel");
      $("#pending-title").textContent = reseller.status === "rejected" ? "Your application was not approved" : reseller.status === "suspended" ? "Your reseller account is suspended" : "Your reseller application is under review";
      $("#pending-message").textContent = reseller.status === "rejected" ? "Please contact M.H.R. if you believe this decision needs to be reviewed." : reseller.status === "suspended" ? "Reseller catalogue access is currently disabled. Contact M.H.R. for assistance." : "M.H.R. must approve your account before you can access reseller products. You can sign in here to check your status.";
      return;
    }
    showPanel("#dashboard-panel");
    $("#welcome-text").textContent = "Welcome, " + (reseller.full_name || "reseller") + ". Manage your M.H.R. reseller activity here.";
    $("#account-details").textContent = (reseller.full_name || "") + " · " + reseller.email + " · " + (reseller.phone || "");
    $(".admin-status").textContent = Number(reseller.pay_later_enabled) === 1 ? "Approved distributor" : "Standard reseller";
    $(".admin-stats .stat-card:nth-child(3) strong").textContent = Number(reseller.pay_later_enabled) === 1 ? "Approved" : "No access";
    $(".admin-stats .stat-card:nth-child(3) small").textContent = Number(reseller.pay_later_enabled) === 1 ? "Contact M.H.R. for settlement terms" : "Reserved for selected distributors";
    $("#products-status").textContent = "Loading products…";
    const productData = await api("products");
    renderProducts(productData.data?.products || []);
    renderCart();
    await loadInventoryAndOrders();
  } catch (error) {
    showPanel("#auth-panel");
    setMode("login");
    status.textContent = error.message;
  }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  try {
    if (mode === "register") {
      await createUserWithEmailAndPassword(auth, emailField.value.trim(), passwordField.value);
      currentUser = auth.currentUser;
      await api("register", "POST", { full_name: form.elements.full_name.value, phone: form.elements.phone.value });
    } else if (mode === "login") {
      await signInWithEmailAndPassword(auth, emailField.value.trim(), passwordField.value);
      currentUser = auth.currentUser;
      const account = await api("me");
      if (!account.data?.reseller) { setMode("profile"); return; }
    } else {
      await api("register", "POST", { full_name: form.elements.full_name.value, phone: form.elements.phone.value });
    }
    await loadAccount();
  } catch (error) {
    status.textContent = error?.code === "auth/email-already-in-use" ? "An account already exists with this email. Choose sign in instead." : error?.code === "auth/weak-password" ? "Choose a password with at least 6 characters." : error?.message || "Unable to continue. Please try again.";
  } finally { submit.disabled = false; }
});
switchMode.addEventListener("click", () => setMode(mode === "register" ? "login" : "register"));
$("[data-logout]").addEventListener("click", async () => { await signOut(auth); setMode("login"); });
document.querySelectorAll("[data-refresh]").forEach((button) => button.addEventListener("click", loadAccount));
$("#refresh-inventory").addEventListener("click", loadInventoryAndOrders);
$("#refresh-orders").addEventListener("click", loadInventoryAndOrders);
$("#place-order").addEventListener("click", async () => {
  const items = renderCart();
  if (!items.length) return;
  const button = $("#place-order");
  button.disabled = true;
  $("#cart-status").textContent = "Submitting stock order…";
  try {
    const result = await api("stock-orders", "POST", { items, reseller_notes: $("#order-note").value });
    cart.clear(); $("#order-note").value = ""; renderCart();
    $("#cart-status").textContent = "Order " + result.data.order_number + " submitted. Total payable: " + money(result.data.total_amount, result.data.currency) + ". Please arrange payment with M.H.R.; stock is not released until payment is verified.";
    await loadAccount();
  } catch (error) { $("#cart-status").textContent = error.message; }
  finally { button.disabled = cart.size === 0; }
});
onAuthStateChanged(auth, () => loadAccount());
