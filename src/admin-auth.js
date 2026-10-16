import { verifyFirebaseIdToken } from "./index.js";

export async function requireAdmin(request, env) {
  const token = await verifyFirebaseIdToken(request);
  const admin = await env.DB.prepare(
    "SELECT firebase_uid, role, is_enabled FROM admin_users WHERE firebase_uid = ? AND is_enabled = 1"
  ).bind(token.sub).first();

  if (!admin) {
    const error = new Error("Administrator authorization required.");
    error.code = "ADMIN_AUTH_REQUIRED";
    throw error;
  }

  return { token, admin };
}
