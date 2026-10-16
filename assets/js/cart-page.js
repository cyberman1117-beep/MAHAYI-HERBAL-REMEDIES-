const cartPageElement = document.querySelector('[data-cart-page]');

const formatCartPrice = (item) => {
  const currency = String(item.currency || 'ZAR').toUpperCase();
  return `${currency} ${(Number(item.price) * Number(item.quantity)).toFixed(2)}`;
};

const enrichCartImages = async () => {
  const cart = readCart();
  if (!cart.some((item) => !item.image_url)) return cart;
  try {
    const response = await fetch('/api/products?limit=100', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    const products = Array.isArray(payload.data?.products) ? payload.data.products : [];
    let changed = false;
    cart.forEach((item) => {
      if (item.image_url) return;
      const product = products.find((candidate) => Number(candidate.id) === Number(item.product_id));
      const images = Array.isArray(product?.images) ? product.images : [];
      const image = images.find((candidate) => Number(candidate.is_primary) === 1)?.image_url || images[0]?.image_url;
      if (image) { item.image_url = image; changed = true; }
    });
    if (changed) writeCart(cart);
  } catch {}
  return cart;
};

const renderCart = (cartOverride) => {
  if (!cartPageElement) return;
  const cart = cartOverride || readCart();
  if (!cart.length) {
    cartPageElement.innerHTML = `<div class="cart-empty"><h2>Your cart is empty</h2><p class="muted">Add products from the store and they will appear here.</p><a class="button button-primary" href="index.html#categories">Shop products</a></div>`;
    return;
  }

  const subtotal = cart.reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const currency = String(cart[0]?.currency || 'ZAR').toUpperCase();

  cartPageElement.innerHTML = `
    <div class="cart-layout">
      <div class="cart-items">
        ${cart.map((item) => `
          <article class="cart-item" data-cart-item data-product-id="${Number(item.product_id)}">
            <div class="cart-item-image">${item.image_url ? `<img src="${String(item.image_url).replace(/"/g, '&quot;')}" alt="">` : '<span>No image</span>'}</div>
            <div class="cart-item-details">
              <div><h2>${String(item.name).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}</h2><p class="price">${String(item.currency || 'ZAR').toUpperCase()} ${Number(item.price || 0).toFixed(2)}</p></div>
              <div class="cart-item-actions">
                <div class="quantity-control" aria-label="Quantity">
                  <button type="button" data-cart-decrease aria-label="Decrease quantity">−</button>
                  <span>${Number(item.quantity || 0)}</span>
                  <button type="button" data-cart-increase aria-label="Increase quantity">+</button>
                </div>
                <button class="text-link" type="button" data-cart-remove>Remove</button>
              </div>
            </div>
            <strong class="cart-item-total">${formatCartPrice(item)}</strong>
          </article>
        `).join('')}
      </div>
      <aside class="cart-summary">
        <p class="eyebrow">Summary</p>
        <h2>Order total</h2>
        <div class="cart-summary-row"><span>Subtotal</span><strong>${currency} ${subtotal.toFixed(2)}</strong></div>
        <p class="muted">Shipping and payment are calculated during checkout.</p>
        <a class="button button-primary" href="checkout.html" data-proceed-checkout>Proceed to checkout</a>
      </aside>
    </div>`;
};

const saveAndRender = (cart) => {
  writeCart(cart);
  updateCartCount();
  enrichCartImages().then((cart) => {
  updateCartCount();
  renderCart(cart);
});
};

document.addEventListener('click', (event) => {
  const item = event.target.closest('[data-cart-item]');
  if (!item) return;
  const productId = Number(item.dataset.productId);
  const cart = readCart();
  const entry = cart.find((cartItem) => Number(cartItem.product_id) === productId);
  if (!entry) return;

  if (event.target.closest('[data-cart-increase]')) entry.quantity = Number(entry.quantity || 0) + 1;
  if (event.target.closest('[data-cart-decrease]')) entry.quantity = Math.max(0, Number(entry.quantity || 0) - 1);
  if (event.target.closest('[data-cart-remove]')) entry.quantity = 0;

  saveAndRender(cart.filter((cartItem) => Number(cartItem.quantity || 0) > 0));
});

renderCart();


document.addEventListener('click', async (event) => {
  const link = event.target.closest('[data-proceed-checkout]');
  if (!link) return;
  event.preventDefault();
  try {
    const user = window.customerAuthReady ? await window.customerAuthReady : null;
    window.location.assign(user ? 'checkout.html' : 'account.html?redirect=checkout');
  } catch {
    window.location.assign('account.html?redirect=checkout');
  }
});
