-- Provider-neutral payment transactions. Provider credentials are never stored in D1.
-- This migration is intentionally provider-neutral so Yoco, Paystack, and Stripe
-- can use the same transaction record.
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initialized',
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  customer_email TEXT NOT NULL,
  checkout_data TEXT NOT NULL DEFAULT '{}',
  provider_checkout_id TEXT DEFAULT NULL,
  provider_transaction_id TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_uid
  ON payment_transactions (firebase_uid, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_status
  ON payment_transactions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider
  ON payment_transactions (provider, created_at DESC);
