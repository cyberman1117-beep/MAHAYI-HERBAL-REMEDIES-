-- TEMPORARY DISTRIBUTOR CATALOGUE DEMO: Sea Moss with editable package pricing rows.
-- Safe to re-run: the product is keyed by its demo slug and package labels.
INSERT OR IGNORE INTO reseller_products
  (category_id, name, slug, description, sku, currency, status, stock_quantity, track_stock, sort_order, image_url, package_group, package_label)
VALUES
  (NULL, 'Sea Moss — Demo', 'demo-sea-moss', 'TEMPORARY DEMO PRODUCT — use this listing to review package selection, stock amount, resale price, and distributor commission. Replace the demo details before accepting real orders.', 'DEMO-SEA-MOSS-001', 'ZAR', 'active', 0, 0, 1,
   'https://images.unsplash.com/photo-1515586000433-45406d8e6662?auto=format&fit=crop&w=900&q=85', 'demo-sea-moss', '');

INSERT INTO reseller_product_packages
  (reseller_product_id, package_label, stock_amount, resale_amount, commission, stock_quantity, minimum_order_quantity, is_enabled, sort_order)
SELECT p.id, seed.package_label, seed.stock_amount, seed.resale_amount, seed.commission, 100, 1, 1, seed.sort_order
FROM reseller_products p
JOIN (
  SELECT '100 g' AS package_label, 100.00 AS stock_amount, 250.00 AS resale_amount, 150.00 AS commission, 1 AS sort_order
  UNION ALL SELECT '500 g', 150.00, 350.00, 200.00, 2
  UNION ALL SELECT '1 kg', 250.00, 500.00, 250.00, 3
) seed
WHERE p.slug = 'demo-sea-moss'
  AND NOT EXISTS (
    SELECT 1 FROM reseller_product_packages existing
    WHERE existing.reseller_product_id = p.id AND existing.package_label = seed.package_label
  );
