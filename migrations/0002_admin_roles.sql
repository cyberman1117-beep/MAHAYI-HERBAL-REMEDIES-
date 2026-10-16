CREATE TABLE IF NOT EXISTS admin_users (
  firebase_uid TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'admin',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_users_enabled ON admin_users (is_enabled);
