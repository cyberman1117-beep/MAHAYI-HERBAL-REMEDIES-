-- Separate retail units inside each stock package from the number of stock packages held by M.H.R.
-- Existing package rows default to one unit per package, preserving current orders and pricing.
ALTER TABLE reseller_product_packages
  ADD COLUMN units_per_package INTEGER NOT NULL DEFAULT 1 CHECK (units_per_package > 0);

ALTER TABLE reseller_stock_order_items
  ADD COLUMN units_per_package INTEGER NOT NULL DEFAULT 1 CHECK (units_per_package > 0);
