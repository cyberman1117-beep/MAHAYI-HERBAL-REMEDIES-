import { packOrder } from "./shipping-packing.js";
import { getCourierGuyRates } from "./shipping-courier.js";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function id(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function enabled(value, fallback = 1) {
  if (value === undefined || value === null) return fallback;
  return value ? 1 : 0;
}

async function requireAdmin(request, originalWorker, env) {
  const response = await originalWorker.fetch(new Request(new URL("/api/admin-auth-check", request.url), {
    method: "GET",
    headers: request.headers
  }), env);
  if (!response.ok) throw new Error("Authentication required.");
  return response.json();
}

async function getShippingTypes(env, includeDisabled = false) { const where = includeDisabled ? "" : "WHERE is_enabled = 1"; return (await env.DB.prepare(`SELECT id,name,code,description,requires_weight,requires_dimensions,is_enabled,sort_order,created_at,updated_at FROM shipping_types ${where} ORDER BY sort_order ASC,id ASC`).all()).results ?? []; }
async function getPackaging(env, includeDisabled = false) { const where = includeDisabled ? "" : "WHERE is_enabled = 1"; return (await env.DB.prepare(`SELECT id,name,packaging_type,length_cm,width_cm,height_cm,packaging_weight_kg,max_weight_kg,stock_quantity,is_enabled,sort_order,created_at,updated_at FROM shipping_packaging ${where} ORDER BY sort_order ASC,id ASC`).all()).results ?? []; }

async function packCart(env, items) {
  if (!Array.isArray(items) || !items.length) throw new Error("Your cart is empty.");
  const normalized = items.map((item) => ({
    product_id: Number(item?.product_id),
    quantity: Number(item?.quantity)
  }));
  if (normalized.some((item) => !Number.isInteger(item.product_id) || item.product_id <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99)) {
    throw new Error("Your cart contains an invalid item.");
  }

  const ids = [...new Set(normalized.map((item) => item.product_id))];
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
     WHERE p.id IN (${placeholders}) AND p.status = 'active'`
  ).bind(...ids).all()).results ?? [];

  const products = new Map(rows.map((row) => [Number(row.product_id), row]));
  if (products.size !== ids.length) throw new Error("One or more products are no longer available.");

  const packaging = await getPackaging(env, false);
  const result = packOrder({
    items: normalized.map((item) => {
      const product = products.get(item.product_id);
      return {
        product_id: item.product_id,
        product_name: product.product_name,
        quantity: item.quantity,
        shipping: product
      };
    }),
    packaging
  });

  return result;
}

async function getShipping(env, includeDisabled = false) {
  const methodWhere = includeDisabled ? "" : "WHERE is_enabled = 1";
  const optionWhere = includeDisabled ? "" : "AND o.is_enabled = 1";
  const methods = await env.DB.prepare(
    `SELECT id, name, provider_type, mode, is_enabled, sort_order, created_at, updated_at
     FROM shipping_methods ${methodWhere}
     ORDER BY sort_order ASC, id ASC`
  ).all();

  const options = await env.DB.prepare(
    `SELECT o.id, o.shipping_method_id, o.name, o.price, o.requires_landmark, o.is_enabled, o.sort_order,
            o.created_at, o.updated_at
     FROM shipping_options o
     JOIN shipping_methods m ON m.id = o.shipping_method_id
     WHERE 1=1 ${includeDisabled ? "" : "AND m.is_enabled = 1"} ${optionWhere}
     ORDER BY o.shipping_method_id ASC, o.sort_order ASC, o.id ASC`
  ).all();

  const customCouriers = await env.DB.prepare(
    `SELECT id, shipping_method_id, description, calculation_mode, created_at, updated_at
     FROM custom_couriers
     ORDER BY id ASC`
  ).all();
  const rates = await env.DB.prepare(
    `SELECT id, custom_courier_id, service_name, area_name, packaging_type,
            min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm,
            price, estimated_delivery, is_enabled, sort_order, created_at, updated_at
     FROM custom_courier_rates
     ORDER BY custom_courier_id ASC, sort_order ASC, id ASC`
  ).all();
  const courierRows = customCouriers.results ?? [];
  const rateRows = rates.results ?? [];

  const optionRows = options.results ?? [];
  return (methods.results ?? []).map((method) => {
    const courier = courierRows.find((item) => Number(item.shipping_method_id) === Number(method.id));
    return {
      ...method,
      options: optionRows.filter((option) => Number(option.shipping_method_id) === Number(method.id)),
      custom_courier: courier ? {
        ...courier,
        rates: rateRows.filter((rate) => Number(rate.custom_courier_id) === Number(courier.id))
      } : null
    };
  });
}

export async function handleShippingApi(request, env, originalWorker) {
  try {
    const url = new URL(request.url);

    if (url.pathname === "/api/product-shipping") {
      const auth = await requireAdmin(request, originalWorker, env);
      const productId = id(url.searchParams.get("id"));
      if (request.method === "GET") {
        const shipping_types = await getShippingTypes(env, false);
        if (!productId) return jsonResponse({ success: true, data: { shipping: null, shipping_types } });
        const product = await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
        if (!product) return jsonResponse({ success: false, error: "Product not found." }, 404);
        const shipping = await env.DB.prepare(
          `SELECT product_id, shipping_type_id,
                  CASE WHEN packing_mode = 'prepackaged' THEN 1 ELSE 0 END AS is_prepackaged,
                  weight_kg AS shipping_weight_kg,
                  length_cm AS shipping_length_cm, width_cm AS shipping_width_cm, height_cm AS shipping_height_cm,
                  created_at, updated_at
           FROM product_shipping WHERE product_id = ?`
        ).bind(productId).first();
        return jsonResponse({ success: true, data: { shipping: shipping || null, shipping_types } });
      }

      if (!productId) return jsonResponse({ success: false, error: "A valid product id is required." }, 400);
      const product = await env.DB.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
      if (!product) return jsonResponse({ success: false, error: "Product not found." }, 404);

      if (request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM product_shipping WHERE product_id = ?").bind(productId).run();
        return jsonResponse({ success: true, data: { id: productId, uid: auth?.data?.uid || "" } });
      }

      if (request.method !== "PUT") return jsonResponse({ success: false, error: "Method not allowed." }, 405);

      const body = await request.json();
      const shippingTypeId = id(body?.shipping_type_id);
      if (!shippingTypeId) return jsonResponse({ success: false, error: "Shipping type is required." }, 400);

      const shippingType = await env.DB.prepare(
        "SELECT id, code, requires_weight, requires_dimensions FROM shipping_types WHERE id = ? AND is_enabled = 1"
      ).bind(shippingTypeId).first();
      if (!shippingType) return jsonResponse({ success: false, error: "Shipping type not found or disabled." }, 400);

      const isPrepackaged = enabled(body?.is_prepackaged, 0);
      const numberOrNull = (value) => value === null || value === "" || value === undefined ? null : nonNegative(value, null);
      const weight = numberOrNull(body?.shipping_weight_kg);
      const length = numberOrNull(body?.shipping_length_cm);
      const width = numberOrNull(body?.shipping_width_cm);
      const height = numberOrNull(body?.shipping_height_cm);

      if (Number(shippingType.requires_weight) === 1 && !(weight > 0)) {
        return jsonResponse({ success: false, error: "Shipping weight is required for this shipping type." }, 400);
      }

      const dimensionsRequired = Number(shippingType.requires_dimensions) === 1 || isPrepackaged === 1;
      if (dimensionsRequired && !(length > 0 && width > 0 && height > 0)) {
        return jsonResponse({ success: false, error: "Packed length, width and height are required for this product." }, 400);
      }

      await env.DB.prepare(
        `INSERT INTO product_shipping
          (product_id, shipping_type_id, packing_mode, weight_kg,
           length_cm, width_cm, height_cm)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
           shipping_type_id = excluded.shipping_type_id,
           packing_mode = excluded.packing_mode,
           weight_kg = excluded.weight_kg,
           length_cm = excluded.length_cm,
           width_cm = excluded.width_cm,
           height_cm = excluded.height_cm,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(productId, shippingTypeId, isPrepackaged === 1 ? "prepackaged" : "compressible", weight, dimensionsRequired ? length : null, dimensionsRequired ? width : null, dimensionsRequired ? height : null).run();

      return jsonResponse({ success: true, data: { id: productId, uid: auth?.data?.uid || "" } });
    }

    if (request.method === "POST" && url.searchParams.get("resource") === "pack-order") {
      await requireAdmin(request, originalWorker, env);
      const orderId = id(url.searchParams.get("id"));
      if (!orderId) return jsonResponse({ success: false, error: "A valid order id is required." }, 400);

      const order = await env.DB.prepare("SELECT id, order_number FROM orders WHERE id = ?").bind(orderId).first();
      if (!order) return jsonResponse({ success: false, error: "Order not found." }, 404);

      const itemRows = (await env.DB.prepare(
        `SELECT oi.product_id, oi.product_name, oi.quantity,
                ps.shipping_type_id,
                st.code AS shipping_type_code,
                CASE WHEN ps.packing_mode = 'prepackaged' THEN 1 ELSE 0 END AS is_prepackaged,
                ps.weight_kg AS shipping_weight_kg,
                ps.length_cm AS shipping_length_cm,
                ps.width_cm AS shipping_width_cm,
                ps.height_cm AS shipping_height_cm
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN product_shipping ps ON ps.product_id = oi.product_id
         LEFT JOIN shipping_types st ON st.id = ps.shipping_type_id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC`
      ).bind(orderId).all()).results ?? [];

      const packaging = await getPackaging(env, false);
      const result = packOrder({
        items: itemRows.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          shipping: {
            shipping_type_id: item.shipping_type_id,
            shipping_type_code: item.shipping_type_code,
            is_prepackaged: item.is_prepackaged,
            shipping_weight_kg: item.shipping_weight_kg,
            shipping_length_cm: item.shipping_length_cm,
            shipping_width_cm: item.shipping_width_cm,
            shipping_height_cm: item.shipping_height_cm
          }
        })),
        packaging
      });

      return jsonResponse({
        success: result.success,
        data: {
          order_id: order.id,
          order_number: order.order_number,
          parcels: result.parcels,
          errors: result.errors
        },
        ...(result.success ? {} : { error: "Order could not be fully packed with the current product shipping data and configured packaging." })
      }, result.success ? 200 : 422);
    }

    if (request.method === "POST" && url.searchParams.get("resource") === "live-rates") {
      try {
        const body = await request.json().catch(() => ({}));
        const methodId = id(body?.shipping_method_id);
        if (!methodId) return jsonResponse({ success: false, error: "A valid shipping method is required." }, 400);
        const method = await env.DB.prepare(
          "SELECT id, name, provider_type, mode FROM shipping_methods WHERE id = ? AND is_enabled = 1"
        ).bind(methodId).first();
        if (!method) return jsonResponse({ success: false, error: "The selected shipping method is no longer available." }, 404);

        const packing = await packCart(env, body?.items);
        if (!packing.success) {
          return jsonResponse({
            success: false,
            error: "This cart cannot currently be safely packaged for delivery.",
            data: { parcels: packing.parcels || [], errors: packing.errors || [] }
          }, 422);
        }

        if (method.provider_type === "custom" && method.mode === "manual") {
          const courier = await env.DB.prepare(
            "SELECT id, calculation_mode FROM custom_couriers WHERE shipping_method_id = ?"
          ).bind(method.id).first();
          if (!courier) return jsonResponse({ success: false, error: "This custom courier is not configured." }, 409);

          const rateRows = (await env.DB.prepare(
            "SELECT id, service_name, area_name, packaging_type, min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm, price, estimated_delivery FROM custom_courier_rates WHERE custom_courier_id = ? AND is_enabled = 1 ORDER BY sort_order ASC, id ASC"
          ).bind(courier.id).all()).results ?? [];

          const totalWeight = (packing.parcels || []).reduce((sum, parcel) => sum + Number(parcel.weight_kg || 0), 0);
          const customer = body?.customer || {};
          const areaValues = [customer.city, customer.province, customer.postal_code]
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean);
          const areaMatches = (areaName) => {
            const configured = String(areaName || "").trim().toLowerCase();
            return !configured || areaValues.includes(configured);
          };
          const weightMatches = (min, max, weight) => {
            const lower = min === null || min === undefined ? 0 : Number(min);
            const upper = max === null || max === undefined ? Infinity : Number(max);
            return weight >= lower && weight <= upper;
          };
          const dimensionMatches = (parcel, rate) => {
            const configuredType = String(rate.packaging_type || "any").trim().toLowerCase();
            const parcelType = String(parcel?.packaging_type || "").trim().toLowerCase();
            if (configuredType !== "any" && configuredType !== parcelType) return false;
            const length = Number(parcel?.length_cm);
            const width = Number(parcel?.width_cm);
            const height = Number(parcel?.height_cm);
            if (rate.max_length_cm !== null && rate.max_length_cm !== undefined && !(Number.isFinite(length) && length <= Number(rate.max_length_cm))) return false;
            if (rate.max_width_cm !== null && rate.max_width_cm !== undefined && !(Number.isFinite(width) && width <= Number(rate.max_width_cm))) return false;
            if (rate.max_height_cm !== null && rate.max_height_cm !== undefined && !(Number.isFinite(height) && height <= Number(rate.max_height_cm))) return false;
            return true;
          };
          const parcels = Array.isArray(packing.parcels) ? packing.parcels : [];
          const shipmentWeight = parcels.reduce((sum, parcel) => sum + Number(parcel.weight_kg || 0), 0);

          const rates = rateRows.filter((rate) => {
            const weightOk = courier.calculation_mode === "fixed" || courier.calculation_mode === "area"
              ? true
              : weightMatches(rate.min_weight_kg, rate.max_weight_kg, shipmentWeight);
            const areaOk = courier.calculation_mode === "area" || courier.calculation_mode === "weight_area"
              ? areaMatches(rate.area_name)
              : true;
            const parcelOk = parcels.length > 0 && parcels.every((parcel) => dimensionMatches(parcel, rate));
            return weightOk && areaOk && parcelOk;
          }).map((rate) => ({
            code: "custom-" + rate.id,
            name: rate.service_name + (rate.estimated_delivery ? " · " + rate.estimated_delivery : ""),
            price: Number(rate.price || 0)
          }));

          return jsonResponse({
            success: true,
            data: {
              method_id: method.id,
              method_name: method.name,
              provider_type: method.provider_type,
              parcels: packing.parcels,
              rates
            }
          });
        }

        if (method.provider_type !== "courier_guy" || method.mode !== "api") {
          return jsonResponse({ success: false, error: "Live rates are not available for this shipping method." }, 400);
        }

        const rates = await getCourierGuyRates(env, {
          parcels: packing.parcels,
          customer: body?.customer || {},
          declaredValue: body?.declared_value
        });

        return jsonResponse({
          success: true,
          data: {
            method_id: method.id,
            method_name: method.name,
            provider_type: method.provider_type,
            parcels: rates.parcels,
            rates: rates.rates
          }
        });
      } catch (error) {
        return jsonResponse({
          success: false,
          error: error?.message || "Unable to calculate shipping rates."
        }, 502);
      }
    }
    if (request.method === "POST" && url.searchParams.get("resource") === "pack-cart") {
      const body = await request.json().catch(() => ({}));
      const result = await packCart(env, body?.items);
      return jsonResponse({
        success: result.success,
        data: { parcels: result.parcels, errors: result.errors },
        ...(result.success ? {} : { error: "This cart cannot currently be safely packaged with the configured packaging stock." })
      }, result.success ? 200 : 422);
    }

    const includeDisabled = url.searchParams.get("include_disabled") === "1";

    if (request.method === "GET") {
      if (includeDisabled) await requireAdmin(request, originalWorker, env);
      const methods = await getShipping(env, includeDisabled); const shipping_types = await getShippingTypes(env, includeDisabled); const packaging = await getPackaging(env, includeDisabled); return jsonResponse({ success: true, data: methods, shipping_types, packaging });
    }

    const auth = await requireAdmin(request, originalWorker, env);
    if (!["POST", "PUT", "DELETE"].includes(request.method)) {
      return jsonResponse({ success: false, error: "Method not allowed." }, 405);
    }

    if (request.method === "POST") {
      const body = await request.json();
      if (body?.resource === "type") { const name=String(body?.name??"").trim(); const code=String(body?.code??name).trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); if(!name||!code)return jsonResponse({success:false,error:"A shipping type name is required."},400); const result=await env.DB.prepare(`INSERT INTO shipping_types (name,code,description,requires_weight,requires_dimensions,is_enabled,sort_order) VALUES (?,?,?,?,?,?,?) RETURNING id`).bind(name,code,String(body?.description??"").trim(),enabled(body?.requires_weight,1),enabled(body?.requires_dimensions,0),enabled(body?.is_enabled,1),nonNegative(body?.sort_order)).first(); return jsonResponse({success:true,data:{id:result.id,uid:auth?.data?.uid||""}},201); }
      if (body?.resource === "packaging") { const name=String(body?.name??"").trim(), type=String(body?.packaging_type??"box").trim().toLowerCase(); if(!name||!["bag","box","envelope","manufacturer","custom"].includes(type))return jsonResponse({success:false,error:"A valid packaging name and type are required."},400); const num=v=>v===null||v===""?null:nonNegative(v); const result=await env.DB.prepare(`INSERT INTO shipping_packaging (name,packaging_type,length_cm,width_cm,height_cm,packaging_weight_kg,max_weight_kg,stock_quantity,is_enabled,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(name,type,num(body?.length_cm),num(body?.width_cm),num(body?.height_cm),nonNegative(body?.packaging_weight_kg),num(body?.max_weight_kg),Math.floor(nonNegative(body?.stock_quantity)),enabled(body?.is_enabled,1),nonNegative(body?.sort_order)).first(); return jsonResponse({success:true,data:{id:result.id,uid:auth?.data?.uid||""}},201); }
      if (body?.resource === "custom-courier") {
        const name = String(body?.name ?? "").trim();
        const description = String(body?.description ?? "").trim();
        const calculationMode = String(body?.calculation_mode ?? "weight").trim();
        const rates = Array.isArray(body?.rates) ? body.rates : [];
        if (!name || !["fixed", "weight", "area", "weight_area"].includes(calculationMode)) {
          return jsonResponse({ success: false, error: "Courier name and a valid calculation mode are required." }, 400);
        }

        const normalizedRates = [];
        for (let index = 0; index < rates.length; index += 1) {
          const rate = rates[index] || {};
          const serviceName = String(rate.service_name ?? "").trim();
          if (!serviceName) return jsonResponse({ success: false, error: `Rate ${index + 1} needs a service name.` }, 400);
          const minWeight = rate.min_weight_kg === null || rate.min_weight_kg === "" || rate.min_weight_kg === undefined ? null : nonNegative(rate.min_weight_kg, null);
          const maxWeight = rate.max_weight_kg === null || rate.max_weight_kg === "" || rate.max_weight_kg === undefined ? null : nonNegative(rate.max_weight_kg, null);
          const maxLength = rate.max_length_cm === null || rate.max_length_cm === "" || rate.max_length_cm === undefined ? null : nonNegative(rate.max_length_cm, null);
          const maxWidth = rate.max_width_cm === null || rate.max_width_cm === "" || rate.max_width_cm === undefined ? null : nonNegative(rate.max_width_cm, null);
          const maxHeight = rate.max_height_cm === null || rate.max_height_cm === "" || rate.max_height_cm === undefined ? null : nonNegative(rate.max_height_cm, null);
          const packagingType = String(rate.packaging_type ?? "any").trim().toLowerCase();
          if (!["any", "bag", "box", "envelope", "manufacturer", "custom"].includes(packagingType)) {
            return jsonResponse({ success: false, error: `Rate ${index + 1} has an invalid parcel type.` }, 400);
          }
          if (minWeight !== null && maxWeight !== null && maxWeight <= minWeight) {
            return jsonResponse({ success: false, error: `Rate ${index + 1} has an invalid weight range.` }, 400);
          }
          normalizedRates.push({
            serviceName,
            areaName: String(rate.area_name ?? "").trim(),
            packagingType,
            minWeight,
            maxWeight,
            maxLength,
            maxWidth,
            maxHeight,
            price: nonNegative(rate.price),
            estimatedDelivery: String(rate.estimated_delivery ?? "").trim(),
            isEnabled: enabled(rate.is_enabled, 1),
            sortOrder: nonNegative(rate.sort_order, index)
          });
        }

        const method = await env.DB.prepare(
          `INSERT INTO shipping_methods (name, provider_type, mode, is_enabled, sort_order)
           VALUES (?, 'custom', 'manual', ?, ?) RETURNING id`
        ).bind(name, enabled(body?.is_enabled, 1), nonNegative(body?.sort_order)).first();
        const courier = await env.DB.prepare(
          `INSERT INTO custom_couriers (shipping_method_id, description, calculation_mode)
           VALUES (?, ?, ?) RETURNING id`
        ).bind(method.id, description, calculationMode).first();

        if (normalizedRates.length) {
          await env.DB.batch(normalizedRates.map((rate) => env.DB.prepare(
            `INSERT INTO custom_courier_rates
             (custom_courier_id, service_name, area_name, packaging_type, min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm, price, estimated_delivery, is_enabled, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            courier.id, rate.serviceName, rate.areaName, rate.packagingType, rate.minWeight, rate.maxWeight,
            rate.maxLength, rate.maxWidth, rate.maxHeight, rate.price, rate.estimatedDelivery, rate.isEnabled, rate.sortOrder
          )));
        }

        return jsonResponse({ success: true, data: { id: method.id, custom_courier_id: courier.id, uid: auth?.data?.uid || "" } }, 201);
      }

      if (body?.resource === "method") {
        const name = String(body?.name ?? "").trim();
        const providerType = String(body?.provider_type ?? "").trim();
        const mode = String(body?.mode ?? "").trim();
        if (!name || !["local", "paxi", "courier_guy", "postnet", "bobgo", "custom"].includes(providerType) || !["manual", "api"].includes(mode)) {
          return jsonResponse({ success: false, error: "A valid shipping method is required." }, 400);
        }
        const result = await env.DB.prepare(
          `INSERT INTO shipping_methods (name, provider_type, mode, is_enabled, sort_order)
           VALUES (?, ?, ?, ?, ?) RETURNING id`
        ).bind(name, providerType, mode, enabled(body?.is_enabled, 1), nonNegative(body?.sort_order)).first();
        return jsonResponse({ success: true, data: { id: result.id, uid: auth?.data?.uid || "" } }, 201);
      }

      const methodId = id(body?.shipping_method_id);
      const name = String(body?.name ?? "").trim();
      if (!methodId || !name) return jsonResponse({ success: false, error: "Shipping method and option name are required." }, 400);
      const method = await env.DB.prepare("SELECT id, provider_type FROM shipping_methods WHERE id = ?").bind(methodId).first();
      if (!method) return jsonResponse({ success: false, error: "Shipping method not found." }, 404);
      const result = await env.DB.prepare(
        `INSERT INTO shipping_options (shipping_method_id, name, price, requires_landmark, is_enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
      ).bind(methodId, name, nonNegative(body?.price), method.provider_type === "local" ? enabled(body?.requires_landmark, 0) : 0, enabled(body?.is_enabled, 1), nonNegative(body?.sort_order)).first();
      return jsonResponse({ success: true, data: { id: result.id, uid: auth?.data?.uid || "" } }, 201);
    }

    const resource = url.searchParams.get("resource") || "method";
    const resourceId = id(url.searchParams.get("id"));
    if (!resourceId) return jsonResponse({ success: false, error: "A valid id is required." }, 400);

    if (request.method === "DELETE") {
      if (resource === "type") await env.DB.prepare("DELETE FROM shipping_types WHERE id = ?").bind(resourceId).run(); else if (resource === "packaging") await env.DB.prepare("DELETE FROM shipping_packaging WHERE id = ?").bind(resourceId).run(); else if (resource === "option") await env.DB.prepare("DELETE FROM shipping_options WHERE id = ?").bind(resourceId).run();
      else await env.DB.prepare("DELETE FROM shipping_methods WHERE id = ?").bind(resourceId).run();
      return jsonResponse({ success: true, data: { id: resourceId, uid: auth?.data?.uid || "" } });
    }

    const body = await request.json();
    if (resource === "custom-courier") {
      const existing = await env.DB.prepare(
        `SELECT m.id, m.name, m.is_enabled, m.sort_order, c.id AS custom_courier_id,
                c.description, c.calculation_mode
         FROM shipping_methods m
         JOIN custom_couriers c ON c.shipping_method_id = m.id
         WHERE m.id = ? AND m.provider_type = 'custom'`
      ).bind(resourceId).first();
      if (!existing) return jsonResponse({ success: false, error: "Custom courier not found." }, 404);

      const name = String(body?.name ?? existing.name).trim();
      const description = String(body?.description ?? existing.description ?? "").trim();
      const calculationMode = String(body?.calculation_mode ?? existing.calculation_mode).trim();
      const rates = Array.isArray(body?.rates) ? body.rates : [];
      if (!name || !["fixed", "weight", "area", "weight_area"].includes(calculationMode)) {
        return jsonResponse({ success: false, error: "Courier name and a valid calculation mode are required." }, 400);
      }

      await env.DB.prepare(
        `UPDATE shipping_methods
         SET name = ?, is_enabled = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(name, enabled(body?.is_enabled, existing.is_enabled), nonNegative(body?.sort_order, existing.sort_order), resourceId).run();

      await env.DB.prepare(
        `UPDATE custom_couriers
         SET description = ?, calculation_mode = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(description, calculationMode, existing.custom_courier_id).run();

      await env.DB.prepare("DELETE FROM custom_courier_rates WHERE custom_courier_id = ?").bind(existing.custom_courier_id).run();
      for (let index = 0; index < rates.length; index += 1) {
        const rate = rates[index] || {};
        const serviceName = String(rate.service_name ?? "").trim();
        if (!serviceName) return jsonResponse({ success: false, error: `Rate ${index + 1} needs a service name.` }, 400);
        const minWeight = rate.min_weight_kg === null || rate.min_weight_kg === "" || rate.min_weight_kg === undefined ? null : nonNegative(rate.min_weight_kg, null);
        const maxWeight = rate.max_weight_kg === null || rate.max_weight_kg === "" || rate.max_weight_kg === undefined ? null : nonNegative(rate.max_weight_kg, null);
        const maxLength = rate.max_length_cm === null || rate.max_length_cm === "" || rate.max_length_cm === undefined ? null : nonNegative(rate.max_length_cm, null);
        const maxWidth = rate.max_width_cm === null || rate.max_width_cm === "" || rate.max_width_cm === undefined ? null : nonNegative(rate.max_width_cm, null);
        const maxHeight = rate.max_height_cm === null || rate.max_height_cm === "" || rate.max_height_cm === undefined ? null : nonNegative(rate.max_height_cm, null);
        const packagingType = String(rate.packaging_type ?? "any").trim().toLowerCase();
        if (!["any", "bag", "box", "envelope", "manufacturer", "custom"].includes(packagingType)) {
          return jsonResponse({ success: false, error: `Rate ${index + 1} has an invalid parcel type.` }, 400);
        }
        if (minWeight !== null && maxWeight !== null && maxWeight <= minWeight) {
          return jsonResponse({ success: false, error: `Rate ${index + 1} has an invalid weight range.` }, 400);
        }
        await env.DB.prepare(
          `INSERT INTO custom_courier_rates
           (custom_courier_id, service_name, area_name, packaging_type, min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm, price, estimated_delivery, is_enabled, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          existing.custom_courier_id, serviceName, String(rate.area_name ?? "").trim(), packagingType, minWeight, maxWeight,
          maxLength, maxWidth, maxHeight, nonNegative(rate.price), String(rate.estimated_delivery ?? "").trim(),
          enabled(rate.is_enabled, 1), nonNegative(rate.sort_order, index)
        ).run();
      }
      return jsonResponse({ success: true, data: { id: resourceId, uid: auth?.data?.uid || "" } });
    }

    if (resource === "type") { const existing=await env.DB.prepare("SELECT * FROM shipping_types WHERE id=?").bind(resourceId).first(); if(!existing)return jsonResponse({success:false,error:"Shipping type not found."},404); const name=String(body?.name??existing.name).trim(),code=String(body?.code??existing.code).trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); if(!name||!code)return jsonResponse({success:false,error:"A shipping type name is required."},400); await env.DB.prepare("UPDATE shipping_types SET name=?,code=?,description=?,requires_weight=?,requires_dimensions=?,is_enabled=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,code,String(body?.description??existing.description??"").trim(),enabled(body?.requires_weight,existing.requires_weight),enabled(body?.requires_dimensions,existing.requires_dimensions),enabled(body?.is_enabled,existing.is_enabled),nonNegative(body?.sort_order,existing.sort_order),resourceId).run();
    } else if (resource === "packaging") { const existing=await env.DB.prepare("SELECT * FROM shipping_packaging WHERE id=?").bind(resourceId).first(); if(!existing)return jsonResponse({success:false,error:"Packaging not found."},404); const type=String(body?.packaging_type??existing.packaging_type).trim().toLowerCase(); if(!["bag","box","envelope","manufacturer","custom"].includes(type))return jsonResponse({success:false,error:"Invalid packaging type."},400); const num=(v,f)=>v===null||v===""?null:nonNegative(v,f); await env.DB.prepare("UPDATE shipping_packaging SET name=?,packaging_type=?,length_cm=?,width_cm=?,height_cm=?,packaging_weight_kg=?,max_weight_kg=?,stock_quantity=?,is_enabled=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(body?.name??existing.name).trim(),type,num(body?.length_cm,existing.length_cm),num(body?.width_cm,existing.width_cm),num(body?.height_cm,existing.height_cm),nonNegative(body?.packaging_weight_kg,existing.packaging_weight_kg),num(body?.max_weight_kg,existing.max_weight_kg),Math.floor(nonNegative(body?.stock_quantity,existing.stock_quantity)),enabled(body?.is_enabled,existing.is_enabled),nonNegative(body?.sort_order,existing.sort_order),resourceId).run();
    } else if (resource === "option") {
      const existing = await env.DB.prepare("SELECT o.*, m.provider_type FROM shipping_options o JOIN shipping_methods m ON m.id = o.shipping_method_id WHERE o.id = ?").bind(resourceId).first();
      if (!existing) return jsonResponse({ success: false, error: "Shipping option not found." }, 404);
      const targetMethodId = id(body?.shipping_method_id) || existing.shipping_method_id;
      const targetMethod = await env.DB.prepare("SELECT id, provider_type FROM shipping_methods WHERE id = ?").bind(targetMethodId).first();
      if (!targetMethod) return jsonResponse({ success: false, error: "Shipping method not found." }, 404);
      await env.DB.prepare(
        `UPDATE shipping_options
         SET shipping_method_id = ?, name = ?, price = ?, requires_landmark = ?, is_enabled = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(
        targetMethodId,
        String(body?.name ?? existing.name).trim(),
        nonNegative(body?.price, existing.price),
        targetMethod.provider_type === "local" ? enabled(body?.requires_landmark, existing.requires_landmark) : 0,
        enabled(body?.is_enabled, existing.is_enabled),
        nonNegative(body?.sort_order, existing.sort_order),
        resourceId
      ).run();
    } else {
      const existing = await env.DB.prepare("SELECT * FROM shipping_methods WHERE id = ?").bind(resourceId).first();
      if (!existing) return jsonResponse({ success: false, error: "Shipping method not found." }, 404);
      await env.DB.prepare(
        `UPDATE shipping_methods
         SET name = ?, is_enabled = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).bind(String(body?.name ?? existing.name).trim(), enabled(body?.is_enabled, existing.is_enabled), nonNegative(body?.sort_order, existing.sort_order), resourceId).run();
    }

    return jsonResponse({ success: true, data: { id: resourceId, uid: auth?.data?.uid || "" } });
  } catch (error) {
    if (error?.message === "Authentication required.") return jsonResponse({ success: false, error: error.message }, 401);
    return jsonResponse({ success: false, error: "Unable to save shipping settings." }, 500);
  }
}
