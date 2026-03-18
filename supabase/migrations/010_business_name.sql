-- Add configurable business name to settings (single-row table).
-- Defaults to the original hardcoded name so existing deployments are unaffected.
alter table settings
  add column if not exists business_name text not null default 'Purple Acorns Creations';
