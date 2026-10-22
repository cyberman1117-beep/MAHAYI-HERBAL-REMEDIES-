-- Record each payment received by a reseller from their own customer.
-- This is intentionally separate from reseller_company_ledger, which tracks money owed to M.H.R.
CREATE TABLE IF NOT EXISTS reseller_customer_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reseller_order_id INTEGER NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  payment_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_method TEXT NOT NULL DEFAULT '',
  payment_reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reseller_order_id) REFERENCES reseller_orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reseller_customer_payments_order_date
  ON reseller_customer_payments (reseller_order_id, payment_date, id);
