-- Individually track every reseller unit issued from a fulfilled stock order.
CREATE TABLE IF NOT EXISTS reseller_stock_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reseller_id INTEGER NOT NULL,
  stock_order_id INTEGER NOT NULL,
  stock_order_item_id INTEGER NOT NULL,
  package_id INTEGER NOT NULL,
  unit_number INTEGER NOT NULL,
  product_sku TEXT NOT NULL DEFAULT '',
  tracking_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','sold','returned','adjusted')),
  reseller_order_id INTEGER,
  reseller_note TEXT NOT NULL DEFAULT '',
  expected_payment_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(stock_order_item_id, unit_number),
  FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE RESTRICT,
  FOREIGN KEY (stock_order_id) REFERENCES reseller_stock_orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (stock_order_item_id) REFERENCES reseller_stock_order_items(id) ON DELETE RESTRICT,
  FOREIGN KEY (package_id) REFERENCES reseller_product_packages(id) ON DELETE RESTRICT,
  FOREIGN KEY (reseller_order_id) REFERENCES reseller_orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_reseller_stock_units_register
  ON reseller_stock_units(reseller_id, status, package_id, id);
CREATE INDEX IF NOT EXISTS idx_reseller_stock_units_sale
  ON reseller_stock_units(reseller_order_id, id);
