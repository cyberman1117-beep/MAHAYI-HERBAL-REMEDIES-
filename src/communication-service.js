import { sendTransactionalEmail } from "./email-service.js";

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * Communication orchestration layer.
 *
 * Business features call this module with a communication intent such as
 * "order confirmation". They do not choose Gmail, Resend, a domain, or any
 * other delivery provider. Delivery remains behind the email adapter.
 */
export async function sendOrderConfirmation(env, transaction, order, checkoutData) {
  const customer = checkoutData?.customer || {};
  const shipping = checkoutData?.shipping || {};
  const lineItems = Array.isArray(checkoutData?.line_items) ? checkoutData.line_items : [];
  const recipient = clean(transaction.customer_email);

  if (!recipient || !lineItems.length) {
    return { sent: false, skipped: true, reason: "Order confirmation recipient or items are missing." };
  }

  const itemRows = lineItems.map(item => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const lineTotal = unitPrice * quantity;
    return "<tr><td style=\"padding:8px 0\">" + escapeHtml(item.name) + " × " + quantity + "</td><td style=\"padding:8px 0;text-align:right\">" + escapeHtml(transaction.currency) + " " + lineTotal.toFixed(2) + "</td></tr>";
  }).join("");

  const customerName = clean(customer.full_name);
  const greeting = customerName ? "Hi " + escapeHtml(customerName) + "," : "Hello,";
  const shippingText = [customer.address, customer.city, customer.province, customer.postal_code, customer.country]
    .filter(Boolean)
    .map(escapeHtml)
    .join(", ");
  const textItems = lineItems.map(item => {
    const lineTotal = Number(item.unit_price || 0) * Number(item.quantity || 0);
    return "- " + clean(item.name) + " x " + Number(item.quantity || 0) + ": " + clean(transaction.currency) + " " + lineTotal.toFixed(2);
  }).join("\n");
  const subtotal = lineItems.reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
    0
  );

  const html = "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#222\">" +
    "<h2>Order confirmed</h2>" +
    "<p>" + greeting + "</p>" +
    "<p>Thank you for your purchase. We have received your payment and your order is now being prepared.</p>" +
    "<p><strong>Order number:</strong> " + escapeHtml(order.order_number) + "</p>" +
    "<table style=\"width:100%;border-collapse:collapse\"><tbody>" + itemRows +
    "<tr><td style=\"padding:12px 0 4px\"><strong>Subtotal</strong></td><td style=\"padding:12px 0 4px;text-align:right\"><strong>" + escapeHtml(transaction.currency) + " " + subtotal.toFixed(2) + "</strong></td></tr>" +
    "<tr><td style=\"padding:4px 0\">Delivery</td><td style=\"padding:4px 0;text-align:right\">" + escapeHtml(transaction.currency) + " " + Number(shipping.fee || 0).toFixed(2) + "</td></tr>" +
    "<tr><td style=\"padding:8px 0\"><strong>Total</strong></td><td style=\"padding:8px 0;text-align:right\"><strong>" + escapeHtml(transaction.currency) + " " + Number(transaction.amount).toFixed(2) + "</strong></td></tr>" +
    "</tbody></table>" +
    (shippingText ? "<p><strong>Delivery address:</strong><br>" + shippingText + "</p>" : "") +
    "<p>Order status: <strong>Pending</strong></p></div>";

  const text = "Order confirmed\n\n" +
    (customerName ? "Hi " + customerName + ",\n\n" : "") +
    "Thank you for your purchase. We have received your payment and your order is now being prepared.\n\n" +
    "Order number: " + clean(order.order_number) + "\n\n" +
    "Items:\n" + textItems + "\n\n" +
    "Subtotal: " + clean(transaction.currency) + " " + subtotal.toFixed(2) + "\n" +
    "Delivery: " + clean(transaction.currency) + " " + Number(shipping.fee || 0).toFixed(2) + "\n" +
    "Total: " + clean(transaction.currency) + " " + Number(transaction.amount).toFixed(2) + "\n\n" +
    (shippingText ? "Delivery address: " + [customer.address, customer.city, customer.province, customer.postal_code, customer.country].filter(Boolean).map(clean).join(", ") + "\n\n" : "") +
    "Order status: Pending";

  try {
    return await sendTransactionalEmail(env, {
      to: recipient,
      subject: "Order confirmation " + clean(order.order_number),
      html,
      text,
      notification: "order_confirmation"
    });
  } catch (error) {
    console.error("Order confirmation communication failed", {
      order_id: order.id,
      order_number: order.order_number,
      recipient,
      error: error?.message || String(error)
    });
    return { sent: false, failed: true, reason: error?.message || "Delivery failed." };
  }
}


export async function sendOrderStatusUpdate(env, order, previousStatus, newStatus) {
  const recipient = clean(order?.customer_email);
  const orderNumber = clean(order?.order_number);
  const nextStatus = clean(newStatus).toLowerCase();
  const oldStatus = clean(previousStatus).toLowerCase();

  if (!recipient || !orderNumber || !nextStatus || nextStatus === oldStatus) {
    return { sent: false, skipped: true, reason: "Order status notification is not required." };
  }

  const label = nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1);
  const customerName = clean(order?.customer_full_name);
  const greeting = customerName ? "Hi " + escapeHtml(customerName) + "," : "Hello,";

  const html = "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#222\">" +
    "<h2>Order status updated</h2>" +
    "<p>" + greeting + "</p>" +
    "<p>Your order status has been updated.</p>" +
    "<p><strong>Order number:</strong> " + escapeHtml(orderNumber) + "</p>" +
    "<p><strong>Status:</strong> " + escapeHtml(label) + "</p>" +
    "<p>Thank you for shopping with us.</p>" +
    "</div>";

  const text = "Order status updated\n\n" +
    (customerName ? "Hi " + customerName + ",\n\n" : "") +
    "Your order status has been updated.\n\n" +
    "Order number: " + orderNumber + "\n" +
    "Status: " + label + "\n\n" +
    "Thank you for shopping with us.";

  try {
    return await sendTransactionalEmail(env, {
      to: recipient,
      subject: "Order " + orderNumber + " — " + label,
      html,
      text,
      notification: "order_status"
    });
  } catch (error) {
    console.error("Order status communication failed", {
      order_id: order.id,
      order_number: orderNumber,
      recipient,
      previous_status: oldStatus,
      new_status: nextStatus,
      error: error?.message || String(error)
    });
    return { sent: false, failed: true, reason: error?.message || "Delivery failed." };
  }
}


export async function sendNewChatNotification(env, conversation, message) {
  const customerName = clean(conversation?.customer_name);
  const customerEmail = clean(conversation?.customer_email);
  const subjectText = clean(conversation?.subject);
  const body = clean(message);

  if (!body) {
    return { sent: false, skipped: true, reason: "Chat message is missing." };
  }

  try {
    const settingsRow = await env.DB.prepare(
      "SELECT contact_email, store_name FROM store_settings WHERE id = 1"
    ).first();
    const recipient = clean(settingsRow?.contact_email);

    if (!recipient) {
      return { sent: false, skipped: true, reason: "Store contact email is not configured." };
    }

    const storeName = clean(settingsRow?.store_name) || "Store";
    const senderLabel = customerName || customerEmail || "Customer";
    const subject = subjectText
      ? "New customer message — " + subjectText
      : "New customer message from " + senderLabel;

    const html = "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#222\">" +
      "<h2>New customer message</h2>" +
      "<p><strong>Customer:</strong> " + escapeHtml(senderLabel) + "</p>" +
      (customerEmail ? "<p><strong>Email:</strong> " + escapeHtml(customerEmail) + "</p>" : "") +
      (subjectText ? "<p><strong>Subject:</strong> " + escapeHtml(subjectText) + "</p>" : "") +
      (conversation?.order_id ? "<p><strong>Order ID:</strong> " + escapeHtml(conversation.order_id) + "</p>" : "") +
      "<p><strong>Message:</strong></p><p>" + escapeHtml(body).replace(/\\n/g, "<br>") + "</p>" +
      "<p>Open the admin Communications area to reply.</p>" +
      "<p>" + escapeHtml(storeName) + "</p>" +
      "</div>";

    const text = "New customer message\n\n" +
      "Customer: " + senderLabel + "\n" +
      (customerEmail ? "Email: " + customerEmail + "\n" : "") +
      (subjectText ? "Subject: " + subjectText + "\n" : "") +
      (conversation?.order_id ? "Order ID: " + conversation.order_id + "\n" : "") +
      "\nMessage:\n" + body + "\n\n" +
      "Open the admin Communications area to reply.";

    return await sendTransactionalEmail(env, {
      to: recipient,
      subject,
      html,
      text,
      notification: "new_chat"
    });
  } catch (error) {
    console.error("New chat communication failed", {
      conversation_id: conversation?.id,
      customer_email: customerEmail,
      error: error?.message || String(error)
    });
    return { sent: false, failed: true, reason: error?.message || "Delivery failed." };
  }
}
