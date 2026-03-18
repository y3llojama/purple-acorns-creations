alter table settings
  add column custom_primary text,
  add column custom_accent  text,
  add column hero_image_url text;

-- Expand theme constraint to include 'custom'
alter table settings
  drop constraint settings_theme_check,
  add constraint settings_theme_check
    check (theme in ('warm-artisan', 'soft-botanical', 'custom'));
