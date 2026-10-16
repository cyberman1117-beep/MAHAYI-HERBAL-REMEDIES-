-- Final product-group configuration: predefined options with option-level SKU and quantity.
ALTER TABLE product_groups ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS product_group_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_group_id INTEGER NOT NULL,
  value TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_group_id) REFERENCES product_groups(id) ON DELETE CASCADE,
  UNIQUE (product_group_id, value)
);

ALTER TABLE products ADD COLUMN product_group_option_id INTEGER REFERENCES product_group_options(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_group_options_group
  ON product_group_options (product_group_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_products_group_option
  ON products (product_group_option_id);

-- Preserve existing grouped products by creating options from their current group values.
INSERT OR IGNORE INTO product_group_options (product_group_id, value, sku, quantity, sort_order)
SELECT product_group_id, product_group_value, sku, stock_quantity, 0
FROM products
WHERE product_group_id IS NOT NULL
  AND TRIM(COALESCE(product_group_value, '')) <> '';

UPDATE products
SET product_group_option_id = (
  SELECT o.id
  FROM product_group_options o
  WHERE o.product_group_id = products.product_group_id
    AND LOWER(o.value) = LOWER(products.product_group_value)
  ORDER BY o.id ASC
  LIMIT 1
)
WHERE product_group_id IS NOT NULL
  AND product_group_option_id IS NULL
  AND TRIM(COALESCE(product_group_value, '')) <> '';
