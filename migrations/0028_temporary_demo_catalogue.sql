-- TEMPORARY DESIGN DEMO CATALOGUE
-- All rows use the demo-* slug prefix so they can be removed safely after visual review.
-- These are sample listings only; replace or delete them before accepting real orders.

INSERT OR IGNORE INTO categories
  (name, slug, description, sort_order, is_enabled, show_in_navigation, show_on_homepage, is_main_category, is_featured, is_promoted, showcase_image_url, showcase_image_alt)
VALUES
  ('Wellness', 'demo-wellness', 'Temporary sample category for storefront design review.', 10, 1, 1, 1, 1, 1, 1, 'https://images.unsplash.com/photo-1547887538-e3a2f32cb1cc?auto=format&fit=crop&w=900&q=80', 'Wellness products sample category'),
  ('Herbs & Botanicals', 'demo-herbs-botanicals', 'Temporary sample category for storefront design review.', 20, 1, 1, 1, 1, 1, 0, 'https://images.unsplash.com/photo-1515586000433-45406d8e6662?auto=format&fit=crop&w=900&q=80', 'Herbs and botanicals sample category'),
  ('Natural Care', 'demo-natural-care', 'Temporary sample category for storefront design review.', 30, 1, 1, 1, 1, 0, 0, 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=80', 'Natural care sample category');

UPDATE categories
SET parent_id = (SELECT id FROM categories WHERE slug = 'demo-wellness'),
    is_main_category = 0,
    show_on_homepage = 0,
    is_featured = 0,
    is_promoted = 0
WHERE slug IN ('demo-daily-wellness', 'demo-herbal-teas', 'demo-skin-care');

INSERT OR IGNORE INTO categories
  (name, slug, description, parent_id, sort_order, is_enabled, show_in_navigation, show_on_homepage, is_main_category, is_featured, is_promoted, showcase_image_url, showcase_image_alt)
SELECT 'Daily Wellness', 'demo-daily-wellness', 'Temporary sample subcategory.', id, 1, 1, 1, 0, 0, 0, 0,
  'https://images.unsplash.com/photo-1547887538-e3a2f32cb1cc?auto=format&fit=crop&w=600&q=80', 'Daily wellness sample'
FROM categories WHERE slug = 'demo-wellness';

INSERT OR IGNORE INTO categories
  (name, slug, description, parent_id, sort_order, is_enabled, show_in_navigation, show_on_homepage, is_main_category, is_featured, is_promoted, showcase_image_url, showcase_image_alt)
SELECT 'Herbal Teas', 'demo-herbal-teas', 'Temporary sample subcategory.', id, 2, 1, 1, 0, 0, 0, 0,
  'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80', 'Herbal tea sample'
FROM categories WHERE slug = 'demo-herbs-botanicals';

INSERT OR IGNORE INTO categories
  (name, slug, description, parent_id, sort_order, is_enabled, show_in_navigation, show_on_homepage, is_main_category, is_featured, is_promoted, showcase_image_url, showcase_image_alt)
SELECT 'Skin & Body Care', 'demo-skin-care', 'Temporary sample subcategory.', id, 1, 1, 1, 0, 0, 0, 0,
  'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=600&q=80', 'Skin and body care sample'
FROM categories WHERE slug = 'demo-natural-care';

INSERT OR IGNORE INTO products
  (category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order)
SELECT id, 'Moringa Leaf Powder — Demo', 'demo-moringa-leaf-powder',
  'Temporary sample listing for storefront design review. Replace this demo description and verify product details before launch.',
  'DEMO-MORINGA-001', 129.00, 'ZAR', 'active', 25, 0, 1
FROM categories WHERE slug = 'demo-daily-wellness';

INSERT OR IGNORE INTO products
  (category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order)
SELECT id, 'Baobab Wellness Blend — Demo', 'demo-baobab-wellness-blend',
  'Temporary sample listing for storefront design review. Replace this demo description and verify product details before launch.',
  'DEMO-BAOBAB-001', 149.00, 'ZAR', 'active', 25, 0, 2
FROM categories WHERE slug = 'demo-daily-wellness';

INSERT OR IGNORE INTO products
  (category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order)
SELECT id, 'Daily Herbal Infusion — Demo', 'demo-daily-herbal-infusion',
  'Temporary sample listing for storefront design review. Replace this demo description and verify product details before launch.',
  'DEMO-INFUSION-001', 89.00, 'ZAR', 'active', 25, 0, 1
FROM categories WHERE slug = 'demo-herbal-teas';

INSERT OR IGNORE INTO products
  (category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order)
SELECT id, 'Rooibos Botanical Tea — Demo', 'demo-rooibos-botanical-tea',
  'Temporary sample listing for storefront design review. Replace this demo description and verify product details before launch.',
  'DEMO-ROOIBOS-001', 79.00, 'ZAR', 'active', 25, 0, 2
FROM categories WHERE slug = 'demo-herbal-teas';

INSERT OR IGNORE INTO products
  (category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order)
SELECT id, 'Aloe Botanical Gel — Demo', 'demo-aloe-botanical-gel',
  'Temporary sample listing for storefront design review. Replace this demo description and verify product details before launch.',
  'DEMO-ALOE-001', 99.00, 'ZAR', 'active', 25, 0, 1
FROM categories WHERE slug = 'demo-skin-care';

INSERT OR IGNORE INTO products
  (category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order)
SELECT id, 'Botanical Body Oil — Demo', 'demo-botanical-body-oil',
  'Temporary sample listing for storefront design review. Replace this demo description and verify product details before launch.',
  'DEMO-BODY-OIL-001', 119.00, 'ZAR', 'active', 25, 0, 2
FROM categories WHERE slug = 'demo-skin-care';

INSERT OR IGNORE INTO products
  (category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order)
SELECT id, 'Ginger & Turmeric Blend — Demo', 'demo-ginger-turmeric-blend',
  'Temporary sample listing for storefront design review. This is not a real product listing or health claim.',
  'DEMO-GINGER-001', 109.00, 'ZAR', 'active', 25, 0, 3
FROM categories WHERE slug = 'demo-daily-wellness';

INSERT OR IGNORE INTO products
  (category_id, name, slug, description, sku, price, currency, status, stock_quantity, track_stock, sort_order)
SELECT id, 'Herbal Bath Soak — Demo', 'demo-herbal-bath-soak',
  'Temporary sample listing for storefront design review. Replace this demo description and verify product details before launch.',
  'DEMO-BATH-SOAK-001', 139.00, 'ZAR', 'active', 25, 0, 3
FROM categories WHERE slug = 'demo-skin-care';

INSERT OR IGNORE INTO product_images (product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary)
SELECT id, 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=900&q=85', '', 'Moringa powder sample product image', 0, 1 FROM products WHERE slug = 'demo-moringa-leaf-powder';
INSERT OR IGNORE INTO product_images (product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary)
SELECT id, 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab12?auto=format&fit=crop&w=900&q=85', '', 'Baobab blend sample product image', 0, 1 FROM products WHERE slug = 'demo-baobab-wellness-blend';
INSERT OR IGNORE INTO product_images (product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary)
SELECT id, 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=85', '', 'Herbal infusion sample product image', 0, 1 FROM products WHERE slug = 'demo-daily-herbal-infusion';
INSERT OR IGNORE INTO product_images (product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary)
SELECT id, 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=900&q=85', '', 'Rooibos tea sample product image', 0, 1 FROM products WHERE slug = 'demo-rooibos-botanical-tea';
INSERT OR IGNORE INTO product_images (product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary)
SELECT id, 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85', '', 'Aloe gel sample product image', 0, 1 FROM products WHERE slug = 'demo-aloe-botanical-gel';
INSERT OR IGNORE INTO product_images (product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary)
SELECT id, 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=900&q=85', '', 'Botanical body oil sample product image', 0, 1 FROM products WHERE slug = 'demo-botanical-body-oil';
INSERT OR IGNORE INTO product_images (product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary)
SELECT id, 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=900&q=85', '', 'Ginger turmeric sample product image', 0, 1 FROM products WHERE slug = 'demo-ginger-turmeric-blend';
INSERT OR IGNORE INTO product_images (product_id, image_url, cloudinary_public_id, alt_text, sort_order, is_primary)
SELECT id, 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85', '', 'Herbal bath soak sample product image', 0, 1 FROM products WHERE slug = 'demo-herbal-bath-soak';

INSERT OR IGNORE INTO product_new_arrivals (product_id, is_enabled, duration_days, starts_at, expires_at)
SELECT id, 1, 30, CURRENT_TIMESTAMP, datetime('now', '+30 days') FROM products
WHERE slug IN ('demo-moringa-leaf-powder', 'demo-daily-herbal-infusion', 'demo-aloe-botanical-gel');

INSERT OR IGNORE INTO product_promotions (product_id, is_enabled, promotion_price)
SELECT id, 1, CASE slug
  WHEN 'demo-baobab-wellness-blend' THEN 119.00
  WHEN 'demo-rooibos-botanical-tea' THEN 65.00
  WHEN 'demo-botanical-body-oil' THEN 99.00
END
FROM products
WHERE slug IN ('demo-baobab-wellness-blend', 'demo-rooibos-botanical-tea', 'demo-botanical-body-oil');
