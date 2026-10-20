-- Support restricted distributor stock issues and company settlement ledger.
ALTER TABLE reseller_stock_orders ADD COLUMN fulfilment_mode TEXT NOT NULL DEFAULT 'upfront'
  CHECK (fulfilment_mode IN ('upfront', 'pay_later'));
ALTER TABLE reseller_inventory ADD COLUMN pay_later_quantity INTEGER NOT NULL DEFAULT 0
  CHECK (pay_later_quantity >= 0 AND pay_later_quantity <= quantity_available);

CREATE TABLE IF NOT EXISTS reseller_company_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reseller_id INTEGER NOT NULL,
  reseller_product_id INTEGER,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('stock_sold_on_credit', 'settlement', 'adjustment')),
  amount_debit REAL NOT NULL DEFAULT 0 CHECK (amount_debit >= 0),
  amount_credit REAL NOT NULL DEFAULT 0 CHECK (amount_credit >= 0),
  reference_type TEXT NOT NULL DEFAULT '',
  reference_id INTEGER,
  payment_reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((amount_debit > 0 AND amount_credit = 0) OR (amount_credit > 0 AND amount_debit = 0) OR (amount_debit = 0 AND amount_credit = 0)),
  FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE RESTRICT,
  FOREIGN KEY (reseller_product_id) REFERENCES reseller_products(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reseller_company_ledger_account
  ON reseller_company_ledger (reseller_id, created_at DESC, id DESC);
