-- Product groups let separate sellable products be related as alternatives
-- without turning them into one shared variant record.
CREATE TABLE IF NOT EXISTS product_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products ADD COLUMN product_group_id INTEGER REFERENCES product_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_product_group
  ON products (product_group_id, status, sort_order, id);
