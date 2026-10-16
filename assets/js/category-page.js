const titleElement = document.querySelector('[data-category-title]');
const introElement = document.querySelector('[data-category-intro]');
const filtersElement = document.querySelector('[data-category-filters]');
const catalogueElement = document.querySelector('[data-category-catalogue]');
const statusElement = document.querySelector('[data-category-status]');

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
    ? `<span data-product-image style="display:block;width:100%;height:100%;min-height:340px;background-image:url('${escapeHtml(imageUrl).replace(/'/g, '%27')}');background-size:cover;background-position:center;" aria-hidden="true"></span>`
    : '<span>No image</span>';
  const badges = [];
  if (product.status === 'active' && product.is_new) badges.push('<span class="product-badge">New</span>');
  if (product.status === 'active' && product.promotion_enabled) badges.push('<span class="product-badge">Sale</span>');
  const badge = badges.join('');

  return `<article class="product-card">
    <a class="product-image" href="/product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHtml(product.name)}">
      ${imageContent}${badge}
    </a>
    <div class="product-info">
      <div><p class="product-category">${escapeHtml(product.category_name || 'Uncategorized')}</p><h2><a href="/product.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a></h2></div>
      <strong class="price">${formatPrice(product)}</strong>
    </div>
    <button class="product-action" type="button" data-add-to-cart data-product-id="${escapeHtml(product.id)}" aria-label="Add ${escapeHtml(product.name)} to cart">Add to cart <span aria-hidden="true">+</span></button>
  </article>`;
};

const sortByStoreOrder = (a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id);
const params = new URLSearchParams(window.location.search);
const getIdFromUrl = () => params.get('id');
const getSubcategoryIdFromUrl = () => params.get('subcategory');

let currentFilter = getSubcategoryIdFromUrl() || 'all';
let state = { mainCategory: null, subcategories: [], products: [] };

function renderFilters() {
  if (!filtersElement) return;
  const filters = [
    { id: 'all', name: 'All' },
    ...state.subcategories.map((subcategory) => ({ id: String(subcategory.id), name: subcategory.name }))
  ];

  if (!filters.some((filter) => String(filter.id) === String(currentFilter))) currentFilter = 'all';

  filtersElement.innerHTML = filters.map((filter) => `
    <button class="button ${String(filter.id) === String(currentFilter) ? 'button-primary' : 'button-ghost'}" type="button" data-category-filter="${escapeHtml(filter.id)}" aria-pressed="${String(filter.id) === String(currentFilter)}">${escapeHtml(filter.name)}</button>
  `).join('');

  filtersElement.querySelectorAll('[data-category-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      currentFilter = button.dataset.categoryFilter || 'all';
      renderFilters();
      renderCatalogue();
    });
  });
}

function renderCatalogue() {
  if (!catalogueElement) return;

  const products = currentFilter === 'all'
    ? state.products
    : state.products.filter((product) => Number(product.category_id) === Number(currentFilter));

  if (!products.length) {
    catalogueElement.innerHTML = '<p class="muted">No active products are available in this selection yet.</p>';
    return;
  }

  catalogueElement.innerHTML = `<div class="product-grid">${products.map(renderProductCard).join('')}</div>`;
}

async function loadCategoryPage() {
  const categoryId = getIdFromUrl();
  if (!categoryId) {
    if (titleElement) titleElement.textContent = 'Category not found';
    if (statusElement) statusElement.textContent = 'No main category was selected.';
    return;
  }

  try {
    const [categoryResponse, productResponse] = await Promise.all([
      fetch('/api/categories', { headers: { Accept: 'application/json' }, cache: 'no-store' }),
      fetch('/api/products?limit=100', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    ]);

    const categoryPayload = await categoryResponse.json().catch(() => ({}));
    const productPayload = await productResponse.json().catch(() => ({}));
    if (!categoryResponse.ok || !categoryPayload.success) throw new Error(categoryPayload.error || 'Unable to load categories.');
    if (!productResponse.ok || !productPayload.success) throw new Error(productPayload.error || 'Unable to load products.');

    const categories = Array.isArray(categoryPayload.data) ? categoryPayload.data : [];
    const products = Array.isArray(productPayload.data?.products)
      ? productPayload.data.products
      : Array.isArray(productPayload.data)
        ? productPayload.data
        : [];

    const mainCategory = categories.find((category) =>
      Number(category.id) === Number(categoryId) &&
      Number(category.is_enabled) === 1 &&
      Number(category.is_main_category) === 1
    );

    if (!mainCategory) throw new Error('This main category is not available.');

    const subcategories = categories
      .filter((category) =>
        Number(category.is_enabled) === 1 &&
        Number(category.parent_id) === Number(mainCategory.id) &&
        Number(category.is_main_category) !== 1
      )
      .sort(sortByStoreOrder);

    const subcategoryIds = new Set(subcategories.map((subcategory) => Number(subcategory.id)));
    const activeProducts = products
      .filter((product) => String(product.status || 'active').toLowerCase() === 'active' && subcategoryIds.has(Number(product.category_id)));

    state = { mainCategory, subcategories, products: activeProducts };
    document.title = `${mainCategory.name} | Clothing Store`;
    document.querySelector('[data-category-meta-description]')?.setAttribute('content', `Shop ${mainCategory.name} and browse its subcategories.`);
    if (titleElement) titleElement.textContent = mainCategory.name;
    if (introElement) introElement.textContent = `Browse all ${mainCategory.name} pieces or filter by subcategory.`;
    if (statusElement) statusElement.textContent = '';

    renderFilters();
    renderCatalogue();
  } catch (error) {
    if (titleElement) titleElement.textContent = 'Category unavailable';
    if (statusElement) statusElement.textContent = error?.message || 'Unable to load this category.';
    if (catalogueElement) catalogueElement.innerHTML = '';
  }
}

loadCategoryPage();
