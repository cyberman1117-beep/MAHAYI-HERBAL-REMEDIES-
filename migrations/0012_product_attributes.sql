-- Independent product attributes: a product can have a color and/or size even when it has no product group.
ALTER TABLE products ADD COLUMN product_color TEXT;
ALTER TABLE products ADD COLUMN product_size TEXT;

CREATE INDEX IF NOT EXISTS idx_products_color ON products (product_color);
CREATE INDEX IF NOT EXISTS idx_products_size ON products (product_size);
