const params = new URLSearchParams(window.location.search);
let currentProductId = params.get('id');
const titleElement = document.querySelector('[data-product-title]');
const categoryElement = document.querySelector('[data-product-category]');
const priceElement = document.querySelector('[data-product-price]');
const descriptionElement = document.querySelector('[data-product-description]');
const mainImageElement = document.querySelector('[data-product-main-image]');
const thumbnailsElement = document.querySelector('[data-product-thumbnails]');
const statusElement = document.querySelector('[data-product-status]');
const attributesElement = document.querySelector('[data-product-attributes]');
const addButton = document.querySelector('[data-add-to-cart]');
const buyNowButton = document.querySelector('[data-buy-now]');
const relatedSection = document.querySelector('[data-related-products-section]');
const groupColorPalette = [
  ['Black', '#000000'], ['White', '#ffffff'], ['Red', '#dc2626'], ['Blue', '#2563eb'],
  ['Green', '#16a34a'], ['Yellow', '#facc15'], ['Orange', '#f97316'], ['Purple', '#9333ea'],
  ['Pink', '#ec4899'], ['Brown', '#92400e'], ['Grey', '#6b7280'], ['Beige', '#d6c3a5'],
  ['Navy', '#1e3a8a'], ['Maroon', '#7f1d1d'], ['Burgundy', '#800020'], ['Cream', '#fff7d6'],
  ['Khaki', '#c3b091'], ['Olive', '#808000'], ['Teal', '#0f766e'], ['Turquoise', '#14b8a6'],
  ['Gold', '#d4af37'], ['Silver', '#c0c0c0']
];
const getGroupColorHex = (value) => groupColorPalette.find(([name]) => name.toLowerCase() === String(value || '').trim().toLowerCase())?.[1] || '#9ca3af';
const relatedProductsElement = document.querySelector('[data-related-products]');
const groupOptionsElement = document.querySelector('[data-product-group-options]');
const groupLabelElement = document.querySelector('[data-product-group-label]');
const groupValuesElement = document.querySelector('[data-product-group-values]');
let loadedProduct = null;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
}[character]));

const getImages = (product) => {
  if (!Array.isArray(product?.images)) return [];
  return [...product.images].sort((a,b) => Number(b.is_primary) - Number(a.is_primary) || Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
};

const formatPrice = (product) => {
  const amount = Number(product?.effective_price ?? product?.price);
  const regular = Number(product?.price);
  const currency = String(product?.currency || 'ZAR').toUpperCase();
  if (!Number.isFinite(amount)) return currency + ' 0.00';
  if (Number(product?.promotion_enabled) === 1 && Number.isFinite(regular) && regular !== amount) return '<span class="price-original">' + currency + ' ' + regular.toFixed(2) + '</span> ' + currency + ' ' + amount.toFixed(2);
  return currency + ' ' + amount.toFixed(2);
};

function getPrimaryImage(product) {
  const images = getImages(product);
  return images[0]?.image_url || '';
}

function renderRelatedProducts(product) {
  if (!relatedSection || !relatedProductsElement) return;
  const related = Array.isArray(product?.related_products) ? product.related_products : [];
  if (!related.length) {
    relatedSection.hidden = true;
    relatedProductsElement.innerHTML = '';
    return;
  }
  relatedProductsElement.innerHTML = related.map((item) => {
    const image = getPrimaryImage(item);
    const imageMarkup = image
      ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(item.name) + '" loading="lazy">'
      : '<span class="product-image-placeholder">No image</span>';
    return '<article class="product-card">' +
      '<a class="product-image" href="product.html?id=' + encodeURIComponent(item.id) + '" aria-label="View ' + escapeHtml(item.name) + '">' + imageMarkup + '</a>' +
      '<div class="product-info"><div><p class="product-category">' + escapeHtml(item.product_group_name || 'Related product') + '</p><h3><a href="product.html?id=' + encodeURIComponent(item.id) + '">' + escapeHtml(item.name) + '</a></h3></div><strong class="price">' + formatPrice(item) + '</strong></div>' +
      '</article>';
  }).join('');
  relatedSection.hidden = false;
}

function renderGallery(product) {
  const images = getImages(product);
  if (!images.length) {
    mainImageElement.hidden = true;
    mainImageElement.parentElement.innerHTML = '<div class="product-gallery-empty">No image available</div>';
    thumbnailsElement.innerHTML = '';
    return;
  }

  function showImage(index) {
    const image = images[index];
    mainImageElement.src = image.image_url;
    mainImageElement.alt = image.alt_text || product.name;
    thumbnailsElement.querySelectorAll('[data-gallery-index]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.galleryIndex) === index);
      button.setAttribute('aria-current', Number(button.dataset.galleryIndex) === index ? 'true' : 'false');
    });
  }

  mainImageElement.hidden = false;
  mainImageElement.src = images[0].image_url;
  mainImageElement.alt = images[0].alt_text || product.name;
  thumbnailsElement.innerHTML = images.map((image, index) => '<button class="product-gallery-thumb' + (index === 0 ? ' is-active' : '') + '" type="button" data-gallery-index="' + index + '" aria-label="View picture ' + (index + 1) + '" aria-current="' + (index === 0 ? 'true' : 'false') + '"><img src="' + escapeHtml(image.image_url) + '" alt=""></button>').join('');
  thumbnailsElement.querySelectorAll('[data-gallery-index]').forEach((button) => {
    button.addEventListener('click', () => showImage(Number(button.dataset.galleryIndex)));
  });
}

async function loadProduct(id = currentProductId, updateHistory = false) {
  if (!id || !/^\d+$/.test(id)) throw new Error('A valid product was not specified.');
  const response = await fetch('/api/products?id=' + encodeURIComponent(id), { headers:{Accept:'application/json'}, cache:'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load product.');
  const products = Array.isArray(payload.data?.products) ? payload.data.products : [];
  const product = products.find((item) => String(item.id) === String(id));
  if (!product) throw new Error('Product not found.');
  currentProductId = String(product.id);
  loadedProduct = product;
  titleElement.textContent = product.name;
  categoryElement.textContent = product.category_name || 'Uncategorized';
  priceElement.textContent = formatPrice(product);
  descriptionElement.textContent = product.description || 'No description available.';
  statusElement.textContent = product.track_stock && Number(product.stock_quantity) <= 0 ? 'Out of stock' : 'Available';
  if (attributesElement) {
    const attributes = Array.isArray(product.attributes) ? product.attributes : [];
    attributesElement.innerHTML = attributes.length
      ? attributes.map((attribute) => '<span><strong>' + escapeHtml(attribute.name) + ':</strong> ' + escapeHtml(attribute.value) + '</span>').join(' · ')
      : '';
    attributesElement.hidden = !attributes.length;
  }
  if (addButton) {
    addButton.dataset.productId = product.id;
    addButton.setAttribute('aria-label', 'Add ' + product.name + ' to cart');
    addButton.disabled = Boolean(product.track_stock && Number(product.stock_quantity) <= 0);
    if (buyNowButton) { buyNowButton.dataset.productId = product.id; buyNowButton.disabled = Boolean(product.track_stock && Number(product.stock_quantity) <= 0); }
    addButton.firstChild.textContent = 'Add to cart ';
  }
  renderGallery(product);
  renderRelatedProducts(product);
  renderGroupOptions(product);
  document.title = product.name + ' | Clothing Store';
  if (updateHistory) window.history.pushState({ productId: product.id }, '', 'product.html?id=' + encodeURIComponent(product.id));
}

function renderGroupOptions(product) {
  if (!groupOptionsElement || !groupLabelElement || !groupValuesElement) return;
  const groupName = product.product_group_name;
  const type = String(product.product_group_relationship_type || '').toLowerCase();
  const related = Array.isArray(product.related_products) ? product.related_products : [];
  if (!groupName || !related.length || !['color','size'].includes(type)) {
    groupOptionsElement.hidden = true;
    groupValuesElement.innerHTML = '';
    return;
  }
  const label = type === 'size' ? 'Size' : 'Color';
  groupLabelElement.textContent = label;
  const options = [product, ...related].filter((item, index, array) => array.findIndex((candidate) => String(candidate.id) === String(item.id)) === index);
  groupValuesElement.innerHTML = options.map((item) => {
    const value = item.product_group_value || item.name;
    const active = String(item.id) === String(product.id);
    if (type === 'color') {
      const hex = getGroupColorHex(value);
      return '<button class="button button-small ' + (active ? 'button-primary' : 'button-outline') + '" type="button" data-group-product-id="' + escapeHtml(item.id) + '" aria-label="' + escapeHtml(value) + '" title="' + escapeHtml(value) + '" aria-pressed="' + active + '" style="width:40px;height:40px;padding:4px;border-radius:50%;display:inline-grid;place-items:center;">' +
        '<span aria-hidden="true" style="display:block;width:28px;height:28px;border-radius:50%;background:' + hex + ';border:1px solid rgba(0,0,0,.2);box-shadow:inset 0 0 0 1px rgb(255 255 255 / .35);"></span>' +
        '<span class="sr-only">' + escapeHtml(value) + '</span>' +
        '</button>';
    }
    return '<button class="button button-small ' + (active ? 'button-primary' : 'button-outline') + '" type="button" data-group-product-id="' + escapeHtml(item.id) + '" aria-pressed="' + active + '">' + escapeHtml(value) + '</button>';
  }).join('');
  groupOptionsElement.hidden = false;
  groupValuesElement.querySelectorAll('[data-group-product-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.groupProductId;
      if (id === currentProductId) return;
      groupValuesElement.querySelectorAll('button').forEach((item) => item.disabled = true);
      try {
        await loadProduct(id, true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        statusElement.textContent = error.message || 'Unable to switch product.';
      } finally {
        groupValuesElement.querySelectorAll('button').forEach((item) => item.disabled = false);
      }
    });
  });
}

if (buyNowButton) {
  buyNowButton.addEventListener('click', () => {
    if (!loadedProduct || buyNowButton.disabled) return;
    try {
      const item = {
        product_id: loadedProduct.id,
        name: loadedProduct.name,
        price: Number(loadedProduct.effective_price ?? loadedProduct.price) || 0,
        currency: String(loadedProduct.currency || 'ZAR').toUpperCase(),
        image_url: getImages(loadedProduct)[0]?.image_url || null,
        quantity: 1
      };
      localStorage.setItem('clothing-store-cart', JSON.stringify([item]));
      window.location.href = 'checkout.html';
    } catch {}
  });
}

loadProduct().catch((error) => {
  titleElement.textContent = 'Product unavailable';
  statusElement.textContent = error.message || 'Unable to load this product.';
  if (addButton) addButton.disabled = true;
});


if (addButton) {
  addButton.addEventListener('click', () => {
    if (!loadedProduct || addButton.disabled) return;
    try {
      const key = 'clothing-store-cart';
      const cart = JSON.parse(localStorage.getItem(key) || '[]');
      const existing = Array.isArray(cart) ? cart.find((item) => Number(item.product_id) === Number(loadedProduct.id)) : null;
      if (existing) existing.quantity = Number(existing.quantity || 0) + 1;
      else cart.push({
        product_id: loadedProduct.id,
        name: loadedProduct.name,
        price: Number(loadedProduct.effective_price ?? loadedProduct.price) || 0,
        currency: String(loadedProduct.currency || 'ZAR').toUpperCase(),
        image_url: getImages(loadedProduct)[0]?.image_url || null,
        quantity: 1
      });
      localStorage.setItem(key, JSON.stringify(cart));
      window.animateProductToCart?.(mainImageElement || addButton);
      document.querySelectorAll('.cart-count, .sticky-cart-count').forEach((element) => {
        element.textContent = String(cart.reduce((total, item) => total + Number(item.quantity || 0), 0));
      });
      addButton.firstChild.textContent = 'Added to cart ';
    } catch {}
  });
}


window.addEventListener('popstate', () => {
  const id = new URLSearchParams(window.location.search).get('id');
  loadProduct(id, false).catch((error) => {
    titleElement.textContent = 'Product unavailable';
    statusElement.textContent = error.message || 'Unable to load this product.';
  });
});
