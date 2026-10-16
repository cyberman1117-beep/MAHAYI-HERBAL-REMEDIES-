-- Managed product relationships: reusable groups with a relationship type and per-product value.
ALTER TABLE product_groups ADD COLUMN relationship_type TEXT NOT NULL DEFAULT 'color';

ALTER TABLE products ADD COLUMN product_group_value TEXT;

CREATE INDEX IF NOT EXISTS idx_products_group_value
  ON products (product_group_id, product_group_value, status, sort_order, id);
