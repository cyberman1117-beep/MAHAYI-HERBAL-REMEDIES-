-- Add Bob Go as an optional API shipping provider.
-- Preserve all existing shipping methods and options unchanged.
-- Bob Go remains disabled until its API connection is configured.

PRAGMA defer_foreign_keys = ON;

BEGIN TRANSACTION;

CREATE TABLE shipping_methods_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (
    provider_type IN ('local', 'paxi', 'courier_guy', 'postnet', 'bobgo')
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
SELECT
  id, name, provider_type, mode, is_enabled, sort_order, created_at, updated_at
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
SELECT
  id, shipping_method_id, name, price, requires_landmark, is_enabled, sort_order, created_at, updated_at
FROM shipping_options;

DROP TABLE shipping_options;
DROP TABLE shipping_methods;

ALTER TABLE shipping_methods_new RENAME TO shipping_methods;
ALTER TABLE shipping_options_new RENAME TO shipping_options;

CREATE INDEX IF NOT EXISTS idx_shipping_methods_enabled_order
  ON shipping_methods (is_enabled, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_shipping_options_method_enabled_order
  ON shipping_options (shipping_method_id, is_enabled, sort_order, id);

INSERT INTO shipping_methods (
  name, provider_type, mode, is_enabled, sort_order
)
SELECT
  'Bob Go — API',
  'bobgo',
  'api',
  0,
  5
WHERE NOT EXISTS (
  SELECT 1 FROM shipping_methods WHERE provider_type = 'bobgo'
);

COMMIT;
