-- Seed removable test data for the Custom Courier admin/checkout flow.
-- This is database configuration, not application hardcoding. It can be deleted
-- normally from Admin -> Shipping -> Custom Couriers after testing.

INSERT INTO shipping_methods
  (name, provider_type, mode, is_enabled, sort_order)
VALUES
  ('Test Fashion Courier', 'custom', 'manual', 1, 9000);

INSERT INTO custom_couriers
  (shipping_method_id, description, calculation_mode)
SELECT
  id,
  'Temporary test courier for weight, parcel type and dimension-based pricing.',
  'weight'
FROM shipping_methods
WHERE name = 'Test Fashion Courier'
  AND provider_type = 'custom'
  AND mode = 'manual'
ORDER BY id DESC
LIMIT 1;

INSERT INTO custom_courier_rates
  (custom_courier_id, service_name, area_name, packaging_type,
   min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm,
   price, estimated_delivery, is_enabled, sort_order)
SELECT
  id, 'Economy', '', 'bag',
  0, 5, NULL, NULL, NULL,
  60, '3–7 business days', 1, 0
FROM custom_couriers
WHERE shipping_method_id = (
  SELECT id
  FROM shipping_methods
  WHERE name = 'Test Fashion Courier'
    AND provider_type = 'custom'
    AND mode = 'manual'
  ORDER BY id DESC
  LIMIT 1
)
LIMIT 1;

INSERT INTO custom_courier_rates
  (custom_courier_id, service_name, area_name, packaging_type,
   min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm,
   price, estimated_delivery, is_enabled, sort_order)
SELECT
  id, 'Standard', '', 'bag',
  5.001, 10, NULL, NULL, NULL,
  80, '3–7 business days', 1, 1
FROM custom_couriers
WHERE shipping_method_id = (
  SELECT id
  FROM shipping_methods
  WHERE name = 'Test Fashion Courier'
    AND provider_type = 'custom'
    AND mode = 'manual'
  ORDER BY id DESC
  LIMIT 1
)
LIMIT 1;

INSERT INTO custom_courier_rates
  (custom_courier_id, service_name, area_name, packaging_type,
   min_weight_kg, max_weight_kg, max_length_cm, max_width_cm, max_height_cm,
   price, estimated_delivery, is_enabled, sort_order)
SELECT
  id, 'Box Economy', '', 'box',
  0, 5, 40, 30, 20,
  75, '3–7 business days', 1, 2
FROM custom_couriers
WHERE shipping_method_id = (
  SELECT id
  FROM shipping_methods
  WHERE name = 'Test Fashion Courier'
    AND provider_type = 'custom'
    AND mode = 'manual'
  ORDER BY id DESC
  LIMIT 1
)
LIMIT 1;
