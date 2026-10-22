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
               p.image_url, p.package_group, p.status
        FROM reseller_products p
        LEFT JOIN reseller_categories c ON c.id = p.category_id
        WHERE p.status = 'active' AND (p.category_id IS NULL OR c.is_enabled = 1)
          AND EXISTS (SELECT 1 FROM reseller_product_packages pkg WHERE pkg.reseller_product_id = p.id AND pkg.is_enabled = 1)
        ORDER BY p.sort_order, p.name, p.id
      `).all();
      const packageResult = await env.DB.prepare(`
        SELECT pkg.id AS package_id, pkg.reseller_product_id, pkg.package_label, pkg.units_per_package,
               pkg.stock_amount AS stock_unit_price, pkg.resale_amount AS customer_price,
               pkg.commission AS reseller_share, pkg.stock_quantity, pkg.stock_units_available, pkg.minimum_order_quantity,
               pkg.is_enabled, COALESCE(ri.quantity_available, 0) AS reseller_stock_quantity,
               COALESCE(ri.pay_later_quantity, 0) AS pay_later_quantity
        FROM reseller_product_packages pkg
        JOIN reseller_products p ON p.id = pkg.reseller_product_id
        LEFT JOIN reseller_package_inventory ri ON ri.package_id = pkg.id AND ri.reseller_id = ?
        LEFT JOIN reseller_categories c ON c.id = p.category_id
        WHERE pkg.is_enabled = 1 AND p.status = 'active' AND (p.category_id IS NULL OR c.is_enabled = 1)
        ORDER BY p.sort_order, p.name, pkg.sort_order, pkg.id
      `).bind(reseller.id).all();
      const byProduct = new Map();
      for (const pkg of packageResult.results || []) {
        if (!byProduct.has(pkg.reseller_product_id)) byProduct.set(pkg.reseller_product_id, []);
        byProduct.get(pkg.reseller_product_id).push(pkg);
      }
      const products = (result.results || []).map((p) => ({ ...p, packages: byProduct.get(p.id) || [] }));
      return json({ success: true, data: { products } });
    }
    if (action === "stock-register") {
      const reseller = await getReseller(token, env);
      if (!reseller || reseller.status !== "active") return json({ success: false, error: "An approved reseller account is required." }, 403);
      const result = await env.DB.prepare(`
        SELECT u.id AS unit_id, u.tracking_code, u.product_sku, u.status, u.reseller_note, u.expected_payment_date,
               u.reseller_order_id, o.order_number AS sale_order_number, o.sale_date, u.created_at, p.name AS product_name, p.currency, pkg.package_label,
               pkg.resale_amount AS customer_price, pkg.stock_amount AS stock_price, pkg.commission AS reseller_share,
               so.order_number AS stock_order_number, so.created_at AS stock_order_date
        FROM reseller_stock_units u
        JOIN reseller_product_packages pkg ON pkg.id = u.package_id
        JOIN reseller_products p ON p.id = pkg.reseller_product_id
        JOIN reseller_stock_orders so ON so.id = u.stock_order_id
        LEFT JOIN reseller_orders o ON o.id = u.reseller_order_id
        WHERE u.reseller_id = ?
        ORDER BY u.created_at DESC, u.id DESC LIMIT 2000
      `).bind(reseller.id).all();
      return json({ success: true, data: { units: result.results || [] } });
    }

    if (action === "inventory") {
      const reseller = await getReseller(token, env);
      if (!reseller || reseller.status !== "active") return json({ success: false, error: "An approved reseller account is required." }, 403);
      const result = await env.DB.prepare(`
        SELECT ri.package_id, pkg.reseller_product_id AS product_id, p.name, pkg.package_label, p.sku, p.currency,
               ri.quantity_available, ri.pay_later_quantity, ri.updated_at
        FROM reseller_package_inventory ri
        JOIN reseller_product_packages pkg ON pkg.id = ri.package_id
        JOIN reseller_products p ON p.id = pkg.reseller_product_id
        WHERE ri.reseller_id = ? ORDER BY p.name, pkg.sort_order, pkg.id
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
          SELECT i.reseller_stock_order_id, i.product_name, i.product_sku, i.package_label, i.quantity, i.wholesale_unit_price,
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
      if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) return json({ success: false, error: "Choose at least one item for your stock order." }, 400);
      const quantities = new Map();
      for (const item of body.items) {
        const packageId = Number(item.package_id), quantity = Number(item.quantity);
        const itemType = item.item_type === "mixed" ? "mixed" : item.item_type === "packages" ? "packages" : (body.order_type === "mixed" ? "mixed" : "packages");
        if (!Number.isSafeInteger(packageId) || packageId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return json({ success: false, error: "Each stock order row needs a package and whole-number quantity." }, 400);
        const key = packageId + ":" + itemType, previous = quantities.get(key);
        quantities.set(key, { packageId, quantity: (previous?.quantity || 0) + quantity, itemType });
      }
      const rows = [...quantities.values()];
      const mixedUnitCount = rows.filter(item => item.itemType === "mixed").reduce((sum, item) => sum + item.quantity, 0);
      if (mixedUnitCount > 0 && mixedUnitCount < 10) return json({ success: false, error: "Individual-unit selections must total at least 10 units across the cart." }, 400);
      const orderItems = [];
      let total = 0;
      let currency = "ZAR";
      const requestedUnitsByPackage = new Map();
      for (const item of rows) {
        const pkg = await env.DB.prepare("SELECT pkg.id AS package_id, pkg.reseller_product_id AS product_id, pkg.package_label, pkg.units_per_package, pkg.stock_amount, pkg.resale_amount, pkg.commission, pkg.stock_quantity, pkg.stock_units_available, pkg.minimum_order_quantity, p.name, p.sku, p.currency FROM reseller_product_packages pkg JOIN reseller_products p ON p.id = pkg.reseller_product_id LEFT JOIN reseller_categories c ON c.id = p.category_id WHERE pkg.id = ? AND pkg.is_enabled = 1 AND p.status = 'active' AND (p.category_id IS NULL OR c.is_enabled = 1)").bind(item.packageId).first();
        if (!pkg) return json({ success: false, error: "One selected package is no longer available." }, 400);
        const unitsPerPackage = Number(pkg.units_per_package || 1);
        if (item.itemType === "packages" && item.quantity < Number(pkg.minimum_order_quantity)) return json({ success: false, error: pkg.name + " (" + pkg.package_label + ") requires a minimum order of " + pkg.minimum_order_quantity + " package(s)." }, 400);
        item.unitsNeeded = item.itemType === "mixed" ? item.quantity : item.quantity * unitsPerPackage;
        item.pkg = pkg;
        requestedUnitsByPackage.set(item.packageId, (requestedUnitsByPackage.get(item.packageId) || 0) + item.unitsNeeded);
      }
      for (const item of rows) {
        const pkg = item.pkg, unitsPerPackage = Number(pkg.units_per_package || 1);
        const unitsAvailable = Number(pkg.stock_units_available ?? (Number(pkg.stock_quantity) * unitsPerPackage));
        const packageCountAvailable = Math.floor(unitsAvailable / unitsPerPackage);
        if ((requestedUnitsByPackage.get(item.packageId) || 0) > unitsAvailable || (item.itemType === "packages" && item.quantity > packageCountAvailable)) return json({ success: false, error: "Not enough stock available for " + pkg.name + " (" + pkg.package_label + "). Please refresh the catalogue." }, 409);
        currency = pkg.currency || currency;
        const wholesale = Number(pkg.stock_amount), customerPrice = Number(pkg.resale_amount), resellerShare = Number(pkg.commission);
        const itemUnitsPerPackage = item.itemType === "mixed" ? 1 : unitsPerPackage;
        const lineTotal = Math.round(wholesale * itemUnitsPerPackage * item.quantity * 100) / 100;
        total = Math.round((total + lineTotal) * 100) / 100;
        orderItems.push({ ...item, productId: Number(pkg.product_id), itemUnitsPerPackage, wholesale, customerPrice, resellerShare, lineTotal });
      }
      const orderNumber = "MHR-RS-" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-" + crypto.randomUUID().slice(0,8).toUpperCase();
      const created = await env.DB.prepare("INSERT INTO reseller_stock_orders (order_number, reseller_id, currency, total_amount, payment_status, order_status, fulfilment_mode, reseller_notes) VALUES (?, ?, ?, ?, 'pending', 'submitted', ?, ?) RETURNING id").bind(orderNumber, reseller.id, currency, total, fulfilmentMode, clean(body.reseller_notes, 2000)).first();
      try {
        const statements = [];
        for (const item of orderItems) {
          if (item.itemType === "mixed") {
            statements.push(env.DB.prepare("UPDATE reseller_product_packages SET stock_units_available = stock_units_available - ?, stock_quantity = CAST((stock_units_available - ?) / units_per_package AS INTEGER), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stock_units_available >= ?").bind(item.unitsNeeded, item.unitsNeeded, item.packageId, item.unitsNeeded));
          } else {
            statements.push(env.DB.prepare("UPDATE reseller_product_packages SET stock_quantity = stock_quantity - ?, stock_units_available = stock_units_available - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stock_quantity >= ? AND stock_units_available >= ?").bind(item.quantity, item.unitsNeeded, item.packageId, item.quantity, item.unitsNeeded));
          }
          statements.push(env.DB.prepare("INSERT INTO reseller_stock_order_items (reseller_stock_order_id, reseller_product_id, package_id, package_label, product_name, product_sku, quantity, wholesale_unit_price, customer_unit_price, reseller_unit_share, line_total, currency, units_per_package) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(created.id, item.productId, item.packageId, item.itemType === "mixed" ? item.pkg.package_label + " (individual units)" : item.pkg.package_label, item.pkg.name + " — " + item.pkg.package_label + (item.itemType === "mixed" ? " (individual units)" : ""), item.pkg.sku || "", item.quantity, item.wholesale, item.customerPrice, item.resellerShare, item.lineTotal, item.pkg.currency || "ZAR", item.itemUnitsPerPackage));
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
          SELECT o.id, o.order_number, o.currency, o.subtotal,
                 o.reseller_earnings, o.company_earnings, o.payment_status, o.order_status, o.sale_date, o.expected_payment_date, o.customer_notes, o.created_at,
                 COALESCE((SELECT SUM(p.amount) FROM reseller_customer_payments p WHERE p.reseller_order_id = o.id), 0) AS amount_collected
          FROM reseller_orders o WHERE o.reseller_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 100
        `).bind(reseller.id).all();
        const payments = await env.DB.prepare(`
          SELECT p.id, p.reseller_order_id, p.amount, p.payment_date, p.payment_method, p.payment_reference, p.notes
          FROM reseller_customer_payments p JOIN reseller_orders o ON o.id = p.reseller_order_id
          WHERE o.reseller_id = ? ORDER BY p.payment_date DESC, p.id DESC
        `).bind(reseller.id).all();
        const items = await env.DB.prepare(`
          SELECT i.reseller_order_id, i.product_name, i.package_label, i.quantity, i.customer_unit_price,
                 i.reseller_unit_share, i.line_total, i.currency
          FROM reseller_order_items i JOIN reseller_orders o ON o.id = i.reseller_order_id
          WHERE o.reseller_id = ? ORDER BY i.id
        `).bind(reseller.id).all();
        return json({ success: true, data: { sales: orders.results || [], items: items.results || [], payments: payments.results || [] } });
      }
      if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
      const body = await request.json();
      if ((!Array.isArray(body.unit_ids) || !body.unit_ids.length) && (!Array.isArray(body.items) || !body.items.length || body.items.length > 50)) return json({ success: false, error: "Select at least one stock item for this sale." }, 400);
      if (Array.isArray(body.unit_ids) && body.unit_ids.length > 500) return json({ success: false, error: "Record up to 500 individual items per sale." }, 400);
      const quantities = new Map();
      const unitIdsByPackage = new Map();
      if (Array.isArray(body.unit_ids) && body.unit_ids.length) {
        const ids = [...new Set(body.unit_ids.map(Number))];
        if (ids.length !== body.unit_ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return json({ success: false, error: "Select valid individual stock records." }, 400);
        const placeholders = ids.map(() => "?").join(",");
        const selected = await env.DB.prepare(`
          SELECT id, package_id, status FROM reseller_stock_units
          WHERE reseller_id = ? AND id IN (${placeholders})
        `).bind(reseller.id, ...ids).all();
        if ((selected.results || []).length !== ids.length || selected.results.some(unit => unit.status !== "available")) return json({ success: false, error: "One or more selected stock records are no longer available." }, 409);
        for (const unit of selected.results) {
          quantities.set(Number(unit.package_id), (quantities.get(Number(unit.package_id)) || 0) + 1);
          if (!unitIdsByPackage.has(Number(unit.package_id))) unitIdsByPackage.set(Number(unit.package_id), []);
          unitIdsByPackage.get(Number(unit.package_id)).push(Number(unit.id));
        }
      } else {
        for (const item of body.items) {
          const packageId = Number(item.package_id), quantity = Number(item.quantity);
          if (!Number.isSafeInteger(packageId) || packageId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return json({ success: false, error: "Each sale row needs a package and whole-number quantity." }, 400);
          quantities.set(packageId, (quantities.get(packageId) || 0) + quantity);
        }
      }
      if (!quantities.size) return json({ success: false, error: "Select stock items to record this sale." }, 400);
      const saleItems = [];
      let subtotal = 0, resellerEarnings = 0, companyEarnings = 0, currency = "ZAR";
      for (const [packageId, quantity] of quantities) {
        const pkg = await env.DB.prepare(`
          SELECT pkg.id AS package_id, pkg.reseller_product_id AS product_id, pkg.package_label, pkg.stock_amount, pkg.resale_amount, pkg.commission,
                 pkg.minimum_order_quantity, ri.quantity_available, ri.pay_later_quantity, p.name, p.sku, p.currency
          FROM reseller_product_packages pkg
          JOIN reseller_products p ON p.id = pkg.reseller_product_id
          JOIN reseller_package_inventory ri ON ri.package_id = pkg.id AND ri.reseller_id = ?
          LEFT JOIN reseller_categories c ON c.id = p.category_id
          WHERE pkg.id = ? AND pkg.is_enabled = 1 AND p.status = 'active' AND (p.category_id IS NULL OR c.is_enabled = 1)
        `).bind(reseller.id, packageId).first();
        if (!pkg) return json({ success: false, error: "A selected package is not available in your inventory." }, 400);
        if (quantity > Number(pkg.quantity_available)) return json({ success: false, error: "Your inventory does not have enough " + pkg.name + " (" + pkg.package_label + ") for this sale." }, 409);
        const creditQuantity = Math.min(quantity, Number(pkg.pay_later_quantity || 0));
        currency = pkg.currency || "ZAR";
        const lineTotal = Math.round(Number(pkg.resale_amount) * quantity * 100) / 100;
        const resellerLine = Math.round(Number(pkg.commission) * quantity * 100) / 100;
        const companyLine = Math.round(Number(pkg.stock_amount) * quantity * 100) / 100;
        subtotal = Math.round((subtotal + lineTotal) * 100) / 100;
        resellerEarnings = Math.round((resellerEarnings + resellerLine) * 100) / 100;
        companyEarnings = Math.round((companyEarnings + companyLine) * 100) / 100;
        saleItems.push({ pkg, packageId, productId: Number(pkg.product_id), quantity, creditQuantity, lineTotal, resellerLine, companyLine, unitIds: unitIdsByPackage.get(packageId) || [] });
      }
      const initialPayment = Math.round(Number(body.amount_collected || 0) * 100) / 100;
      if (!Number.isFinite(initialPayment) || initialPayment < 0 || initialPayment > subtotal + 0.001) return json({ success: false, error: "Enter a valid customer payment amount no greater than the sale total." }, 400);
      const paymentStatus = initialPayment + 0.001 >= subtotal ? "paid" : "pending";
      const saleDate = clean(body.sale_date, 10) || new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate) || Number.isNaN(Date.parse(saleDate))) return json({ success: false, error: "Enter a valid sale date." }, 400);
      const orderNumber = "MHR-SALE-" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-" + crypto.randomUUID().slice(0,8).toUpperCase();
      const created = await env.DB.prepare(`
        INSERT INTO reseller_orders
          (order_number, reseller_id, currency, subtotal, reseller_earnings, company_earnings, payment_status, order_status, customer_notes, sale_date, expected_payment_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'fulfilled', ?, ?, ?)
        RETURNING id
      `).bind(orderNumber, reseller.id, currency, subtotal, resellerEarnings, companyEarnings, paymentStatus, clean(body.customer_notes, 2000), saleDate, clean(body.expected_payment_date, 10)).first();
      try {
        const statements = [];
        for (const item of saleItems) {
          statements.push(env.DB.prepare(`
            UPDATE reseller_package_inventory SET quantity_available = quantity_available - ?,
              pay_later_quantity = pay_later_quantity - ?, updated_at = CURRENT_TIMESTAMP
            WHERE reseller_id = ? AND package_id = ? AND quantity_available >= ?
          `).bind(item.quantity, item.creditQuantity, reseller.id, item.packageId, item.quantity));
          statements.push(env.DB.prepare(`
            INSERT INTO reseller_order_items
              (reseller_order_id, reseller_product_id, package_id, package_label, product_name, product_sku, quantity, customer_unit_price,
               reseller_unit_share, company_unit_share, line_total, reseller_line_earnings, company_line_earnings, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(created.id, item.productId, item.packageId, item.pkg.package_label, item.pkg.name + " — " + item.pkg.package_label, item.pkg.sku || "", item.quantity,
            Number(item.pkg.resale_amount), Number(item.pkg.commission), Number(item.pkg.stock_amount),
            item.lineTotal, item.resellerLine, item.companyLine, item.pkg.currency || "ZAR"));
          statements.push(env.DB.prepare(`
            INSERT INTO reseller_inventory_movements
              (reseller_id, reseller_product_id, package_id, movement_type, quantity_change, reference_type, reference_id, notes)
            VALUES (?, ?, ?, 'sale', ?, 'reseller_sale', ?, ?)
          `).bind(reseller.id, item.productId, item.packageId, -item.quantity, created.id, "Customer sale " + orderNumber + " (" + item.pkg.package_label + ")"));
          if (item.unitIds.length) {
            for (const unitId of item.unitIds) {
              statements.push(env.DB.prepare(`
                UPDATE reseller_stock_units SET status = 'sold', reseller_order_id = ?, reseller_note = ?,
                  expected_payment_date = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND reseller_id = ? AND status = 'available'
              `).bind(created.id, clean(body.customer_notes, 2000), clean(body.expected_payment_date, 10), unitId, reseller.id));
            }
          }
          if (item.creditQuantity > 0) {
            statements.push(env.DB.prepare(`
              INSERT INTO reseller_company_ledger
                (reseller_id, reseller_product_id, package_id, movement_type, amount_debit, reference_type, reference_id, notes)
              VALUES (?, ?, ?, 'stock_sold_on_credit', ?, 'reseller_sale', ?, ?)
            `).bind(reseller.id, item.productId, item.packageId, Math.round(Number(item.pkg.stock_amount) * item.creditQuantity * 100) / 100, created.id, "Company share due from sale " + orderNumber + " (" + item.pkg.package_label + ")"));
          }
        }
        if (initialPayment > 0) {
          statements.push(env.DB.prepare(`
            INSERT INTO reseller_customer_payments (reseller_order_id, amount, payment_date, payment_method, payment_reference, notes)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(created.id, initialPayment, clean(body.payment_date, 40) || new Date().toISOString(), clean(body.payment_method, 80), clean(body.payment_reference, 200), clean(body.payment_notes, 1000)));
        }
        await env.DB.batch(statements);
      } catch (error) {
        await env.DB.prepare("DELETE FROM reseller_orders WHERE id = ?").bind(created.id).run();
        throw error;
      }
      return json({ success: true, data: { id: created.id, order_number: orderNumber, subtotal, amount_collected: initialPayment, customer_balance: Math.round((subtotal - initialPayment) * 100) / 100, reseller_earnings: resellerEarnings, currency, payment_status: paymentStatus } }, 201);
    }
    if (action === "sales-payments" && request.method === "POST") {
      const reseller = await getReseller(token, env);
      if (!reseller || reseller.status !== "active") return json({ success: false, error: "An approved reseller account is required." }, 403);
      const body = await request.json();
      const orderId = Number(body.reseller_order_id);
      const amount = Math.round(Number(body.amount) * 100) / 100;
      if (!Number.isSafeInteger(orderId) || orderId <= 0 || !Number.isFinite(amount) || amount <= 0) return json({ success: false, error: "Choose a sale and enter a payment amount greater than zero." }, 400);
      const order = await env.DB.prepare("SELECT id, subtotal, currency FROM reseller_orders WHERE id = ? AND reseller_id = ?").bind(orderId, reseller.id).first();
      if (!order) return json({ success: false, error: "Customer sale not found in your account." }, 404);
      const collectedRow = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS amount_collected FROM reseller_customer_payments WHERE reseller_order_id = ?").bind(orderId).first();
      const collected = Math.round(Number(collectedRow?.amount_collected || 0) * 100) / 100;
      const balance = Math.round((Number(order.subtotal) - collected) * 100) / 100;
      if (amount > balance + 0.001) return json({ success: false, error: "Payment exceeds the customer's remaining balance of " + balance.toFixed(2) + "." }, 400);
      const paymentDate = clean(body.payment_date, 40) || new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO reseller_customer_payments (reseller_order_id, amount, payment_date, payment_method, payment_reference, notes) VALUES (?, ?, ?, ?, ?, ?)`).bind(orderId, amount, paymentDate, clean(body.payment_method, 80), clean(body.payment_reference, 200), clean(body.notes, 1000)),
        env.DB.prepare("UPDATE reseller_orders SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND reseller_id = ?").bind(amount + collected + 0.001 >= Number(order.subtotal) ? "paid" : "pending", orderId, reseller.id)
      ]);
      return json({ success: true, data: { reseller_order_id: orderId, amount_collected: Math.round((collected + amount) * 100) / 100, customer_balance: Math.max(0, Math.round((balance - amount) * 100) / 100) } }, 201);
    }
    return json({ success: false, error: "Choose a valid reseller portal action." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
