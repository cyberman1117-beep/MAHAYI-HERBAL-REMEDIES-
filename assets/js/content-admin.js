const list = document.querySelector("[data-page-list]");

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

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

async function loadPages() {
  try {
    const result = await api("/api/content-pages");
    const pages = result.data || [];
    list.innerHTML = pages.length
      ? pages.map((page) => '<a class="admin-panel" href="./edit/?id=' + encodeURIComponent(page.id) + '">' +
          '<div><h2>' + escapeHtml(page.title || page.slug) + '</h2><p class="muted">' +
          escapeHtml(page.slug) + " · " + (Number(page.is_published) === 1 ? "Published" : "Draft") +
          " · Sort " + Number(page.sort_order || 0) + '</p></div><span class="button button-outline">Edit</span></a>').join("")
      : '<p class="muted">No information pages yet. Create your first page.</p>';
  } catch (error) {
    list.innerHTML = '<p class="muted">' + escapeHtml(error.message) + '</p>';
  }
}

loadPages();