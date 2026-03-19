-- Add 'modern' to the theme check constraint and set it as the default
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_theme_check;
ALTER TABLE settings ADD CONSTRAINT settings_theme_check
  CHECK (theme IN ('warm-artisan', 'soft-botanical', 'custom', 'modern'));
ALTER TABLE settings ALTER COLUMN theme SET DEFAULT 'modern';
UPDATE settings SET theme = 'modern';
