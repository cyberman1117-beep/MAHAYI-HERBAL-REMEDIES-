-- Shipping methods and admin-configured checkout options.
CREATE TABLE IF NOT EXISTS shipping_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('local','paxi','courier_guy')),
  mode TEXT NOT NULL CHECK (mode IN ('manual','api')),
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipping_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipping_method_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
  requires_landmark INTEGER NOT NULL DEFAULT 0 CHECK (requires_landmark IN (0,1)),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shipping_methods_enabled_order
  ON shipping_methods (is_enabled, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_shipping_options_method_enabled_order
  ON shipping_options (shipping_method_id, is_enabled, sort_order, id);

INSERT INTO shipping_methods (name, provider_type, mode, is_enabled, sort_order)
SELECT 'Local delivery', 'local', 'manual', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE provider_type = 'local' AND mode = 'manual');

INSERT INTO shipping_methods (name, provider_type, mode, is_enabled, sort_order)
SELECT 'PAXI — Manual rates', 'paxi', 'manual', 1, 2
WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE provider_type = 'paxi' AND mode = 'manual');

INSERT INTO shipping_methods (name, provider_type, mode, is_enabled, sort_order)
SELECT 'The Courier Guy — API', 'courier_guy', 'api', 0, 3
WHERE NOT EXISTS (SELECT 1 FROM shipping_methods WHERE provider_type = 'courier_guy' AND mode = 'api');
