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

function showPanel(selector) {
  panels.forEach((panel) => { $(panel).hidden = panel !== selector; });
}
function setMode(nextMode) {
  mode = nextMode;
  const profileOnly = mode === "profile";
  const registering = mode === "register" || profileOnly;
  $("#auth-title").textContent = profileOnly ? "Complete your reseller application" : registering ? "Create your reseller account" : "Sign in to your reseller account";
  $("#auth-intro").textContent = profileOnly ? "Add your contact details to submit your application for M.H.R. approval." : registering ? "Create an account to apply to the M.H.R. reseller programme." : "Sign in to access your reseller account.";
  $("#auth-legend").textContent = profileOnly ? "Your contact details" : "Account details";
  nameField.hidden = !registering;
  phoneField.hidden = !registering;
  emailField.hidden = profileOnly;
  passwordField.closest(".field").hidden = profileOnly;
  if (profileOnly) emailField.value = currentUser?.email || "";
  emailField.disabled = profileOnly;
  passwordField.required = !profileOnly;
  $("#auth-submit").textContent = profileOnly ? "Submit application" : registering ? "Create account & apply" : "Sign in";
  switchMode.hidden = profileOnly;
  switchMode.textContent = registering ? "I already have an account" : "Create reseller account";
  status.textContent = profileOnly ? "Your sign-in is ready. Complete your details below." : registering ? "New applications require M.H.R. approval." : "Sign in or create an account to apply.";
  showPanel("#auth-panel");
}
async function api(action, method = "GET", body) {
  if (!auth.currentUser) throw new Error("Please sign in to continue.");
  const token = await auth.currentUser.getIdToken();
  const url = new URL("/api/reseller-portal", location.origin);
  url.searchParams.set("action", action);
  const response = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Request failed. Please try again.");
  return payload;
}
function money(value, currency = "ZAR") {
  try { return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(Number(value || 0)); }
  catch { return "R" + Number(value || 0).toFixed(2); }
}
function renderProducts(products) {
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
    const title = document.createElement("h2");
    title.textContent = product.name;
    const category = document.createElement("p");
    category.className = "muted";
    category.textContent = product.category_name || "Reseller product";
    const description = document.createElement("p");
    description.className = "muted";
    description.textContent = product.description || "Quality product supplied by M.H.R.";
    const price = document.createElement("p");
    price.innerHTML = "";
    price.textContent = "Customer price: " + money(product.customer_price, product.currency);
    const earnings = document.createElement("p");
    earnings.className = "muted";
    earnings.textContent = "Your share per unit: " + money(product.reseller_share, product.currency);
    const minimum = document.createElement("p");
    minimum.className = "muted";
    minimum.textContent = "Minimum quantity: " + product.minimum_order_quantity;
    details.append(title, category, description, price, earnings, minimum);
    const label = document.createElement("span");
    label.className = "button button-outline";
    label.textContent = "Stock ordering coming next";
    card.append(marker, details, label);
    list.append(card);
  }
}
async function loadAccount() {
  currentUser = auth.currentUser;
  if (!currentUser) {
    $("#account-email").textContent = "";
    $("#logout")?.setAttribute("hidden", "");
    setMode("login");
    return;
  }
  $("[data-account-email]").textContent = currentUser.email || "Reseller account";
  $("[data-logout]").hidden = false;
  try {
    const result = await api("me");
    const reseller = result.data?.reseller;
    if (!reseller) {
      setMode("profile");
      return;
    }
    if (reseller.status !== "active") {
      showPanel("#pending-panel");
      $("#pending-title").textContent = reseller.status === "rejected" ? "Your application was not approved" : reseller.status === "suspended" ? "Your reseller account is suspended" : "Your reseller application is under review";
      $("#pending-message").textContent = reseller.status === "rejected"
        ? "Please contact M.H.R. if you believe this decision needs to be reviewed."
        : reseller.status === "suspended"
          ? "Reseller catalogue access is currently disabled. Contact M.H.R. for assistance."
          : "M.H.R. must approve your account before you can access reseller products. You can sign in here to check your status.";
      return;
    }
    showPanel("#dashboard-panel");
    $("#welcome-text").textContent = "Welcome, " + (reseller.full_name || "reseller") + ". Manage your M.H.R. reseller activity here.";
    $("#account-details").textContent = (reseller.full_name || "") + " · " + reseller.email + " · " + (reseller.phone || "");
    $("#products-status").textContent = "Loading products…";
    const products = await api("products");
    renderProducts(products.data?.products || []);
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
      const email = emailField.value.trim();
      const password = passwordField.value;
      await createUserWithEmailAndPassword(auth, email, password);
      currentUser = auth.currentUser;
      await api("register", "POST", { full_name: form.elements.full_name.value, phone: form.elements.phone.value });
    } else if (mode === "login") {
      await signInWithEmailAndPassword(auth, emailField.value.trim(), passwordField.value);
      currentUser = auth.currentUser;
      const account = await api("me");
      if (!account.data?.reseller) {
        setMode("profile");
        return;
      }
    } else {
      await api("register", "POST", { full_name: form.elements.full_name.value, phone: form.elements.phone.value });
    }
    await loadAccount();
  } catch (error) {
    status.textContent = error?.code === "auth/email-already-in-use"
      ? "An account already exists with this email. Choose sign in instead."
      : error?.code === "auth/weak-password"
        ? "Choose a password with at least 6 characters."
        : error?.message || "Unable to continue. Please try again.";
  } finally {
    submit.disabled = false;
  }
});
switchMode.addEventListener("click", () => setMode(mode === "register" ? "login" : "register"));
$("[data-logout]").addEventListener("click", async () => { await signOut(auth); setMode("login"); });
document.querySelectorAll("[data-refresh]").forEach((button) => button.addEventListener("click", loadAccount));
onAuthStateChanged(auth, () => loadAccount());
