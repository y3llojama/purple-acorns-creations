-- Auto-delete contact form messages older than 90 days.
-- Satisfies GDPR data minimisation principle and our stated Privacy Policy retention period.
-- Requires pg_cron extension (enabled by default on Supabase Pro; on free tier run manually or via Edge Function).

-- Add created_at index to make the scheduled delete efficient
create index if not exists messages_created_at_idx on messages (created_at);

-- Schedule nightly deletion of messages older than 90 days (pg_cron, runs at 03:00 UTC)
select cron.schedule(
  'delete-old-messages',
  '0 3 * * *',
  $$delete from messages where created_at < now() - interval '90 days'$$
);
