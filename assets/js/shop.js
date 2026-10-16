const catalogueElement = document.querySelector('[data-shop-catalogue]');
const statusElement = document.querySelector('[data-shop-status]');
const countElement = document.querySelector('[data-shop-count]');
const searchElement = document.querySelector('[data-shop-search]');
const mainCategoryElement = document.querySelector('[data-shop-main-category]');
const subcategoryElement = document.querySelector('[data-shop-subcategory]');
const sortElement = document.querySelector('[data-shop-sort]');
const clearButton = document.querySelector('[data-shop-clear]');

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const getPrimaryImage = (product) => {
  if (!Array.isArray(product?.images) || !product.images.length) return null;
  return product.images.find((image) => Number(image.is_primary) === 1)?.image_url || product.images[0]?.image_url || null;
};

const formatPrice = (product) => {
  const amount = Number(product?.effective_price ?? product?.price);
  const regular = Number(product?.price);
  const currency = String(product?.currency || 'ZAR').toUpperCase();
  if (!Number.isFinite(amount)) return `${escapeHtml(currency)} 0.00`;
  if (Number(product?.promotion_enabled) === 1 && Number.isFinite(regular) && regular !== amount) return '<span class="price-original">' + escapeHtml(currency) + ' ' + regular.toFixed(2) + '</span> ' + escapeHtml(currency) + ' ' + amount.toFixed(2);
  return `${escapeHtml(currency)} ${amount.toFixed(2)}`;
};

const renderProductCard = (product) => {
  const imageUrl = getPrimaryImage(product);
  const imageContent = imageUrl
    ? `<span data-product-image style="display:block;width:100%;height:100%;min-height:340px;background-image:url('${escapeHtml(imageUrl).replace(/'/g, '%27')}');background-size:contain;background-position:center;background-repeat:no-repeat;" aria-hidden="true"></span>`
    : '<span>No image</span>';
  const badges = [];
  if (product.status === 'active' && product.is_new) badges.push('<span class="product-badge">New</span>');
  if (product.status === 'active' && product.promotion_enabled) badges.push('<span class="product-badge">Sale</span>');
  const badge = badges.join('');
  return `<article class="product-card">
    <a class="product-image" href="/product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHtml(product.name)}">${imageContent}${badge}</a>
    <div class="product-info">
      <div><p class="product-category">${escapeHtml(product.category_name || 'Uncategorized')}</p><h2><a href="/product.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h2></div>
      <strong class="price">${formatPrice(product)}</strong>
    </div>
    <div class="product-actions">
      <button class="product-action" type="button" data-add-to-cart data-product-id="${escapeHtml(product.id)}" aria-label="Add ${escapeHtml(product.name)} to cart">Add to cart <span aria-hidden="true">+</span></button>
      <button class="product-buy-now" type="button" data-buy-now data-product-id="${escapeHtml(product.id)}" aria-label="Buy ${escapeHtml(product.name)} now">Buy now <span aria-hidden="true">↗</span></button>
    </div>
  </article>`;
};

const sortByStoreOrder = (a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id);

let state = { categories: [], products: [] };

const getMainCategories = () => state.categories.filter((category) =>
  Number(category.is_enabled) === 1 && Number(category.is_main_category) === 1
).sort(sortByStoreOrder);

const getSubcategories = () => state.categories.filter((category) =>
  Number(category.is_enabled) === 1 && Number(category.is_main_category) !== 1
).sort(sortByStoreOrder);

function populateMainCategories() {
  if (!mainCategoryElement) return;
  mainCategoryElement.innerHTML = '<option value="all">All categories</option>' +
    getMainCategories().map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('');
}

function populateSubcategories() {
  if (!subcategoryElement) return;
  const mainId = mainCategoryElement?.value || 'all';
  const subcategories = getSubcategories().filter((category) => mainId === 'all' || Number(category.parent_id) === Number(mainId));
  subcategoryElement.innerHTML = '<option value="all">All subcategories</option>' +
    subcategories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('');
}

function renderCatalogue() {
  if (!catalogueElement) return;
  const query = String(searchElement?.value || '').trim().toLowerCase();
  const mainId = mainCategoryElement?.value || 'all';
  const subId = subcategoryElement?.value || 'all';

  const visible = state.products.filter((product) => {
    const category = state.categories.find((item) => Number(item.id) === Number(product.category_id));
    const matchesMain = mainId === 'all' || Number(product.category_id) === Number(mainId) || Number(category?.parent_id) === Number(mainId);
    const matchesSub = subId === 'all' || Number(product.category_id) === Number(subId);
    const haystack = [product.name, product.sku, product.description, product.category_name].map((value) => String(value || '').toLowerCase()).join(' ');
    return matchesMain && matchesSub && (!query || haystack.includes(query));
  });

  const sort = sortElement?.value || 'store';
  visible.sort((a, b) => {
    if (sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    if (sort === 'price-low') return Number(a.price) - Number(b.price) || sortByStoreOrder(a, b);
    if (sort === 'price-high') return Number(b.price) - Number(a.price) || sortByStoreOrder(a, b);
    return sortByStoreOrder(a, b);
  });

  if (countElement) countElement.textContent = '';
  if (!visible.length) {
    catalogueElement.innerHTML = '<p class="muted">No products match the selected filters.</p>';
    return;
  }
  catalogueElement.innerHTML = `<div class="product-grid">${visible.map(renderProductCard).join('')}</div>`;
}

function bindFilters() {
  mainCategoryElement?.addEventListener('change', () => {
    populateSubcategories();
    renderCatalogue();
  });
  subcategoryElement?.addEventListener('change', renderCatalogue);
  sortElement?.addEventListener('change', renderCatalogue);
  searchElement?.addEventListener('input', renderCatalogue);
  clearButton?.addEventListener('click', () => {
    if (searchElement) searchElement.value = '';
    if (mainCategoryElement) mainCategoryElement.value = 'all';
    populateSubcategories();
    if (subcategoryElement) subcategoryElement.value = 'all';
    if (sortElement) sortElement.value = 'store';
    renderCatalogue();
  });
}

async function loadProducts() {
  const response = await fetch('/api/products?limit=100&page=1', { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load products.');
  const firstProducts = Array.isArray(payload.data?.products) ? payload.data.products : [];
  const totalPages = Number(payload.data?.pagination?.total_pages || 1);
  if (totalPages <= 1) return firstProducts;

  const pages = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) =>
    fetch(`/api/products?limit=100&page=${index + 2}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((pageResponse) => pageResponse.json().then((pagePayload) => {
        if (!pageResponse.ok || !pagePayload.success) throw new Error(pagePayload.error || 'Unable to load products.');
        return Array.isArray(pagePayload.data?.products) ? pagePayload.data.products : [];
      }))
  ));
  return firstProducts.concat(...pages);
}

async function loadShopAll() {
  try {
    const [categoryResponse, products] = await Promise.all([
      fetch('/api/categories', { headers: { Accept: 'application/json' }, cache: 'no-store' }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load categories.');
        return Array.isArray(payload.data) ? payload.data : [];
      }),
      loadProducts()
    ]);
    state = { categories: categoryResponse, products };
    populateMainCategories();
    populateSubcategories();
    renderCatalogue();
    if (statusElement) statusElement.textContent = 'Showing the current active catalogue.';
  } catch (error) {
    if (statusElement) statusElement.textContent = error?.message || 'Unable to load the catalogue.';
    if (catalogueElement) catalogueElement.innerHTML = '<p class="muted">The catalogue is temporarily unavailable.</p>';
  }
}

bindFilters();
loadShopAll();