const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function parseOptionalId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseNonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function parseEnabled(value, fallback = 1) {
  if (value === undefined || value === null) return fallback;
  return value ? 1 : 0;
}

function parseParentId(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  return parseOptionalId(value);
}

function categoryFields() {
  return `id, name, slug, description, parent_id, sort_order, is_enabled, show_in_navigation, show_on_homepage, is_main_category, is_featured, is_promoted, showcase_image_url, showcase_image_alt, created_at, updated_at`;
}

async function getCategories(env, includeDisabled = false) {
  const where = includeDisabled ? "" : "WHERE is_enabled = 1";
  const result = await env.DB.prepare(`SELECT ${categoryFields()} FROM categories ${where} ORDER BY sort_order ASC, id ASC`).all();
  return result.results ?? [];
}

async function requireAdmin(request, originalWorker, env) {
  const response = await originalWorker.fetch(new Request(new URL("/api/admin-auth-check", request.url), {
    method: "GET",
    headers: request.headers
  }), env);
  if (!response.ok) throw new Error("Authentication required.");
  return response.json();
}

async function validateMainCategory(env, parentId, categoryId = null) {
  if (parentId === null) return;
  if (!parentId) throw new Error("Main category id is invalid.");
  if (categoryId && parentId === categoryId) throw new Error("A category cannot be its own main category.");

  const parent = await env.DB.prepare("SELECT id, is_main_category FROM categories WHERE id = ?").bind(parentId).first();
  if (!parent) throw new Error("Main category not found.");
  if (Number(parent.is_main_category) !== 1) throw new Error("Selected category is not a main category.");
}

export async function handleCategoryApi(request, env, originalWorker) {
  if (request.method === "GET") {
    try {
      const includeDisabled = new URL(request.url).searchParams.get("include_disabled") === "1";
      if (includeDisabled) await requireAdmin(request, originalWorker, env);
      return jsonResponse({ success: true, data: await getCategories(env, includeDisabled) });
    } catch (error) {
      if (error?.message === "Authentication required.") return jsonResponse({ success: false, error: error.message }, 401);
      return jsonResponse({ success: false, error: "Unable to load categories." }, 500);
    }
  }

  try {
    const auth = await requireAdmin(request, originalWorker, env);
    if (!["POST", "PUT", "DELETE"].includes(request.method)) return jsonResponse({ success: false, error: "Method not allowed." }, 405);

    if (request.method === "POST") {
      const body = await request.json();
      const name = String(body?.name ?? "").trim();
      const slug = String(body?.slug ?? name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
      const isMainCategory = parseEnabled(body?.is_main_category, 0);
      const parentId = isMainCategory ? null : parseParentId(body?.parent_id, null);
      const showcaseImageUrl = String(body?.showcase_image_url ?? "").trim();
      const showcaseImageAlt = String(body?.showcase_image_alt ?? "").trim();
      if (!name || !slug) return jsonResponse({ success: false, error: "Category name is required." }, 400);
      await validateMainCategory(env, parentId);
      const result = await env.DB.prepare(`INSERT INTO categories (name, slug, description, parent_id, sort_order, is_enabled, show_in_navigation, show_on_homepage, is_main_category, is_featured, is_promoted, showcase_image_url, showcase_image_alt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
        .bind(name, slug, String(body?.description ?? "").trim(), parentId, parseNonNegativeInteger(body?.sort_order), parseEnabled(body?.is_enabled), parseEnabled(body?.show_in_navigation, 1), parseEnabled(body?.show_on_homepage, 0), isMainCategory, parseEnabled(body?.is_featured, 0), parseEnabled(body?.is_promoted, 0), showcaseImageUrl || null, showcaseImageAlt || null).first();
      return jsonResponse({ success: true, data: { id: result.id, uid: auth?.data?.uid || "" } }, 201);
    }

    const url = new URL(request.url);
    const id = parseOptionalId(url.searchParams.get("id"));
    if (!id) return jsonResponse({ success: false, error: "A valid category id is required." }, 400);

    if (request.method === "DELETE") {
      const existing = await env.DB.prepare("SELECT id FROM categories WHERE id = ?").bind(id).first();
      if (!existing) return jsonResponse({ success: false, error: "Category not found." }, 404);
      await env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
      return jsonResponse({ success: true, data: { id, uid: auth?.data?.uid || "" } });
    }

    const body = await request.json();
    const existing = await env.DB.prepare(`SELECT ${categoryFields()} FROM categories WHERE id = ?`).bind(id).first();
    if (!existing) return jsonResponse({ success: false, error: "Category not found." }, 404);

    const name = String(body?.name ?? existing.name).trim();
    const slug = String(body?.slug ?? existing.slug).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
    const isMainCategory = body?.is_main_category === undefined ? Number(existing.is_main_category) : parseEnabled(body?.is_main_category, existing.is_main_category);
    const parentId = isMainCategory ? null : parseParentId(body?.parent_id, parseOptionalId(existing.parent_id));
    const showcaseImageUrl = body?.showcase_image_url === undefined ? (existing.showcase_image_url || "") : String(body.showcase_image_url ?? "").trim();
    const showcaseImageAlt = body?.showcase_image_alt === undefined ? (existing.showcase_image_alt || "") : String(body.showcase_image_alt ?? "").trim();
    if (!name || !slug) return jsonResponse({ success: false, error: "Category name is required." }, 400);
    await validateMainCategory(env, parentId, id);

    await env.DB.prepare(`UPDATE categories SET name = ?, slug = ?, description = ?, parent_id = ?, sort_order = ?, is_enabled = ?, show_in_navigation = ?, show_on_homepage = ?, is_main_category = ?, is_featured = ?, is_promoted = ?, showcase_image_url = ?, showcase_image_alt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(name, slug, String(body?.description ?? existing.description).trim(), parentId, parseNonNegativeInteger(body?.sort_order, existing.sort_order), parseEnabled(body?.is_enabled, existing.is_enabled), parseEnabled(body?.show_in_navigation, existing.show_in_navigation), parseEnabled(body?.show_on_homepage, existing.show_on_homepage), isMainCategory, parseEnabled(body?.is_featured, existing.is_featured), parseEnabled(body?.is_promoted, existing.is_promoted), showcaseImageUrl || null, showcaseImageAlt || null, id).run();

    return jsonResponse({ success: true, data: { id, uid: auth?.data?.uid || "" } });
  } catch (error) {
    if (error?.message === "Authentication required.") return jsonResponse({ success: false, error: error.message }, 401);
    if (error?.message === "Main category not found." || error?.message === "Main category id is invalid." || error?.message === "Selected category is not a main category." || error?.message === "A category cannot be its own main category.") return jsonResponse({ success: false, error: error.message }, 400);
    if (String(error?.message || "").includes("UNIQUE constraint failed")) return jsonResponse({ success: false, error: "A category with that slug already exists." }, 409);
    return jsonResponse({ success: false, error: "Unable to save category." }, 500);
  }
}
