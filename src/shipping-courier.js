const API_URL = "https://api.portal.thecourierguy.co.za/rates";

function clean(value) {
  return String(value ?? "").trim();
}

function requiredNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(label + " must be greater than zero.");
  return number;
}

function addressFromCustomer(customer = {}) {
  const country = clean(customer.country || "South Africa");
  const code = clean(customer.postal_code);
  const city = clean(customer.city);
  const province = clean(customer.province);
  const street = clean(customer.address);
  if (!code || !city || !province || !street) {
    throw new Error("A complete delivery address is required before courier rates can be calculated.");
  }
  return {
    type: "residential",
    street_address: street,
    local_area: city,
    city,
    zone: province,
    country: country.length === 2 ? country.toUpperCase() : "ZA",
    code
  };
}

function collectionAddress(env) {
  if (!env.COURIER_GUY_COLLECTION_ADDRESS) {
    throw new Error("Courier Guy collection address is not configured.");
  }
  let address;
  try {
    address = JSON.parse(env.COURIER_GUY_COLLECTION_ADDRESS);
  } catch {
    throw new Error("Courier Guy collection address configuration is invalid.");
  }
  if (!address || !clean(address.street_address) || !clean(address.city) || !clean(address.code)) {
    throw new Error("Courier Guy collection address configuration is incomplete.");
  }
  return {
    type: clean(address.type || "business"),
    company: clean(address.company || ""),
    street_address: clean(address.street_address),
    local_area: clean(address.local_area || address.city),
    city: clean(address.city),
    zone: clean(address.zone || address.province),
    country: clean(address.country || "ZA").toUpperCase(),
    code: clean(address.code)
  };
}

function parcelPayload(parcel) {
  const length = requiredNumber(parcel?.length_cm, "Parcel length");
  const width = requiredNumber(parcel?.width_cm, "Parcel width");
  const height = requiredNumber(parcel?.height_cm, "Parcel height");
  const weight = requiredNumber(parcel?.weight_kg, "Parcel weight");
  return {
    parcel_description: clean((parcel?.items || []).map((item) => item.product_name).filter(Boolean).join(", ")),
    submitted_length_cm: length,
    submitted_width_cm: width,
    submitted_height_cm: height,
    submitted_weight_kg: weight,
    packaging: clean(parcel?.packaging_type || parcel?.packaging_name || "")
  };
}

function extractRates(payload) {
  const rates = Array.isArray(payload?.result?.rates) ? payload.result.rates
    : Array.isArray(payload?.rates) ? payload.rates
    : [];
  return rates.map((rate, index) => {
    const service = rate?.service_level || rate?.service || {};
    const price = Number(rate?.rate ?? rate?.price ?? rate?.amount);
    const code = clean(service?.code || rate?.service_level_code || rate?.code || "rate-" + index);
    const name = clean(service?.name || rate?.service_name || rate?.name || code);
    const description = clean(service?.description || rate?.description || "");
    return {
      code,
      name,
      description,
      price,
      currency: clean(rate?.currency || "ZAR").toUpperCase(),
      delivery_date_from: service?.delivery_date_from || rate?.delivery_date_from || null,
      delivery_date_to: service?.delivery_date_to || rate?.delivery_date_to || null
    };
  }).filter((rate) => rate.code && Number.isFinite(rate.price) && rate.price >= 0);
}

export async function getCourierGuyRates(env, { parcels, customer, declaredValue = 0 }) {
  const apiKey = clean(env.COURIER_GUY_API_KEY);
  const providerId = clean(env.COURIER_GUY_PROVIDER_ID);

  if (!apiKey) {
    throw new Error("Courier Guy API credentials are not configured yet.");
  }
  if (!providerId) {
    throw new Error("Courier Guy provider/account ID is not configured yet.");
  }
  if (!Array.isArray(parcels) || !parcels.length) {
    throw new Error("No final parcels were produced by the packing engine.");
  }

  const body = {
    provider_id: providerId,
    collection_address: collectionAddress(env),
    delivery_address: addressFromCustomer(customer),
    parcels: parcels.map(parcelPayload)
  };

  const value = Number(declaredValue);
  if (Number.isFinite(value) && value > 0) body.declared_value = value;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(body)
  });

  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const message = clean(
      payload?.message ||
      payload?.error?.message ||
      payload?.error ||
      payload?.detail ||
      (Array.isArray(payload?.errors) ? payload.errors.map((item) => clean(item?.message || item?.detail || item)).filter(Boolean).join("; ") : "")
    );
    const raw = clean(responseText).slice(0, 500);
    const diagnostic = "Courier Guy authentication diagnostic: API key is present (" + apiKey.length + " characters), provider ID is \"" + providerId + "\". HTTP " + response.status + ". ";
    const fallback = "Courier Guy rate request failed (HTTP " + response.status + ").";
    throw new Error(diagnostic + (message || raw || fallback));
  }

  const rates = extractRates(payload);
  if (!rates.length) {
    throw new Error("Courier Guy returned no usable shipping rates for this parcel and delivery address.");
  }

  return {
    provider: "courier_guy",
    parcels: body.parcels,
    rates
  };
}
