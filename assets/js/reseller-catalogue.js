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
    for (const label of ["Package", "Stock amount", "Resale amount", "Your commission"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; tr.append(th); }
    thead.append(tr); table.append(thead);
    const tbody = document.createElement("tbody");
    for (const pkg of (product.packages || []).filter((item) => Number(item.is_enabled) === 1)) {
      const row = document.createElement("tr");
      for (const value of [pkg.package_label, money(pkg.stock_unit_price, product.currency), money(pkg.customer_price, product.currency), money(pkg.reseller_share, product.currency)]) { const td = document.createElement("td"); td.textContent = value || ""; row.append(td); }
      tbody.append(row);
    }
    table.append(tbody); const wrap = document.createElement("div"); wrap.style.overflowX = "auto"; wrap.append(table);
    const button = document.createElement("button"); button.className = "button button-primary"; button.type = "button"; button.textContent = "View product"; button.addEventListener("click", () => openProduct(product));
    card.append(marker, details, wrap, button); list.append(card);
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
  for (const label of ["Package", "Stock amount", "Resale amount", "Your commission", "M.H.R. stock", "Your stock", "Order quantity", "Action"]) { const th = document.createElement("th"); th.scope = "col"; th.textContent = label; header.append(th); }
  thead.append(header); table.append(thead);
  const tbody = document.createElement("tbody");
  const enabledPackages = (product.packages || []).filter((item) => Number(item.is_enabled) === 1);
  for (const pkg of enabledPackages) {
    const row = document.createElement("tr");
    for (const value of [pkg.package_label || "Package", money(pkg.stock_unit_price, product.currency), money(pkg.customer_price, product.currency), money(pkg.reseller_share, product.currency), String(pkg.stock_quantity ?? 0), String(pkg.reseller_stock_quantity || 0)]) { const td = document.createElement("td"); td.textContent = value; row.append(td); }
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
      const destination = new URL("../index.html", location.href);
      destination.searchParams.set("order_package", String(pkg.package_id || pkg.id));
      destination.searchParams.set("quantity", String(quantity));
      destination.hash = "stock-cart";
      location.href = destination.href;
    });
    actionCell.append(order); row.append(actionCell); tbody.append(row);
  }
  table.append(tbody); const wrap = document.createElement("div"); wrap.style.overflowX = "auto"; wrap.append(table);
  $("#detail-information").append(wrap);
  const instruction = document.createElement("p"); instruction.className = "settings-notice";
  instruction.textContent = enabledPackages.length ? "Choose the package size, enter how many you want, then select “Order this package”. Your selection will be added to your stock order for review before you submit it." : "No package options are available for this product yet.";
  $("#detail-information").append(instruction);
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
