-- Add attachments column to message_replies.
-- NOT NULL DEFAULT '{}' backfills all existing rows automatically.
alter table message_replies
  add column attachments text[] not null default '{}';
