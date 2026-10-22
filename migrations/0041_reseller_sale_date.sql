-- Add an explicit date for when the reseller made the customer sale.
-- Existing records retain their original recorded timestamp as the best available sale date.
ALTER TABLE reseller_orders ADD COLUMN sale_date TEXT NOT NULL DEFAULT '';
UPDATE reseller_orders SET sale_date = created_at WHERE sale_date = '';
CREATE INDEX IF NOT EXISTS idx_reseller_orders_reseller_sale_date
  ON reseller_orders (reseller_id, sale_date, id);
