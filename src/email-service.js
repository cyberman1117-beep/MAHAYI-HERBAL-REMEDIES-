const DEFAULTS = {
  enabled: false,
  provider: "resend",
  sender_name: "",
  sender_email: "",
  reply_to: "",
  notify_order_confirmation: true,
  notify_order_status: true,
  notify_new_chat: true
};

function clean(value) {
  return String(value ?? "").trim();
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeHeader(value) {
  return clean(value).replace(/[\r\n]/g, " ");
}

function encodeMimeBody(value) {
  return String(value || "").replace(/\r?\n/g, "\r\n");
}

export function getEmailSettings(storeSettingsRow) {
  let parsed = {};
  try {
    const settings = JSON.parse(storeSettingsRow?.settings_json || "{}");
    parsed = settings?.email && typeof settings.email === "object" ? settings.email : {};
  } catch {
    parsed = {};
  }
  return {
    ...DEFAULTS,
    ...parsed,
    enabled: Boolean(parsed.enabled),
    provider: clean(parsed.provider || DEFAULTS.provider).toLowerCase(),
    sender_name: clean(parsed.sender_name),
    sender_email: clean(parsed.sender_email),
    reply_to: clean(parsed.reply_to),
    notify_order_confirmation: parsed.notify_order_confirmation !== false,
    notify_order_status: parsed.notify_order_status !== false,
    notify_new_chat: parsed.notify_new_chat !== false
  };
}

async function sendWithResend(env, settings, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) throw new Error("Resend API key is not configured.");
  const recipient = clean(to);
  if (!recipient) throw new Error("Recipient email is required.");
  const payload = {
    from: settings.sender_name ? settings.sender_name + " <" + settings.sender_email + ">" : settings.sender_email,
    to: [recipient],
    subject: clean(subject),
    html: String(html || ""),
    text: String(text || "")
  };
  if (settings.reply_to) payload.reply_to = settings.reply_to;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.id) throw new Error(result?.message || "Transactional email delivery failed.");
  return { sent: true, id: String(result.id), provider: "resend" };
}



async function sendWithGoogleAppsScript(env, settings, { to, subject, html, text }) {
  const endpoint = clean(env.GOOGLE_APPS_SCRIPT_URL);
  const secret = clean(env.GOOGLE_APPS_SCRIPT_SECRET);
  const recipient = clean(to);
  if (!endpoint) throw new Error("Google Apps Script endpoint is not configured.");
  if (!secret) throw new Error("Google Apps Script secret is not configured.");
  if (!recipient) throw new Error("Recipient email is required.");

  const payload = {
    to: recipient,
    subject: clean(subject),
    html: String(html || ""),
    text: String(text || ""),
    sender_name: settings.sender_name,
    sender_email: settings.sender_email,
    reply_to: settings.reply_to,
    secret
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success !== true) {
    throw new Error(result?.message || "Google Apps Script email delivery failed.");
  }

  return {
    sent: true,
    id: String(result.id || "google-apps-script"),
    provider: "google_apps_script"
  };
}

async function getGoogleAccessToken(env) {
  if (!env.GOOGLE_GMAIL_CLIENT_ID || !env.GOOGLE_GMAIL_CLIENT_SECRET || !env.GOOGLE_GMAIL_REFRESH_TOKEN) {
    throw new Error("Google Gmail credentials are not configured.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_GMAIL_CLIENT_ID,
      client_secret: env.GOOGLE_GMAIL_CLIENT_SECRET,
      refresh_token: env.GOOGLE_GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.access_token) {
    throw new Error(result?.error_description || result?.error || "Unable to authorize Google Gmail.");
  }
  return String(result.access_token);
}

async function sendWithGmail(env, settings, { to, subject, html, text }) {
  const recipient = clean(to);
  if (!recipient) throw new Error("Recipient email is required.");
  if (!settings.sender_email) throw new Error("Gmail sender email is not configured.");

  const headers = [
    "From: " + (settings.sender_name ? settings.sender_name + " <" + normalizeHeader(settings.sender_email) + ">" : normalizeHeader(settings.sender_email)),
    "To: " + normalizeHeader(recipient),
    "Subject: " + normalizeHeader(subject),
    "MIME-Version: 1.0",
    "Content-Type: multipart/alternative; boundary=\"store-email-boundary\""
  ];
  if (settings.reply_to) headers.splice(3, 0, "Reply-To: " + normalizeHeader(settings.reply_to));

  const mime = headers.join("\r\n") +
    "\r\n\r\n--store-email-boundary\r\n" +
    "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" +
    encodeMimeBody(text) +
    "\r\n\r\n--store-email-boundary\r\n" +
    "Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" +
    encodeMimeBody(html) +
    "\r\n\r\n--store-email-boundary--";

  const accessToken = await getGoogleAccessToken(env);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ raw: base64UrlEncode(mime) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.id) {
    throw new Error(result?.error?.message || "Gmail message delivery failed.");
  }
  return { sent: true, id: String(result.id), provider: "gmail" };
}

export async function sendTransactionalEmail(env, { to, subject, html, text, notification = null }) {
  const row = await env.DB.prepare("SELECT settings_json FROM store_settings WHERE id = 1").first();
  const settings = getEmailSettings(row);
  if (!settings.enabled) return { sent: false, skipped: true, reason: "Email notifications are disabled." };
  if (notification === "order_confirmation" && !settings.notify_order_confirmation) {
    return { sent: false, skipped: true, reason: "Order confirmation notifications are disabled." };
  }
  if (notification === "order_status" && !settings.notify_order_status) {
    return { sent: false, skipped: true, reason: "Order status notifications are disabled." };
  }
  if (notification === "new_chat" && !settings.notify_new_chat) {
    return { sent: false, skipped: true, reason: "New chat notifications are disabled." };
  }
  if (!settings.sender_email) throw new Error("Transactional sender email is not configured.");

  if (settings.provider === "resend") {
    return sendWithResend(env, settings, { to, subject, html, text });
  }
  if (settings.provider === "gmail") {
    return sendWithGmail(env, settings, { to, subject, html, text });
  }
  if (settings.provider === "google_apps_script") {
    return sendWithGoogleAppsScript(env, settings, { to, subject, html, text });
  }
  throw new Error("Unsupported email provider.");
}
