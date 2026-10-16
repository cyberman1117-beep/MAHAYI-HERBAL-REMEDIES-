const productGrid = document.querySelector('[data-product-grid]');
const catalogueStatus = document.querySelector('[data-catalogue-sentinel]');
const loadingLabel = document.querySelector('[data-loading-label]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}[character]));

const getPrimaryImage = (product) => {
  if (!Array.isArray(product?.images) || !product.images.length) return null;
  return product.images.find((image) => Number(image.is_primary) === 1)?.image_url
    || product.images[0]?.image_url
    || null;
};

const formatPrice = (product) => {
  const amount = Number(product?.price);
  const currency = String(product?.currency || 'ZAR').toUpperCase();
  if (!Number.isFinite(amount)) return `${escapeHtml(currency)} 0.00`;
  return `${escapeHtml(currency)} ${amount.toFixed(2)}`;
};

const renderProducts = (products) => {
  productGrid.innerHTML = '';

  products.forEach((product) => {
    const article = document.createElement('article');
    article.className = 'product-card';

    const productLink = document.createElement('a');
    productLink.className = 'product-image';
    productLink.href = '/product.html?id=' + encodeURIComponent(product.id);
    productLink.setAttribute('aria-label', `View ${product.name}`);

    const imageUrl = getPrimaryImage(product);
    if (imageUrl) {
      productLink.style.backgroundImage = `url("${String(imageUrl).replace(/"/g, '%22')}")`;
      productLink.style.backgroundSize = 'cover';
      productLink.style.backgroundPosition = 'center';
      productLink.setAttribute('data-product-image', 'true');
    } else {
      const placeholder = document.createElement('span');
      placeholder.textContent = 'No image';
      productLink.append(placeholder);
    }

    if (product.status === 'active' && product.is_new) {
      const badge = document.createElement('span');
      badge.className = 'product-badge';
      badge.textContent = 'New';
      productLink.append(badge);
    }

    const info = document.createElement('div');
    info.className = 'product-info';
    info.innerHTML = `<div><p class="product-category">${escapeHtml(product.category_name || 'Uncategorized')}</p><h3><a href="/product.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h3></div><strong class="price">${formatPrice(product)}</strong>`;

    const action = document.createElement('button');
    action.className = 'product-action';
    action.type = 'button';
    action.innerHTML = 'Add to bag <span aria-hidden="true">+</span>';

    article.append(productLink, info, action);
    productGrid.append(article);
  });
};

const loadPublicProducts = async () => {
  if (!productGrid) return;

  if (loadingLabel) loadingLabel.textContent = 'Loading products…';
  if (catalogueStatus) catalogueStatus.hidden = false;

  try {
    const response = await fetch('/api/products?limit=100', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Unable to load products.');

    const products = Array.isArray(payload.data?.products) ? payload.data.products : [];
    renderProducts(products);

    if (loadingLabel) {
      loadingLabel.textContent = products.length ? 'Showing available products' : 'No products available right now';
    }
  } catch (error) {
    productGrid.innerHTML = '';
    if (loadingLabel) loadingLabel.textContent = error?.message || 'Unable to load products right now';
  }
};

loadPublicProducts();
