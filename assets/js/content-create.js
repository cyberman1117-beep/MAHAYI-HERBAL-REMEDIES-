const form = document.querySelector("[data-form]");
const status = document.querySelector("[data-status]");
const saveButton = document.querySelector("[data-save]");

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

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.checkValidity()) { form.reportValidity(); return; }
  saveButton.disabled = true;
  status.textContent = "Creating…";
  try {
    const result = await api("/api/content-pages", {
      method: "POST",
      body: JSON.stringify({
        title: form.elements.title.value.trim(),
        slug: form.elements.slug.value.trim(),
        content: form.elements.content.value,
        is_published: form.elements.is_published.checked,
        sort_order: Math.max(0, Math.floor(Number(form.elements.sort_order.value || 0)))
      })
    });
    const id = result.data?.id;
    if (!id) throw new Error("Page was created but its id was not returned.");
    window.location.href = "../edit/?id=" + encodeURIComponent(id);
  } catch (error) {
    status.textContent = error.message;
    saveButton.disabled = false;
  }
});