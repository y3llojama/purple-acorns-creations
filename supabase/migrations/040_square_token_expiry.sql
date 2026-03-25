-- Store the Square OAuth token expiry time so getSquareClient() can refresh
-- before the token expires (Square tokens expire after 30 days).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS square_token_expires_at TIMESTAMPTZ;
