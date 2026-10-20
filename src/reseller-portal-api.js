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
               p.stock_quantity, p.track_stock, p.image_url, p.package_group, p.package_label,
               pp.customer_price, pp.reseller_share, pp.company_share AS stock_unit_price, pp.minimum_order_quantity,
               COALESCE(ri.quantity_available, 0) AS reseller_stock_quantity
        FROM reseller_products p
        INNER JOIN reseller_product_pricing pp ON pp.reseller_product_id = p.id AND pp.is_enabled = 1
        LEFT JOIN reseller_categories c ON c.id = p.category_id
        LEFT JOIN reseller_inventory ri ON ri.reseller_product_id = p.id AND ri.reseller_id = ?
        WHERE p.status = 'active' AND (p.category_id IS NULL OR c.is_enabled = 1)
        ORDER BY p.sort_order, p.name, p.id
      `).bind(reseller.id).all();
      return json({ success: true, data: { products: result.results || [] } });
    }

    if (action === "inventory") {
      const reseller = await getReseller(token, env);
      if (!reseller || reseller.status !== "active") return json({ success: false, error: "An approved reseller account is required." }, 403);
      const result = await env.DB.prepare(`
        SELECT i.reseller_product_id AS product_id, p.name, p.package_label, p.sku, p.currency, i.quantity_available, i.pay_later_quantity, i.updated_at
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
          SELECT id, order_number, currency, total_amount, payment_status, order_status, fulfilment_mode, payment_reference,
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
      const body = await request.json();
      const fulfilmentMode = body.fulfilment_mode === "pay_later" ? "pay_later" : "upfront";
      if (fulfilmentMode === "pay_later" && Number(reseller.pay_later_enabled) !== 1) return json({ success: false, error: "Pay-later stock access has not been approved for your account." }, 403);
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
          SELECT p.id, p.name, p.package_label, p.sku, p.currency, p.stock_quantity, p.track_stock,
                 pp.customer_price, pp.reseller_share, pp.company_share, pp.minimum_order_quantity
          FROM reseller_products p JOIN reseller_product_pricing pp ON pp.reseller_product_id = p.id
          LEFT JOIN reseller_categories c ON c.id = p.category_id
          WHERE p.id = ? AND p.status = 'active' AND pp.is_enabled = 1
            AND (p.category_id IS NULL OR c.is_enabled = 1)
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
        INSERT INTO reseller_stock_orders (order_number, reseller_id, currency, total_amount, payment_status, order_status, fulfilment_mode, reseller_notes)
        VALUES (?, ?, ?, ?, 'pending', 'submitted', ?, ?)
        RETURNING id
      `).bind(orderNumber, reseller.id, currency, total, fulfilmentMode, clean(body.reseller_notes, 2000)).first();
      try {
        const statements = [];
        for (const item of orderItems) {
          if (Number(item.product.track_stock) === 1) statements.push(env.DB.prepare("UPDATE reseller_products SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(item.quantity, item.productId));
          statements.push(env.DB.prepare(`
            INSERT INTO reseller_stock_order_items
              (reseller_stock_order_id, reseller_product_id, product_name, product_sku, quantity, wholesale_unit_price, customer_unit_price, reseller_unit_share, line_total, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(created.id, item.productId, (item.product.package_label ? item.product.name + " — " + item.product.package_label : item.product.name), item.product.sku || "", item.quantity, item.wholesale, item.customerPrice, item.resellerShare, item.lineTotal, item.product.currency || "ZAR"));
        }
        statements.push(env.DB.prepare("UPDATE reseller_stock_orders SET stock_reserved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(created.id));
        await env.DB.batch(statements);
      } catch (error) {
        await env.DB.prepare("DELETE FROM reseller_stock_orders WHERE id = ?").bind(created.id).run();
        throw error;
      }
      return json({ success: true, data: { id: created.id, order_number: orderNumber, total_amount: total, currency, fulfilment_mode: fulfilmentMode, payment_status: "pending", order_status: "submitted" } }, 201);
    }

    if (action === "ledger") {
      const reseller = await getReseller(token, env);
      if (!reseller || reseller.status !== "active") return json({ success: false, error: "An approved reseller account is required." }, 403);
      const rows = await env.DB.prepare(`
        SELECT id, movement_type, amount_debit, amount_credit, reference_type, reference_id, payment_reference, notes, created_at
        FROM reseller_company_ledger WHERE reseller_id = ? ORDER BY created_at DESC, id DESC LIMIT 200
      `).bind(reseller.id).all();
      const balance = await env.DB.prepare(`
        SELECT COALESCE(SUM(amount_debit) - SUM(amount_credit), 0) AS outstanding
        FROM reseller_company_ledger WHERE reseller_id = ?
      `).bind(reseller.id).first();
      return json({ success: true, data: { outstanding: Number(balance?.outstanding || 0), entries: rows.results || [] } });
    }

    if (action === "sales") {
      const reseller = await getReseller(token, env);
      if (!reseller || reseller.status !== "active") return json({ success: false, error: "An approved reseller account is required." }, 403);
      if (request.method === "GET") {
        const orders = await env.DB.prepare(`
          SELECT id, order_number, customer_full_name, customer_phone, currency, subtotal,
                 reseller_earnings, company_earnings, payment_status, order_status, created_at
          FROM reseller_orders WHERE reseller_id = ? ORDER BY created_at DESC, id DESC LIMIT 100
        `).bind(reseller.id).all();
        const items = await env.DB.prepare(`
          SELECT i.reseller_order_id, i.product_name, i.quantity, i.customer_unit_price,
                 i.reseller_unit_share, i.line_total, i.currency
          FROM reseller_order_items i JOIN reseller_orders o ON o.id = i.reseller_order_id
          WHERE o.reseller_id = ? ORDER BY i.id
        `).bind(reseller.id).all();
        return json({ success: true, data: { sales: orders.results || [], items: items.results || [] } });
      }
      if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
      const body = await request.json();
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) return json({ success: false, error: "Add at least one product to this sale." }, 400);
      const quantities = new Map();
      for (const item of body.items) {
        const productId = Number(item.product_id), quantity = Number(item.quantity);
        if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return json({ success: false, error: "Each sale item needs a valid product and whole-number quantity." }, 400);
        quantities.set(productId, (quantities.get(productId) || 0) + quantity);
      }
      const saleItems = [];
      let subtotal = 0, resellerEarnings = 0, companyEarnings = 0, currency = "ZAR";
      for (const [productId, quantity] of quantities) {
        const product = await env.DB.prepare(`
          SELECT p.id, p.name, p.package_label, p.sku, p.currency, pp.customer_price, pp.reseller_share, pp.company_share,
                 pp.minimum_order_quantity, i.quantity_available, i.pay_later_quantity
          FROM reseller_products p
          JOIN reseller_product_pricing pp ON pp.reseller_product_id = p.id AND pp.is_enabled = 1
          JOIN reseller_inventory i ON i.reseller_product_id = p.id AND i.reseller_id = ?
          WHERE p.id = ?
        `).bind(reseller.id, productId).first();
        if (!product) return json({ success: false, error: "A selected product is not currently available for sale from your inventory." }, 400);

        if (quantity > Number(product.quantity_available)) return json({ success: false, error: "Your inventory does not have enough " + product.name + " for this sale." }, 409);
        const creditQuantity = Math.min(quantity, Number(product.pay_later_quantity || 0));
        currency = product.currency || "ZAR";
        const lineTotal = Math.round(Number(product.customer_price) * quantity * 100) / 100;
        const resellerLine = Math.round(Number(product.reseller_share) * quantity * 100) / 100;
        const companyLine = Math.round(Number(product.company_share) * quantity * 100) / 100;
        subtotal = Math.round((subtotal + lineTotal) * 100) / 100;
        resellerEarnings = Math.round((resellerEarnings + resellerLine) * 100) / 100;
        companyEarnings = Math.round((companyEarnings + companyLine) * 100) / 100;
        saleItems.push({ product, productId, quantity, creditQuantity, lineTotal, resellerLine, companyLine });
      }
      const paymentStatus = body.payment_status === "pending" ? "pending" : "paid";
      const customerName = clean(body.customer_full_name, 160);
      const customerPhone = clean(body.customer_phone, 40);
      const orderNumber = "MHR-SALE-" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-" + crypto.randomUUID().slice(0,8).toUpperCase();
      const created = await env.DB.prepare(`
        INSERT INTO reseller_orders
          (order_number, reseller_id, customer_full_name, customer_phone, currency, subtotal,
           reseller_earnings, company_earnings, payment_status, order_status, customer_notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'fulfilled', ?)
        RETURNING id
      `).bind(orderNumber, reseller.id, customerName, customerPhone, currency, subtotal, resellerEarnings, companyEarnings, paymentStatus, clean(body.customer_notes, 2000)).first();
      try {
        const statements = [];
        for (const item of saleItems) {
          statements.push(env.DB.prepare(`
            UPDATE reseller_inventory SET quantity_available = quantity_available - ?,
              pay_later_quantity = pay_later_quantity - ?, updated_at = CURRENT_TIMESTAMP
            WHERE reseller_id = ? AND reseller_product_id = ?
          `).bind(item.quantity, item.creditQuantity, reseller.id, item.productId));
          statements.push(env.DB.prepare(`
            INSERT INTO reseller_order_items
              (reseller_order_id, reseller_product_id, product_name, product_sku, quantity, customer_unit_price,
               reseller_unit_share, company_unit_share, line_total, reseller_line_earnings, company_line_earnings, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(created.id, item.productId, (item.product.package_label ? item.product.name + " — " + item.product.package_label : item.product.name), item.product.sku || "", item.quantity,
            Number(item.product.customer_price), Number(item.product.reseller_share), Number(item.product.company_share),
            item.lineTotal, item.resellerLine, item.companyLine, item.product.currency || "ZAR"));
          statements.push(env.DB.prepare(`
            INSERT INTO reseller_inventory_movements
              (reseller_id, reseller_product_id, movement_type, quantity_change, reference_type, reference_id, notes)
            VALUES (?, ?, 'sale', ?, 'reseller_sale', ?, ?)
          `).bind(reseller.id, item.productId, -item.quantity, created.id, "Customer sale " + orderNumber));
          if (item.creditQuantity > 0) {
            statements.push(env.DB.prepare(`
              INSERT INTO reseller_company_ledger
                (reseller_id, reseller_product_id, movement_type, amount_debit, reference_type, reference_id, notes)
              VALUES (?, ?, 'stock_sold_on_credit', ?, 'reseller_sale', ?, ?)
            `).bind(reseller.id, item.productId, Math.round(Number(item.product.company_share) * item.creditQuantity * 100) / 100, created.id, "Company share due from sale " + orderNumber));
          }
        }
        await env.DB.batch(statements);
      } catch (error) {
        await env.DB.prepare("DELETE FROM reseller_orders WHERE id = ?").bind(created.id).run();
        throw error;
      }
      return json({ success: true, data: { id: created.id, order_number: orderNumber, subtotal, reseller_earnings: resellerEarnings, currency, payment_status: paymentStatus } }, 201);
    }

    return json({ success: false, error: "Choose a valid reseller portal action." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
