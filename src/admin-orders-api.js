import { requireAdmin } from "./admin-auth.js";
import { sendOrderStatusUpdate } from "./communication-service.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function clean(value) {
  return String(value ?? "").trim();
}

const ORDER_STATUSES = new Set(["pending", "processing", "shipped", "delivered", "cancelled"]);

const ORDER_FIELDS = `
  o.id,
  o.order_number,
  o.payment_transaction_id,
  o.firebase_uid,
  o.customer_email,
  o.customer_full_name,
  o.customer_phone,
  o.shipping_address,
  o.shipping_city,
  o.shipping_province,
  o.shipping_postal_code,
  o.shipping_country,
  o.shipping_method_id,
  o.shipping_method_name,
  o.shipping_option_id,
  o.shipping_option_name,
  o.shipping_fee,
  o.subtotal,
  o.total,
  o.currency,
  o.payment_status,
  o.order_status,
  o.customer_notes,
  o.delivery_landmark,
  o.created_at,
  o.updated_at
`;

async function getOrder(env, id) {
  const order = await env.DB.prepare(
    `SELECT ${ORDER_FIELDS} FROM orders o WHERE o.id = ?`
  ).bind(id).first();

  if (!order) return null;

  const items = await env.DB.prepare(
    "SELECT id, product_id, product_name, quantity, unit_price, line_total, currency, created_at FROM order_items WHERE order_id = ? ORDER BY id ASC"
  ).bind(id).all();

  return {
    ...order,
    items: items.results ?? []
  };
}

export async function handleAdminOrders(request, env) {
  if (!["GET", "PUT"].includes(request.method)) {
    return json({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    await requireAdmin(request, env);

    const url = new URL(request.url);
    const idValue = clean(url.searchParams.get("id"));

    if (request.method === "GET") {
      if (idValue) {
        const id = Number(idValue);
        if (!Number.isInteger(id) || id < 1) {
          return json({ success: false, error: "A valid order id is required." }, 400);
        }

        const order = await getOrder(env, id);
        if (!order) return json({ success: false, error: "Order not found." }, 404);
        return json({ success: true, data: order });
      }

      const status = clean(url.searchParams.get("status")).toLowerCase();
      if (status && !ORDER_STATUSES.has(status)) {
        return json({ success: false, error: "Invalid order status." }, 400);
      }

      const search = clean(url.searchParams.get("search"));
      const limitValue = Number(url.searchParams.get("limit") || 100);
      const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 100;

      const conditions = [];
      const bindings = [];

      if (status) {
        conditions.push("o.order_status = ?");
        bindings.push(status);
      }

      if (search) {
        const term = `%${search}%`;
        conditions.push("(o.order_number LIKE ? OR o.customer_email LIKE ? OR o.customer_full_name LIKE ? OR o.customer_phone LIKE ?)");
        bindings.push(term, term, term, term);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await env.DB.prepare(
        `SELECT ${ORDER_FIELDS} FROM orders o ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ?`
      ).bind(...bindings, limit).all();

      return json({ success: true, data: result.results ?? [] });
    }

    const id = Number(idValue);
    if (!Number.isInteger(id) || id < 1) {
      return json({ success: false, error: "A valid order id is required." }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const orderStatus = clean(body?.order_status).toLowerCase();

    if (!ORDER_STATUSES.has(orderStatus)) {
      return json({ success: false, error: "Invalid order status." }, 400);
    }

    const existing = await env.DB.prepare(
      "SELECT id, order_status FROM orders WHERE id = ?"
    ).bind(id).first();

    if (!existing) return json({ success: false, error: "Order not found." }, 404);

    if (existing.order_status !== orderStatus) {
      const orderBeforeUpdate = await env.DB.prepare(
        `SELECT ${ORDER_FIELDS} FROM orders o WHERE o.id = ?`
      ).bind(id).first();

      await env.DB.prepare(
        "UPDATE orders SET order_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(orderStatus, id).run();

      const communication = await sendOrderStatusUpdate(
        env,
        orderBeforeUpdate,
        existing.order_status,
        orderStatus
      );

      return json({
        success: true,
        data: await getOrder(env, id),
        communication
      });
    }

    return json({
      success: true,
      data: await getOrder(env, id),
      communication: { sent: false, skipped: true, reason: "Order status was unchanged." }
    });
  } catch (error) {
    if (error?.code === "ADMIN_AUTH_REQUIRED") {
      return json({ success: false, error: error.message }, 403);
    }
    if (error?.message === "Authentication required.") {
      return json({ success: false, error: error.message }, 401);
    }
    return json({ success: false, error: "Unable to manage orders." }, 500);
  }
}
