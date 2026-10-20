import { verifyFirebaseIdToken } from "./index.js";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: HEADERS });
const text = (value, fallback = "") => String(value ?? fallback).trim();
const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const integer = (value, fallback = 0) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
const amount = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const slugify = (value) => text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function authorize(request, env) {
  const token = await verifyFirebaseIdToken(request);
  const admin = await env.DB.prepare(
    "SELECT firebase_uid FROM admin_users WHERE firebase_uid = ? AND is_enabled = 1"
  ).bind(token.sub).first();
  if (!admin) throw new Error("Administrator authorization required.");
  return token;
}

function errorResponse(error) {
  if (error?.message === "Administrator authorization required.") return response({ success: false, error: error.message }, 403);
  if (error?.message === "Missing bearer token." || /token|authentication/i.test(error?.message || "")) return response({ success: false, error: "Authentication required." }, 401);
  if (String(error?.message || "").includes("UNIQUE constraint failed")) return response({ success: false, error: "That name or slug is already in use." }, 409);
  console.error("Reseller catalog request failed:", error);
  return response({ success: false, error: "Unable to process reseller catalog request." }, 500);
}

async function categories(request, env, method, id) {
  if (method === "GET") {
    const result = await env.DB.prepare("SELECT id, name, slug, description, sort_order, is_enabled, created_at, updated_at FROM reseller_categories ORDER BY sort_order, name, id").all();
    return response({ success: true, data: { categories: result.results || [] } });
  }
  if (method === "DELETE") {
    if (!id) return response({ success: false, error: "A valid category id is required." }, 400);
    const found = await env.DB.prepare("SELECT id FROM reseller_categories WHERE id = ?").bind(id).first();
    if (!found) return response({ success: false, error: "Reseller category not found." }, 404);
    await env.DB.prepare("DELETE FROM reseller_categories WHERE id = ?").bind(id).run();
    return response({ success: true, data: { id } });
  }
  if (!["POST", "PUT"].includes(method)) return response({ success: false, error: "Method not allowed." }, 405);
  const body = await request.json();
  const existing = method === "PUT" && id
    ? await env.DB.prepare("SELECT * FROM reseller_categories WHERE id = ?").bind(id).first()
    : null;
  if (method === "PUT" && !id) return response({ success: false, error: "A valid category id is required." }, 400);
  if (method === "PUT" && !existing) return response({ success: false, error: "Reseller category not found." }, 404);
  const name = text(body.name, existing?.name);
  const slug = slugify(body.slug || name || existing?.slug);
  if (!name || !slug) return response({ success: false, error: "Category name is required." }, 400);
  const description = text(body.description, existing?.description);
  const sortOrder = integer(body.sort_order, existing?.sort_order || 0);
  const enabled = body.is_enabled === undefined ? (existing?.is_enabled ?? 1) : (body.is_enabled ? 1 : 0);
  if (method === "POST") {
    const saved = await env.DB.prepare("INSERT INTO reseller_categories (name, slug, description, sort_order, is_enabled) VALUES (?, ?, ?, ?, ?) RETURNING id").bind(name, slug, description, sortOrder, enabled).first();
    return response({ success: true, data: { id: saved.id } }, 201);
  }
  await env.DB.prepare("UPDATE reseller_categories SET name = ?, slug = ?, description = ?, sort_order = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(name, slug, description, sortOrder, enabled, id).run();
  return response({ success: true, data: { id } });
}

async function products(request, env, method, id) {
  if (method === "GET") {
    const result = await env.DB.prepare(`SELECT p.id, p.category_id, c.name AS category_name, p.name, p.slug, p.description, p.sku, p.currency, p.status, p.stock_quantity, p.track_stock, p.sort_order, p.created_at, p.updated_at, pp.customer_price, pp.reseller_share, pp.company_share, pp.minimum_order_quantity, pp.is_enabled AS pricing_enabled
      FROM reseller_products p
      LEFT JOIN reseller_categories c ON c.id = p.category_id
      LEFT JOIN reseller_product_pricing pp ON pp.reseller_product_id = p.id
      ORDER BY p.sort_order, p.name, p.id`).all();
    return response({ success: true, data: { products: result.results || [] } });
  }
  if (method === "DELETE") {
    if (!id) return response({ success: false, error: "A valid product id is required." }, 400);
    const found = await env.DB.prepare("SELECT id FROM reseller_products WHERE id = ?").bind(id).first();
    if (!found) return response({ success: false, error: "Reseller product not found." }, 404);
    await env.DB.prepare("DELETE FROM reseller_products WHERE id = ?").bind(id).run();
    return response({ success: true, data: { id } });
  }
  if (!["POST", "PUT"].includes(method)) return response({ success: false, error: "Method not allowed." }, 405);
  const body = await request.json();
  const existing = method === "PUT" && id
    ? await env.DB.prepare("SELECT * FROM reseller_products WHERE id = ?").bind(id).first()
    : null;
  if (method === "PUT" && !id) return response({ success: false, error: "A valid product id is required." }, 400);
  if (method === "PUT" && !existing) return response({ success: false, error: "Reseller product not found." }, 404);
  const name = text(body.name, existing?.name);
  const slug = slugify(body.slug || name || existing?.slug);
  if (!name || !slug) return response({ success: false, error: "Product name is required." }, 400);
  const categoryId = body.category_id === "" || body.category_id === null ? null : (body.category_id === undefined ? existing?.category_id ?? null : positiveId(body.category_id));
  if (body.category_id && !categoryId) return response({ success: false, error: "Select a valid reseller category." }, 400);
  if (categoryId && !(await env.DB.prepare("SELECT id FROM reseller_categories WHERE id = ?").bind(categoryId).first())) return response({ success: false, error: "Reseller category not found." }, 400);
  const status = text(body.status, existing?.status || "draft");
  if (!["draft", "active", "archived"].includes(status)) return response({ success: false, error: "Invalid product status." }, 400);
  const currency = text(body.currency, existing?.currency || "ZAR").toUpperCase();
  const sku = text(body.sku, existing?.sku);
  const description = text(body.description, existing?.description);
  const stock = integer(body.stock_quantity, existing?.stock_quantity || 0);
  const trackStock = body.track_stock === undefined ? (existing?.track_stock ?? 1) : (body.track_stock ? 1 : 0);
  const sortOrder = integer(body.sort_order, existing?.sort_order || 0);
  let customerPrice = body.customer_price === undefined ? null : amount(body.customer_price);
  let resellerShare = body.reseller_share === undefined ? null : amount(body.reseller_share);
  let companyShare = body.company_share === undefined ? null : amount(body.company_share);
  const hasPricing = customerPrice !== null || resellerShare !== null || companyShare !== null ||
    body.customer_price !== undefined || body.reseller_share !== undefined || body.company_share !== undefined;
  if (hasPricing) {
    if (customerPrice === null || resellerShare === null || companyShare === null) return response({ success: false, error: "Enter a valid customer price, reseller share, and company share." }, 400);
    if (Math.abs(customerPrice - resellerShare - companyShare) >= 0.01) return response({ success: false, error: "Customer price must equal the reseller share plus the company share." }, 400);
  }
  let productId = id;
  if (method === "POST") {
    const saved = await env.DB.prepare("INSERT INTO reseller_products (category_id, name, slug, description, sku, currency, status, stock_quantity, track_stock, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id").bind(categoryId, name, slug, description, sku, currency, status, stock, trackStock, sortOrder).first();
    productId = saved.id;
  } else {
    await env.DB.prepare("UPDATE reseller_products SET category_id = ?, name = ?, slug = ?, description = ?, sku = ?, currency = ?, status = ?, stock_quantity = ?, track_stock = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(categoryId, name, slug, description, sku, currency, status, stock, trackStock, sortOrder, productId).run();
  }
  if (hasPricing) {
    const minimum = integer(body.minimum_order_quantity, 1) || 1;
    const pricingEnabled = body.pricing_enabled === undefined ? 1 : (body.pricing_enabled ? 1 : 0);
    await env.DB.prepare(`INSERT INTO reseller_product_pricing (reseller_product_id, customer_price, reseller_share, company_share, minimum_order_quantity, is_enabled)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(reseller_product_id) DO UPDATE SET customer_price = excluded.customer_price, reseller_share = excluded.reseller_share, company_share = excluded.company_share, minimum_order_quantity = excluded.minimum_order_quantity, is_enabled = excluded.is_enabled, updated_at = CURRENT_TIMESTAMP`).bind(productId, customerPrice, resellerShare, companyShare, minimum, pricingEnabled).run();
  }
  return response({ success: true, data: { id: productId } }, method === "POST" ? 201 : 200);
}

export async function handleAdminResellerCatalog(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...HEADERS, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type" } });
  try {
    await authorize(request, env);
    const url = new URL(request.url);
    const resource = url.searchParams.get("resource");
    const id = positiveId(url.searchParams.get("id"));
    if (resource === "categories") return await categories(request, env, request.method, id);
    if (resource === "products") return await products(request, env, request.method, id);
    return response({ success: false, error: "Choose a valid resource: categories or products." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
