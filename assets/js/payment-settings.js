const form = document.querySelector("[data-payment-settings-form]");
const list = document.querySelector("[data-payment-provider-list]");
const status = document.querySelector("[data-payment-settings-status]");
const saveButton = form?.querySelector("button[type=submit]");

function setStatus(message) {
  if (status) status.textContent = message;
}

function renderProviders(providers) {
  if (!list) return;
  list.innerHTML = providers.map((provider) =>
    '<a class="settings-option payment-provider-option" href="/admin/settings/payments/' +
    encodeURIComponent(provider.provider_key) +
    '/">' +
    '<span><strong>' +
    provider.display_name +
    '</strong><small>' +
    (provider.is_enabled ? "Enabled for checkout." : "Not enabled for checkout.") +
    '</small></span>' +
    '<span class="settings-readonly">' +
    (provider.is_enabled ? "Enabled" : "Configure") +
    '</span></a>'
  ).join("");
}

async function loadPaymentSettings() {
  setStatus("Loading payment providers…");
  await window.adminAuthReady;
  const token = await window.getAdminIdToken();
  const response = await fetch("/api/payment-settings?admin=1", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load payment providers.");
  renderProviders(payload.data || []);
  setStatus("Payment provider settings loaded.");
  if (saveButton) saveButton.disabled = false;
}

loadPaymentSettings().catch((error) => {
  setStatus(error?.message || "Unable to load payment providers.");
});
