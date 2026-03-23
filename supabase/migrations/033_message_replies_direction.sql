-- supabase/migrations/033_message_replies_direction.sql
alter table message_replies
  add column direction text not null default 'outbound'
    check (direction in ('outbound', 'inbound')),
  add column from_email text,
  add column resend_message_id text;

-- All existing rows are admin-sent replies; 'outbound' default is correct.
