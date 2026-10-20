-- Reseller package options remain separate inventory products so existing stock,
-- order reservation, distributor inventory, sales, and credit-ledger paths stay intact.
ALTER TABLE reseller_products ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_products ADD COLUMN package_group TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_products ADD COLUMN package_label TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_reseller_products_package_group
  ON reseller_products (package_group, status, sort_order, id);
