CREATE TABLE IF NOT EXISTS content_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_pages_published_order
  ON content_pages (is_published, sort_order, id);

INSERT OR IGNORE INTO content_pages (slug, title, content, is_published, sort_order) VALUES
('terms-and-conditions', 'Terms and Conditions', '', 0, 10),
('privacy-policy', 'Privacy Policy', '', 0, 20),
('shipping-policy', 'Shipping Policy', '', 0, 30),
('returns-and-refunds', 'Returns and Refunds', '', 0, 40),
('contact-us', 'Contact Us', '', 0, 50);