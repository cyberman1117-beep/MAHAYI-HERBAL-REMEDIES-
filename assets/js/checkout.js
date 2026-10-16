const checkoutPageElement = document.querySelector('[data-checkout-page]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const formatMoney = (value, currency) => `${String(currency || 'ZAR').toUpperCase()} ${Number(value || 0).toFixed(2)}`;

let shippingMethods = [];
let cart = [];

async function loadShippingMethods() {
  const response = await fetch('/api/shipping', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load shipping options.');
  shippingMethods = Array.isArray(payload.data) ? payload.data : [];
}

async function validateCartPacking() {
  const response = await fetch('/api/shipping?resource=pack-cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      items: cart.map((item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) }))
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) {
    const detail = Array.isArray(payload.data?.errors) ? payload.data.errors.map((item) => item.error).filter(Boolean).join(' ') : '';
    throw new Error(detail || payload.error || 'This cart cannot currently be safely packaged for delivery.');
  }
  return payload.data;
}

async function getCustomerProfile() {
  const token = await window.getCustomerIdToken();
  const response = await fetch('/api/customer-profile', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load your saved details.');
  return payload.data || {};
}

function populateCustomerProfile(profile) {
  const form = document.querySelector('[data-checkout-form]');
  if (!form) return;
  for (const field of ['full_name','email','phone','address','city','province','postal_code','country']) {
    const input = form.elements[field];
    if (input && profile[field]) input.value = profile[field];
  }
  applyConfiguredLocalArea();
}

async function saveCustomerProfile(form) {
  const token = await window.getCustomerIdToken();
  const details = Object.fromEntries(new FormData(form).entries());
  const response = await fetch('/api/customer-profile', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(details) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to save your details.');
  return payload.data;
}

function normalizeArea(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findConfiguredLocalArea(city) {
  const normalizedCity = normalizeArea(city);
  if (!normalizedCity) return null;
  for (const method of shippingMethods) {
    if (method?.provider_type !== 'local' || Number(method.is_enabled) !== 1) continue;
    const option = (method.options || []).find((item) => normalizeArea(item.name) === normalizedCity && Number(item.is_enabled) === 1);
    if (option) return { method, option };
  }
  return null;
}

function applyConfiguredLocalArea() {
  const form = document.querySelector('[data-checkout-form]');
  if (!form) return false;
  const local = findConfiguredLocalArea(form.elements.city?.value);
  if (!local) return false;
  const methodSelect = form.elements.shipping_method_id;
  const optionSelect = form.elements.shipping_option_id;
  if (String(methodSelect.value) !== String(local.method.id)) {
    methodSelect.value = String(local.method.id);
    renderShippingOptions();
  }
  if (optionSelect && String(optionSelect.value) !== String(local.option.id)) {
    optionSelect.value = String(local.option.id);
  }
  const notice = form.querySelector('[data-checkout-notice]');
  if (notice) {
    notice.hidden = false;
    notice.textContent = 'Local delivery is available for your area.';
  }
  return true;
}

function selectedShipping() {
  const form = document.querySelector('[data-checkout-form]');
  if (!form) return { method: null, option: null };
  const methodId = Number(form.elements.shipping_method_id?.value || 0);
  const optionId = Number(form.elements.shipping_option_id?.value || 0);
  const method = shippingMethods.find((item) => Number(item.id) === methodId) || null;
  const option = method?.options?.find((item) => Number(item.id) === optionId) || null;
  return { method, option };
}

function renderShippingOptions() {
  const methodSelect = document.querySelector('[data-shipping-method]');
  const optionList = document.querySelector('[data-shipping-option]');
  const optionField = document.querySelector('[data-shipping-option-field]');
  const landmarkField = document.querySelector('[data-landmark-field]');
  const method = shippingMethods.find((item) => Number(item.id) === Number(methodSelect?.value || 0)) || null;

  if (!methodSelect || !optionList || !optionField) return;
  optionList.innerHTML = '';
  const options = method?.options || [];
  optionField.hidden = !options.length;
  for (const option of options) {
    const label = document.createElement('label');
    label.className = 'shipping-option-card';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'shipping_option_id';
    input.value = String(option.id);
    input.required = true;
    input.checked = options.length === 1;
    const content = document.createElement('span');
    content.className = 'shipping-option-card-content';
    content.innerHTML = `<strong>${escapeHtml(option.name)}</strong><span>${formatMoney(option.price, 'ZAR')}</span>`;
    label.append(input, content);
    optionList.append(label);
  }

  const requiresLandmark = method?.provider_type === 'local';
  if (landmarkField) {
    landmarkField.hidden = !requiresLandmark;
    const input = landmarkField.querySelector('input');
    if (input) input.required = requiresLandmark;
  }

  const addressField = document.querySelector('[data-address-field]');
  if (addressField) {
    addressField.querySelector('input').required = true;
    addressField.hidden = false;
  }

  updateTotals();
  applyConfiguredLocalArea();
}

function updateTotals() {
  const { option } = selectedShipping();
  const shipping = Number(option?.price || 0);
  const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const currency = String(cart[0]?.currency || 'ZAR').toUpperCase();
  const shippingTotal = document.querySelector('[data-checkout-shipping]');
  const orderTotal = document.querySelector('[data-checkout-grand-total]');
  if (shippingTotal) shippingTotal.textContent = formatMoney(shipping, currency);
  if (orderTotal) orderTotal.textContent = formatMoney(subtotal + shipping, currency);
}

function renderCheckout() {
  if (!checkoutPageElement) return;
  if (!cart.length) {
    checkoutPageElement.innerHTML = `
      <div class="checkout-empty">
        <h2>Your cart is empty</h2>
        <p class="muted">Add products before continuing to checkout.</p>
        <a class="button button-primary" href="index.html#categories">Shop products</a>
      </div>`;
    return;
  }

  const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const currency = String(cart[0]?.currency || 'ZAR').toUpperCase();
  const methodsMarkup = shippingMethods.length
    ? shippingMethods.map((method, index) => `<option value="${method.id}" ${index === 0 ? 'selected' : ''}>${escapeHtml(method.name)}</option>`).join('')
    : '<option value="">No shipping method configured</option>';

  checkoutPageElement.innerHTML = `
    <div class="checkout-layout">
      <form class="checkout-form" data-checkout-form novalidate>
        <fieldset class="checkout-section">
          <legend>Contact information</legend>
          <label class="field"><span>Full name</span><input name="full_name" type="text" autocomplete="name" required></label>
          <label class="field"><span>Email address</span><input name="email" type="email" autocomplete="email" required></label>
          <label class="field"><span>Phone number</span><input name="phone" type="tel" autocomplete="tel" required></label>
        </fieldset>

        <fieldset class="checkout-section">
          <legend>Delivery address</legend>
          <div class="settings-fields-two">
            <label class="field" data-address-field><span>Street / address</span><input name="address" type="text" autocomplete="street-address" required></label>
            <label class="field"><span>City / Town</span><input name="city" type="text" autocomplete="address-level2" required></label>
          </div>
          <div class="settings-fields-two">
            <label class="field"><span>Province</span><input name="province" type="text" autocomplete="address-level1" required></label>
            <label class="field"><span>Postal code</span><input name="postal_code" type="text" autocomplete="postal-code" required></label>
          </div>
          <label class="field"><span>Country</span><input name="country" type="text" autocomplete="country-name" value="South Africa" required></label>
        </fieldset>

        <fieldset class="checkout-section">
          <legend>Delivery method</legend>
          <label class="field"><span>Shipping method</span><select name="shipping_method_id" data-shipping-method required>${methodsMarkup}</select></label>
          <div class="field" data-shipping-option-field hidden><span>Delivery option rates</span><div class="shipping-option-list" data-shipping-option></div></div>
          <label class="field" data-landmark-field hidden><span>Where are you staying / what are you near?</span><input name="landmark" type="text" maxlength="300" placeholder="e.g. Next to the school or near Mpho's shop"></label>
          <label class="field"><span>Order notes <small>(optional)</small></span><textarea name="notes" rows="4" placeholder="Anything we should know about your delivery?"></textarea></label>
        </fieldset>

        <p class="checkout-notice" data-checkout-notice hidden></p>
        <button class="button button-primary checkout-submit" type="submit">Continue to payment</button>
        <p class="muted checkout-payment-note">Payment will be connected in the next step. This step currently only prepares the order details.</p>
      </form>

      <aside class="checkout-summary">
        <p class="eyebrow">Your order</p>
        <h2>Order summary</h2>
        <div class="checkout-items">
          ${cart.map((item) => `
            <div class="checkout-item">
              <div class="checkout-item-image">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : ''}</div>
              <div><strong>${escapeHtml(item.name)}</strong><span>${Number(item.quantity || 0)} × ${formatMoney(item.price, item.currency)}</span></div>
              <strong>${formatMoney(Number(item.price || 0) * Number(item.quantity || 0), item.currency)}</strong>
            </div>`).join('')}
        </div>
        <div class="checkout-total"><span>Subtotal</span><strong>${formatMoney(subtotal, currency)}</strong></div>
        <div class="checkout-total"><span>Shipping</span><strong data-checkout-shipping>${formatMoney(0, currency)}</strong></div>
        <div class="checkout-total checkout-grand-total"><strong>Total</strong><strong data-checkout-grand-total>${formatMoney(subtotal, currency)}</strong></div>
      </aside>
    </div>`;

  const methodSelect = document.querySelector('[data-shipping-method]');
  const optionSelect = document.querySelector('[data-shipping-option]');
  methodSelect?.addEventListener('change', renderShippingOptions);
  document.querySelector('[data-shipping-option]')?.addEventListener('change', updateTotals);
  document.querySelector('[data-checkout-form]')?.elements.city?.addEventListener('input', applyConfiguredLocalArea);
  renderShippingOptions();
}

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-checkout-form]');
  if (!form) return;
  event.preventDefault();
  const notice = form.querySelector('[data-checkout-notice]');
  const submitButton = form.querySelector('.checkout-submit');
  const { method, option } = selectedShipping();

  if (!method || !option) {
    notice.hidden = false;
    notice.textContent = 'Please select a delivery method and delivery option.';
    return;
  }
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  submitButton.disabled = true;
  notice.hidden = false;
  notice.textContent = 'Saving your customer details…';

  try {
    await saveCustomerProfile(form);
    const details = Object.fromEntries(new FormData(form).entries());
    details.shipping_method_name = method.name;
    details.shipping_provider_type = method.provider_type;
    details.shipping_mode = method.mode;
    details.shipping_option_name = option.name;
    details.shipping_fee = Number(option.price || 0);
    sessionStorage.setItem('clothing-store-checkout-details', JSON.stringify(details));
    notice.textContent = 'Preparing secure payment…';
    const token = await window.getCustomerIdToken();
    const paymentResponse = await fetch('/api/payment/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        items: cart.map((item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) })),
        shipping_method_id: Number(method.id),
        shipping_option_id: Number(option.id),
        customer: details
      })
    });
    const paymentPayload = await paymentResponse.json().catch(() => ({}));
    if (!paymentResponse.ok || !paymentPayload.success || !paymentPayload.data?.authorization_url) throw new Error(paymentPayload.error || 'Unable to start payment.');
    window.location.assign(paymentPayload.data.authorization_url);
  } catch (error) {
    notice.textContent = error.message || 'Your details could not be saved. Please try again.';
  } finally {
    submitButton.disabled = false;
  }
});

async function getCustomerUser() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (window.customerAuthReady) return window.customerAuthReady;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Customer authentication is unavailable.');
}

async function init() {
  const user = await getCustomerUser();
  if (!user) {
    const currentPath = window.location.pathname.endsWith('/checkout.html') ? 'checkout' : 'checkout';
    window.location.replace(`account.html?redirect=${currentPath}`);
    return;
  }

  cart = typeof readCart === 'function' ? readCart() : [];
  if (!cart.length) {
    renderCheckout();
    return;
  }
  try {
    await loadShippingMethods();
    await validateCartPacking();
    renderCheckout();
    try { const profile = await getCustomerProfile(); populateCustomerProfile(profile); } catch {}
  } catch (error) {
    checkoutPageElement.innerHTML = `
      <div class="checkout-empty">
        <h2>Shipping is not available yet</h2>
        <p class="muted">${escapeHtml(error.message)}</p>
        <a class="button button-outline" href="cart.html">Back to cart</a>
      </div>`;
  }
}

init();
