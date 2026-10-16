-- Optional per-product shipping data. Kept separate from the catalogue products table
-- so existing product loading remains independent and backward-compatible.
CREATE TABLE IF NOT EXISTS product_shipping (
  product_id INTEGER PRIMARY KEY,
  shipping_type_id INTEGER,
  is_prepackaged INTEGER NOT NULL DEFAULT 0 CHECK (is_prepackaged IN (0,1)),
  shipping_weight_kg REAL,
  shipping_length_cm REAL,
  shipping_width_cm REAL,
  shipping_height_cm REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (shipping_type_id) REFERENCES shipping_types(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_product_shipping_type
  ON product_shipping (shipping_type_id);
