export async function loadProductShipping(apiFetch, productId) {
  const url = '/api/product-shipping' + (productId ? '?id=' + encodeURIComponent(productId) : '');
  let lastError = null;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const payload = await apiFetch(url);
      return payload.data || { shipping: null, shipping_types: [] };
    } catch (error) {
      lastError = error;
      if (!String(error?.message || '').toLowerCase().includes('authentication is still loading')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError || new Error('Authentication required. Please sign in again.');
}

export function createProductShippingController({ form, apiFetch }) {
  const section = document.createElement('fieldset');
  section.className = 'settings-group';
  section.innerHTML = `
    <legend>Shipping</legend>
    <p class="muted">Shipping data is separate from catalogue details. It tells the packing engine how this product should be prepared before the final parcel is sent to the delivery provider.</p>
    <div class="settings-fields settings-fields-two">
      <label class="field"><span>Shipping type</span><select name="shipping_type_id"><option value="">Select shipping type</option></select></label>
      <label class="field"><span><input name="is_prepackaged" type="checkbox"> Already packaged / boxed</span><small class="muted">Use this for items such as shoes or electronics that already have fixed packaging.</small></label>
      <label class="field"><span>Shipping weight (kg)</span><input name="shipping_weight_kg" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0.000"></label>
      <div class="field field-wide" data-shipping-dimensions hidden>
        <span>Packed dimensions (cm)</span>
        <div class="settings-fields settings-fields-two">
          <label class="field"><span>Length</span><input name="shipping_length_cm" type="number" min="0" step="0.1" inputmode="decimal"></label>
          <label class="field"><span>Width</span><input name="shipping_width_cm" type="number" min="0" step="0.1" inputmode="decimal"></label>
          <label class="field"><span>Height</span><input name="shipping_height_cm" type="number" min="0" step="0.1" inputmode="decimal"></label>
        </div>
      </div>
    </div>
    <p class="muted" data-shipping-help>Choose a shipping type to see what information is required.</p>
  `;
  const attributesFieldset = form.querySelector('[data-product-attributes]')?.closest('.settings-group');
  if (attributesFieldset) attributesFieldset.before(section); else form.append(section);

  const typeSelect = section.querySelector('[name="shipping_type_id"]');
  const prepackaged = section.querySelector('[name="is_prepackaged"]');
  const weight = section.querySelector('[name="shipping_weight_kg"]');
  const dimensions = section.querySelector('[data-shipping-dimensions]');
  const length = section.querySelector('[name="shipping_length_cm"]');
  const width = section.querySelector('[name="shipping_width_cm"]');
  const height = section.querySelector('[name="shipping_height_cm"]');
  const help = section.querySelector('[data-shipping-help]');
  let types = [];

  function updateVisibility() {
    const type = types.find((item) => String(item.id) === String(typeSelect.value));
    const requiresWeight = type ? Number(type.requires_weight) === 1 : false;
    const requiresDimensions = type ? Number(type.requires_dimensions) === 1 : false;
    const showDimensions = requiresDimensions || prepackaged.checked;
    dimensions.hidden = !showDimensions;
    weight.required = requiresWeight;
    length.required = showDimensions;
    width.required = showDimensions;
    height.required = showDimensions;
    if (!type) help.textContent = 'Choose a shipping type to see what information is required.';
    else if (type.code === 'fashion' && !prepackaged.checked) help.textContent = 'Fashion products can be packed together by weight. Dimensions are only needed when the item already has fixed packaging.';
    else if (type.code === 'electronics') help.textContent = 'Electronics use weight and packed dimensions so the packing engine can determine which packaging can contain the item.';
    else if (type.code === 'appliance') help.textContent = 'Appliances use their packed weight and dimensions, normally from the manufacturer or final box.';
    else help.textContent = 'The packing engine will use the configured requirements for this shipping type.';
  }

  typeSelect.addEventListener('change', updateVisibility);
  prepackaged.addEventListener('change', updateVisibility);

  async function load(productId, initial = null) {
    const payload = await loadProductShipping(apiFetch, productId);
    types = Array.isArray(payload.shipping_types) ? payload.shipping_types : [];
    typeSelect.innerHTML = '<option value="">Select shipping type</option>';
    for (const type of types) {
      const option = document.createElement('option');
      option.value = type.id;
      option.textContent = type.name;
      typeSelect.append(option);
    }
    const data = initial || payload.shipping || {};
    typeSelect.value = data.shipping_type_id || '';
    prepackaged.checked = Number(data.is_prepackaged) === 1;
    weight.value = data.shipping_weight_kg ?? '';
    length.value = data.shipping_length_cm ?? '';
    width.value = data.shipping_width_cm ?? '';
    height.value = data.shipping_height_cm ?? '';
    updateVisibility();
  }

  async function save(productId) {
    if (!typeSelect.value) return;
    await apiFetch('/api/product-shipping?id=' + encodeURIComponent(productId), {
      method: 'PUT',
      body: JSON.stringify({
        shipping_type_id: typeSelect.value,
        is_prepackaged: prepackaged.checked,
        shipping_weight_kg: weight.value,
        shipping_length_cm: length.value,
        shipping_width_cm: width.value,
        shipping_height_cm: height.value
      })
    });
  }

  return { section, load, save };
}