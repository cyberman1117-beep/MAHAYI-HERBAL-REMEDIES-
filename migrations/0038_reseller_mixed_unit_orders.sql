ALTER TABLE reseller_product_packages ADD COLUMN stock_units_available INTEGER NOT NULL DEFAULT 0 CHECK (stock_units_available >= 0);
UPDATE reseller_product_packages SET stock_units_available = stock_quantity * units_per_package WHERE stock_units_available = 0 AND stock_quantity > 0;
