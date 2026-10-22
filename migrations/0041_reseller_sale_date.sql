-- The sale_date column is introduced with migration 0039 for fresh installs.
-- The first remote attempt added the column before the migration runner failed to record it.
-- Keep this migration idempotent for the existing production database.
UPDATE reseller_orders SET sale_date = created_at WHERE sale_date = '';
CREATE INDEX IF NOT EXISTS idx_reseller_orders_reseller_sale_date
  ON reseller_orders (reseller_id, sale_date, id);
