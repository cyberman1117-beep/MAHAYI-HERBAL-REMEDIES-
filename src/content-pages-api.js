import { verifyFirebaseIdToken } from "./index.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

async function requireAdmin(request, env) {
  const token = await verifyFirebaseIdToken(request);
  const admin = await env.DB.prepare(
    "SELECT firebase_uid, role, is_enabled FROM admin_users WHERE firebase_uid = ? AND is_enabled = 1"
  ).bind(token.sub).first();
  if (!admin) throw new Error("Administrator authorization required.");
  return token;
}

function normalizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseOrder(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function parseEnabled(value, fallback = 0) {
  if (value === undefined || value === null) return fallback;
  return value ? 1 : 0;
}

async function getPages(env, includeUnpublished = false) {
  const sql = includeUnpublished
    ? "SELECT id, slug, title, content, is_published, sort_order, created_at, updated_at FROM content_pages ORDER BY sort_order ASC, id ASC"
    : "SELECT id, slug, title, content, is_published, sort_order, created_at, updated_at FROM content_pages WHERE is_published = 1 ORDER BY sort_order ASC, id ASC";
  return (await env.DB.prepare(sql).all()).results ?? [];
}

async function handleContentPages(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const slug = String(url.searchParams.get("slug") || "").trim();
    try {
      if (slug) {
        const page = await env.DB.prepare(
          "SELECT id, slug, title, content, is_published, sort_order, created_at, updated_at FROM content_pages WHERE slug = ? LIMIT 1"
        ).bind(slug).first();
        if (!page) return jsonResponse({ success: false, error: "Information page not found." }, 404);
        if (Number(page.is_published) !== 1) {
          try { await requireAdmin(request, env); } catch { return jsonResponse({ success: false, error: "Information page not found." }, 404); }
        }
        return jsonResponse({ success: true, data: page });
      }

      let includeUnpublished = false;
      if (request.headers.get("Authorization")) {
        try {
          await requireAdmin(request, env);
          includeUnpublished = true;
        } catch {
          includeUnpublished = false;
        }
      }
      return jsonResponse({ success: true, data: await getPages(env, includeUnpublished) });
    } catch {
      return jsonResponse({ success: false, error: "Unable to load information pages." }, 500);
    }
  }

  try {
    const token = await requireAdmin(request, env);

    if (request.method === "POST") {
      const body = await request.json();
      const title = String(body?.title ?? "").trim();
      const slug = normalizeSlug(body?.slug || title);
      if (!title || !slug) return jsonResponse({ success: false, error: "Page title is required." }, 400);
      const existing = await env.DB.prepare("SELECT id FROM content_pages WHERE slug = ? LIMIT 1").bind(slug).first();
      if (existing) return jsonResponse({ success: false, error: "An information page with that slug already exists." }, 409);

      const result = await env.DB.prepare(
        "INSERT INTO content_pages (slug, title, content, is_published, sort_order) VALUES (?, ?, ?, ?, ?) RETURNING id"
      ).bind(
        slug,
        title,
        String(body?.content ?? ""),
        parseEnabled(body?.is_published, 0),
        parseOrder(body?.sort_order, 0)
      ).first();

      return jsonResponse({ success: true, data: { id: result.id, uid: token.sub } }, 201);
    }

    const id = parseId(url.searchParams.get("id"));
    if (!id) return jsonResponse({ success: false, error: "A valid page id is required." }, 400);

    if (request.method === "PUT") {
      const existing = await env.DB.prepare("SELECT id, slug, title, content, is_published, sort_order FROM content_pages WHERE id = ?").bind(id).first();
      if (!existing) return jsonResponse({ success: false, error: "Information page not found." }, 404);

      const body = await request.json();
      const title = String(body?.title ?? existing.title).trim();
      const content = String(body?.content ?? existing.content ?? "");
      const slug = normalizeSlug(existing.slug);
      if (!title || !slug) return jsonResponse({ success: false, error: "Page title is required." }, 400);

      await env.DB.prepare(
        "UPDATE content_pages SET title = ?, content = ?, is_published = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(
        title,
        content,
        parseEnabled(body?.is_published, existing.is_published),
        parseOrder(body?.sort_order, existing.sort_order),
        id
      ).run();

      return jsonResponse({ success: true, data: { id, uid: token.sub } });
    }

    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM content_pages WHERE id = ?").bind(id).run();
      return jsonResponse({ success: true, data: { id, uid: token.sub } });
    }

    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  } catch (error) {
    if (error?.message === "Administrator authorization required.") return jsonResponse({ success: false, error: error.message }, 403);
    if (error?.message === "Missing bearer token.") return jsonResponse({ success: false, error: "Authentication required." }, 401);
    return jsonResponse({ success: false, error: "Unable to save information page." }, 500);
  }
}

export { handleContentPages };