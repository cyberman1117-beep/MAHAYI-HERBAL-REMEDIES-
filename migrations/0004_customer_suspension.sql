ALTER TABLE customer_profiles ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE customer_profiles ADD COLUMN suspension_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_profiles ADD COLUMN suspended_at TEXT DEFAULT NULL;
ALTER TABLE customer_profiles ADD COLUMN suspended_by TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_profiles_status ON customer_profiles (status);
