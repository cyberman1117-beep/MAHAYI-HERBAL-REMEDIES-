-- Independent reseller programme foundation.
-- These tables are deliberately separate from the retail catalogue and retail orders.

CREATE TABLE IF NOT EXISTS reseller_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reseller_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  track_stock INTEGER NOT NULL DEFAULT 1 CHECK (track_stock IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES reseller_categories(id) ON DELETE SET NULL
);

-- One configurable customer price and profit split per reseller product.
-- Values are stored in the product currency; order items snapshot them at order time.
CREATE TABLE IF NOT EXISTS reseller_product_pricing (
  reseller_product_id INTEGER PRIMARY KEY,
  customer_price REAL NOT NULL CHECK (customer_price >= 0),
  reseller_share REAL NOT NULL CHECK (reseller_share >= 0),
  company_share REAL NOT NULL CHECK (company_share >= 0),
  minimum_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_order_quantity > 0),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ABS(customer_price - reseller_share - company_share) < 0.01),
  FOREIGN KEY (reseller_product_id) REFERENCES reseller_products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resellers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  notes TEXT NOT NULL DEFAULT '',
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resellers_status_created
  ON resellers (status, created_at DESC);

CREATE TABLE IF NOT EXISTS reseller_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  reseller_id INTEGER NOT NULL,
  customer_full_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_address TEXT NOT NULL DEFAULT '',
  customer_city TEXT NOT NULL DEFAULT '',
  customer_province TEXT NOT NULL DEFAULT '',
  customer_postal_code TEXT NOT NULL DEFAULT '',
  customer_country TEXT NOT NULL DEFAULT 'South Africa',
  currency TEXT NOT NULL DEFAULT 'ZAR',
  subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  reseller_earnings REAL NOT NULL DEFAULT 0 CHECK (reseller_earnings >= 0),
  company_earnings REAL NOT NULL DEFAULT 0 CHECK (company_earnings >= 0),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  order_status TEXT NOT NULL DEFAULT 'submitted' CHECK (order_status IN ('submitted', 'confirmed', 'processing', 'ready', 'fulfilled', 'cancelled')),
  customer_notes TEXT NOT NULL DEFAULT '',
  company_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reseller_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reseller_order_id INTEGER NOT NULL,
  reseller_product_id INTEGER,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  customer_unit_price REAL NOT NULL CHECK (customer_unit_price >= 0),
  reseller_unit_share REAL NOT NULL CHECK (reseller_unit_share >= 0),
  company_unit_share REAL NOT NULL CHECK (company_unit_share >= 0),
  line_total REAL NOT NULL CHECK (line_total >= 0),
  reseller_line_earnings REAL NOT NULL CHECK (reseller_line_earnings >= 0),
  company_line_earnings REAL NOT NULL CHECK (company_line_earnings >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ABS(customer_unit_price - reseller_unit_share - company_unit_share) < 0.01),
  FOREIGN KEY (reseller_order_id) REFERENCES reseller_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (reseller_product_id) REFERENCES reseller_products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reseller_products_status_order
  ON reseller_products (status, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_reseller_products_category_status
  ON reseller_products (category_id, status, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_reseller_order_pricing_enabled
  ON reseller_product_pricing (is_enabled, reseller_product_id);
CREATE INDEX IF NOT EXISTS idx_reseller_orders_reseller_created
  ON reseller_orders (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reseller_orders_status_created
  ON reseller_orders (order_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reseller_order_items_order
  ON reseller_order_items (reseller_order_id, id);
