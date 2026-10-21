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
let authFlowInProgress = false;
let products = [];
const cart = new Map();
const mixedCart = new Map();
const saleCart = new Map();
let checkoutType = "packages";

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
  form.elements.full_name.required = registering;
  form.elements.phone.required = registering;
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
function findPackage(packageId) {
  for (const product of products) {
    const pkg = (product.packages || []).find((item) => Number(item.package_id || item.id) === Number(packageId));
    if (pkg) return { product, pkg };
  }
  return null;
}
function renderProducts(data) {
  products = data;
  const routeUrl = new URL(location.href);
  const requestedPackage = routeUrl.searchParams.get("order_package");
  if (requestedPackage) {
    const cartUrl = new URL("cart/", location.href);
    cartUrl.search = routeUrl.search;
    location.replace(cartUrl.href);
    return;
  }
  const list = $("#product-list");
  list.replaceChildren();
  const available = products.filter((p) => (p.packages || []).some((pkg) => Number(pkg.is_enabled) === 1));
  if (!available.length) {
    $("#products-status").textContent = "No distributor products are available yet. Please check again later.";
    return;
  }
  $("#products-status").textContent = available.length + " distributor product" + (available.length === 1 ? "" : "s") + " available.";
  for (const product of available) {
    const card = document.createElement("article"); card.className = "reseller-dashboard-product";
    const marker = document.createElement("div"); marker.className = "reseller-dashboard-product-image";
    const details = document.createElement("div"); details.className = "reseller-dashboard-product-details";
    const title = document.createElement("h2"); title.textContent = product.name;
    const category = document.createElement("p"); category.className = "muted"; category.textContent = product.category_name || "Distributor product";
    const description = document.createElement("p"); description.className = "muted"; description.textContent = product.description || "Choose the package that suits your budget.";
    details.append(title, category, description);
    const productImageUrl = product.image_url && /^https?:\/\//i.test(product.image_url) ? product.image_url : "";
    if (productImageUrl) {
      const image = document.createElement("img"); image.src = productImageUrl; image.alt = product.name; image.loading = "lazy";
      marker.replaceChildren(image); marker.classList.add("has-image");
    } else {
      marker.textContent = "M.H.R.";
      marker.classList.add("is-placeholder");
    }
    const enabledPackages = (product.packages || []).filter((item) => Number(item.is_enabled) === 1);
    const prices = enabledPackages.map((pkg) => Number(pkg.stock_unit_price || 0));
    const priceLine = document.createElement("p"); priceLine.className = "reseller-dashboard-product-price";
    const minPrice = prices.length ? Math.min(...prices) : 0; const maxPrice = prices.length ? Math.max(...prices) : 0;
    priceLine.textContent = "Reseller cost per unit: " + (minPrice === maxPrice ? money(minPrice, product.currency) : money(minPrice, product.currency) + " – " + money(maxPrice, product.currency)) + " · " + enabledPackages.length + " package size" + (enabledPackages.length === 1 ? "" : "s");
    details.append(priceLine);
    const table = document.createElement("table"); table.className = "data-table";
    const thead = document.createElement("thead"), tr = document.createElement("tr");
    for (const label of ["Stock package", "Units/package", "Cost per unit", "Selling price/unit", "Profit/unit", "Package cost", "Packages available", "Order packages", "Choose"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; tr.append(th); }
    thead.append(tr); table.append(thead);
    const tbody = document.createElement("tbody");
    for (const pkg of (product.packages || []).filter((item) => Number(item.is_enabled) === 1)) {
      const row = document.createElement("tr");
      const label = document.createElement("td"); label.textContent = pkg.package_label || "Package";
      const units = Number(pkg.units_per_package || 1);
      const unitsCell = document.createElement("td"); unitsCell.textContent = String(units);
      const stockAmount = document.createElement("td"); stockAmount.textContent = money(pkg.stock_unit_price, product.currency);
      const resale = document.createElement("td"); resale.textContent = money(pkg.customer_price, product.currency);
      const commission = document.createElement("td"); commission.textContent = money(pkg.reseller_share, product.currency);
      const packageCost = document.createElement("td"); packageCost.textContent = money(Number(pkg.stock_unit_price) * units, product.currency);
      const stock = document.createElement("td"); stock.textContent = String(pkg.stock_quantity);
      const qtyCell = document.createElement("td"); const qty = document.createElement("input"); qty.type = "number"; qty.min = String(pkg.minimum_order_quantity || 1); qty.step = "1"; qty.value = String(pkg.minimum_order_quantity || 1); qty.style.width = "5.5rem"; qty.setAttribute("aria-label", "Quantity of " + product.name + " " + pkg.package_label);
      if (Number(pkg.stock_quantity) < Number(pkg.minimum_order_quantity || 1)) { qty.disabled = true; qty.value = "1"; }
      qtyCell.append(qty);
      const actions = document.createElement("td");
      const add = document.createElement("button"); add.className = "button button-primary"; add.type = "button"; add.textContent = "Order package";
      if (Number(pkg.stock_quantity) < Number(pkg.minimum_order_quantity || 1)) { add.disabled = true; add.textContent = "Out of stock"; }
      add.addEventListener("click", () => {
        const quantity = Number(qty.value), id = Number(pkg.package_id);
        const status = $("#stock-cart-status");
        if (!Number.isSafeInteger(quantity) || quantity < Number(pkg.minimum_order_quantity || 1)) { if(status)status.textContent = "Enter a whole-number quantity that meets this package’s minimum order."; return; }
        let saved = {}; let mixedSaved = {};
        try { saved = JSON.parse(localStorage.getItem("mhr_reseller_package_cart") || "{}"); } catch {}
        try { mixedSaved = JSON.parse(localStorage.getItem("mhr_reseller_mixed_cart") || "{}"); } catch {}
        const units = Number(pkg.units_per_package || 1), availableUnits = Number(pkg.stock_units_available ?? Number(pkg.stock_quantity || 0) * units);
        const alreadyNeeded = Number(saved[id] || 0) * units + Number(mixedSaved[id] || 0);
        if (alreadyNeeded + quantity * units > availableUnits) { if(status)status.textContent = "That quantity exceeds the remaining stock. Check your cart and try again."; return; }
        saved[id] = Number(saved[id] || 0) + quantity;
        localStorage.setItem("mhr_reseller_package_cart", JSON.stringify(saved));
        if(status)status.textContent = quantity + " full package(s) added to your cart. You can keep browsing or open your cart when ready.";
      });
      const addSale = document.createElement("button"); addSale.className = "button button-outline"; addSale.type = "button"; addSale.textContent = "Record sale"; addSale.style.marginTop = ".35rem";
      if (Number(pkg.reseller_stock_quantity || 0) < 1) { addSale.disabled = true; addSale.textContent = "No stock"; }
      addSale.addEventListener("click", () => {
        const quantity = Number(qty.value), id = Number(pkg.package_id);
        if (!Number.isSafeInteger(quantity) || quantity < 1) { $("#sale-cart-status").textContent = "Enter a whole-number quantity for the customer sale."; return; }
        if (quantity + (saleCart.get(id) || 0) > Number(pkg.reseller_stock_quantity || 0)) { $("#sale-cart-status").textContent = "Your inventory does not have enough " + product.name + " (" + pkg.package_label + ") for this sale."; return; }
        saleCart.set(id, (saleCart.get(id) || 0) + quantity); renderSaleCart();
        $("#sale-cart-status").textContent = product.name + " (" + pkg.package_label + ") added to the customer sale.";
      });
      const chooseMixed = document.createElement("button"); chooseMixed.className = "button button-outline"; chooseMixed.type = "button"; chooseMixed.textContent = "Choose individual units"; chooseMixed.style.marginTop = ".35rem"; chooseMixed.addEventListener("click", () => openMixedBuilder(product.id));
      actions.append(add, document.createTextNode(" "), addSale, document.createElement("br"), chooseMixed);
      row.append(label, unitsCell, stockAmount, resale, commission, packageCost, stock, qtyCell, actions); tbody.append(row);
    }
    table.append(tbody);
    const options = document.createElement("details"); options.className = "reseller-dashboard-product-options";
    const summary = document.createElement("summary"); summary.textContent = "Package options and actions";
    const wrap = document.createElement("div"); wrap.className = "reseller-dashboard-package-table"; wrap.append(table);
    options.append(summary, wrap);
    const mixedButton = document.createElement("button"); mixedButton.className = "button button-outline reseller-dashboard-mixed-button"; mixedButton.type = "button"; mixedButton.textContent = "Choose individual units"; mixedButton.addEventListener("click", () => { const destination = new URL("catalog/", location.href); destination.searchParams.set("product", String(product.id)); location.href = destination.href; });
    card.append(marker, details, options, mixedButton); list.append(card);
  }
}
function renderCart() {
  const box = $("#cart-items"); box.replaceChildren();
  let total = 0; const chosen = [];
  for (const [id, quantity] of cart) {
    const found = findPackage(id); if (!found) continue;
    const { product, pkg } = found;
    total += Number(pkg.stock_unit_price || 0) * Number(pkg.units_per_package || 1) * quantity;
    chosen.push({ package_id: id, quantity });
    const row = document.createElement("div"); row.className = "admin-panel";
    const details = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = product.name + " — " + pkg.package_label;
    const amount = document.createElement("p"); amount.className = "muted"; amount.textContent = quantity + " stock package(s) × " + Number(pkg.units_per_package || 1) + " unit(s) each = " + (quantity * Number(pkg.units_per_package || 1)) + " units; total to M.H.R.: " + money(Number(pkg.stock_unit_price) * Number(pkg.units_per_package || 1) * quantity, product.currency);
    details.append(title, amount);
    const remove = document.createElement("button"); remove.className = "button button-outline"; remove.type = "button"; remove.textContent = "Remove"; remove.addEventListener("click", () => { cart.delete(id); renderCart(); });
    row.append(details, remove); box.append(row);
  }
  if (!chosen.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Your order is empty."; box.append(p); }
  const payLater = $("#pay-later-mode")?.checked === true;
  $("#cart-total").textContent = "Package subtotal: " + money(total);
  $("#cart-count").textContent = cart.size + mixedCart.size + " item type" + (cart.size + mixedCart.size === 1 ? "" : "s");
  $("#checkout-packages").disabled = !chosen.length;
  return chosen;
}
function renderMixedCart() {
  const box = $("#mixed-cart-items"); if (!box) return [];
  box.replaceChildren(); let total = 0, unitCount = 0; const chosen = [];
  for (const [id, quantity] of mixedCart) {
    const found = findPackage(id); if (!found) continue; const { product, pkg } = found;
    total += Number(pkg.stock_unit_price || 0) * quantity; unitCount += quantity; chosen.push({ package_id: id, quantity });
    const row = document.createElement("div"); row.className = "admin-panel"; const details = document.createElement("div"); const title = document.createElement("h3"); title.textContent = product.name + " — " + pkg.package_label; const amount = document.createElement("p"); amount.className = "muted"; amount.textContent = quantity + " individual unit(s) × " + money(pkg.stock_unit_price, product.currency) + " = " + money(Number(pkg.stock_unit_price) * quantity, product.currency); details.append(title, amount); const remove = document.createElement("button"); remove.className = "button button-outline"; remove.type = "button"; remove.textContent = "Remove"; remove.addEventListener("click", () => { mixedCart.delete(id); renderMixedCart(); }); row.append(details, remove); box.append(row);
  }
  if (!chosen.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "No individual units selected."; box.append(p); }
  $("#mixed-cart-total").textContent = "Mixed order: " + unitCount + " individual unit(s) · " + money(total);
  $("#mixed-cart-total").textContent = "Mixed order subtotal: " + money(total);
  $("#checkout-mixed").disabled = unitCount < 10;
  $("#cart-count").textContent = cart.size + mixedCart.size + " item type" + (cart.size + mixedCart.size === 1 ? "" : "s");
  return chosen;
}
function renderSaleCart() {
  const box = $("#sale-cart-items"); box.replaceChildren();
  let total = 0; const chosen = [];
  for (const [id, quantity] of saleCart) {
    const found = findPackage(id); if (!found) continue;
    const { product, pkg } = found;
    total += Number(pkg.customer_price || 0) * quantity;
    chosen.push({ package_id: id, quantity });
    const row = document.createElement("div"); row.className = "admin-panel";
    const details = document.createElement("div");
    const title = document.createElement("h3"); title.textContent = product.name + " — " + pkg.package_label;
    const amount = document.createElement("p"); amount.className = "muted"; amount.textContent = quantity + " × " + money(pkg.customer_price, product.currency) + " = " + money(Number(pkg.customer_price) * quantity, product.currency);
    details.append(title, amount);
    const remove = document.createElement("button"); remove.className = "button button-outline"; remove.type = "button"; remove.textContent = "Remove"; remove.addEventListener("click", () => { saleCart.delete(id); renderSaleCart(); });
    row.append(details, remove); box.append(row);
  }
  if (!chosen.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "No packages selected for a sale."; box.append(p); }
  $("#sale-cart-total").textContent = "Customer sale total: " + money(total);
  $("#record-sale").disabled = !chosen.length;
  return chosen;
}
async function loadSales() {
  try {
    const result = await api("sales");
    const sales = result.data?.sales || [], items = result.data?.items || [];
    const list = $("#my-sales-list"); list.replaceChildren();
    $("#sales-status").textContent = sales.length ? sales.length + " customer sale(s)." : "You have not recorded a customer sale yet.";
    for (const sale of sales) {
      const lines = items.filter(item => Number(item.reseller_order_id) === Number(sale.id));
      list.append(makeCard(sale.order_number, ["Customer: " + (sale.customer_full_name || "Not provided"), "Customer total: " + money(sale.subtotal, sale.currency), "Your share: " + money(sale.reseller_earnings, sale.currency), "Customer payment: " + sale.payment_status, "Date: " + sale.created_at, ...lines.map(item => item.product_name + " × " + item.quantity)]));
    }
  } catch (e) { $("#sales-status").textContent = e.message; }
}
async function loadInventoryAndOrders() {
  try {
    const inv = await api("inventory");
    const list = $("#inventory-list"); list.replaceChildren();
    const items = inv.data?.inventory || [];
    $("#inventory-status").textContent = items.length ? items.length + " inventory product(s)." : "No stock has been released to your inventory yet.";
    for (const item of items) list.append(makeCard(item.name + (item.package_label ? " — " + item.package_label : ""), ["Available quantity: " + item.quantity_available, "SKU: " + (item.sku || "—"), "Last updated: " + item.updated_at]));
  } catch (e) { $("#inventory-status").textContent = e.message; }
  try {
    const result = await api("stock-orders");
    const orders = result.data?.orders || [];
    const items = result.data?.items || [];
    const list = $("#orders-list"); list.replaceChildren();
    $("#orders-status").textContent = orders.length ? orders.length + " stock order(s)." : "You have not placed a stock order yet.";
    for (const order of orders) {
      const lines = items.filter(item => Number(item.reseller_stock_order_id) === Number(order.id));
      const card = makeCard(order.order_number, ["Total: " + money(order.total_amount, order.currency), "Payment: " + order.payment_status, "Arrangement: " + (order.fulfilment_mode === "pay_later" ? "Approved pay-later stock" : "Upfront stock purchase"), "Stock order: " + order.order_status, "Submitted: " + order.created_at, ...lines.map(item => item.product_name + " × " + item.quantity), order.payment_reference ? "Payment reference: " + order.payment_reference : "Payment reference: not recorded"]);
      list.append(card);
    }
  } catch (e) { $("#orders-status").textContent = e.message; }
}
async function loadLedger() {
  try {
    const result = await api("ledger");
    const outstanding = Number(result.data?.outstanding || 0);
    $("#outstanding-balance").textContent = money(outstanding);
    $("#outstanding-note").textContent = outstanding > 0 ? "Company share to settle" : "No outstanding balance";
    const entries = result.data?.entries || [], list = $("#ledger-list"); list.replaceChildren();
    $("#ledger-status").textContent = entries.length ? entries.length + " ledger entry(s)." : "No pay-later sales or settlements recorded.";
    for (const entry of entries) {
      const kind = entry.movement_type === "settlement" ? "Settlement received" : entry.movement_type === "stock_sold_on_credit" ? "Company share due from sale" : "Account adjustment";
      list.append(makeCard(kind, [(entry.amount_debit > 0 ? "Amount due: " + money(entry.amount_debit) : "Payment received: " + money(entry.amount_credit)), entry.payment_reference ? "Reference: " + entry.payment_reference : "", entry.notes || "", entry.created_at].filter(Boolean)));
    }
  } catch (e) { $("#ledger-status").textContent = e.message; }
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

  let result;
  try {
    result = await api("me");
  } catch (error) {
    showPanel("#auth-panel");
    setMode("login");
    status.textContent = "We couldn't verify your reseller account. Your login is still active. Please retry in a moment. " + error.message;
    return;
  }

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
  $("#pay-later-note").textContent = Number(reseller.pay_later_enabled) === 1 ? "M.H.R. has granted your account restricted distributor privileges. Standard upfront stock orders remain available here; arrange the approved pay-later stock issue and settlement terms directly with M.H.R." : "The standard buy-stock-first arrangement is active for your account. Receiving stock and paying later is restricted to distributors approved by M.H.R.";
  $(".admin-status").textContent = Number(reseller.pay_later_enabled) === 1 ? "Approved distributor" : "Standard reseller";
  $(".admin-stats .stat-card:nth-child(3) strong").textContent = Number(reseller.pay_later_enabled) === 1 ? "Approved" : "No access";
  $(".admin-stats .stat-card:nth-child(3) small").textContent = Number(reseller.pay_later_enabled) === 1 ? "Approved for pay-later stock requests" : "Reserved for selected distributors";
  $("#products-status").textContent = "Loading products…";
  try {
    const productData = await api("products");
    renderProducts(productData.data?.products || []);
    renderSaleCart();
    const routeUrl = new URL(location.href); const mixedProduct = routeUrl.searchParams.get("mixed_product");
    if (mixedProduct) { const cartUrl = new URL("cart/", location.href); cartUrl.searchParams.set("mixed_product", mixedProduct); location.replace(cartUrl.href); return; }
  } catch (error) {
    $("#products-status").textContent = "Your account is signed in, but the catalogue could not load: " + error.message;
  }
  await loadInventoryAndOrders();
  await loadSales();
  await loadLedger();
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  authFlowInProgress = true;
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
    if (mode === "register" && auth.currentUser) {
      currentUser = auth.currentUser;
      setMode("profile");
      status.textContent = "Your login account was created, but the reseller application did not finish. Complete your details below to retry. " + (error?.message || "");
    } else {
      status.textContent = error?.code === "auth/email-already-in-use" ? "An account already exists with this email. Choose sign in instead." : error?.code === "auth/weak-password" ? "Choose a password with at least 6 characters." : error?.message || "Unable to continue. Please try again.";
    }
  } finally { authFlowInProgress = false; submit.disabled = false; }
});
switchMode.addEventListener("click", () => setMode(mode === "register" ? "login" : "register"));
$("[data-logout]").addEventListener("click", async () => { await signOut(auth); setMode("login"); });
document.querySelectorAll("[data-refresh]").forEach((button) => button.addEventListener("click", loadAccount));
$("#refresh-sales").addEventListener("click", loadSales);
$("#refresh-ledger").addEventListener("click", loadLedger);
$("#record-sale").addEventListener("click", async () => {
  const items = renderSaleCart(); if (!items.length) return;
  const button = $("#record-sale"); button.disabled = true; $("#sale-cart-status").textContent = "Recording customer sale…";
  try {
    const result = await api("sales", "POST", { items, customer_full_name: $("#sale-customer-name").value, customer_phone: $("#sale-customer-phone").value, payment_status: $("#sale-payment-status").value, customer_notes: $("#sale-note").value });
    saleCart.clear(); $("#sale-customer-name").value = ""; $("#sale-customer-phone").value = ""; $("#sale-note").value = ""; renderSaleCart();
    $("#sale-cart-status").textContent = "Sale " + result.data.order_number + " recorded. Your share: " + money(result.data.reseller_earnings, result.data.currency) + ".";
    await loadAccount();
  } catch (error) { $("#sale-cart-status").textContent = error.message; }
  finally { button.disabled = saleCart.size === 0; }
});
$("#refresh-inventory").addEventListener("click", loadInventoryAndOrders);
$("#refresh-orders").addEventListener("click", loadInventoryAndOrders);
function openMixedBuilder(productId) {
  const cartUrl = new URL("cart/", location.href);
  if (productId != null) cartUrl.searchParams.set("mixed_product", String(productId));
  location.href = cartUrl.href;
}
onAuthStateChanged(auth, () => { if (!authFlowInProgress) loadAccount(); });
