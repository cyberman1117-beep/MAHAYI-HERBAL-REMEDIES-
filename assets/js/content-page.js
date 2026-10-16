const params = new URLSearchParams(window.location.search);
const slug = String(params.get("slug") || "").trim();
const titleElement = document.querySelector("[data-information-title]");
const contentElement = document.querySelector("[data-information-content]");
const navigationElement = document.querySelector("[data-information-navigation]");
const statusElement = document.querySelector("[data-information-status]");

const renderNavigation = (pages = []) => {
  if (!navigationElement) return;
  navigationElement.innerHTML = pages.map((page) => {
    const active = page.slug === slug ? ' aria-current="page"' : "";
    return '<a href="information.html?slug=' + encodeURIComponent(page.slug) + '"' + active + '>' +
      escapeHtml(page.title || page.slug) + '</a>';
  }).join("");
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

const load = async () => {
  if (!slug) {
    if (titleElement) titleElement.textContent = "Information";
    if (statusElement) statusElement.textContent = "Choose an information page.";
    return;
  }

  try {
    const response = await fetch("/api/content-pages?slug=" + encodeURIComponent(slug), {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error || "Information page not found.");

    const page = payload.data;
    document.title = page.title + " | Clothing Store";
    if (titleElement) titleElement.textContent = page.title;
    if (contentElement) {
      contentElement.textContent = page.content || "This information page has not been published yet.";
      contentElement.hidden = false;
    }
    if (statusElement) statusElement.hidden = true;
  } catch (error) {
    if (titleElement) titleElement.textContent = "Information unavailable";
    if (statusElement) {
      statusElement.textContent = error.message;
      statusElement.hidden = false;
    }
    if (contentElement) contentElement.hidden = true;
  }

  try {
    const response = await fetch("/api/content-pages", { headers: { Accept: "application/json" }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.success) renderNavigation(payload.data || []);
  } catch {
    // The page itself remains usable if the navigation request fails.
  }
};

load();