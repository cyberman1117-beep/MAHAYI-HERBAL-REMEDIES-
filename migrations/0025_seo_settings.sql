CREATE TABLE IF NOT EXISTS seo_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  site_title TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL DEFAULT '',
  robots_index INTEGER NOT NULL DEFAULT 1 CHECK (robots_index IN (0,1)),
  robots_follow INTEGER NOT NULL DEFAULT 1 CHECK (robots_follow IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO seo_settings (id, site_title, meta_description, canonical_url, robots_index, robots_follow)
VALUES (1, '', '', '', 1, 1);
