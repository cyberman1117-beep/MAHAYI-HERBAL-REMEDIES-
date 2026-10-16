-- Carrier-neutral shipping foundation. Intentionally independent of products.
-- Product linkage and parcel calculation are added in later isolated changes.
CREATE TABLE IF NOT EXISTS shipping_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  requires_weight INTEGER NOT NULL DEFAULT 1 CHECK (requires_weight IN (0,1)),
  requires_dimensions INTEGER NOT NULL DEFAULT 0 CHECK (requires_dimensions IN (0,1)),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS shipping_packaging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  packaging_type TEXT NOT NULL DEFAULT 'box' CHECK (packaging_type IN ('bag','box','envelope','manufacturer','custom')),
  length_cm REAL,
  width_cm REAL,
  height_cm REAL,
  packaging_weight_kg REAL NOT NULL DEFAULT 0 CHECK (packaging_weight_kg >= 0),
  max_weight_kg REAL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shipping_types_enabled_order ON shipping_types (is_enabled, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_shipping_packaging_enabled_order ON shipping_packaging (is_enabled, sort_order, id);
INSERT OR IGNORE INTO shipping_types (name, code, description, requires_weight, requires_dimensions, is_enabled, sort_order) VALUES
('Fashion','fashion','Clothing, shoes, bags and other generally compressible products.',1,0,1,1),
('Electronics','electronics','Electronics and other rigid or protected products.',1,1,1,2),
('Appliance','appliance','Appliances shipped in their manufacturer or final packaging.',1,1,1,3),
('Other','other','General shipping classification for products that do not fit another type.',1,1,1,4);