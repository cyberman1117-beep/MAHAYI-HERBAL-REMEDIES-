import { verifyFirebaseIdToken } from "./index.js";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export async function handleCustomerProfile(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...JSON_HEADERS, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, PUT, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept" } });
  if (request.method !== "GET" && request.method !== "PUT") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    const token = await verifyFirebaseIdToken(request);
    if (request.method === "GET") {
      const profile = await env.DB.prepare("SELECT firebase_uid, email, full_name, phone, address, city, province, postal_code, country, status, suspension_reason, suspended_at FROM customer_profiles WHERE firebase_uid = ?").bind(token.sub).first();
      return json({ success: true, data: profile || { firebase_uid: token.sub, email: token.email || "", full_name: "", phone: "", address: "", city: "", province: "", postal_code: "", country: "South Africa", status: "active", suspension_reason: "", suspended_at: null } });
    }
    const body = await request.json();
    const email = String(token.email || body?.email || "").trim();
    const fullName = String(body?.full_name || "").trim();
    const phone = String(body?.phone || "").trim();
    const address = String(body?.address || "").trim();
    const city = String(body?.city || "").trim();
    const province = String(body?.province || "").trim();
    const postalCode = String(body?.postal_code || "").trim();
    const country = String(body?.country || "South Africa").trim();
    if (!fullName || !email || !phone || !address || !city || !province || !postalCode || !country) return json({ success: false, error: "Please complete your contact and delivery details." }, 400);
    const currentProfile = await env.DB.prepare("SELECT status, suspension_reason FROM customer_profiles WHERE firebase_uid = ?").bind(token.sub).first();
    if (currentProfile?.status === "suspended") return json({ success: false, error: currentProfile.suspension_reason ? `Your customer account is suspended: ${currentProfile.suspension_reason}` : "Your customer account is suspended." }, 403);
    await env.DB.prepare("INSERT INTO customer_profiles (firebase_uid, email, full_name, phone, address, city, province, postal_code, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(firebase_uid) DO UPDATE SET email = excluded.email, full_name = excluded.full_name, phone = excluded.phone, address = excluded.address, city = excluded.city, province = excluded.province, postal_code = excluded.postal_code, country = excluded.country, updated_at = CURRENT_TIMESTAMP").bind(token.sub, email, fullName, phone, address, city, province, postalCode, country).run();
    return json({ success: true, data: { firebase_uid: token.sub, email, full_name: fullName, phone, address, city, province, postal_code: postalCode, country, status: "active", suspension_reason: "", suspended_at: null } });
  } catch (error) {
    const authError = error?.message === "Authentication required.";
    return json({ success: false, error: authError ? error.message : `Unable to save customer profile: ${error?.message || "Unknown server error."}` }, authError ? 401 : 500);
  }
}
