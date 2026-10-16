-- Configurable payment providers. Provider credentials are NOT stored in D1.
CREATE TABLE IF NOT EXISTS payment_providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_providers_enabled_order
  ON payment_providers (is_enabled, sort_order, id);

INSERT INTO payment_providers (provider_key, display_name, is_enabled, sort_order)
SELECT 'paystack', 'Paystack', 0, 1
WHERE NOT EXISTS (SELECT 1 FROM payment_providers WHERE provider_key = 'paystack');

INSERT INTO payment_providers (provider_key, display_name, is_enabled, sort_order)
SELECT 'yoco', 'Yoco', 0, 2
WHERE NOT EXISTS (SELECT 1 FROM payment_providers WHERE provider_key = 'yoco');

INSERT INTO payment_providers (provider_key, display_name, is_enabled, sort_order)
SELECT 'stripe', 'Stripe', 0, 3
WHERE NOT EXISTS (SELECT 1 FROM payment_providers WHERE provider_key = 'stripe');
