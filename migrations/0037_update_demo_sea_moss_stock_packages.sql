-- Update the existing temporary Sea Moss demo to demonstrate multi-unit reseller stock packages.
-- Prices remain per retail unit; each stock package contains 10 identical retail units.
UPDATE reseller_products
SET description = 'TEMPORARY DEMO PRODUCT — reseller stock is purchased in packs of 10 identical retail units. Each size option shows per-unit stock cost, customer selling price and reseller profit, plus the total cost and potential return for one 10-unit stock package. Replace the demo details before accepting real orders.',
    updated_at = CURRENT_TIMESTAMP
WHERE slug = 'demo-sea-moss';

UPDATE reseller_product_packages
SET package_label = CASE package_label
      WHEN '100 g' THEN '100 g × 10 units'
      WHEN '500 g' THEN '500 g × 10 units'
      WHEN '1 kg' THEN '1 kg × 10 units'
      ELSE package_label
    END,
    units_per_package = 10,
    updated_at = CURRENT_TIMESTAMP
WHERE reseller_product_id = (SELECT id FROM reseller_products WHERE slug = 'demo-sea-moss')
  AND package_label IN ('100 g', '500 g', '1 kg', '100 g × 10 units', '500 g × 10 units', '1 kg × 10 units');
