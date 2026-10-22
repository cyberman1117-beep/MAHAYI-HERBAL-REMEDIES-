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
  let payLater = body.pay_later_enabled === undefined ? Number(existing.pay_later_enabled) : (body.pay_later_enabled ? 1 : 0);
  if (status !== "active") payLater = 0;
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
             o.currency, o.total_amount, o.payment_status, o.order_status, o.fulfilment_mode, o.payment_reference,
             o.reseller_notes, o.company_notes, o.stock_reserved_at, o.stock_released_at, o.inventory_applied_at, o.created_at, o.updated_at,
             (SELECT COUNT(*) FROM reseller_stock_order_items i WHERE i.reseller_stock_order_id = o.id) AS item_count
      FROM reseller_stock_orders o JOIN resellers r ON r.id = o.reseller_id
      ORDER BY o.created_at DESC, o.id DESC
    `).all();
    const itemResult = await env.DB.prepare(`
      SELECT i.reseller_stock_order_id, i.product_name, i.package_label, i.product_sku, i.quantity, i.units_per_package, i.wholesale_unit_price,
             i.line_total, i.currency
      FROM reseller_stock_order_items i ORDER BY i.reseller_stock_order_id DESC, i.id
    `).all();
    return json({ success: true, data: { orders: result.results || [], items: itemResult.results || [] } });
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
  let creditIssue = false;
  if (orderStatus === "fulfilled") {
    if (existing.fulfilment_mode === "pay_later" && paymentStatus !== "paid") {
      const reseller = await env.DB.prepare("SELECT status, pay_later_enabled FROM resellers WHERE id = ?").bind(existing.reseller_id).first();
      if (!reseller || reseller.status !== "active" || Number(reseller.pay_later_enabled) !== 1) return json({ success: false, error: "Pay-later access is not currently approved for this reseller." }, 403);
      creditIssue = true;
    } else if (paymentStatus !== "paid") {
      return json({ success: false, error: "Mark the order paid before releasing stock into reseller inventory." }, 400);
    }
  }
  if (existing.stock_released_at && orderStatus === "fulfilled") return json({ success: false, error: "This order was cancelled and its company stock reservation was released. Create a new order instead." }, 409);
  const reference = body.payment_reference === undefined ? existing.payment_reference : clean(body.payment_reference, 200);
  const notes = body.company_notes === undefined ? existing.company_notes : clean(body.company_notes, 4000);
  if (orderStatus === "cancelled" && existing.stock_reserved_at && !existing.stock_released_at && !existing.inventory_applied_at) {
    const items = await env.DB.prepare("SELECT i.reseller_product_id, i.package_id, i.package_label, i.product_name, i.quantity FROM reseller_stock_order_items i WHERE i.reseller_stock_order_id = ?").bind(id).all();
    const releaseStatements = [];
    for (const item of (items.results || [])) {
      if (item.package_id) {
        releaseStatements.push(env.DB.prepare("UPDATE reseller_product_packages SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(item.quantity, item.package_id));
      }
    }
    releaseStatements.push(env.DB.prepare(`
      UPDATE reseller_stock_orders SET payment_status = ?, order_status = ?, payment_reference = ?,
        company_notes = ?, stock_released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(paymentStatus, orderStatus, reference, notes, id));
    await env.DB.batch(releaseStatements);
    return json({ success: true, data: { id, payment_status: paymentStatus, order_status: orderStatus, stock_released: true } });
  }
  const statements = [];
  if (orderStatus === "fulfilled" && !existing.inventory_applied_at) {
    const items = await env.DB.prepare("SELECT id, reseller_product_id, package_id, package_label, product_name, product_sku, quantity, units_per_package FROM reseller_stock_order_items WHERE reseller_stock_order_id = ?").bind(id).all();
    if (!items.results?.length) return json({ success: false, error: "Cannot fulfil an empty stock order." }, 409);
    for (const item of items.results) {
      if (!item.reseller_product_id || !item.package_id) return json({ success: false, error: "A package in this order is no longer available. Inventory was not changed." }, 409);
      const unitQuantity = Number(item.quantity) * Number(item.units_per_package || 1);
      const creditQuantity = creditIssue ? unitQuantity : 0;
      const movementType = creditIssue ? "pay_later_issue" : "stock_purchase";
      statements.push(env.DB.prepare(`
        INSERT INTO reseller_package_inventory (reseller_id, package_id, quantity_available, pay_later_quantity)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(reseller_id, package_id) DO UPDATE SET
          quantity_available = reseller_package_inventory.quantity_available + excluded.quantity_available,
          pay_later_quantity = reseller_package_inventory.pay_later_quantity + excluded.pay_later_quantity,
          updated_at = CURRENT_TIMESTAMP
      `).bind(existing.reseller_id, item.package_id, unitQuantity, creditQuantity));
      statements.push(env.DB.prepare(`
        INSERT INTO reseller_inventory_movements
          (reseller_id, reseller_product_id, package_id, movement_type, quantity_change, reference_type, reference_id, notes)
        VALUES (?, ?, ?, ?, ?, 'stock_order', ?, ?)
      `).bind(existing.reseller_id, item.reseller_product_id, item.package_id, movementType, unitQuantity, id, "Stock order " + existing.order_number + " — " + item.product_name + " (" + item.package_label + ")"));
      for (let unitNumber = 1; unitNumber <= unitQuantity; unitNumber++) {
        const sku = String(item.product_sku || "").trim();
        const trackingCode = "MHR-R" + existing.reseller_id + "-O" + id + "-I" + item.id + "-U" + unitNumber;
        statements.push(env.DB.prepare(`
          INSERT INTO reseller_stock_units
            (reseller_id, stock_order_id, stock_order_item_id, package_id, unit_number, product_sku, tracking_code)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(stock_order_item_id, unit_number) DO NOTHING
        `).bind(existing.reseller_id, id, item.id, item.package_id, unitNumber, sku, trackingCode));
      }
    }
    statements.push(env.DB.prepare(`
      UPDATE reseller_stock_orders SET payment_status = ?, order_status = ?, payment_reference = ?,
        company_notes = ?, inventory_applied_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(paymentStatus, orderStatus, reference, notes, id));
    await env.DB.batch(statements);
  } else if (orderStatus === "fulfilled" && existing.inventory_applied_at) {
    // Repair missing unit-register rows for previously fulfilled orders without applying inventory twice.
    const items = await env.DB.prepare("SELECT id, package_id, product_sku, quantity, units_per_package FROM reseller_stock_order_items WHERE reseller_stock_order_id = ?").bind(id).all();
    const repairStatements = [];
    for (const item of (items.results || [])) {
      if (!item.package_id) return json({ success: false, error: "A package in this order is no longer available. Unit-register repair was stopped." }, 409);
      const unitQuantity = Number(item.quantity) * Number(item.units_per_package || 1);
      if (!Number.isInteger(unitQuantity) || unitQuantity < 1 || unitQuantity > 10000) return json({ success: false, error: "The saved item quantity is invalid. Unit-register repair was stopped." }, 409);
      for (let unitNumber = 1; unitNumber <= unitQuantity; unitNumber++) {
        const sku = String(item.product_sku || "").trim();
        const trackingCode = "MHR-R" + existing.reseller_id + "-O" + id + "-I" + item.id + "-U" + unitNumber;
        repairStatements.push(env.DB.prepare("INSERT INTO reseller_stock_units (reseller_id, stock_order_id, stock_order_item_id, package_id, unit_number, product_sku, tracking_code) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(stock_order_item_id, unit_number) DO NOTHING").bind(existing.reseller_id, id, item.id, item.package_id, unitNumber, sku, trackingCode));
      }
    }
    repairStatements.push(env.DB.prepare("UPDATE reseller_stock_orders SET payment_status = ?, order_status = ?, payment_reference = ?, company_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(paymentStatus, orderStatus, reference, notes, id));
    await env.DB.batch(repairStatements);
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
    if (resource === "settlements") {
      if (request.method === "GET") {
        const accounts = await env.DB.prepare(`
          SELECT r.id, r.full_name, r.email, r.status, r.pay_later_enabled,
                 COALESCE(SUM(l.amount_debit), 0) - COALESCE(SUM(l.amount_credit), 0) AS outstanding
          FROM resellers r LEFT JOIN reseller_company_ledger l ON l.reseller_id = r.id
          GROUP BY r.id ORDER BY r.full_name, r.email
        `).all();
        const entries = await env.DB.prepare(`
          SELECT l.id, l.reseller_id, r.full_name AS reseller_name, r.email AS reseller_email,
                 l.movement_type, l.amount_debit, l.amount_credit, l.payment_reference, l.notes, l.created_at
          FROM reseller_company_ledger l JOIN resellers r ON r.id = l.reseller_id
          ORDER BY l.created_at DESC, l.id DESC LIMIT 500
        `).all();
        return json({ success: true, data: { accounts: accounts.results || [], entries: entries.results || [] } });
      }
      if (request.method !== "POST") return json({ success: false, error: "Use POST to record a settlement." }, 405);
      const body = await request.json();
      const resellerId = idValue(body.reseller_id);
      const amount = Number(body.amount);
      if (!resellerId || !Number.isFinite(amount) || amount <= 0) return json({ success: false, error: "Choose a reseller and enter a settlement amount greater than zero." }, 400);
      const reseller = await env.DB.prepare("SELECT id, status, pay_later_enabled FROM resellers WHERE id = ?").bind(resellerId).first();
      if (!reseller) return json({ success: false, error: "Reseller account not found." }, 404);
      const balance = await env.DB.prepare("SELECT COALESCE(SUM(amount_debit) - SUM(amount_credit), 0) AS outstanding FROM reseller_company_ledger WHERE reseller_id = ?").bind(resellerId).first();
      const outstanding = Math.round(Number(balance?.outstanding || 0) * 100) / 100;
      const roundedAmount = Math.round(amount * 100) / 100;
      if (roundedAmount > outstanding + 0.001) return json({ success: false, error: "Settlement exceeds the outstanding balance of R" + outstanding.toFixed(2) + "." }, 400);
      const reference = clean(body.payment_reference, 200);
      if (!reference) return json({ success: false, error: "Enter the payment reference before recording the settlement." }, 400);
      await env.DB.prepare(`
        INSERT INTO reseller_company_ledger
          (reseller_id, movement_type, amount_credit, reference_type, payment_reference, notes)
        VALUES (?, 'settlement', ?, 'manual_settlement', ?, ?)
      `).bind(resellerId, roundedAmount, reference, clean(body.notes, 4000)).run();
      return json({ success: true, data: { reseller_id: resellerId, amount: roundedAmount, outstanding: Math.round((outstanding - roundedAmount) * 100) / 100 } }, 201);
    }
    if (resource === "sales" && request.method === "GET") {
      const sales = await env.DB.prepare(`
        SELECT o.id, o.order_number, o.reseller_id, r.full_name AS reseller_name, r.email AS reseller_email,
               o.currency, o.subtotal, o.reseller_earnings,
               o.company_earnings, o.payment_status, o.order_status, o.sale_date, o.created_at,
               COALESCE((SELECT SUM(p.amount) FROM reseller_customer_payments p WHERE p.reseller_order_id = o.id), 0) AS amount_collected
        FROM reseller_orders o JOIN resellers r ON r.id = o.reseller_id
        ORDER BY o.created_at DESC, o.id DESC LIMIT 500
      `).all();
      const items = await env.DB.prepare(`
        SELECT i.reseller_order_id, i.product_name, i.package_label, i.quantity, i.customer_unit_price,
               i.reseller_line_earnings, i.line_total, i.currency
        FROM reseller_order_items i ORDER BY i.reseller_order_id DESC, i.id
      `).all();
      const payments = await env.DB.prepare(`
        SELECT p.id, p.reseller_order_id, p.amount, p.payment_date, p.payment_method, p.payment_reference, p.notes
        FROM reseller_customer_payments p ORDER BY p.payment_date DESC, p.id DESC
      `).all();
      const performance = await env.DB.prepare(`
        SELECT r.id AS reseller_id, r.full_name AS reseller_name, r.email AS reseller_email,
               COALESCE((SELECT SUM(o.subtotal) FROM reseller_orders o WHERE o.reseller_id = r.id AND o.order_status <> 'cancelled'), 0) AS sales_value,
               COALESCE((SELECT SUM(p.amount) FROM reseller_customer_payments p JOIN reseller_orders o ON o.id = p.reseller_order_id WHERE o.reseller_id = r.id AND o.order_status <> 'cancelled'), 0) AS amount_collected,
               COALESCE((SELECT SUM(o.subtotal) FROM reseller_orders o WHERE o.reseller_id = r.id AND o.order_status <> 'cancelled'), 0)
                 - COALESCE((SELECT SUM(p.amount) FROM reseller_customer_payments p JOIN reseller_orders o ON o.id = p.reseller_order_id WHERE o.reseller_id = r.id AND o.order_status <> 'cancelled'), 0) AS customer_outstanding,
               COALESCE((SELECT SUM(i.quantity) FROM reseller_order_items i JOIN reseller_orders o ON o.id = i.reseller_order_id WHERE o.reseller_id = r.id AND o.order_status <> 'cancelled'), 0) AS units_sold,
               COALESCE((SELECT SUM(inv.quantity_available) FROM reseller_package_inventory inv WHERE inv.reseller_id = r.id), 0) AS units_in_stock
        FROM resellers r WHERE r.status = 'active' ORDER BY sales_value DESC, r.full_name
      `).all();
      return json({ success: true, data: { sales: sales.results || [], items: items.results || [], payments: payments.results || [], performance: performance.results || [] } });
    }
    return json({ success: false, error: "Choose accounts or stock-orders." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
