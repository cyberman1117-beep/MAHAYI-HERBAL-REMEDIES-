-- Add configurable custom couriers without changing the packing engine.
-- Custom couriers use the existing shipping_methods layer and manual pricing rules.

PRAGMA defer_foreign_keys = ON;

BEGIN TRANSACTION;

CREATE TABLE shipping_methods_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (
    provider_type IN ('local', 'paxi', 'courier_guy', 'postnet', 'bobgo', 'custom')
  ),
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'api')),
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO shipping_methods_new (
  id, name, provider_type, mode, is_enabled, sort_order, created_at, updated_at
)
SELECT id, name, provider_type, mode, is_enabled, sort_order, created_at, updated_at
FROM shipping_methods;

CREATE TABLE shipping_options_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipping_method_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  requires_landmark INTEGER NOT NULL DEFAULT 0 CHECK (requires_landmark IN (0,1)),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods_new(id) ON DELETE CASCADE
);

INSERT INTO shipping_options_new (
  id, shipping_method_id, name, price, requires_landmark, is_enabled, sort_order, created_at, updated_at
)
SELECT id, shipping_method_id, name, price, requires_landmark, is_enabled, sort_order, created_at, updated_at
FROM shipping_options;

DROP TABLE shipping_options;
DROP TABLE shipping_methods;

ALTER TABLE shipping_methods_new RENAME TO shipping_methods;
ALTER TABLE shipping_options_new RENAME TO shipping_options;

CREATE INDEX IF NOT EXISTS idx_shipping_methods_enabled_order
  ON shipping_methods (is_enabled, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_shipping_options_method_enabled_order
  ON shipping_options (shipping_method_id, is_enabled, sort_order, id);

CREATE TABLE IF NOT EXISTS custom_couriers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipping_method_id INTEGER NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  calculation_mode TEXT NOT NULL DEFAULT 'weight'
    CHECK (calculation_mode IN ('fixed', 'weight', 'area', 'weight_area')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_courier_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  custom_courier_id INTEGER NOT NULL,
  service_name TEXT NOT NULL,
  area_name TEXT NOT NULL DEFAULT '',
  min_weight_kg REAL,
  max_weight_kg REAL,
  price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  estimated_delivery TEXT NOT NULL DEFAULT '',
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (custom_courier_id) REFERENCES custom_couriers(id) ON DELETE CASCADE,
  CHECK (min_weight_kg IS NULL OR min_weight_kg >= 0),
  CHECK (max_weight_kg IS NULL OR max_weight_kg >= 0),
  CHECK (max_weight_kg IS NULL OR min_weight_kg IS NULL OR max_weight_kg > min_weight_kg)
);

CREATE INDEX IF NOT EXISTS idx_custom_couriers_method
  ON custom_couriers (shipping_method_id);

CREATE INDEX IF NOT EXISTS idx_custom_courier_rates_lookup
  ON custom_courier_rates (custom_courier_id, is_enabled, sort_order, id);

COMMIT;
