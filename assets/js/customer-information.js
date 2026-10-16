import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { firebaseConfig } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const page = document.querySelector("[data-customer-information-page]");

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }

async function load(user) {
  page.innerHTML = `
    <div class="account-card">
      <div class="settings-heading"><div><p class="eyebrow">Your account</p><h1>Account Information</h1><p class="muted">Manage the contact and delivery details used during checkout.</p></div><a class="button button-outline" href="account.html">Back to Account</a></div>
      <form class="settings-form" data-profile-form>
        <div class="settings-group"><p class="settings-readonly">Account</p><label class="field"><span>Email address</span><input name="email" type="email" readonly></label></div>
        <div class="settings-group"><p class="settings-readonly">Contact information</p><div class="settings-fields"><label class="field"><span>Full name</span><input name="full_name" required></label><label class="field"><span>Phone number</span><input name="phone" type="tel" required></label></div></div>
        <div class="settings-group"><p class="settings-readonly">Delivery address</p><div class="settings-fields"><label class="field"><span>Street / address</span><input name="address" required></label><div class="settings-fields-two"><label class="field"><span>City / Town</span><input name="city" required></label><label class="field"><span>Province</span><input name="province" required></label></div><div class="settings-fields-two"><label class="field"><span>Postal code</span><input name="postal_code" required></label><label class="field"><span>Country</span><input name="country" value="South Africa" required></label></div></div></div>
        <p class="checkout-notice" data-status hidden></p>
        <div class="settings-actions"><a class="button button-outline" href="account.html">Cancel</a><button class="button button-primary" type="submit">Save Customer Information</button></div>
      </form>
    </div>`;

  const form = page.querySelector("[data-profile-form]");
  form.elements.email.value = user.email || "";
  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/customer-profile", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load your customer information.");
    const profile = payload.data || {};
    for (const field of ["full_name","phone","address","city","province","postal_code","country"]) if (form.elements[field] && profile[field]) form.elements[field].value = profile[field];
    if (profile.status === "suspended") {
      const status = page.querySelector("[data-status]");
      status.textContent = profile.suspension_reason ? `Your customer account is suspended: ${profile.suspension_reason}` : "Your customer account is suspended. Please contact the store.";
      status.hidden = false;
      form.querySelectorAll("input:not([readonly])").forEach(input => input.disabled = true);
      form.querySelector('button[type="submit"]').disabled = true;
    }
  } catch (error) {
    const status = page.querySelector("[data-status]"); status.textContent = error.message; status.hidden = false;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const button = form.querySelector('button[type="submit"]'), status = page.querySelector("[data-status]");
    button.disabled = true; status.hidden = false; status.textContent = "Saving your customer information…";
    try {
      const token = await user.getIdToken();
      const details = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/customer-profile", { method:"PUT", headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json", Accept:"application/json" }, body:JSON.stringify(details) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to save your customer information.");
      status.textContent = "Your customer information has been saved.";
    } catch (error) { status.textContent = error.message || "Unable to save your customer information."; }
    finally { button.disabled = false; }
  });
}

onAuthStateChanged(auth, user => {
  if (user) load(user);
  else page.innerHTML = '<div class="account-card"><p class="eyebrow">Customer account</p><h1>Sign in required</h1><p class="muted">Please sign in to view your account information.</p><a class="button button-primary" href="account.html">Go to Account</a></div>';
});
