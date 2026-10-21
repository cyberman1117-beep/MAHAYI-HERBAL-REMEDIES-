import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const $ = (selector) => document.querySelector(selector);
let products = [];
let loadedUser = null;

function money(value, currency = "ZAR") {
  try { return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(Number(value || 0)); }
  catch { return "R" + Number(value || 0).toFixed(2); }
}
function setStatus(message) { $("#catalogue-status").textContent = message; }
const CART_KEYS = { packages: "mhr_reseller_package_cart", mixed: "mhr_reseller_mixed_cart" };
function readCartMap(key) {
  try { const value = JSON.parse(localStorage.getItem(key) || "{}"); return new Map(Object.entries(value).map(([id,qty]) => [Number(id),Number(qty)]).filter(([id,qty]) => Number.isSafeInteger(id) && Number.isSafeInteger(qty) && id > 0 && qty > 0)); }
  catch { return new Map(); }
}
function writeCartMap(key, map) { localStorage.setItem(key, JSON.stringify(Object.fromEntries(map))); updateCartLink(); }
function updateCartLink() {
  const link = $("#catalogue-cart-link"); if (!link) return;
  const full = readCartMap(CART_KEYS.packages), units = readCartMap(CART_KEYS.mixed);
  link.textContent = "Cart (" + (full.size + units.size) + ")";
}
function showCartMessage(message) {
  const status = $("#catalogue-cart-status");
  if (status) status.textContent = message;
  updateCartLink();
}
function addFullPackageToCart(pkg, quantity) {
  const id = Number(pkg.package_id || pkg.id), full = readCartMap(CART_KEYS.packages), mixed = readCartMap(CART_KEYS.mixed);
  const unitsPerPackage = Number(pkg.units_per_package || 1);
  const stockUnits = Number(pkg.stock_units_available ?? Number(pkg.stock_quantity || 0) * unitsPerPackage);
  const alreadyNeeded = (full.get(id) || 0) * unitsPerPackage + (mixed.get(id) || 0);
  if (!Number.isSafeInteger(quantity) || quantity < Number(pkg.minimum_order_quantity || 1)) return "Choose a whole package quantity that meets the minimum.";
  if (alreadyNeeded + quantity * unitsPerPackage > stockUnits) return "That quantity exceeds the remaining stock. Check your cart and try again.";
  full.set(id, (full.get(id) || 0) + quantity); writeCartMap(CART_KEYS.packages, full);
  return quantity + " full package(s) added to your cart. You can keep shopping.";
}
function openMixedBuilder(product) {
  const box = $("#catalogue-mixed-builder-options"); if (!box) return;
  box.replaceChildren();
  const full = readCartMap(CART_KEYS.packages), mixed = readCartMap(CART_KEYS.mixed);
  const section = document.createElement("section"); section.className = "mixed-builder-product";
  const heading = document.createElement("div"); heading.className = "mixed-builder-product-heading";
  const title = document.createElement("h3"); title.textContent = product.name;
  const intro = document.createElement("p"); intro.textContent = "Choose individual units for each size. Your selection will be added to the shared cart.";
  heading.append(title,intro); section.append(heading);
  const options = (product.packages || []).filter(pkg => Number(pkg.is_enabled) === 1);
  for (const pkg of options) {
    const id = Number(pkg.package_id || pkg.id), unitsPerPackage = Number(pkg.units_per_package || 1);
    const stockUnits = Number(pkg.stock_units_available ?? Number(pkg.stock_quantity || 0) * unitsPerPackage);
    const remaining = Math.max(0, stockUnits - (full.get(id) || 0) * unitsPerPackage - (mixed.get(id) || 0));
    if (!remaining) continue;
    const row = document.createElement("label"); row.className = "mixed-builder-option";
    const info = document.createElement("span"); info.className = "mixed-builder-option-info";
    const name = document.createElement("strong"); name.className = "mixed-builder-option-name"; name.textContent = pkg.package_label;
    const price = document.createElement("span"); price.className = "mixed-builder-option-price"; price.textContent = money(pkg.stock_unit_price, product.currency) + " per unit";
    const stock = document.createElement("span"); stock.className = "mixed-builder-option-stock"; stock.textContent = remaining + " individual units available for your cart";
    info.append(name,price,stock);
    const qwrap = document.createElement("span"); qwrap.className = "mixed-builder-quantity-wrap";
    const qlabel = document.createElement("span"); qlabel.className = "mixed-builder-quantity-label"; qlabel.textContent = "Quantity";
    const input = document.createElement("input"); input.className = "mixed-builder-quantity"; input.type = "number"; input.min = "0"; input.max = String(remaining); input.step = "1"; input.inputMode = "numeric"; input.value = "0"; input.dataset.packageId = String(id); input.dataset.price = String(pkg.stock_unit_price || 0); input.dataset.max = String(remaining); input.setAttribute("aria-label",product.name+" "+pkg.package_label+" individual unit quantity");
    qwrap.append(qlabel,input); row.append(info,qwrap); section.append(row);
  }
  if (!section.querySelector("input")) { const empty = document.createElement("p"); empty.className = "mixed-builder-empty"; empty.textContent = "No individual units remain available for this product."; section.append(empty); }
  box.append(section); updateCatalogueMixedSummary();
  $("#catalogue-mixed-builder-status").textContent = "Minimum order: 10 individual units combined across your cart before checkout.";
  const dialog = $("#catalogue-mixed-builder-dialog"); if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open","");
}
function updateCatalogueMixedSummary() {
  const inputs = [...($("#catalogue-mixed-builder-options")?.querySelectorAll("input[data-package-id]") || [])];
  const units = inputs.reduce((sum,input) => sum + Math.max(0,Number(input.value)||0),0);
  const total = inputs.reduce((sum,input) => sum + Math.max(0,Number(input.value)||0) * Number(input.dataset.price || 0),0);
  const summary = $("#catalogue-mixed-builder-summary"); if (summary) summary.textContent = units + " individual unit" + (units === 1 ? "" : "s") + " selected · Estimated subtotal " + money(total);
  const button = $("#catalogue-add-mixed-to-cart"); if (button) button.disabled = units === 0;
}
async function api(action) {
  if (!auth.currentUser) throw new Error("Please sign in to continue.");
  const token = await auth.currentUser.getIdToken();
  const url = new URL("/api/reseller-portal", location.origin);
  url.searchParams.set("action", action);
  const response = await fetch(url, { headers: { Authorization: "Bearer " + token, Accept: "application/json" }, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load the reseller catalogue.");
  return payload;
}
function addDetailLine(label, value) {
  const card = document.createElement("article");
  card.className = "admin-panel";
  const marker = document.createElement("div");
  marker.className = "panel-icon";
  marker.textContent = "M.H.R.";
  const content = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = label;
  const description = document.createElement("p");
  description.className = "muted";
  description.textContent = value;
  content.append(heading, description);
  card.append(marker, content);
  $("#detail-information").append(card);
}
function openProduct(product) {
  const url = new URL(location.href);
  url.searchParams.set("product", String(product.id));
  history.pushState({}, "", url);
  renderRoute();
}
function renderList() {
  const query = $("#catalogue-search").value.trim().toLowerCase();
  const matching = products.filter((product) => [product.name, product.category_name, product.description, product.sku]
    .some((value) => String(value || "").toLowerCase().includes(query)));
  const list = $("#catalogue-list"); list.replaceChildren();
  $("#catalogue-results-status").textContent = matching.length + " product" + (matching.length === 1 ? "" : "s") + " found.";
  for (const product of matching) {
    const card = document.createElement("article"); card.className = "admin-panel";
    const marker = document.createElement("div"); marker.className = "panel-icon"; marker.textContent = "M.H.R.";
    const details = document.createElement("div");
    const title = document.createElement("h2"); title.textContent = product.name;
    const category = document.createElement("p"); category.className = "muted"; category.textContent = product.category_name || "Distributor product";
    const description = document.createElement("p"); description.className = "muted"; description.textContent = product.description || "Choose the package that suits your budget.";
    details.append(title, category, description);
    if (product.image_url && /^https?:\/\//i.test(product.image_url)) { const image = document.createElement("img"); image.src = product.image_url; image.alt = product.name; image.loading = "lazy"; image.style.width = "min(100%, 240px)"; image.style.height = "auto"; image.style.objectFit = "contain"; details.prepend(image); }
    const table = document.createElement("table"); table.className = "data-table";
    const thead = document.createElement("thead"), tr = document.createElement("tr");
    for (const label of ["Stock package", "Units/package", "Cost per unit", "Selling price/unit", "Profit/unit", "Package cost"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; tr.append(th); }
    thead.append(tr); table.append(thead);
    const tbody = document.createElement("tbody");
    for (const pkg of (product.packages || []).filter((item) => Number(item.is_enabled) === 1)) {
      const row = document.createElement("tr");
      for (const value of [pkg.package_label, String(pkg.units_per_package || 1), money(pkg.stock_unit_price, product.currency), money(pkg.customer_price, product.currency), money(pkg.reseller_share, product.currency), money(Number(pkg.stock_unit_price) * Number(pkg.units_per_package || 1), product.currency)]) { const td = document.createElement("td"); td.textContent = value || ""; row.append(td); }
      tbody.append(row);
    }
    table.append(tbody); const wrap = document.createElement("div"); wrap.style.overflowX = "auto"; wrap.append(table);
    const button = document.createElement("button"); button.className = "button button-primary"; button.type = "button"; button.textContent = "View product"; button.addEventListener("click", () => openProduct(product));
    const mixedButton = document.createElement("button"); mixedButton.className = "button button-outline"; mixedButton.type = "button"; mixedButton.textContent = "Choose individual units"; mixedButton.addEventListener("click", () => openMixedBuilder(product));
    card.append(marker, details, wrap, button, mixedButton); list.append(card);
  }
}
function renderRoute() {
  const productId = new URL(location.href).searchParams.get("product");
  const product = products.find((item) => String(item.id) === productId);
  const isDetail = Boolean(productId);
  $("#catalogue-list-panel").hidden = isDetail;
  $("#product-detail-panel").hidden = !isDetail;
  $("#catalogue-title").textContent = isDetail ? "Product Details" : "Product Catalogue";
  $("#catalogue-intro").textContent = isDetail
    ? "Review the current product information and reseller terms below."
    : "Browse available products and open any product to see its full reseller pricing and stock details.";
  if (!isDetail) { renderList(); return; }
  if (!product) {
    $("#detail-name").textContent = "Product not found";
    $("#detail-category").textContent = "Catalogue";
    $("#detail-description").textContent = "This product may no longer be active. Return to the catalogue and choose an available product.";
    $("#detail-information").replaceChildren();
    $("#dashboard-product-link").href = "./";
    return;
  }
  $("#detail-name").textContent = product.name;
  $("#detail-category").textContent = product.category_name || "Reseller product";
  $("#detail-description").textContent = product.description || "Quality product supplied by M.H.R.";
  let image = document.querySelector("#detail-product-image");
  if (!image) { image = document.createElement("img"); image.id = "detail-product-image"; image.style.width = "min(100%, 360px)"; image.style.height = "auto"; image.style.objectFit = "contain"; image.style.borderRadius = ".75rem"; $("#detail-description").before(image); }
  image.hidden = !(product.image_url && /^https:\/\//i.test(product.image_url));
  if (!image.hidden) { image.src = product.image_url; image.alt = product.name; }
  $("#detail-information").replaceChildren();
  addDetailLine("SKU", product.sku || "Not provided");
  const imageUrl = product.image_url && /^https?:\/\//i.test(product.image_url) ? product.image_url : "";
  const table = document.createElement("table"); table.className = "data-table";
  const thead = document.createElement("thead"), header = document.createElement("tr");
  for (const label of ["Stock package", "Units/package", "Cost per unit", "Selling price/unit", "Profit/unit", "Package cost", "Stock packages available", "Your units", "Order packages", "Action"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; header.append(th); }
  thead.append(header); table.append(thead);
  const tbody = document.createElement("tbody");
  const enabledPackages = (product.packages || []).filter((item) => Number(item.is_enabled) === 1);
  const mixedButton = document.createElement("button"); mixedButton.type = "button"; mixedButton.className = "button button-outline"; mixedButton.textContent = "Choose individual units"; mixedButton.addEventListener("click", () => openMixedBuilder(product));
  $("#detail-information").append(mixedButton);
  for (const pkg of enabledPackages) {
    const row = document.createElement("tr");
    for (const value of [pkg.package_label || "Package", String(pkg.units_per_package || 1), money(pkg.stock_unit_price, product.currency), money(pkg.customer_price, product.currency), money(pkg.reseller_share, product.currency), money(Number(pkg.stock_unit_price) * Number(pkg.units_per_package || 1), product.currency), String(pkg.stock_quantity ?? 0), String(pkg.reseller_stock_quantity || 0)]) { const td = document.createElement("td"); td.textContent = value; row.append(td); }
    const qtyCell = document.createElement("td");
    const qty = document.createElement("input"); qty.type = "number"; qty.min = String(pkg.minimum_order_quantity || 1); qty.step = "1"; qty.value = String(pkg.minimum_order_quantity || 1); qty.style.width = "5.5rem"; qty.setAttribute("aria-label", "Order quantity for " + pkg.package_label); qtyCell.append(qty); row.append(qtyCell);
    const actionCell = document.createElement("td");
    const order = document.createElement("button"); order.type = "button"; order.className = "button button-primary"; order.textContent = "Order this package"; order.style.minWidth = "10rem";
    const enoughStock = Number(pkg.stock_quantity) >= Number(pkg.minimum_order_quantity || 1);
    if (!enoughStock) { order.disabled = true; order.textContent = "Currently unavailable"; qty.disabled = true; }
    order.addEventListener("click", () => {
      const quantity = Number(qty.value);
      if (!Number.isSafeInteger(quantity) || quantity < Number(pkg.minimum_order_quantity || 1)) { qty.focus(); return; }
      if (quantity > Number(pkg.stock_quantity)) { qty.focus(); order.textContent = "Not enough stock"; return; }
      showCartMessage(addFullPackageToCart(pkg, quantity));
    });
    actionCell.append(order); row.append(actionCell); tbody.append(row);
  }
  table.append(tbody); const wrap = document.createElement("div"); wrap.style.overflowX = "auto"; wrap.append(table);
  $("#detail-information").append(wrap);
  const instruction = document.createElement("p"); instruction.className = "settings-notice";
  instruction.textContent = enabledPackages.length ? "Choose a stock package to add it to your cart, or select “Choose individual units” to build a mixed-size order. All orders go through your cart and checkout." : "No package options are available for this product yet.";
  $("#detail-information").append(instruction);
  const cartStatus = document.createElement("p"); cartStatus.id = "catalogue-cart-status"; cartStatus.className = "settings-notice"; cartStatus.setAttribute("role","status"); cartStatus.textContent = "Add items to your cart, then continue browsing or open your cart when ready."; $("#detail-information").append(cartStatus);
  $("#dashboard-product-link").href = "../index.html";
}
async function loadCatalogue() {
  $("#refresh-catalogue").disabled = true;
  setStatus("Loading your reseller account and current product catalogue…");
  try {
    const me = await api("me");
    const reseller = me.data?.reseller;
    if (!reseller) {
      setStatus("No reseller application was found for this account. Open the reseller portal dashboard to complete your application.");
      return;
    }
    if (reseller.status !== "active") {
      setStatus("Your reseller account is awaiting M.H.R. approval. The catalogue becomes available after approval.");
      return;
    }
    loadedUser = me.data.email || auth.currentUser.email || "";
    document.querySelector("[data-account-email]").textContent = loadedUser;
    const result = await api("products");
    products = Array.isArray(result.data?.products) ? result.data.products : [];
    $("#catalogue-status-panel").hidden = true;
    $("#catalogue-list-panel").hidden = false;
    renderRoute();
    if (!products.length) $("#catalogue-results-status").textContent = "No active, priced reseller products are available yet.";
  } catch (error) {
    setStatus(error.message + " You can return to the reseller dashboard to sign in or check your application.");
  } finally {
    $("#refresh-catalogue").disabled = false;
  }
}
$("#catalogue-search").addEventListener("input", renderList);
$("#catalogue-mixed-builder-options").addEventListener("input",event=>{if(event.target.matches("input[data-package-id]"))updateCatalogueMixedSummary();});
$("#catalogue-add-mixed-to-cart").addEventListener("click",()=>{
  const inputs=[...$("#catalogue-mixed-builder-options").querySelectorAll("input[data-package-id]")];
  const chosen=inputs.filter(input=>Number(input.value)>0);
  for(const input of chosen){const q=Number(input.value),max=Number(input.dataset.max);if(!Number.isSafeInteger(q)||q<0||q>max){$("#catalogue-mixed-builder-status").textContent="Use whole-number quantities within the available stock.";return;}}
  if(!chosen.length){$("#catalogue-mixed-builder-status").textContent="Choose at least one individual unit.";return;}
  const mixed=readCartMap(CART_KEYS.mixed);
  for(const input of chosen){const id=Number(input.dataset.packageId);mixed.set(id,(mixed.get(id)||0)+Number(input.value));}
  writeCartMap(CART_KEYS.mixed,mixed);$("#catalogue-mixed-builder-dialog").close();showCartMessage("Individual units added to your cart. You can continue shopping."); 
});
updateCartLink();
$("#refresh-catalogue").addEventListener("click", loadCatalogue);
window.addEventListener("popstate", renderRoute);
onAuthStateChanged(auth, (user) => {
  if (!user) {
    setStatus("Please sign in to your reseller account to access the catalogue.");
    return;
  }
  loadCatalogue();
});
document.querySelectorAll("[data-current-year]").forEach((element) => { element.textContent = String(new Date().getFullYear()); });
