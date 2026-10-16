const id = new URLSearchParams(location.search).get("id");
const form = document.querySelector("[data-form]");
const title = document.querySelector("[data-title]");
const status = document.querySelector("[data-status]");
const saveButton = document.querySelector("[data-save]");
const deleteButton = document.querySelector("[data-delete]");

async function getToken() {
  if (typeof window.getAdminIdToken !== "function") throw new Error("Admin authentication is still loading.");
  const token = await window.getAdminIdToken();
  if (!token) throw new Error("Authentication required. Please sign in again.");
  return token;
}

async function api(url, options = {}) {
  const token = await getToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", "Bearer " + token);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || "Request failed.");
  return payload;
}

async function load() {
  if (!id) throw new Error("A page id is required.");
  const result = await api("/api/content-pages");
  const page = (result.data || []).find((item) => String(item.id) === String(id));
  if (!page) throw new Error("Information page not found.");
  title.textContent = "Edit " + (page.title || "Information Page");
  form.elements.title.value = page.title || "";
  form.elements.slug.value = page.slug || "";
  form.elements.content.value = page.content || "";
  form.elements.sort_order.value = Number(page.sort_order || 0);
  form.elements.is_published.checked = Number(page.is_published) === 1;
  status.textContent = "Page loaded.";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.checkValidity()) { form.reportValidity(); return; }
  saveButton.disabled = true;
  status.textContent = "Saving…";
  try {
    await api("/api/content-pages?id=" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify({
        title: form.elements.title.value.trim(),
        content: form.elements.content.value,
        is_published: form.elements.is_published.checked,
        sort_order: Math.max(0, Math.floor(Number(form.elements.sort_order.value || 0)))
      })
    });
    await load();
    status.textContent = "Changes saved.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

deleteButton?.addEventListener("click", async () => {
  if (!confirm("Delete this information page? This cannot be undone.")) return;
  deleteButton.disabled = true;
  status.textContent = "Deleting…";
  try {
    await api("/api/content-pages?id=" + encodeURIComponent(id), { method: "DELETE" });
    window.location.href = "../";
  } catch (error) {
    status.textContent = error.message;
    deleteButton.disabled = false;
  }
});

(async () => {
  try { await load(); }
  catch (error) {
    title.textContent = "Information page unavailable";
    status.textContent = error.message;
    form.querySelectorAll("input,textarea,button").forEach((control) => control.disabled = true);
  }
})();