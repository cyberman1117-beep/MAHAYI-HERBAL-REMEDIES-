-- Reseller stock purchases, allocated inventory, and restricted distributor privileges.
ALTER TABLE resellers ADD COLUMN pay_later_enabled INTEGER NOT NULL DEFAULT 0 CHECK (pay_later_enabled IN (0, 1));
ALTER TABLE resellers ADD COLUMN pay_later_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN pay_later_approved_at TEXT;

CREATE TABLE IF NOT EXISTS reseller_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reseller_id INTEGER NOT NULL,
  reseller_product_id INTEGER NOT NULL,
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (reseller_id, reseller_product_id),
  FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE RESTRICT,
  FOREIGN KEY (reseller_product_id) REFERENCES reseller_products(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reseller_stock_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  reseller_id INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  total_amount REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded')),
  order_status TEXT NOT NULL DEFAULT 'submitted' CHECK (order_status IN ('submitted', 'confirmed', 'processing', 'ready', 'fulfilled', 'cancelled')),
  payment_reference TEXT NOT NULL DEFAULT '',
  reseller_notes TEXT NOT NULL DEFAULT '',
  company_notes TEXT NOT NULL DEFAULT '',
  inventory_applied_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS reseller_stock_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reseller_stock_order_id INTEGER NOT NULL,
  reseller_product_id INTEGER,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  wholesale_unit_price REAL NOT NULL CHECK (wholesale_unit_price >= 0),
  customer_unit_price REAL NOT NULL CHECK (customer_unit_price >= 0),
  reseller_unit_share REAL NOT NULL CHECK (reseller_unit_share >= 0),
  line_total REAL NOT NULL CHECK (line_total >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reseller_stock_order_id) REFERENCES reseller_stock_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (reseller_product_id) REFERENCES reseller_products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reseller_inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reseller_id INTEGER NOT NULL,
  reseller_product_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('stock_purchase', 'adjustment', 'return', 'sale', 'pay_later_issue')),
  quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE RESTRICT,
  FOREIGN KEY (reseller_product_id) REFERENCES reseller_products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_reseller_inventory_reseller
  ON reseller_inventory (reseller_id, reseller_product_id);
CREATE INDEX IF NOT EXISTS idx_reseller_stock_orders_reseller_created
  ON reseller_stock_orders (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reseller_stock_orders_status_created
  ON reseller_stock_orders (order_status, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reseller_stock_items_order
  ON reseller_stock_order_items (reseller_stock_order_id, id);
CREATE INDEX IF NOT EXISTS idx_reseller_inventory_movements_reseller
  ON reseller_inventory_movements (reseller_id, created_at DESC);
