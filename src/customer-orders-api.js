import { verifyFirebaseIdToken } from "./index.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

const ORDER_FIELDS = `
  o.id,
  o.order_number,
  o.customer_email,
  o.customer_full_name,
  o.customer_phone,
  o.shipping_address,
  o.shipping_city,
  o.shipping_province,
  o.shipping_postal_code,
  o.shipping_country,
  o.shipping_method_name,
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

export async function handleCustomerOrders(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...JSON_HEADERS,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept"
      }
    });
  }

  if (request.method !== "GET") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const token = await verifyFirebaseIdToken(request);
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));

    if (url.searchParams.has("id")) {
      if (!Number.isInteger(id) || id <= 0) {
        return json({ success: false, error: "Invalid order." }, 400);
      }

      const order = await env.DB.prepare(
        `SELECT ${ORDER_FIELDS} FROM orders o WHERE o.id = ? AND o.firebase_uid = ?`
      ).bind(id, token.sub).first();

      if (!order) return json({ success: false, error: "Order not found." }, 404);

      const items = await env.DB.prepare(
        `SELECT id, product_id, product_name, quantity, unit_price, line_total, currency FROM order_items WHERE order_id = ? ORDER BY id ASC`
      ).bind(order.id).all();

      return json({ success: true, data: { order, items: items.results || [] } });
    }

    const orders = await env.DB.prepare(
      `SELECT ${ORDER_FIELDS} FROM orders o WHERE o.firebase_uid = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 100`
    ).bind(token.sub).all();

    return json({ success: true, data: orders.results || [] });
  } catch (error) {
    if (error?.message === "Authentication required.") {
      return json({ success: false, error: error.message }, 401);
    }
    return json({ success: false, error: "Unable to load your orders." }, 500);
  }
}
