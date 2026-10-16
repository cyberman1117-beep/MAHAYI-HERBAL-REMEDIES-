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

async function handleSeoSettings(request, env) {
  if (request.method === "GET") {
    try {
      const settings = await env.DB.prepare(
        "SELECT id, site_title, meta_description, canonical_url, robots_index, robots_follow, updated_at FROM seo_settings WHERE id = 1"
      ).first();
      return jsonResponse({
        success: true,
        data: settings || { id: 1, site_title: "", meta_description: "", canonical_url: "", robots_index: 1, robots_follow: 1 }
      });
    } catch {
      return jsonResponse({ success: false, error: "Unable to load SEO settings." }, 500);
    }
  }

  if (request.method !== "PUT") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    const token = await requireAdmin(request, env);
    const body = await request.json();

    const siteTitle = String(body?.site_title ?? "").trim().slice(0, 160);
    const metaDescription = String(body?.meta_description ?? "").trim().slice(0, 320);
    const canonicalUrl = String(body?.canonical_url ?? "").trim().replace(/\/$/, "");
    const robotsIndex = body?.robots_index === true ? 1 : 0;
    const robotsFollow = body?.robots_follow === true ? 1 : 0;

    await env.DB.prepare(
      "INSERT INTO seo_settings (id, site_title, meta_description, canonical_url, robots_index, robots_follow, updated_at) VALUES (1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET site_title = excluded.site_title, meta_description = excluded.meta_description, canonical_url = excluded.canonical_url, robots_index = excluded.robots_index, robots_follow = excluded.robots_follow, updated_at = CURRENT_TIMESTAMP"
    ).bind(siteTitle, metaDescription, canonicalUrl, robotsIndex, robotsFollow).run();

    const saved = await env.DB.prepare(
      "SELECT id, site_title, meta_description, canonical_url, robots_index, robots_follow, updated_at FROM seo_settings WHERE id = 1"
    ).first();

    return jsonResponse({ success: true, data: saved });
  } catch (error) {
    if (error?.message === "Missing bearer token.") return jsonResponse({ success: false, error: "Authentication required." }, 401);
    if (error?.message === "Administrator authorization required.") return jsonResponse({ success: false, error: error.message }, 403);
    return jsonResponse({ success: false, error: "Unable to save SEO settings." }, 500);
  }
}

export { handleSeoSettings };
