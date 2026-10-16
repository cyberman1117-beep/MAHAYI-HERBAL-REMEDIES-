INSERT INTO admin_users (firebase_uid, role, is_enabled)
VALUES ('0sKhW5ehHoMZGz7ySij88ffZJOq1', 'admin', 1)
ON CONFLICT(firebase_uid) DO UPDATE SET
  role = 'admin',
  is_enabled = 1,
  updated_at = CURRENT_TIMESTAMP;
