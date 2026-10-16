-- Independent merchandising controls for products.
-- These tables intentionally do not modify category, shipping, checkout, or catalogue fields.

CREATE TABLE IF NOT EXISTS product_new_arrivals (
  product_id INTEGER PRIMARY KEY,
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
  duration_days INTEGER NOT NULL DEFAULT 7 CHECK (duration_days > 0),
  starts_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_new_arrivals_active
  ON product_new_arrivals (is_enabled, expires_at, product_id);

CREATE TABLE IF NOT EXISTS product_promotions (
  product_id INTEGER PRIMARY KEY,
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
  promotion_price REAL NOT NULL DEFAULT 0 CHECK (promotion_price >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_promotions_active
  ON product_promotions (is_enabled, product_id);
