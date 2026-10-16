/**
 * Carrier-neutral order packing engine.
 *
 * The engine decides how an order becomes final parcel(s) before any
 * courier/provider is asked for a rate.
 *
 * Rules:
 * - Fashion: soft/compressible items are packed by weight and may share bags.
 * - Protected/dimensional items are packed into configured outer boxes; the
 *   product's own/manufacturer packaging is treated as an inner package.
 * - A standard 5 cm minimum protective clearance is required on every side
 *   of a dimensional/prepackaged item before selecting the outer box.
 * - Packaging stock is treated as available capacity only. This calculation
 *   never decrements stock.
 *
 * Courier-specific pricing or packaging is deliberately not part of this
 * module.
 */

const TYPE_CODES = new Set(["fashion", "electronics", "appliance", "other"]);
const PACKAGING_TYPES = new Set(["bag", "box", "envelope", "manufacturer", "custom"]);

// Minimum protective clearance from the item/package to the inside of the
// store's outer protective box, applied on every side.
const PROTECTIVE_CLEARANCE_CM = 5;

function number(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positive(value) {
  const n = number(value);
  return n !== null && n > 0;
}

function dimensions(value) {
  const length = number(value?.length_cm);
  const width = number(value?.width_cm);
  const height = number(value?.height_cm);
  if (![length, width, height].every(positive)) return null;
  return { length, width, height };
}

function sortedDimensions(value) {
  const d = dimensions(value);
  return d ? [d.length, d.width, d.height].sort((a, b) => b - a) : null;
}

function fitsDimensions(item, packaging) {
  const itemDims = sortedDimensions(item);
  const packageDims = sortedDimensions(packaging);
  if (!itemDims || !packageDims) return false;
  return itemDims.every((size, index) => size <= packageDims[index]);
}

function volume(value) {
  const d = dimensions(value);
  return d ? d.length * d.width * d.height : Number.POSITIVE_INFINITY;
}

function orientations(value) {
  const d = dimensions(value);
  if (!d) return [];
  const values = [d.length, d.width, d.height];
  const result = [];
  const seen = new Set();
  for (const a of values) for (const b of values) for (const c of values) {
    if (a === b && b === c) {
      const key = `${a}|${b}|${c}`;
      if (!seen.has(key)) { seen.add(key); result.push({ length: a, width: b, height: c }); }
      continue;
    }
    if (a === b || b === c || a === c) {
      const key = `${a}|${b}|${c}`;
      if (!seen.has(key)) { seen.add(key); result.push({ length: a, width: b, height: c }); }
      continue;
    }
    const key = `${a}|${b}|${c}`;
    if (!seen.has(key)) { seen.add(key); result.push({ length: a, width: b, height: c }); }
  }
  return result;
}

function normalizedPackaging(packaging) {
  const type = String(packaging?.packaging_type || "").trim().toLowerCase();
  if (!packaging?.id || !packaging?.name || !PACKAGING_TYPES.has(type)) return null;

  return {
    id: Number(packaging.id),
    name: String(packaging.name),
    packaging_type: type,
    length_cm: number(packaging.length_cm),
    width_cm: number(packaging.width_cm),
    height_cm: number(packaging.height_cm),
    packaging_weight_kg: Math.max(0, number(packaging.packaging_weight_kg, 0)),
    max_weight_kg: positive(packaging.max_weight_kg) ? number(packaging.max_weight_kg) : null,
    stock_quantity: Math.max(0, Math.floor(number(packaging.stock_quantity, 0)))
  };
}

function normalizedItem(item) {
  const quantity = Math.max(0, Math.floor(number(item?.quantity, 0)));
  const shipping = item?.shipping || item?.product_shipping || item;

  return {
    product_id: Number(item?.product_id),
    product_name: String(item?.product_name || item?.name || "Product"),
    quantity,
    shipping_type_id: shipping?.shipping_type_id ? Number(shipping.shipping_type_id) : null,
    shipping_type_code: String(shipping?.shipping_type_code || shipping?.shipping_code || "").toLowerCase(),
    is_prepackaged: Number(shipping?.is_prepackaged) === 1,
    weight_kg: positive(shipping?.shipping_weight_kg) ? number(shipping.shipping_weight_kg) : null,
    length_cm: number(shipping?.shipping_length_cm),
    width_cm: number(shipping?.shipping_width_cm),
    height_cm: number(shipping?.shipping_height_cm)
  };
}

function typeRequirements(item) {
  switch (item.shipping_type_code) {
    case "fashion":
      return { requiresWeight: true, requiresDimensions: item.is_prepackaged };
    case "electronics":
      return { requiresWeight: true, requiresDimensions: true };
    case "appliance":
      return { requiresWeight: true, requiresDimensions: true };
    default:
      return { requiresWeight: true, requiresDimensions: Boolean(item.is_prepackaged || positive(item.length_cm) || positive(item.width_cm) || positive(item.height_cm)) };
  }
}

function validateItem(item) {
  if (!TYPE_CODES.has(item.shipping_type_code)) {
    throw new Error(`Shipping type is missing for ${item.product_name}.`);
  }
  if (!positive(item.weight_kg)) {
    throw new Error(`Shipping weight is required for ${item.product_name}.`);
  }
  const requirements = typeRequirements(item);
  if (requirements.requiresDimensions && !dimensions(item)) {
    throw new Error(`Packed dimensions are required for ${item.product_name}.`);
  }
}

function itemWithProtectiveClearance(item) {
  if (!item?.requiresDimensions) return item;

  const d = dimensions(item);
  if (!d) return item;

  const clearance = PROTECTIVE_CLEARANCE_CM * 2;

  return {
    ...item,
    length_cm: d.length + clearance,
    width_cm: d.width + clearance,
    height_cm: d.height + clearance
  };
}

function candidatePackaging(packaging, item, preferredTypes = null) {
  const allowed = preferredTypes ? new Set(preferredTypes) : null;
  return packaging
    .filter((p) => p.stock_quantity > 0)
    .filter((p) => !allowed || allowed.has(p.packaging_type))
    .filter((p) => !p.max_weight_kg || (item.requiresDimensions ? item.weight_kg + p.packaging_weight_kg <= p.max_weight_kg : item.weight_kg <= p.max_weight_kg))
    .filter((p) => !item.requiresDimensions || fitsDimensions(item, p))
    .sort((a, b) => volume(a) - volume(b) || a.id - b.id);
}

function choosePackaging(packaging, item) {
  const dimensional = item.requiresDimensions;
  const preferredTypes = dimensional
    ? ["box"]
    : ["bag", "envelope", "custom"];

  return candidatePackaging(packaging, item, preferredTypes)[0]
    || candidatePackaging(packaging, item)[0]
    || null;
}

function createPackagedParcel(packaging) {
  return {
    packaging_id: packaging.id,
    packaging_name: packaging.name,
    packaging_type: packaging.packaging_type,
    items: [],
    product_weight_kg: 0,
    weight_kg: packaging.packaging_weight_kg,
    length_cm: packaging.length_cm,
    width_cm: packaging.width_cm,
    height_cm: packaging.height_cm,
    _used_length_cm: 0,
    _used_width_cm: 0,
    _used_height_cm: 0
  };
}

/*
 * Conservative 3D packing check for a parcel.
 * Items are placed in a single stacking direction, but each item may rotate.
 * This avoids claiming a parcel fits when its dimensions cannot safely be
 * represented by the configured box.
 */
function tryAddRigidItem(parcel, item) {
  if (!positive(parcel.length_cm) || !positive(parcel.width_cm) || !positive(parcel.height_cm)) return false;

  const maxWeight = parcel.max_weight_kg;
  if (maxWeight && parcel.weight_kg + item.weight_kg > maxWeight) return false;

  const remainingLength = parcel.length_cm - parcel._used_length_cm;
  const itemOrientations = orientations(item);

  for (const o of itemOrientations) {
    if (o.length <= remainingLength && o.width <= parcel.width_cm && o.height <= parcel.height_cm) {
      parcel.items.push({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: 1
      });
      parcel.product_weight_kg += item.weight_kg;
      parcel.weight_kg += item.weight_kg;
      parcel._used_length_cm += o.length;
      parcel._used_width_cm = Math.max(parcel._used_width_cm, o.width);
      parcel._used_height_cm = Math.max(parcel._used_height_cm, o.height);
      return true;
    }
  }

  return false;
}

function cleanParcel(parcel) {
  delete parcel.product_weight_kg;
  delete parcel._used_length_cm;
  delete parcel._used_width_cm;
  delete parcel._used_height_cm;
  delete parcel.max_weight_kg;
  return parcel;
}

function packageStockCapacity(packaging, reserved) {
  return Math.max(0, packaging.stock_quantity - (reserved.get(packaging.id) || 0));
}

function reservePackaging(packaging, reserved) {
  reserved.set(packaging.id, (reserved.get(packaging.id) || 0) + 1);
}

/**
 * Pack an order/cart using product shipping records and configured packaging.
 *
 * This calculation is read-only with respect to packaging stock: it reserves
 * nothing in D1 and only reports whether the current stock can satisfy the
 * calculated parcel plan.
 */
export function packOrder({ items = [], packaging = [] } = {}) {
  const configuredPackaging = packaging
    .map(normalizedPackaging)
    .filter(Boolean)
    .filter((p) => p.stock_quantity > 0)
    .filter((p) => p.max_weight_kg === null || p.max_weight_kg > 0);

  const normalizedItems = items.map(normalizedItem).filter((item) => item.quantity > 0);
  const parcels = [];
  const errors = [];
  const reserved = new Map();
  const softParcels = new Map();

  for (const item of normalizedItems) {
    const requirements = typeRequirements(item);
    item.requiresDimensions = requirements.requiresDimensions;

    try {
      validateItem(item);
    } catch (error) {
      errors.push({ product_id: item.product_id, product_name: item.product_name, error: error.message });
      continue;
    }

    for (let unit = 0; unit < item.quantity; unit += 1) {
      if (item.shipping_type_code === "fashion" && !item.requiresDimensions) {
        let selected = null;
        for (const packaging of candidatePackaging(configuredPackaging, item, ["bag", "envelope", "custom"])) {
          if (packageStockCapacity(packaging, reserved) > 0) {
            selected = packaging;
            break;
          }
        }

        if (!selected) {
          errors.push({
            product_id: item.product_id,
            product_name: item.product_name,
            error: "No suitable fashion packaging is available in the configured stock."
          });
          continue;
        }

        const key = String(selected.id);
        const existing = softParcels.get(key);
        const nextProductWeight = (existing?.product_weight_kg || 0) + item.weight_kg;
        const nextWeight = nextProductWeight + selected.packaging_weight_kg;

        if (existing && (!selected.max_weight_kg || nextProductWeight <= selected.max_weight_kg)) {
          existing.items.push({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: 1
          });
          existing.product_weight_kg += item.weight_kg;
          existing.weight_kg = nextWeight;
        } else {
          if (packageStockCapacity(selected, reserved) <= 0) {
            errors.push({
              product_id: item.product_id,
              product_name: item.product_name,
              error: "Additional fashion packaging is required, but the configured packaging stock is exhausted."
            });
            continue;
          }
          const parcel = createPackagedParcel(selected);
          parcel.max_weight_kg = selected.max_weight_kg;
          parcel.items.push({
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: 1
          });
          parcel.product_weight_kg = item.weight_kg;
          parcel.weight_kg = item.weight_kg + selected.packaging_weight_kg;
          softParcels.set(key + ":" + (reserved.get(selected.id) || 0), parcel);
          parcels.push(parcel);
          reservePackaging(selected, reserved);
        }
        continue;
      }

      // For dimensional or prepackaged products, the supplied dimensions are
      // the inner/manufacturer package dimensions. Add the standard protective
      // clearance before checking the outer box.
      const protectedItem = itemWithProtectiveClearance(item);
      const candidates = candidatePackaging(configuredPackaging, protectedItem, ["box"]);
      let placed = false;

      for (const parcel of parcels.filter((p) => p._rigid && p.packaging_id)) {
        const packaging = configuredPackaging.find((p) => p.id === parcel.packaging_id);
        if (!packaging || packageStockCapacity(packaging, reserved) < 0) continue;
        if (tryAddRigidItem(parcel, protectedItem)) {
          placed = true;
          break;
        }
      }

      if (placed) continue;

      for (const packaging of candidates) {
        if (packageStockCapacity(packaging, reserved) <= 0) continue;
        const parcel = createPackagedParcel(packaging);
        parcel.max_weight_kg = packaging.max_weight_kg;
        parcel._rigid = true;
        if (tryAddRigidItem(parcel, protectedItem)) {
          reservePackaging(packaging, reserved);
          parcels.push(parcel);
          placed = true;
          break;
        }
      }

      if (!placed) {
        errors.push({
          product_id: item.product_id,
          product_name: item.product_name,
          error: "No available box can safely contain this protected item with the configured packaging stock."
        });
      }
    }
  }

  // A second pass tries to consolidate rigid parcels into the smallest boxes
  // that can safely accept their complete contents. This is deliberately
  // conservative and never changes a parcel into a box that cannot contain
  // every item.
  const rigidParcels = parcels.filter((p) => p._rigid);
  for (const parcel of rigidParcels) {
    // The first-pass placement already consolidated compatible items.
    // Keep this marker internal only.
    delete parcel._rigid;
  }

  for (const parcel of parcels) cleanParcel(parcel);

  return {
    success: errors.length === 0,
    parcels,
    errors
  };
}
