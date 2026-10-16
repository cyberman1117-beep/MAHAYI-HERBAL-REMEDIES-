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

export async function handlePaymentSettings(request, env) {
  if (!["GET", "PUT"].includes(request.method)) {
    return json({ success: false, error: "Method not allowed." }, 405);
  }

  try {
    if (request.method === "GET") {
      const adminRequest = new URL(request.url).searchParams.get("admin") === "1";
      if (adminRequest) await requireAdmin(request, env);

      const providerKey = clean(new URL(request.url).searchParams.get("provider"));
      if (adminRequest && providerKey) {
        const provider = await env.DB.prepare(
          "SELECT id, provider_key, display_name, is_enabled, sort_order, created_at, updated_at FROM payment_providers WHERE provider_key = ?"
        ).bind(providerKey).first();
        if (!provider) return json({ success: false, error: "Payment provider not found." }, 404);

        const secretNameByProvider = {
          paystack: "PAYSTACK_SECRET_KEY",
          yoco: "YOCO_SECRET_KEY",
          stripe: "STRIPE_SECRET_KEY"
        };
        const secretName = secretNameByProvider[provider.provider_key];
        const configured = Boolean(secretName && env[secretName]);

        return json({
          success: true,
          data: {
            ...provider,
            secret_configured: configured
          }
        });
      }

      const query = adminRequest
        ? "SELECT id, provider_key, display_name, is_enabled, sort_order, created_at, updated_at FROM payment_providers ORDER BY sort_order ASC, id ASC"
        : "SELECT id, provider_key, display_name, is_enabled, sort_order FROM payment_providers WHERE is_enabled = 1 ORDER BY sort_order ASC, id ASC";
      const result = await env.DB.prepare(query).all();
      return json({ success: true, data: result.results ?? [] });
    }

    await requireAdmin(request, env);
    const body = await request.json();
    if (!Array.isArray(body?.providers)) {
      return json({ success: false, error: "Payment provider settings are required." }, 400);
    }

    const existing = await env.DB.prepare("SELECT provider_key FROM payment_providers").all();
    const allowed = new Set((existing.results ?? []).map((row) => row.provider_key));

    for (const provider of body.providers) {
      const key = clean(provider?.provider_key);
      if (!allowed.has(key)) continue;
      const enabled = provider?.is_enabled ? 1 : 0;
      const sortOrder = Number.isInteger(Number(provider?.sort_order)) && Number(provider.sort_order) >= 0
        ? Number(provider.sort_order)
        : 0;
      await env.DB.prepare(
        "UPDATE payment_providers SET is_enabled = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE provider_key = ?"
      ).bind(enabled, sortOrder, key).run();
    }

    const result = await env.DB.prepare(
      "SELECT id, provider_key, display_name, is_enabled, sort_order, created_at, updated_at FROM payment_providers ORDER BY sort_order ASC, id ASC"
    ).all();

    return json({ success: true, data: result.results ?? [] });
  } catch (error) {
    if (error?.code === "ADMIN_AUTH_REQUIRED") return json({ success: false, error: error.message }, 403);
    if (error?.message === "Authentication required.") return json({ success: false, error: error.message }, 401);
    return json({ success: false, error: "Unable to manage payment providers." }, 500);
  }
}
