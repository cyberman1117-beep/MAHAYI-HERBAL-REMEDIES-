import { verifyFirebaseIdToken } from "./index.js";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const idValue = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const clean = (value, max = 1000) => String(value ?? "").trim().slice(0, max);

async function authorize(request, env) {
  const token = await verifyFirebaseIdToken(request);
  const admin = await env.DB.prepare("SELECT firebase_uid FROM admin_users WHERE firebase_uid = ? AND is_enabled = 1").bind(token.sub).first();
  if (!admin) throw new Error("Administrator authorization required.");
}
function errorResponse(error) {
  if (error?.message === "Administrator authorization required.") return json({ success: false, error: error.message }, 403);
  if (/token|authentication/i.test(error?.message || "")) return json({ success: false, error: "Authentication required." }, 401);
  console.error("Reseller management request failed:", error);
  return json({ success: false, error: "Unable to process reseller management request." }, 500);
}

async function accounts(request, env, id) {
  if (request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT id, email, full_name, phone, status, notes, approved_at, pay_later_enabled,
             pay_later_notes, pay_later_approved_at, created_at, updated_at
      FROM resellers ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC, id DESC
    `).all();
    return json({ success: true, data: { accounts: result.results || [] } });
  }
  if (request.method !== "PUT" || !id) return json({ success: false, error: "Use PUT with a valid reseller account id." }, 400);
  const body = await request.json();
  const existing = await env.DB.prepare("SELECT id, status, pay_later_enabled FROM resellers WHERE id = ?").bind(id).first();
  if (!existing) return json({ success: false, error: "Reseller account not found." }, 404);
  const status = body.status === undefined ? existing.status : clean(body.status, 20);
  if (!["pending", "active", "suspended", "rejected"].includes(status)) return json({ success: false, error: "Choose a valid reseller status." }, 400);
  const payLater = body.pay_later_enabled === undefined ? Number(existing.pay_later_enabled) : (body.pay_later_enabled ? 1 : 0);
  const notes = body.notes === undefined ? null : clean(body.notes, 4000);
  const payLaterNotes = body.pay_later_notes === undefined ? null : clean(body.pay_later_notes, 4000);
  await env.DB.prepare(`
    UPDATE resellers SET status = ?, notes = COALESCE(?, notes),
      pay_later_enabled = ?,
      pay_later_notes = COALESCE(?, pay_later_notes),
      approved_at = CASE WHEN ? = 'active' THEN COALESCE(approved_at, CURRENT_TIMESTAMP) ELSE approved_at END,
      pay_later_approved_at = CASE WHEN ? = 1 THEN COALESCE(pay_later_approved_at, CURRENT_TIMESTAMP) ELSE NULL END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(status, notes, payLater, payLaterNotes, status, payLater, id).run();
  return json({ success: true, data: { id, status, pay_later_enabled: payLater } });
}

async function stockOrders(request, env, id) {
  if (request.method === "GET") {
    const result = await env.DB.prepare(`
      SELECT o.id, o.order_number, o.reseller_id, r.full_name AS reseller_name, r.email AS reseller_email,
             o.currency, o.total_amount, o.payment_status, o.order_status, o.payment_reference,
             o.reseller_notes, o.company_notes, o.inventory_applied_at, o.created_at, o.updated_at,
             (SELECT COUNT(*) FROM reseller_stock_order_items i WHERE i.reseller_stock_order_id = o.id) AS item_count
      FROM reseller_stock_orders o JOIN resellers r ON r.id = o.reseller_id
      ORDER BY o.created_at DESC, o.id DESC
    `).all();
    return json({ success: true, data: { orders: result.results || [] } });
  }
  if (request.method !== "PUT" || !id) return json({ success: false, error: "Use PUT with a valid stock order id." }, 400);
  const body = await request.json();
  const existing = await env.DB.prepare("SELECT * FROM reseller_stock_orders WHERE id = ?").bind(id).first();
  if (!existing) return json({ success: false, error: "Stock order not found." }, 404);
  const paymentStatus = body.payment_status === undefined ? existing.payment_status : clean(body.payment_status, 20);
  const orderStatus = body.order_status === undefined ? existing.order_status : clean(body.order_status, 20);
  if (!["pending", "paid", "failed", "cancelled", "refunded"].includes(paymentStatus)) return json({ success: false, error: "Invalid payment status." }, 400);
  if (!["submitted", "confirmed", "processing", "ready", "fulfilled", "cancelled"].includes(orderStatus)) return json({ success: false, error: "Invalid order status." }, 400);
  if (existing.inventory_applied_at && orderStatus !== "fulfilled") return json({ success: false, error: "This order has already added stock to reseller inventory. Use a return or adjustment instead of changing its fulfilment status." }, 409);
  if (orderStatus === "fulfilled" && paymentStatus !== "paid") return json({ success: false, error: "Mark the order paid before releasing stock into reseller inventory." }, 400);
  const reference = body.payment_reference === undefined ? existing.payment_reference : clean(body.payment_reference, 200);
  const notes = body.company_notes === undefined ? existing.company_notes : clean(body.company_notes, 4000);
  const statements = [];
  if (orderStatus === "fulfilled" && !existing.inventory_applied_at) {
    const items = await env.DB.prepare("SELECT reseller_product_id, product_name, quantity FROM reseller_stock_order_items WHERE reseller_stock_order_id = ?").bind(id).all();
    if (!items.results?.length) return json({ success: false, error: "Cannot fulfil an empty stock order." }, 409);
    for (const item of items.results) {
      if (!item.reseller_product_id) return json({ success: false, error: "A product in this order no longer exists. Inventory was not changed." }, 409);
      statements.push(env.DB.prepare(`
        INSERT INTO reseller_inventory (reseller_id, reseller_product_id, quantity_available)
        VALUES (?, ?, ?)
        ON CONFLICT(reseller_id, reseller_product_id) DO UPDATE SET
          quantity_available = reseller_inventory.quantity_available + excluded.quantity_available,
          updated_at = CURRENT_TIMESTAMP
      `).bind(existing.reseller_id, item.reseller_product_id, item.quantity));
      statements.push(env.DB.prepare(`
        INSERT INTO reseller_inventory_movements
          (reseller_id, reseller_product_id, movement_type, quantity_change, reference_type, reference_id, notes)
        VALUES (?, ?, 'stock_purchase', ?, 'stock_order', ?, ?)
      `).bind(existing.reseller_id, item.reseller_product_id, item.quantity, id, "Stock order " + existing.order_number + " — " + item.product_name));
    }
    statements.push(env.DB.prepare(`
      UPDATE reseller_stock_orders SET payment_status = ?, order_status = ?, payment_reference = ?,
        company_notes = ?, inventory_applied_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(paymentStatus, orderStatus, reference, notes, id));
    await env.DB.batch(statements);
  } else {
    await env.DB.prepare(`
      UPDATE reseller_stock_orders SET payment_status = ?, order_status = ?, payment_reference = ?,
        company_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(paymentStatus, orderStatus, reference, notes, id).run();
  }
  return json({ success: true, data: { id, payment_status: paymentStatus, order_status: orderStatus, inventory_applied: orderStatus === "fulfilled" } });
}

export async function handleAdminResellerManagement(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    ...HEADERS, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept"
  }});
  try {
    await authorize(request, env);
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = idValue(url.searchParams.get("id"));
    if (resource === "accounts") return await accounts(request, env, id);
    if (resource === "stock-orders") return await stockOrders(request, env, id);
    return json({ success: false, error: "Choose accounts or stock-orders." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
