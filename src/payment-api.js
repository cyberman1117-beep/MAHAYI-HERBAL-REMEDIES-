import { verifyFirebaseIdToken } from "./index.js";
import { sendOrderConfirmation } from "./communication-service.js";
import { packOrder } from "./shipping-packing.js";
import { getCourierGuyRates } from "./shipping-courier.js";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS }); }
function clean(value) { return String(value ?? "").trim(); }
function toAmountSubunit(amount) { const value = Number(amount); if (!Number.isFinite(value) || value < 0) throw new Error("Invalid payment amount."); return Math.round(value * 100); }
function makeReference() { return "CS-" + Date.now().toString(36) + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16); }

async function paystackRequest(path, options, secretKey) {
  const response = await fetch("https://api.paystack.co" + path, {
    ...options,
    headers: { Authorization: "Bearer " + secretKey, "Content-Type": "application/json", ...(options?.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.status) throw new Error(payload?.message || "Paystack request failed.");
  return payload;
}

async function getAuthoritativeCart(env, items) {
  if (!Array.isArray(items) || !items.length) throw new Error("Your cart is empty.");
  const normalized = items.map(item => ({ product_id: Number(item?.product_id), quantity: Number(item?.quantity) }));
  if (normalized.some(item => !Number.isInteger(item.product_id) || item.product_id <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99)) throw new Error("Your cart contains an invalid item.");
  const ids = [...new Set(normalized.map(item => item.product_id))];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await env.DB.prepare("SELECT id, name, price, currency, status FROM products WHERE id IN (" + placeholders + ")").bind(...ids).all();
  const products = new Map((result.results || []).map(product => [Number(product.id), product]));
  if (products.size !== ids.length) throw new Error("One or more products are no longer available.");
  let currency = null, subtotal = 0;
  const lineItems = [];
  for (const item of normalized) {
    const product = products.get(item.product_id);
    if (product.status !== "active") throw new Error("Product unavailable: " + product.name);
    const productCurrency = clean(product.currency || "ZAR").toUpperCase();
    if (!currency) currency = productCurrency;
    if (currency !== productCurrency) throw new Error("Cart contains products with different currencies.");
    const unitPrice = Number(product.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Invalid price for product: " + product.name);
    subtotal += unitPrice * item.quantity;
    lineItems.push({ product_id: item.product_id, name: product.name, quantity: item.quantity, unit_price: unitPrice, currency: productCurrency });
  }
  return { currency: currency || "ZAR", subtotal, lineItems };
}

async function validatePacking(env, lineItems) {
  const ids = [...new Set(lineItems.map((item) => Number(item.product_id)))];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = (await env.DB.prepare(
    `SELECT p.id AS product_id, p.name AS product_name,
            ps.shipping_type_id,
            st.code AS shipping_type_code,
            CASE WHEN ps.packing_mode = 'prepackaged' THEN 1 ELSE 0 END AS is_prepackaged,
            ps.weight_kg AS shipping_weight_kg,
            ps.length_cm AS shipping_length_cm,
            ps.width_cm AS shipping_width_cm,
            ps.height_cm AS shipping_height_cm
     FROM products p
     LEFT JOIN product_shipping ps ON ps.product_id = p.id
     LEFT JOIN shipping_types st ON st.id = ps.shipping_type_id
     WHERE p.id IN (${placeholders})`
  ).bind(...ids).all()).results ?? [];
  const products = new Map(rows.map((row) => [Number(row.product_id), row]));
  const packaging = (await env.DB.prepare(
    "SELECT id,name,packaging_type,length_cm,width_cm,height_cm,packaging_weight_kg,max_weight_kg,stock_quantity FROM shipping_packaging WHERE is_enabled = 1 ORDER BY sort_order ASC,id ASC"
  ).all()).results ?? [];
  const result = packOrder({
    items: lineItems.map((item) => ({
      product_id: item.product_id,
      product_name: item.name,
      quantity: item.quantity,
      shipping: products.get(Number(item.product_id))
    })),
    packaging
  });
  if (!result.success) {
    const detail = result.errors.map((item) => item.error).filter(Boolean).join(" ");
    throw new Error(detail || "This cart cannot currently be safely packaged for delivery.");
  }
  return result;
}

async function getShipping(env, shippingMethodId, shippingOptionId, shippingRateCode = '', packing = null, customer = {}, declaredValue = 0) {
  const methodId = Number(shippingMethodId), optionId = Number(shippingOptionId);
  if (!Number.isInteger(methodId) || methodId <= 0) throw new Error("Please select a valid delivery method and option.");

  const normalizeArea = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const customerCity = normalizeArea(customer?.city);
  if (customerCity) {
    const localOptions = (await env.DB.prepare(
      "SELECT m.id AS method_id, m.name AS method_name, m.provider_type, m.mode, o.id AS option_id, o.name AS option_name, o.price FROM shipping_methods m JOIN shipping_options o ON o.shipping_method_id = m.id WHERE m.provider_type = 'local' AND m.is_enabled = 1 AND o.is_enabled = 1 ORDER BY m.sort_order ASC, m.id ASC, o.sort_order ASC, o.id ASC"
    ).all()).results ?? [];
    const localMatch = localOptions.find((option) => normalizeArea(option.option_name) === customerCity);
    if (localMatch) {
      return localMatch;
    }
  }
  if (clean(shippingRateCode) && packing?.parcels?.length) {
    const method = await env.DB.prepare("SELECT id, name, provider_type, mode FROM shipping_methods WHERE id = ? AND is_enabled = 1").bind(methodId).first();
    if (method?.provider_type === "courier_guy" && method.mode === "api") {
      const courier = await getCourierGuyRates(env, { parcels: packing.parcels, customer, declaredValue });
      const rate = courier.rates.find((item) => item.code === clean(shippingRateCode));
      if (!rate) throw new Error("The selected courier rate is no longer available. Please refresh the shipping rates.");
      return { method_id: method.id, method_name: method.name, provider_type: method.provider_type, mode: method.mode, option_id: 0, option_name: rate.name, price: Number(rate.price), rate_code: rate.code };
    }
    if (method?.provider_type === "custom" && method.mode === "manual") {
      const courier = await env.DB.prepare("SELECT id, calculation_mode FROM custom_couriers WHERE shipping_method_id = ?").bind(method.id).first();
      if (!courier) throw new Error("This custom courier is not configured.");
      const rateId = Number(clean(shippingRateCode).replace(/^custom-/, ""));
      if (!Number.isInteger(rateId) || rateId <= 0) throw new Error("The selected custom courier rate is invalid. Please refresh the shipping rates.");
      const rate = await env.DB.prepare(
        "SELECT id, service_name, area_name, min_weight_kg, max_weight_kg, price, estimated_delivery FROM custom_courier_rates WHERE id = ? AND custom_courier_id = ? AND is_enabled = 1"
      ).bind(rateId, courier.id).first();
      if (!rate) throw new Error("The selected custom courier rate is no longer available. Please refresh the shipping rates.");
      const totalWeight = (packing.parcels || []).reduce((sum, parcel) => sum + Number(parcel.weight_kg || 0), 0);
      const areaValues = [customer?.city, customer?.province, customer?.postal_code].map((value) => clean(value).toLowerCase()).filter(Boolean);
      const configuredArea = clean(rate.area_name).toLowerCase();
      const areaMatches = !configuredArea || areaValues.includes(configuredArea);
      const min = rate.min_weight_kg === null || rate.min_weight_kg === undefined ? 0 : Number(rate.min_weight_kg);
      const max = rate.max_weight_kg === null || rate.max_weight_kg === undefined ? Infinity : Number(rate.max_weight_kg);
      const weightMatches = totalWeight >= min && totalWeight <= max;
      const modeMatches = courier.calculation_mode === "fixed"
        || (courier.calculation_mode === "weight" && weightMatches)
        || (courier.calculation_mode === "area" && areaMatches)
        || (courier.calculation_mode === "weight_area" && weightMatches && areaMatches);
      if (!modeMatches) throw new Error("The selected custom courier rate does not match this order. Please refresh the shipping rates.");
      return { method_id: method.id, method_name: method.name, provider_type: method.provider_type, mode: method.mode, option_id: 0, option_name: rate.service_name + (rate.estimated_delivery ? " · " + rate.estimated_delivery : ""), price: Number(rate.price || 0), rate_code: "custom-" + rate.id };
    }
  }
  if (!Number.isInteger(optionId) || optionId <= 0) throw new Error("Please select a valid delivery method and option.");
  const row = await env.DB.prepare(
    "SELECT m.id AS method_id, m.name AS method_name, m.provider_type, m.mode, o.id AS option_id, o.name AS option_name, o.price FROM shipping_methods m JOIN shipping_options o ON o.shipping_method_id = m.id WHERE m.id = ? AND o.id = ? AND m.is_enabled = 1 AND o.is_enabled = 1"
  ).bind(methodId, optionId).first();
  if (!row) throw new Error("The selected delivery option is no longer available.");
  return row;
}
async function handleInitialize(request, env) {
  const token = await verifyFirebaseIdToken(request);
  const body = await request.json().catch(() => ({}));
  const email = clean(token.email || body?.email);
  if (!email) return json({ success: false, error: "A customer email address is required." }, 400);

  const provider = await env.DB.prepare(
    "SELECT provider_key, display_name FROM payment_providers WHERE is_enabled = 1 ORDER BY sort_order ASC, id ASC LIMIT 1"
  ).first();

  if (!provider) {
    return json({ success: false, error: "No payment provider is enabled for checkout." }, 503);
  }

  if (provider.provider_key !== "yoco") {
    return json({ success: false, error: provider.display_name + " checkout is not implemented yet." }, 501);
  }

  if (!env.YOCO_SECRET_KEY) {
    return json({ success: false, error: "Yoco payment gateway is not configured yet." }, 503);
  }

  const cartResult = await getAuthoritativeCart(env, body?.items);
  const packing = await validatePacking(env, cartResult.lineItems);
  const shipping = await getShipping(env, body?.shipping_method_id, body?.shipping_option_id, body?.shipping_rate_code, packing, body?.customer, cartResult.subtotal);
  const total = cartResult.subtotal + Number(shipping.price || 0);

  if (cartResult.currency !== "ZAR") {
    return json({ success: false, error: "Yoco checkout is currently configured for ZAR." }, 400);
  }
  if (!(total > 0)) {
    return json({ success: false, error: "Payment total must be greater than zero." }, 400);
  }

  const reference = makeReference();
  const checkoutData = {
    line_items: cartResult.lineItems,
    shipping: {
      method_id: shipping.method_id,
      method_name: shipping.method_name,
      provider_type: shipping.provider_type,
      mode: shipping.mode,
      option_id: shipping.option_id,
      option_name: shipping.option_name,
      fee: Number(shipping.price || 0)
    },
    customer: {
      full_name: clean(body?.customer?.full_name),
      phone: clean(body?.customer?.phone),
      address: clean(body?.customer?.address),
      city: clean(body?.customer?.city),
      province: clean(body?.customer?.province),
      postal_code: clean(body?.customer?.postal_code),
      country: clean(body?.customer?.country || "South Africa"),
      notes: clean(body?.customer?.notes),
      landmark: clean(body?.customer?.landmark)
    }
  };

  await env.DB.prepare(
    "INSERT INTO payment_transactions (firebase_uid, reference, provider, status, amount, currency, customer_email, checkout_data) VALUES (?, ?, ?, 'initializing', ?, ?, ?, ?)"
  ).bind(
    token.sub,
    reference,
    provider.provider_key,
    total,
    cartResult.currency,
    email,
    JSON.stringify(checkoutData)
  ).run();

  try {
    // Return customers to the storefront that initiated checkout, rather than the API Worker origin.
    // The browser supplies the storefront origin on the same-origin /api/payment/initialize request.
    const requestOrigin = clean(request.headers.get("Origin"));
    const origin = requestOrigin || new URL(request.url).origin;
    const query = "?reference=" + encodeURIComponent(reference);

    const yocoResponse = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.YOCO_SECRET_KEY,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        amount: toAmountSubunit(total),
        currency: cartResult.currency,
        successUrl: origin + "/payment.html" + query,
        cancelUrl: origin + "/payment.html" + query,
        failureUrl: origin + "/payment.html" + query,
        metadata: {
          reference,
          firebase_uid: token.sub
        }
      })
    });

    const payload = await yocoResponse.json().catch(() => ({}));
    if (!yocoResponse.ok || !payload?.redirectUrl) {
      throw new Error(payload?.message || payload?.error || "Yoco checkout creation failed.");
    }

    await env.DB.prepare(
      "UPDATE payment_transactions SET status = 'pending', provider_checkout_id = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ?"
    ).bind(String(payload.id || ""), reference).run();

    return json({
      success: true,
      data: {
        reference,
        provider: provider.provider_key,
        authorization_url: payload.redirectUrl
      }
    });
  } catch (error) {
    await env.DB.prepare(
      "UPDATE payment_transactions SET status = 'initialization_failed', updated_at = CURRENT_TIMESTAMP WHERE reference = ?"
    ).bind(reference).run();
    throw error;
  }
}

async function createOrderFromVerifiedPayment(env, transaction) {
  const existing = await env.DB.prepare(
    "SELECT id, order_number FROM orders WHERE payment_transaction_id = ?"
  ).bind(transaction.id).first();
  if (existing) return { ...existing, created: false };

  const checkoutData = JSON.parse(transaction.checkout_data || "{}");
  const customer = checkoutData.customer || {};
  const shipping = checkoutData.shipping || {};
  const lineItems = Array.isArray(checkoutData.line_items) ? checkoutData.line_items : [];
  if (!lineItems.length) throw new Error("Verified payment has no order items.");

  const orderNumber = "ORD-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);
  const shippingFee = Number(shipping.fee || 0);
  const total = Number(transaction.amount);

  const orderInsert = env.DB.prepare(
    "INSERT INTO orders (order_number, payment_transaction_id, firebase_uid, customer_email, customer_full_name, customer_phone, shipping_address, shipping_city, shipping_province, shipping_postal_code, shipping_country, shipping_method_id, shipping_method_name, shipping_option_id, shipping_option_name, shipping_fee, subtotal, total, currency, payment_status, order_status, customer_notes, delivery_landmark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', 'pending', ?, ?)"
  ).bind(
    orderNumber,
    transaction.id,
    transaction.firebase_uid,
    transaction.customer_email,
    clean(customer.full_name),
    clean(customer.phone),
    clean(customer.address),
    clean(customer.city),
    clean(customer.province),
    clean(customer.postal_code),
    clean(customer.country || "South Africa"),
    Number(shipping.method_id) || null,
    clean(shipping.method_name),
    Number(shipping.option_id) || null,
    clean(shipping.option_name),
    shippingFee,
    subtotal,
    total,
    transaction.currency,
    clean(customer.notes),
    clean(customer.landmark)
  );

  const itemStatements = lineItems.map(item =>
    env.DB.prepare(
      "INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total, currency) SELECT id, ?, ?, ?, ?, ?, ? FROM orders WHERE payment_transaction_id = ?"
    ).bind(
      Number(item.product_id),
      clean(item.name),
      Number(item.quantity),
      Number(item.unit_price),
      Number(item.unit_price) * Number(item.quantity),
      clean(item.currency || transaction.currency).toUpperCase(),
      transaction.id
    )
  );

  try {
    await env.DB.batch([orderInsert, ...itemStatements]);
  } catch (error) {
    const duplicate = await env.DB.prepare(
      "SELECT id, order_number FROM orders WHERE payment_transaction_id = ?"
    ).bind(transaction.id).first();
    if (duplicate) return { ...duplicate, created: false };
    throw error;
  }

  const createdOrder = await env.DB.prepare(
    "SELECT id, order_number FROM orders WHERE payment_transaction_id = ?"
  ).bind(transaction.id).first();
  return createdOrder ? { ...createdOrder, created: true } : null;
}

async function handleVerify(request, env) {
  const token = await verifyFirebaseIdToken(request);
  const reference = clean(new URL(request.url).searchParams.get("reference"));
  if (!reference) return json({ success: false, error: "Payment reference is required." }, 400);

  const transaction = await env.DB.prepare(
    "SELECT id, firebase_uid, reference, provider, status, amount, currency, customer_email, provider_checkout_id, provider_transaction_id, checkout_data FROM payment_transactions WHERE reference = ? AND firebase_uid = ?"
  ).bind(reference, token.sub).first();
  if (!transaction) return json({ success: false, error: "Payment transaction not found." }, 404);

  if (transaction.provider === "yoco") {
    if (!env.YOCO_SECRET_KEY) return json({ success: false, error: "Yoco payment gateway is not configured yet." }, 503);
    if (!transaction.provider_checkout_id) return json({ success: false, error: "Yoco checkout reference is missing." }, 500);

    const response = await fetch("https://payments.yoco.com/api/checkouts/" + encodeURIComponent(transaction.provider_checkout_id), {
      method: "GET",
      headers: {
        Authorization: "Bearer " + env.YOCO_SECRET_KEY,
        Accept: "application/json"
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.id) {
      throw new Error(payload?.message || payload?.error || "Yoco payment verification failed.");
    }

    const data = payload;
    const status = clean(data.status || "unknown").toLowerCase();
    const amountMatches = Number(data.amount) === toAmountSubunit(transaction.amount);
    const currencyMatches = clean(data.currency).toUpperCase() === clean(transaction.currency).toUpperCase();
    const providerTransactionId = String(data.transactionId || data.paymentId || data.id || "");

    if (status === "completed" && amountMatches && currencyMatches) {
      await env.DB.prepare(
        "UPDATE payment_transactions SET status = 'success', provider_transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ?"
      ).bind(providerTransactionId, reference).run();
      const order = await createOrderFromVerifiedPayment(env, transaction);
      if (order?.created) {
        await sendOrderConfirmation(env, transaction, order, JSON.parse(transaction.checkout_data || "{}"));
      }
      return json({ success: true, data: { reference, status: "success", amount: transaction.amount, currency: transaction.currency, order_id: order.id, order_number: order.order_number } });
    }

    const localStatus = status === "failed" || status === "cancelled" ? status : "pending";
    await env.DB.prepare(
      "UPDATE payment_transactions SET status = ?, provider_transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ?"
    ).bind(localStatus, providerTransactionId, reference).run();
    return json({ success: true, data: { reference, status: localStatus, amount: transaction.amount, currency: transaction.currency } });
  }

  if (transaction.provider === "paystack") {
    if (!env.PAYSTACK_SECRET_KEY) return json({ success: false, error: "Paystack payment gateway is not configured yet." }, 503);
    const payload = await paystackRequest("/transaction/verify/" + encodeURIComponent(reference), { method: "GET" }, env.PAYSTACK_SECRET_KEY);
    const data = payload.data || {};
    const status = clean(data.status || "unknown");
    const amountMatches = Number(data.amount) === toAmountSubunit(transaction.amount);
    const currencyMatches = clean(data.currency).toUpperCase() === clean(transaction.currency).toUpperCase();
    if (status === "success" && amountMatches && currencyMatches) {
      await env.DB.prepare("UPDATE payment_transactions SET status = 'success', provider_transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ?").bind(String(data.id ?? ""), reference).run();
      return json({ success: true, data: { reference, status: "success", amount: transaction.amount, currency: transaction.currency } });
    }
    await env.DB.prepare("UPDATE payment_transactions SET status = ?, provider_transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ?").bind(status || "unknown", String(data.id ?? ""), reference).run();
    return json({ success: true, data: { reference, status, amount: transaction.amount, currency: transaction.currency } });
  }

  return json({ success: false, error: "Payment provider verification is not implemented yet." }, 501);
}

async function handleWebhook(request, env) {
  if (request.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  if (!env.PAYSTACK_SECRET_KEY) return json({ success: false, error: "Payment gateway is not configured yet." }, 503);
  const rawBody = await request.text();
  const signature = clean(request.headers.get("x-paystack-signature"));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.PAYSTACK_SECRET_KEY), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (!signature || signature.length !== expected.length) return json({ success: false, error: "Invalid webhook signature." }, 401);
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (difference !== 0) return json({ success: false, error: "Invalid webhook signature." }, 401);
  const event = JSON.parse(rawBody || "{}");
  if (event.event !== "charge.success") return json({ success: true });
  const data = event.data || {}, reference = clean(data.reference);
  if (!reference) return json({ success: true });
  const transaction = await env.DB.prepare("SELECT amount, currency FROM payment_transactions WHERE reference = ?").bind(reference).first();
  if (!transaction) return json({ success: true });
  if (Number(data.amount) !== toAmountSubunit(transaction.amount) || clean(data.currency).toUpperCase() !== clean(transaction.currency).toUpperCase()) {
    await env.DB.prepare("UPDATE payment_transactions SET status = 'verification_failed', provider_transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ?").bind(String(data.id ?? ""), reference).run();
    return json({ success: true });
  }
  await env.DB.prepare("UPDATE payment_transactions SET status = 'success', provider_transaction_id = ?, updated_at = CURRENT_TIMESTAMP WHERE reference = ?").bind(String(data.id ?? ""), reference).run();
  return json({ success: true });
}

export async function handlePaymentApi(request, env) {
  const pathname = new URL(request.url).pathname;
  try {
    if (pathname === "/api/payment/webhook") return handleWebhook(request, env);
    if (request.method === "POST" && pathname === "/api/payment/initialize") return handleInitialize(request, env);
    if (request.method === "GET" && pathname === "/api/payment/verify") return handleVerify(request, env);
    return json({ success: false, error: "Method not allowed." }, 405);
  } catch (error) {
    if (error?.message === "Authentication required.") return json({ success: false, error: error.message }, 401);
    return json({ success: false, error: error?.message || "Unable to process payment." }, 500);
  }
}
