const form = document.querySelector("[data-seo-form]");
const status = document.querySelector("[data-seo-status]");
const saveButton = form?.querySelector("button[type=submit]");
function setStatus(message) { if (status) status.textContent = message; }
function setFormValues(data = {}) {
  if (!form) return;
  form.elements.namedItem("site_title").value = data.site_title ?? "";
  form.elements.namedItem("meta_description").value = data.meta_description ?? "";
  form.elements.namedItem("canonical_url").value = data.canonical_url ?? "";
  form.elements.namedItem("robots_index").checked = Number(data.robots_index) === 1;
  form.elements.namedItem("robots_follow").checked = Number(data.robots_follow) === 1;
}
async function getToken() { await window.adminAuthReady; return window.getAdminIdToken(); }
async function loadSeoSettings() {
  setStatus("Loading current SEO settings…");
  const token = await getToken();
  const response = await fetch("/api/seo-settings", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to load SEO settings.");
  const data = payload.data || {};
  if (!data.site_title || !data.meta_description || !data.canonical_url) {
    try {
      const sr = await fetch("/api/store-settings", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
      const sp = await sr.json().catch(() => ({}));
      const store = sp?.data?.store || {};
      if (!data.site_title) data.site_title = store.store_name || "";
      if (!data.meta_description) data.meta_description = store.description || store.tagline || "";
      if (!data.canonical_url) data.canonical_url = window.location.origin;
    } catch {}
  }
  setFormValues(data);
  setStatus("SEO settings loaded.");
  if (saveButton) saveButton.disabled = false;
}
async function saveSeoSettings(event) {
  event.preventDefault();
  if (!form || !saveButton) return;
  if (!window.confirm("Save these SEO settings?")) return;
  saveButton.disabled = true;
  setStatus("Saving SEO settings…");
  try {
    const token = await getToken();
    const body = { site_title: form.elements.namedItem("site_title").value.trim(), meta_description: form.elements.namedItem("meta_description").value.trim(), canonical_url: form.elements.namedItem("canonical_url").value.trim(), robots_index: form.elements.namedItem("robots_index").checked === true, robots_follow: form.elements.namedItem("robots_follow").checked === true };
    const response = await fetch("/api/seo-settings", { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }, cache: "no-store", body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to save SEO settings.");
    if (!payload.data) throw new Error("SEO settings were saved without a returned database record.");
    setFormValues(payload.data);
    setStatus("SEO settings saved and verified.");
  } catch (error) { setStatus(error?.message || "Unable to save SEO settings."); }
  finally { saveButton.disabled = false; }
}
form?.addEventListener("submit", saveSeoSettings);
loadSeoSettings().catch((error) => setStatus(error?.message || "Unable to load SEO settings."));