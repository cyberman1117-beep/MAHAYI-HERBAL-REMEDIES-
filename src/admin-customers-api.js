import { requireAdmin } from "./admin-auth.js";

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

export async function handleAdminCustomers(request, env) {
  if (request.method !== "GET" && request.method !== "PUT") {
    return json({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    const { token } = await requireAdmin(request, env);
    const url = new URL(request.url);
    const id = clean(url.searchParams.get("firebase_uid"));
    
    if (request.method === "GET") {
      if (id) {
        const customer = await env.DB.prepare(
          "SELECT firebase_uid, email, full_name, phone, address, city, province, postal_code, country, status, suspension_reason, suspended_at, suspended_by, created_at, updated_at FROM customer_profiles WHERE firebase_uid = ?"
        ).bind(id).first();
        if (!customer) return json({ success: false, error: "Customer not found." }, 404);
        return json({ success: true, data: customer });
      }

      const search = clean(url.searchParams.get("search"));
      let result;
      if (search) {
        const term = `%${search}%`;
        result = await env.DB.prepare(
          "SELECT firebase_uid, email, full_name, phone, address, city, province, postal_code, country, status, suspension_reason, suspended_at, suspended_by, created_at, updated_at FROM customer_profiles WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ? ORDER BY updated_at DESC, created_at DESC"
        ).bind(term, term, term, term).all();
      } else {
        result = await env.DB.prepare(
          "SELECT firebase_uid, email, full_name, phone, address, city, province, postal_code, country, status, suspension_reason, suspended_at, suspended_by, created_at, updated_at FROM customer_profiles ORDER BY updated_at DESC, created_at DESC"
        ).all();
      }

      return json({ success: true, data: result.results ?? [] });
    }

    const body = await request.json();
    const firebaseUid = clean(body?.firebase_uid);
    if (!firebaseUid) return json({ success: false, error: "Customer ID is required." }, 400);

    const existing = await env.DB.prepare(
      "SELECT firebase_uid, status FROM customer_profiles WHERE firebase_uid = ?"
    ).bind(firebaseUid).first();
    if (!existing) return json({ success: false, error: "Customer not found." }, 404);

    if (body?.action === "suspend" || body?.action === "restore") {
      if (body.action === "suspend") {
        const reason = clean(body?.suspension_reason);
        if (!reason) return json({ success: false, error: "A suspension reason is required." }, 400);
        await env.DB.prepare(
          "UPDATE customer_profiles SET status = 'suspended', suspension_reason = ?, suspended_at = CURRENT_TIMESTAMP, suspended_by = ?, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?"
        ).bind(reason, token.sub, firebaseUid).run();
      } else {
        await env.DB.prepare(
          "UPDATE customer_profiles SET status = 'active', suspension_reason = '', suspended_at = NULL, suspended_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?"
        ).bind(firebaseUid).run();
      }
      const updatedStatus = await env.DB.prepare(
        "SELECT firebase_uid, email, full_name, phone, address, city, province, postal_code, country, status, suspension_reason, suspended_at, suspended_by, created_at, updated_at FROM customer_profiles WHERE firebase_uid = ?"
      ).bind(firebaseUid).first();
      return json({ success: true, data: updatedStatus });
    }

    const email = clean(body?.email);
    const fullName = clean(body?.full_name);
    const phone = clean(body?.phone);
    const address = clean(body?.address);
    const city = clean(body?.city);
    const province = clean(body?.province);
    const postalCode = clean(body?.postal_code);
    const country = clean(body?.country) || "South Africa";

    if (!email || !fullName || !phone || !address || !city || !province || !postalCode || !country) {
      return json({ success: false, error: "Please complete all customer contact and delivery details." }, 400);
    }

    await env.DB.prepare(
      "UPDATE customer_profiles SET email = ?, full_name = ?, phone = ?, address = ?, city = ?, province = ?, postal_code = ?, country = ?, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?"
    ).bind(email, fullName, phone, address, city, province, postalCode, country, firebaseUid).run();

    const updated = await env.DB.prepare(
      "SELECT firebase_uid, email, full_name, phone, address, city, province, postal_code, country, status, suspension_reason, suspended_at, suspended_by, created_at, updated_at FROM customer_profiles WHERE firebase_uid = ?"
    ).bind(firebaseUid).first();

    return json({ success: true, data: updated });
  } catch (error) {
    if (error?.code === "ADMIN_AUTH_REQUIRED") return json({ success: false, error: error.message }, 403);
    const message = error?.message === "Authentication required."
      ? error.message
      : "Unable to manage customers.";
    return json({ success: false, error: message }, error?.message === "Authentication required." ? 401 : 500);
  }
}