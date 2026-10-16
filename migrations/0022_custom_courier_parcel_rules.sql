-- Add parcel type and dimension constraints to custom courier pricing rules.
ALTER TABLE custom_courier_rates ADD COLUMN packaging_type TEXT NOT NULL DEFAULT 'any'
  CHECK (packaging_type IN ('any', 'bag', 'box', 'envelope', 'manufacturer', 'custom'));
ALTER TABLE custom_courier_rates ADD COLUMN max_length_cm REAL;
ALTER TABLE custom_courier_rates ADD COLUMN max_width_cm REAL;
ALTER TABLE custom_courier_rates ADD COLUMN max_height_cm REAL;
CREATE INDEX IF NOT EXISTS idx_custom_courier_rates_match
  ON custom_courier_rates (custom_courier_id, is_enabled, packaging_type, sort_order, id);
