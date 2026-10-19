-- Add the category hierarchy and visibility fields required by category-api.js.
-- Existing categories are preserved as main categories so they remain visible
-- in the storefront's main-category listing after this migration.
ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN show_in_navigation INTEGER NOT NULL DEFAULT 1 CHECK (show_in_navigation IN (0, 1));
ALTER TABLE categories ADD COLUMN show_on_homepage INTEGER NOT NULL DEFAULT 0 CHECK (show_on_homepage IN (0, 1));
ALTER TABLE categories ADD COLUMN is_main_category INTEGER NOT NULL DEFAULT 1 CHECK (is_main_category IN (0, 1));
ALTER TABLE categories ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1));
ALTER TABLE categories ADD COLUMN is_promoted INTEGER NOT NULL DEFAULT 0 CHECK (is_promoted IN (0, 1));
