ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS square_application_id     TEXT,
  ADD COLUMN IF NOT EXISTS square_application_secret TEXT,
  ADD COLUMN IF NOT EXISTS square_environment        TEXT DEFAULT 'sandbox';
