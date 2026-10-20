-- Real package rows belong to one reseller product. Legacy single-price products
-- are migrated into one package row so existing catalogue data is preserved.
CREATE TABLE IF NOT EXISTS reseller_product_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reseller_product_id INTEGER NOT NULL,
  package_label TEXT NOT NULL,
  stock_amount REAL NOT NULL DEFAULT 0 CHECK (stock_amount >= 0),
  resale_amount REAL NOT NULL DEFAULT 0 CHECK (resale_amount >= 0),
  commission REAL NOT NULL DEFAULT 0 CHECK (commission >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  minimum_order_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_order_quantity > 0),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ABS(resale_amount - stock_amount - commission) < 0.01),
  FOREIGN KEY (reseller_product_id) REFERENCES reseller_products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reseller_product_packages_product
  ON reseller_product_packages (reseller_product_id, is_enabled, sort_order, id);

INSERT INTO reseller_product_packages
  (reseller_product_id, package_label, stock_amount, resale_amount, commission, stock_quantity, minimum_order_quantity, is_enabled, sort_order)
SELECT p.id,
       CASE WHEN TRIM(COALESCE(p.package_label, '')) <> '' THEN p.package_label ELSE 'Standard' END,
       pp.company_share, pp.customer_price, pp.reseller_share,
       CASE WHEN p.track_stock = 1 THEN p.stock_quantity ELSE 0 END,
       pp.minimum_order_quantity, pp.is_enabled, 0
FROM reseller_products p
JOIN reseller_product_pricing pp ON pp.reseller_product_id = p.id
WHERE NOT EXISTS (
  SELECT 1 FROM reseller_product_packages pkg WHERE pkg.reseller_product_id = p.id
);

CREATE TABLE IF NOT EXISTS reseller_package_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reseller_id INTEGER NOT NULL,
  package_id INTEGER NOT NULL,
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  pay_later_quantity INTEGER NOT NULL DEFAULT 0 CHECK (pay_later_quantity >= 0 AND pay_later_quantity <= quantity_available),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (reseller_id, package_id),
  FOREIGN KEY (reseller_id) REFERENCES resellers(id) ON DELETE RESTRICT,
  FOREIGN KEY (package_id) REFERENCES reseller_product_packages(id) ON DELETE RESTRICT
);

INSERT INTO reseller_package_inventory (reseller_id, package_id, quantity_available, pay_later_quantity)
SELECT i.reseller_id, pkg.id, i.quantity_available, i.pay_later_quantity
FROM reseller_inventory i
JOIN reseller_product_packages pkg ON pkg.reseller_product_id = i.reseller_product_id;

ALTER TABLE reseller_stock_order_items ADD COLUMN package_id INTEGER REFERENCES reseller_product_packages(id) ON DELETE SET NULL;
ALTER TABLE reseller_stock_order_items ADD COLUMN package_label TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_order_items ADD COLUMN package_id INTEGER REFERENCES reseller_product_packages(id) ON DELETE SET NULL;
ALTER TABLE reseller_order_items ADD COLUMN package_label TEXT NOT NULL DEFAULT '';
ALTER TABLE reseller_inventory_movements ADD COLUMN package_id INTEGER REFERENCES reseller_product_packages(id) ON DELETE SET NULL;
ALTER TABLE reseller_company_ledger ADD COLUMN package_id INTEGER REFERENCES reseller_product_packages(id) ON DELETE SET NULL;

UPDATE reseller_stock_order_items
SET package_id = (SELECT pkg.id FROM reseller_product_packages pkg WHERE pkg.reseller_product_id = reseller_stock_order_items.reseller_product_id ORDER BY pkg.id LIMIT 1),
    package_label = COALESCE((SELECT pkg.package_label FROM reseller_product_packages pkg WHERE pkg.reseller_product_id = reseller_stock_order_items.reseller_product_id ORDER BY pkg.id LIMIT 1), '')
WHERE reseller_product_id IS NOT NULL;

UPDATE reseller_order_items
SET package_id = (SELECT pkg.id FROM reseller_product_packages pkg WHERE pkg.reseller_product_id = reseller_order_items.reseller_product_id ORDER BY pkg.id LIMIT 1),
    package_label = COALESCE((SELECT pkg.package_label FROM reseller_product_packages pkg WHERE pkg.reseller_product_id = reseller_order_items.reseller_product_id ORDER BY pkg.id LIMIT 1), '')
WHERE reseller_product_id IS NOT NULL;

UPDATE reseller_inventory_movements
SET package_id = (SELECT pkg.id FROM reseller_product_packages pkg WHERE pkg.reseller_product_id = reseller_inventory_movements.reseller_product_id ORDER BY pkg.id LIMIT 1)
WHERE reseller_product_id IS NOT NULL;

UPDATE reseller_company_ledger
SET package_id = (SELECT pkg.id FROM reseller_product_packages pkg WHERE pkg.reseller_product_id = reseller_company_ledger.reseller_product_id ORDER BY pkg.id LIMIT 1)
WHERE reseller_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reseller_package_inventory_reseller
  ON reseller_package_inventory (reseller_id, package_id);
CREATE INDEX IF NOT EXISTS idx_reseller_stock_items_package
  ON reseller_stock_order_items (package_id);
CREATE INDEX IF NOT EXISTS idx_reseller_order_items_package
  ON reseller_order_items (package_id);
