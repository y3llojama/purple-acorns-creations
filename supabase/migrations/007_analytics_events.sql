-- Analytics events table for tracking page views, contact submissions, etc.
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  page_path text,
  referrer text,
  user_agent text,
  device_type text,
  session_id text,
  ip_hash text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- Indexes for common dashboard queries
create index idx_analytics_created_at on analytics_events (created_at desc);
create index idx_analytics_event_type on analytics_events (event_type);
create index idx_analytics_page_path on analytics_events (page_path);
create index idx_analytics_event_created on analytics_events (event_type, created_at desc);

-- RLS: no public SELECT — data accessed only via service role key from admin API routes
alter table analytics_events enable row level security;
-- No policies = no public access (service role key bypasses RLS)
