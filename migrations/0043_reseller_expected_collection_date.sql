-- Expected customer collection date for reseller sales-register reminders and follow-up.
ALTER TABLE reseller_orders ADD COLUMN expected_payment_date TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_reseller_orders_expected_payment_date
  ON reseller_orders (reseller_id, expected_payment_date, payment_status);
