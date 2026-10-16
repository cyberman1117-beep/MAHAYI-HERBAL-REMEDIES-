-- Store orders created only from verified successful payment transactions.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  payment_transaction_id INTEGER NOT NULL UNIQUE,
  firebase_uid TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_full_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  shipping_address TEXT NOT NULL DEFAULT '',
  shipping_city TEXT NOT NULL DEFAULT '',
  shipping_province TEXT NOT NULL DEFAULT '',
  shipping_postal_code TEXT NOT NULL DEFAULT '',
  shipping_country TEXT NOT NULL DEFAULT 'South Africa',
  shipping_method_id INTEGER,
  shipping_method_name TEXT NOT NULL DEFAULT '',
  shipping_option_id INTEGER,
  shipping_option_name TEXT NOT NULL DEFAULT '',
  shipping_fee REAL NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid','pending','failed','cancelled')),
  order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending','processing','shipped','delivered','cancelled')),
  customer_notes TEXT NOT NULL DEFAULT '',
  delivery_landmark TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_transaction_id) REFERENCES payment_transactions(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  line_total REAL NOT NULL CHECK (line_total >= 0),
  currency TEXT NOT NULL DEFAULT 'ZAR',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON orders (firebase_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders (order_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items (order_id, id);
