(() => {
  let methods = [];
  let rates = [];
  let timer = null;

  const money = (value) => 'ZAR ' + Number(value || 0).toFixed(2);
  const cartItems = () => (typeof readCart === 'function' ? readCart() : []);
  const form = () => document.querySelector('[data-checkout-form]');
  const method = () => {
    const f = form();
    return methods.find((item) => Number(item.id) === Number(f?.elements.shipping_method_id?.value || 0)) || null;
  };

  async function loadMethods() {
    const response = await fetch('/api/shipping', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.success) methods = Array.isArray(payload.data) ? payload.data : [];
  }

  function courier() {
    const m = method();
    return (m?.provider_type === 'courier_guy' && m?.mode === 'api')
      || (m?.provider_type === 'custom' && m?.mode === 'manual');
  }

  function completeAddress() {
    const f = form();
    return ['address', 'city', 'province', 'postal_code'].every((name) => String(f?.elements[name]?.value || '').trim());
  }

  function selectedRate() {
    const f = form();
    const code = String(f?.elements.shipping_option_id?.value || '').replace(/^rate:/, '');
    return rates.find((rate) => rate.code === code) || null;
  }

  function clearShippingTotal() {
    const cart = cartItems();
    const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
    const currency = String(cart[0]?.currency || 'ZAR').toUpperCase();
    const shippingTotal = document.querySelector('[data-checkout-shipping]');
    const grandTotal = document.querySelector('[data-checkout-grand-total]');
    if (shippingTotal) shippingTotal.textContent = money(0);
    if (grandTotal) grandTotal.textContent = money(subtotal);
  }

  function updateTotals() {
    const f = form();
    if (!f || !courier()) return;
    const rate = selectedRate();
    if (!rate) {
      clearShippingTotal();
      return;
    }
    const cart = cartItems();
    const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
    const shipping = Number(rate.price || 0);
    const shippingTotal = document.querySelector('[data-checkout-shipping]');
    const grandTotal = document.querySelector('[data-checkout-grand-total]');
    if (shippingTotal) shippingTotal.textContent = money(shipping);
    if (grandTotal) grandTotal.textContent = money(subtotal + shipping);
  }

  async function loadRates() {
    const f = form();
    const optionList = f?.querySelector('[data-shipping-option]');
    const optionField = f?.querySelector('[data-shipping-option-field]');
    const notice = f?.querySelector('[data-checkout-notice]');
    const m = method();
    if (!f || !optionList || !m || !courier()) return;

    if (optionField) optionField.hidden = false;
    rates = [];
    clearShippingTotal();

    if (!completeAddress()) {
      optionList.innerHTML = '<p class="muted shipping-rate-message">Enter your delivery address to get live courier rates.</p>';
      return;
    }

    optionList.innerHTML = '<p class="muted shipping-rate-message">Getting delivery rates…</p>';

    try {
      const cart = cartItems();
      const response = await fetch('/api/shipping?resource=live-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          shipping_method_id: Number(m.id),
          items: cart.map((item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) })),
          customer: Object.fromEntries(new FormData(f).entries()),
          declared_value: cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to calculate delivery rates.');
      rates = Array.isArray(payload.data?.rates) ? payload.data.rates : [];
      optionList.innerHTML = rates.length
        ? rates.map((rate, index) => '<label class="shipping-option-card"><input type="radio" name="shipping_option_id" value="rate:' + String(rate.code).replace(/"/g, '&quot;') + '" required' + (index === 0 ? ' checked' : '') + '><span class="shipping-option-card-content"><strong>' + String(rate.name).replace(/[&<>]/g, '') + '</strong><span>' + money(rate.price) + '</span></span></label>').join('')
        : '<p class="muted shipping-rate-message">No courier service is available for this address.</p>';
      if (rates.length) optionList.querySelectorAll('input[name="shipping_option_id"]').forEach((input) => input.addEventListener('change', updateTotals));
      updateTotals();
    } catch (error) {
      rates = [];
      optionList.innerHTML = '<p class="muted shipping-rate-message">Delivery rate unavailable.</p>';
      select.disabled = false;
      clearShippingTotal();
      if (notice) {
        notice.hidden = false;
        notice.textContent = error.message || 'Unable to calculate delivery rates.';
      }
    }
  }

  function scheduleRates() {
    if (!courier()) return;
    clearTimeout(timer);
    timer = setTimeout(loadRates, 350);
  }

  async function submitCourier(event) {
    if (!courier()) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const f = form();
    const notice = f.querySelector('[data-checkout-notice]');
    const button = f.querySelector('.checkout-submit');
    const rate = selectedRate();

    if (!rate) {
      notice.hidden = false;
      notice.textContent = 'Please wait for a delivery rate and select a delivery service.';
      return;
    }
    if (!f.checkValidity()) {
      f.reportValidity();
      return;
    }

    button.disabled = true;
    notice.hidden = false;
    notice.textContent = 'Saving your customer details…';

    try {
      const details = Object.fromEntries(new FormData(f).entries());
      const token = await window.getCustomerIdToken();
      const profileResponse = await fetch('/api/customer-profile', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(details)
      });
      const profilePayload = await profileResponse.json().catch(() => ({}));
      if (!profileResponse.ok || !profilePayload.success) throw new Error(profilePayload.error || 'Unable to save your details.');

      const m = method();
      details.shipping_method_name = m.name;
      details.shipping_provider_type = m.provider_type;
      details.shipping_mode = m.mode;
      details.shipping_option_name = rate.name;
      details.shipping_fee = Number(rate.price);
      details.shipping_rate_code = rate.code;
      sessionStorage.setItem('clothing-store-checkout-details', JSON.stringify(details));

      notice.textContent = 'Preparing secure payment…';
      const cart = cartItems();
      const paymentResponse = await fetch('/api/payment/initialize', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: cart.map((item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) })),
          shipping_method_id: Number(m.id),
          shipping_option_id: 0,
          shipping_rate_code: rate.code,
          customer: details
        })
      });
      const paymentPayload = await paymentResponse.json().catch(() => ({}));
      if (!paymentResponse.ok || !paymentPayload.success || !paymentPayload.data?.authorization_url) {
        throw new Error(paymentPayload.error || 'Unable to start payment.');
      }
      window.location.assign(paymentPayload.data.authorization_url);
    } catch (error) {
      notice.textContent = error.message || 'Unable to continue to payment.';
    } finally {
      button.disabled = false;
    }
  }

  function attach(f) {
    if (f.dataset.liveCourierAttached === '1') return;
    f.dataset.liveCourierAttached = '1';

    f.addEventListener('change', (event) => {
      if (event.target?.name === 'shipping_method_id') {
        if (courier()) {
          loadRates();
        } else {
          rates = [];
          clearTimeout(timer);
        }
      } else if (event.target?.name === 'shipping_option_id' && courier()) {
        event.stopPropagation();
        updateTotals();
      }
    }, true);

    f.addEventListener('input', (event) => {
      if (['address', 'city', 'province', 'postal_code'].includes(event.target?.name)) scheduleRates();
    });

    f.addEventListener('submit', submitCourier, true);

    if (courier()) loadRates();
  }

  async function init() {
    await loadMethods();
    const observer = new MutationObserver(() => {
      const f = form();
      if (f) attach(f);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const f = form();
    if (f) attach(f);
  }

  init();
})();