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
    const result = await env.DB.prepare(`SELECT p.id, p.category_id, c.name AS category_name, p.name, p.slug, p.description, p.sku, p.currency, p.status, p.stock_quantity, p.track_stock, p.sort_order, p.image_url, p.package_group, p.package_label, p.created_at, p.updated_at
      FROM reseller_products p
      LEFT JOIN reseller_categories c ON c.id = p.category_id
      ORDER BY p.sort_order, p.name, p.id`).all();
    const packages = await env.DB.prepare(`SELECT id, reseller_product_id, package_label, units_per_package, stock_amount, resale_amount, commission, stock_quantity, minimum_order_quantity, is_enabled, sort_order, created_at, updated_at
      FROM reseller_product_packages ORDER BY reseller_product_id, sort_order, id`).all();
    const byProduct = new Map();
    for (const pkg of packages.results || []) {
      if (!byProduct.has(pkg.reseller_product_id)) byProduct.set(pkg.reseller_product_id, []);
      byProduct.get(pkg.reseller_product_id).push(pkg);
    }
    const products = (result.results || []).map((p) => {
      const rows = byProduct.get(p.id) || [];
      const first = rows.find((pkg) => Number(pkg.is_enabled) === 1) || rows[0];
      return { ...p, packages: rows,
        customer_price: first?.resale_amount ?? null,
        reseller_share: first?.commission ?? null,
        company_share: first?.stock_amount ?? null,
        minimum_order_quantity: first?.minimum_order_quantity ?? 1,
        pricing_enabled: first?.is_enabled ?? 0 };
    });
    return response({ success: true, data: { products } });
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
  const imageUrl = text(body.image_url, existing?.image_url).slice(0, 2000);
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return response({ success: false, error: "Product image must use a valid HTTP or HTTPS URL." }, 400);
  const packageGroup = text(body.package_group, existing?.package_group).slice(0, 120);
  const stock = integer(body.stock_quantity, existing?.stock_quantity || 0);
  const trackStock = body.track_stock === undefined ? (existing?.track_stock ?? 1) : (body.track_stock ? 1 : 0);
  const sortOrder = integer(body.sort_order, existing?.sort_order || 0);
  if (!Array.isArray(body.packages) || !body.packages.length || body.packages.length > 100) {
    return response({ success: false, error: "Add at least one package row with its stock amount, resale amount, and commission." }, 400);
  }
  const packageRows = [];
  for (let index = 0; index < body.packages.length; index++) {
    const row = body.packages[index] || {};
    const label = text(row.package_label);
    const unitsPerPackage = integer(row.units_per_package, 1) || 1;
    if (/(?:\\b(?:x|by)\\s*\\d+\\b|×\\s*\\d+)/i.test(label) && unitsPerPackage === 1) {
      return response({ success: false, error: "Package size “" + label + "” appears to include a quantity. Enter only one individual item's size (for example, 100 g) and set the number of individual units in the separate quantity field." }, 400);
    }
    const stockAmount = amount(row.stock_amount);
    const resaleAmount = amount(row.resale_amount);
    const commission = amount(row.commission);
    if (!label || stockAmount === null || resaleAmount === null || commission === null) {
      return response({ success: false, error: "Every package row needs a package name, stock amount, resale amount, and commission." }, 400);
    }
    if (Math.abs(resaleAmount - stockAmount - commission) >= 0.01) {
      return response({ success: false, error: "Package " + label + ": resale amount must equal stock amount plus commission." }, 400);
    }
    const packageStock = integer(row.stock_quantity, 0);
    const minimum = integer(row.minimum_order_quantity, 1) || 1;
    packageRows.push({ id: positiveId(row.id), package_label: label, units_per_package: unitsPerPackage, stock_amount: stockAmount, resale_amount: resaleAmount, commission, stock_quantity: packageStock, minimum_order_quantity: minimum, is_enabled: row.is_enabled === false || row.is_enabled === 0 ? 0 : 1, sort_order: integer(row.sort_order, index) });
  }
  let productId = id;
  if (method === "POST") {
    const saved = await env.DB.prepare("INSERT INTO reseller_products (category_id, name, slug, description, sku, currency, status, stock_quantity, track_stock, sort_order, image_url, package_group, package_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id")
      .bind(categoryId, name, slug, description, sku, currency, status, stock, trackStock, sortOrder, imageUrl, packageGroup, packageRows[0].package_label).first();
    productId = saved.id;
  } else {
    await env.DB.prepare("UPDATE reseller_products SET category_id = ?, name = ?, slug = ?, description = ?, sku = ?, currency = ?, status = ?, stock_quantity = ?, track_stock = ?, sort_order = ?, image_url = ?, package_group = ?, package_label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(categoryId, name, slug, description, sku, currency, status, stock, trackStock, sortOrder, imageUrl, packageGroup, packageRows[0].package_label, productId).run();
  }
  const existingRows = await env.DB.prepare("SELECT id FROM reseller_product_packages WHERE reseller_product_id = ?").bind(productId).all();
  const keepIds = new Set();
  const statements = [];
  for (const row of packageRows) {
    if (row.id) {
      const owns = (existingRows.results || []).some((x) => Number(x.id) === row.id);
      if (!owns) return response({ success: false, error: "A package row does not belong to this product. Refresh and try again." }, 400);
      keepIds.add(row.id);
      statements.push(env.DB.prepare(`UPDATE reseller_product_packages SET package_label = ?, units_per_package = ?, stock_amount = ?, resale_amount = ?, commission = ?, stock_quantity = ?, stock_units_available = CASE WHEN stock_quantity != ? OR units_per_package != ? THEN ? * ? ELSE stock_units_available END, minimum_order_quantity = ?, is_enabled = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND reseller_product_id = ?`)
        .bind(row.package_label, row.units_per_package, row.stock_amount, row.resale_amount, row.commission, row.stock_quantity, row.stock_quantity, row.units_per_package, row.stock_quantity, row.units_per_package, row.minimum_order_quantity, row.is_enabled, row.sort_order, row.id, productId));
    } else {
      statements.push(env.DB.prepare(`INSERT INTO reseller_product_packages (reseller_product_id, package_label, units_per_package, stock_amount, resale_amount, commission, stock_quantity, stock_units_available, minimum_order_quantity, is_enabled, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(productId, row.package_label, row.units_per_package, row.stock_amount, row.resale_amount, row.commission, row.stock_quantity, row.stock_quantity * row.units_per_package, row.minimum_order_quantity, row.is_enabled, row.sort_order));
    }
  }
  for (const row of existingRows.results || []) {
    if (!keepIds.has(Number(row.id)) && !packageRows.some((pkg) => pkg.id === Number(row.id))) {
      statements.push(env.DB.prepare("UPDATE reseller_product_packages SET is_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id));
    }
  }
  if (statements.length) await env.DB.batch(statements);
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
