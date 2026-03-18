-- Messages from contact form (stored instead of just logged)
create table messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz default now()
);

-- Replies sent by admin
create table message_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- SMTP config in settings (defaults to Gmail SMTP)
alter table settings add column smtp_host text default 'smtp.gmail.com';
alter table settings add column smtp_port integer default 587;
alter table settings add column smtp_user text;
alter table settings add column smtp_pass text;

-- RLS
alter table messages enable row level security;
alter table message_replies enable row level security;
-- No public read — messages are admin-only (accessed via service role key)
