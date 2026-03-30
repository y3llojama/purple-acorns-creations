-- Square API debug logging: settings columns + log table

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS square_log_level TEXT NOT NULL DEFAULT 'none'
    CHECK (square_log_level IN ('none', 'basic', 'full')),
  ADD COLUMN IF NOT EXISTS square_log_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS square_api_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INT,
  error TEXT,
  request_body JSONB,
  response_body JSONB,
  duration_ms INT,
  CONSTRAINT square_api_log_retention CHECK (created_at > now() - INTERVAL '8 days')
);

CREATE INDEX IF NOT EXISTS idx_square_api_log_created_at ON square_api_log (created_at DESC);

-- RLS: no public access, service role only
ALTER TABLE square_api_log ENABLE ROW LEVEL SECURITY;
