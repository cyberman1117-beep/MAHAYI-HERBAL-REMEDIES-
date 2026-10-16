import { verifyFirebaseIdToken } from "./index.js";
import { requireAdmin } from "./admin-auth.js";
import { sendNewChatNotification } from "./communication-service.js";

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

function options(methods) {
  return new Response(null, {
    status: 204,
    headers: {
      ...JSON_HEADERS,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept"
    }
  });
}

async function getConversation(env, id) {
  const conversation = await env.DB.prepare(
    `SELECT id, customer_firebase_uid, customer_email, customer_name, order_id, subject, status, created_at, updated_at
     FROM conversations WHERE id = ?`
  ).bind(id).first();

  if (!conversation) return null;

  const messages = await env.DB.prepare(
    `SELECT id, conversation_id, sender_type, sender_firebase_uid, sender_name, body, is_read, created_at
     FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC`
  ).bind(id).all();

  return { ...conversation, messages: messages.results ?? [] };
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function handleCustomerCommunications(request, env) {
  if (request.method === "OPTIONS") return options("GET, POST, OPTIONS");
  if (!["GET", "POST"].includes(request.method)) return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const token = await verifyFirebaseIdToken(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (request.method === "GET") {
      if (id !== null) {
        const conversationId = parseId(id);
        if (!conversationId) return json({ success: false, error: "A valid conversation id is required." }, 400);

        const conversation = await env.DB.prepare(
          `SELECT id, customer_firebase_uid, customer_email, customer_name, order_id, subject, status, created_at, updated_at
           FROM conversations WHERE id = ? AND customer_firebase_uid = ?`
        ).bind(conversationId, token.sub).first();

        if (!conversation) return json({ success: false, error: "Conversation not found." }, 404);

        const messages = await env.DB.prepare(
          `SELECT id, conversation_id, sender_type, sender_firebase_uid, sender_name, body, is_read, created_at
           FROM conversation_messages WHERE conversation_id = ? ORDER BY id ASC`
        ).bind(conversationId).all();

        return json({ success: true, data: { ...conversation, messages: messages.results ?? [] } });
      }

      const conversations = await env.DB.prepare(
        `SELECT c.id, c.customer_email, c.customer_name, c.order_id, c.subject, c.status, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c WHERE c.customer_firebase_uid = ? ORDER BY c.updated_at DESC, c.id DESC LIMIT 100`
      ).bind(token.sub).all();

      return json({ success: true, data: conversations.results ?? [] });
    }

    const body = await request.json().catch(() => ({}));
    const conversationId = parseId(body?.conversation_id);
    const message = clean(body?.body);

    if (!message) return json({ success: false, error: "Message is required." }, 400);

    if (conversationId) {
      const existingConversation = await env.DB.prepare(
        "SELECT id, status FROM conversations WHERE id = ? AND customer_firebase_uid = ?"
      ).bind(conversationId, token.sub).first();

      if (!existingConversation) return json({ success: false, error: "Conversation not found." }, 404);
      if (existingConversation.status === "closed") return json({ success: false, error: "This conversation is closed." }, 409);

      await env.DB.prepare(
        `INSERT INTO conversation_messages
         (conversation_id, sender_type, sender_firebase_uid, sender_name, body)
         VALUES (?, 'customer', ?, ?, ?)`
      ).bind(conversationId, token.sub, clean(body?.sender_name || token.name || token.email), message).run();

      await env.DB.prepare(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(conversationId).run();

      const conversation = await getConversation(env, conversationId);
      const communication = await sendNewChatNotification(env, conversation, message);
      return json({ success: true, data: conversation, communication }, 201);
    }

    const profile = await env.DB.prepare(
      "SELECT email, full_name FROM customer_profiles WHERE firebase_uid = ?"
    ).bind(token.sub).first();

    const email = clean(token.email || profile?.email);
    const name = clean(profile?.full_name || token.name || email);
    const subject = clean(body?.subject);
    const orderId = parseId(body?.order_id);

    if (orderId) {
      const ownedOrder = await env.DB.prepare(
        "SELECT id FROM orders WHERE id = ? AND firebase_uid = ?"
      ).bind(orderId, token.sub).first();
      if (!ownedOrder) return json({ success: false, error: "Order not found." }, 404);
    }

    const openConversation = await env.DB.prepare(
      `SELECT id FROM conversations
       WHERE customer_firebase_uid = ? AND status = 'open'
       ORDER BY updated_at DESC, id DESC LIMIT 1`
    ).bind(token.sub).first();

    if (openConversation) {
      await env.DB.prepare(
        `INSERT INTO conversation_messages
         (conversation_id, sender_type, sender_firebase_uid, sender_name, body)
         VALUES (?, 'customer', ?, ?, ?)`
      ).bind(openConversation.id, token.sub, name, message).run();

      await env.DB.prepare(
        "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(openConversation.id).run();

      const conversation = await getConversation(env, openConversation.id);
      const communication = await sendNewChatNotification(env, conversation, message);
      return json({ success: true, data: conversation, communication }, 201);
    }

    const created = await env.DB.prepare(
      `INSERT INTO conversations
       (customer_firebase_uid, customer_email, customer_name, order_id, subject)
       VALUES (?, ?, ?, ?, ?) RETURNING id`
    ).bind(token.sub, email, name, orderId, subject).first();

    await env.DB.prepare(
      `INSERT INTO conversation_messages
       (conversation_id, sender_type, sender_firebase_uid, sender_name, body)
       VALUES (?, 'customer', ?, ?, ?)`
    ).bind(created.id, token.sub, name, message).run();

    const conversation = await getConversation(env, created.id);
    const communication = await sendNewChatNotification(env, conversation, message);
    return json({ success: true, data: conversation, communication }, 201);
  } catch (error) {
    if (error?.message === "Authentication required.") {
      return json({ success: false, error: error.message }, 401);
    }
    return json({ success: false, error: "Unable to manage your conversations." }, 500);
  }
}

export async function handleAdminCommunications(request, env) {
  if (request.method === "OPTIONS") return options("GET, POST, PUT, OPTIONS");
  if (!["GET", "POST", "PUT"].includes(request.method)) return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const { token, admin } = await requireAdmin(request, env);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (request.method === "GET") {
      if (id !== null) {
        const conversationId = parseId(id);
        if (!conversationId) return json({ success: false, error: "A valid conversation id is required." }, 400);

        const conversation = await getConversation(env, conversationId);
        if (!conversation) return json({ success: false, error: "Conversation not found." }, 404);
        return json({ success: true, data: conversation });
      }

      const status = clean(url.searchParams.get("status")).toLowerCase();
      if (status && !["open", "closed"].includes(status)) return json({ success: false, error: "Invalid conversation status." }, 400);

      const search = clean(url.searchParams.get("search"));
      const conditions = [];
      const bindings = [];

      if (status) {
        conditions.push("status = ?");
        bindings.push(status);
      }
      if (search) {
        const term = `%${search}%`;
        conditions.push("(customer_email LIKE ? OR customer_name LIKE ? OR subject LIKE ?)");
        bindings.push(term, term, term);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const conversations = await env.DB.prepare(
        `SELECT c.id, c.customer_firebase_uid, c.customer_email, c.customer_name, c.order_id, c.subject, c.status, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c ${where} ORDER BY c.updated_at DESC, c.id DESC LIMIT 100`
      ).bind(...bindings).all();

      return json({ success: true, data: conversations.results ?? [] });
    }

    const body = await request.json().catch(() => ({}));
    const conversationId = parseId(body?.conversation_id);
    if (!conversationId) return json({ success: false, error: "A valid conversation id is required." }, 400);

    const existing = await env.DB.prepare(
      "SELECT id, status FROM conversations WHERE id = ?"
    ).bind(conversationId).first();

    if (!existing) return json({ success: false, error: "Conversation not found." }, 404);

    if (request.method === "PUT") {
      const status = clean(body?.status).toLowerCase();
      if (!["open", "closed"].includes(status)) return json({ success: false, error: "Invalid conversation status." }, 400);

      await env.DB.prepare(
        "UPDATE conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(status, conversationId).run();

      return json({ success: true, data: await getConversation(env, conversationId) });
    }

    const message = clean(body?.body);
    if (!message) return json({ success: false, error: "Message is required." }, 400);
    if (existing.status === "closed") return json({ success: false, error: "This conversation is closed." }, 409);

    await env.DB.prepare(
      `INSERT INTO conversation_messages
       (conversation_id, sender_type, sender_firebase_uid, sender_name, body)
       VALUES (?, 'admin', ?, ?, ?)`
    ).bind(conversationId, token.sub, clean(body?.sender_name || admin.role || "Admin"), message).run();

    await env.DB.prepare(
      "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(conversationId).run();

    return json({ success: true, data: await getConversation(env, conversationId) }, 201);
  } catch (error) {
    if (error?.code === "ADMIN_AUTH_REQUIRED") return json({ success: false, error: error.message }, 403);
    if (error?.message === "Authentication required.") return json({ success: false, error: error.message }, 401);
    return json({ success: false, error: "Unable to manage conversations." }, 500);
  }
}
