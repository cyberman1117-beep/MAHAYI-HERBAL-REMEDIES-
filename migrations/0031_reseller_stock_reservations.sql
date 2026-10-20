-- Track whether company stock is reserved for a reseller stock order.
ALTER TABLE reseller_stock_orders ADD COLUMN stock_reserved_at TEXT;
ALTER TABLE reseller_stock_orders ADD COLUMN stock_released_at TEXT;
