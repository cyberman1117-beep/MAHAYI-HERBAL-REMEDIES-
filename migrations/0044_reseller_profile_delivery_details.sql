-- Reseller profile and delivery details for stock fulfillment.
ALTER TABLE resellers ADD COLUMN residential_street TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN residential_area TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN residential_city TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN residential_province TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN residential_postal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN delivery_same_as_residential INTEGER NOT NULL DEFAULT 1 CHECK (delivery_same_as_residential IN (0, 1));
ALTER TABLE resellers ADD COLUMN delivery_street TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN delivery_area TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN delivery_city TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN delivery_province TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN delivery_postal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE resellers ADD COLUMN delivery_instructions TEXT NOT NULL DEFAULT '';

-- Snapshot the destination on each stock order so later profile edits do not rewrite past orders.
ALTER TABLE reseller_stock_orders ADD COLUMN delivery_name TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_stock_orders ADD COLUMN delivery_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_stock_orders ADD COLUMN delivery_street TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_stock_orders ADD COLUMN delivery_area TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_stock_orders ADD COLUMN delivery_city TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_stock_orders ADD COLUMN delivery_province TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_stock_orders ADD COLUMN delivery_postal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_stock_orders ADD COLUMN delivery_instructions TEXT NOT NULL DEFAULT '';
