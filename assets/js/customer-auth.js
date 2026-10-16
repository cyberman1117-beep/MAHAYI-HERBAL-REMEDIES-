import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const accountPage = document.querySelector("[data-account-page]");
let mode = "login";

function setStatus(message) {
  const status = accountPage?.querySelector("[data-account-status]");
  if (status) { status.textContent = message; status.hidden = false; }
}

function authErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "That email already has an account. Please sign in instead.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Your password must be at least 6 characters.",
    "auth/operation-not-allowed": "Email/password customer sign-in is not enabled in Firebase yet.",
    "auth/network-request-failed": "The connection to customer sign-in failed. Check your internet connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again."
  };
  if (error?.code === "auth/unauthorized-domain") return "This website is not authorized in Firebase Authentication. Add the current website domain under Firebase Authentication → Settings → Authorized domains.";
  if (error?.code === "auth/invalid-api-key") return "Firebase rejected the project API key. Please verify the Firebase configuration.";
  return messages[error?.code] || (error?.code ? `Unable to complete the request (${error.code}). Please try again.` : "Unable to complete the request. Please try again.");
}

function renderAccountMenu(user) {
  accountPage.innerHTML = `
    <div class="account-card">
      <div class="settings-heading">
        <div>
          <p class="eyebrow">Your account</p>
          <h1>Account</h1>
          <p class="muted">Manage your customer information and view your orders.</p>
        </div>
        <button class="button button-outline" type="button" data-account-logout>Log out</button>
      </div>
      <div class="account-options">
        <a class="account-option" href="customer-information.html"><span><strong>Account Information</strong><small>Contact and delivery details saved to your account.</small></span><span aria-hidden="true">→</span></a>
        <a class="account-option" href="customer-orders.html"><span><strong>My Orders</strong><small>View your purchases, order status and order details.</small></span><span aria-hidden="true">→</span></a>
        <a class="account-option" href="customer-communications.html"><span><strong>Live Chat</strong><small>Contact the store about questions, orders and support.</small></span><span aria-hidden="true">→</span></a>
      </div>
    </div>`;

  accountPage.querySelector("[data-account-logout]")?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.reload();
  });
}

function renderAuthForm() {
  accountPage.innerHTML = `
    <div class="account-card">
      <p class="eyebrow">Customer account</p>
      <h1>${mode === "login" ? "Sign in" : "Create your account"}</h1>
      <p class="muted">${mode === "login" ? "Sign in to access your account, orders and saved customer information." : "Create an account so your customer information and orders can be securely connected to you."}</p>
      <form class="settings-form" data-account-form>
        <label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="6" required></label>
        ${mode === "register" ? `
        <div class="settings-group">
          <p class="settings-readonly">Delivery address</p>
          <label class="field"><span>Full name</span><input name="full_name" autocomplete="name" required></label>
          <label class="field"><span>Phone number</span><input name="phone" type="tel" autocomplete="tel" required></label>
          <label class="field"><span>Street / address</span><input name="address" autocomplete="street-address" required></label>
          <div class="settings-fields-two">
            <label class="field"><span>City / Town</span><input name="city" autocomplete="address-level2" required></label>
            <label class="field"><span>Province</span><input name="province" autocomplete="address-level1" required></label>
          </div>
          <div class="settings-fields-two">
            <label class="field"><span>Postal code</span><input name="postal_code" autocomplete="postal-code" required></label>
            <label class="field"><span>Country</span><input name="country" autocomplete="country-name" value="South Africa" required></label>
          </div>
        </div>` : ""}
        <p class="checkout-notice" data-account-status aria-live="polite" hidden></p>
        <button class="button button-primary" type="submit">${mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <button class="text-link" type="button" data-account-toggle>${mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"}</button>
    </div>`;

  accountPage.querySelector("[data-account-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = event.currentTarget.elements.email.value.trim();
    const password = event.currentTarget.elements.password.value;
    if (!event.currentTarget.checkValidity()) {
      event.currentTarget.reportValidity();
      return;
    }
    setStatus(mode === "login" ? "Signing in…" : "Creating account…");
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const details = Object.fromEntries(new FormData(event.currentTarget).entries());
        const token = await credential.user.getIdToken();
        const response = await fetch("/api/customer-profile", {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(details)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Your account was created, but your delivery address could not be saved. Please try again.");
        }
      }
      window.location.assign("account.html");
    } catch (error) { setStatus(authErrorMessage(error)); }
  });

  accountPage.querySelector("[data-account-toggle]")?.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    renderAuthForm();
  });
}

onAuthStateChanged(auth, (user) => { if (user) renderAccountMenu(user); else renderAuthForm(); });
