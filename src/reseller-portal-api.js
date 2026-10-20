import { verifyFirebaseIdToken } from "./index.js";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const clean = (value, max = 200) => String(value ?? "").trim().slice(0, max);

function errorResponse(error) {
  if (/Missing bearer token|Invalid token|Authentication required|token subject/i.test(error?.message || "")) {
    return json({ success: false, error: "Please sign in to continue." }, 401);
  }
  if (String(error?.message || "").includes("UNIQUE constraint failed")) {
    return json({ success: false, error: "A reseller account already exists for this email. Please sign in instead." }, 409);
  }
  console.error("Reseller portal request failed:", error);
  return json({ success: false, error: "Unable to process this reseller request. Please try again." }, 500);
}

async function getReseller(token, env) {
  return env.DB.prepare(
    "SELECT id, firebase_uid, email, full_name, phone, status, approved_at, created_at FROM resellers WHERE firebase_uid = ?"
  ).bind(token.sub).first();
}

export async function handleResellerPortal(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      ...HEADERS,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept"
    }});
  }
  if (!["GET", "POST"].includes(request.method)) return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const token = await verifyFirebaseIdToken(request);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "me";

    if (request.method === "POST" && action === "register") {
      const body = await request.json();
      const email = clean(token.email, 254).toLowerCase();
      const fullName = clean(body.full_name, 160);
      const phone = clean(body.phone, 40);
      if (!email || !fullName || !phone) {
        return json({ success: false, error: "Enter your full name and phone number, and sign in with your email address." }, 400);
      }
      const existing = await env.DB.prepare(
        "SELECT id, firebase_uid, email FROM resellers WHERE email = ? OR firebase_uid = ? LIMIT 1"
      ).bind(email, token.sub).first();
      if (existing) {
        if (existing.firebase_uid && existing.firebase_uid !== token.sub) {
          return json({ success: false, error: "A reseller account already exists for this email. Please sign in using its original account." }, 409);
        }
        await env.DB.prepare(
          "UPDATE resellers SET firebase_uid = ?, full_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(token.sub, fullName, phone, existing.id).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO resellers (firebase_uid, email, full_name, phone, status) VALUES (?, ?, ?, ?, 'pending')"
        ).bind(token.sub, email, fullName, phone).run();
      }
      const reseller = await getReseller(token, env);
      return json({ success: true, data: { reseller } }, 201);
    }

    if (action === "me") {
      const reseller = await getReseller(token, env);
      return json({ success: true, data: { reseller: reseller || null, email: clean(token.email, 254) } });
    }

    if (action === "products") {
      const reseller = await getReseller(token, env);
      if (!reseller) return json({ success: false, error: "Complete reseller registration first." }, 403);
      if (reseller.status !== "active") return json({ success: false, error: "Your reseller account must be approved before you can view the reseller catalogue." }, 403);
      const result = await env.DB.prepare(`
        SELECT p.id, p.category_id, c.name AS category_name, p.name, p.slug, p.description, p.sku, p.currency,
               p.stock_quantity, p.track_stock, pp.customer_price, pp.reseller_share, pp.company_share,
               pp.minimum_order_quantity
        FROM reseller_products p
        INNER JOIN reseller_product_pricing pp ON pp.reseller_product_id = p.id AND pp.is_enabled = 1
        LEFT JOIN reseller_categories c ON c.id = p.category_id
        WHERE p.status = 'active' AND (p.category_id IS NULL OR c.is_enabled = 1)
        ORDER BY p.sort_order, p.name, p.id
      `).all();
      return json({ success: true, data: { products: result.results || [] } });
    }

    return json({ success: false, error: "Choose a valid reseller portal action." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
