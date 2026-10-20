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
    "SELECT id, firebase_uid, email, full_name, phone, status, approved_at, pay_later_enabled, created_at FROM resellers WHERE firebase_uid = ?"
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
               p.stock_quantity, p.track_stock, pp.customer_price, pp.reseller_share, pp.company_share AS stock_unit_price, pp.minimum_order_quantity
        FROM reseller_products p
        INNER JOIN reseller_product_pricing pp ON pp.reseller_product_id = p.id AND pp.is_enabled = 1
        LEFT JOIN reseller_categories c ON c.id = p.category_id
        WHERE p.status = 'active' AND (p.category_id IS NULL OR c.is_enabled = 1)
        ORDER BY p.sort_order, p.name, p.id
      `).all();
      return json({ success: true, data: { products: result.results || [] } });
    }

    if (action === "inventory") {
      const reseller = await getReseller(token, env);
      if (!reseller || reseller.status !== "active") return json({ success: false, error: "An approved reseller account is required." }, 403);
      const result = await env.DB.prepare(`
        SELECT i.reseller_product_id AS product_id, p.name, p.sku, p.currency, i.quantity_available, i.updated_at
        FROM reseller_inventory i JOIN reseller_products p ON p.id = i.reseller_product_id
        WHERE i.reseller_id = ? ORDER BY p.name
      `).bind(reseller.id).all();
      return json({ success: true, data: { inventory: result.results || [] } });
    }

    if (action === "stock-orders") {
      const reseller = await getReseller(token, env);
      if (!reseller || reseller.status !== "active") return json({ success: false, error: "An approved reseller account is required." }, 403);
      if (request.method === "GET") {
        const orders = await env.DB.prepare(`
          SELECT id, order_number, currency, total_amount, payment_status, order_status, payment_reference,
                 reseller_notes, created_at, updated_at
          FROM reseller_stock_orders WHERE reseller_id = ? ORDER BY created_at DESC, id DESC LIMIT 100
        `).bind(reseller.id).all();
        const items = await env.DB.prepare(`
          SELECT i.reseller_stock_order_id, i.product_name, i.product_sku, i.quantity, i.wholesale_unit_price,
                 i.customer_unit_price, i.reseller_unit_share, i.line_total, i.currency
          FROM reseller_stock_order_items i JOIN reseller_stock_orders o ON o.id = i.reseller_stock_order_id
          WHERE o.reseller_id = ? ORDER BY i.id
        `).bind(reseller.id).all();
        return json({ success: true, data: { orders: orders.results || [], items: items.results || [] } });
      }
      if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
      if (reseller.pay_later_enabled) return json({ success: false, error: "Your account has distributor privileges. Contact M.H.R. for the agreed stock-issue process." }, 403);
      const body = await request.json();
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) return json({ success: false, error: "Add at least one product to your stock order." }, 400);
      const quantities = new Map();
      for (const item of body.items) {
        const productId = Number(item.product_id);
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return json({ success: false, error: "Each stock order item needs a valid product and whole-number quantity." }, 400);
        quantities.set(productId, (quantities.get(productId) || 0) + quantity);
      }
      const orderItems = [];
      let total = 0;
      let currency = "ZAR";
      for (const [productId, quantity] of quantities) {
        const product = await env.DB.prepare(`
          SELECT p.id, p.name, p.sku, p.currency, p.stock_quantity, p.track_stock,
                 pp.customer_price, pp.reseller_share, pp.company_share, pp.minimum_order_quantity
          FROM reseller_products p JOIN reseller_product_pricing pp ON pp.reseller_product_id = p.id
          WHERE p.id = ? AND p.status = 'active' AND pp.is_enabled = 1
        `).bind(productId).first();
        if (!product) return json({ success: false, error: "One of the selected products is no longer available." }, 400);
        if (quantity < Number(product.minimum_order_quantity)) return json({ success: false, error: product.name + " requires a minimum order of " + product.minimum_order_quantity + "." }, 400);
        if (Number(product.track_stock) === 1 && quantity > Number(product.stock_quantity)) return json({ success: false, error: "Not enough available stock for " + product.name + ". Please refresh the catalogue." }, 409);
        currency = product.currency || "ZAR";
        const wholesale = Number(product.company_share);
        const customerPrice = Number(product.customer_price);
        const resellerShare = Number(product.reseller_share);
        const lineTotal = Math.round(wholesale * quantity * 100) / 100;
        total = Math.round((total + lineTotal) * 100) / 100;
        orderItems.push({ product, productId, quantity, wholesale, customerPrice, resellerShare, lineTotal });
      }
      const orderNumber = "MHR-RS-" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-" + crypto.randomUUID().slice(0,8).toUpperCase();
      const created = await env.DB.prepare(`
        INSERT INTO reseller_stock_orders (order_number, reseller_id, currency, total_amount, payment_status, order_status, reseller_notes)
        VALUES (?, ?, ?, ?, 'pending', 'submitted', ?)
        RETURNING id
      `).bind(orderNumber, reseller.id, currency, total, clean(body.reseller_notes, 2000)).first();
      try {
        const statements = [];
        for (const item of orderItems) {
          if (Number(item.product.track_stock) === 1) statements.push(env.DB.prepare("UPDATE reseller_products SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(item.quantity, item.productId));
          statements.push(env.DB.prepare(`
            INSERT INTO reseller_stock_order_items
              (reseller_stock_order_id, reseller_product_id, product_name, product_sku, quantity, wholesale_unit_price, customer_unit_price, reseller_unit_share, line_total, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(created.id, item.productId, item.product.name, item.product.sku || "", item.quantity, item.wholesale, item.customerPrice, item.resellerShare, item.lineTotal, item.product.currency || "ZAR"));
        }
        statements.push(env.DB.prepare("UPDATE reseller_stock_orders SET stock_reserved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(created.id));
        await env.DB.batch(statements);
      } catch (error) {
        await env.DB.prepare("DELETE FROM reseller_stock_orders WHERE id = ?").bind(created.id).run();
        throw error;
      }
      return json({ success: true, data: { id: created.id, order_number: orderNumber, total_amount: total, currency, payment_status: "pending", order_status: "submitted" } }, 201);
    }

    return json({ success: false, error: "Choose a valid reseller portal action." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
