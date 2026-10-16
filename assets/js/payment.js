const params = new URLSearchParams(window.location.search);
const reference = params.get("reference");
const statusElement = document.querySelector("[data-payment-status]");
const detailElement = document.querySelector("[data-payment-detail]");
const actionsElement = document.querySelector("[data-payment-actions]");
function show(status, detail) { if (statusElement) statusElement.textContent = status; if (detailElement) detailElement.textContent = detail; }
async function verifyPayment() {
  if (!reference) { show("Payment reference missing", "We could not identify the payment transaction."); return; }
  try {
    const token = await window.getCustomerIdToken();
    const response = await fetch("/api/payment/verify?reference=" + encodeURIComponent(reference), { headers: { Authorization: "Bearer " + token, Accept: "application/json" }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) throw new Error(payload.error || "Unable to verify payment.");
    const payment = payload.data || {};
    if (payment.status === "success") {
      try { localStorage.removeItem("clothing-store-cart"); } catch {}
      show("Payment successful", "Payment " + reference + " has been confirmed. Your payment has been recorded securely.");
      if (actionsElement) actionsElement.innerHTML = '<a class="button button-primary" href="index.html">Continue shopping</a>';
      return;
    }
    show("Payment not completed", "Payment status: " + (payment.status || "unknown") + ". If you completed payment, please wait a moment and try again.");
    if (actionsElement) actionsElement.innerHTML = '<a class="button button-outline" href="checkout.html">Return to checkout</a>';
  } catch (error) { show("Payment verification failed", error.message || "Please contact the store if you were charged."); }
}
async function getCustomerUser() {
  for (let attempt = 0; attempt < 50; attempt += 1) { if (window.customerAuthReady) return window.customerAuthReady; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error("Customer authentication is unavailable.");
}
(async () => { const user = await getCustomerUser(); if (!user) { show("Sign-in required", "Please sign in again to verify this payment."); return; } await verifyPayment(); })();