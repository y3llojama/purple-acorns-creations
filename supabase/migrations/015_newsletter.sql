-- newsletters table
create table newsletters (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null default '',
  subject_line text not null default '',
  teaser_text text not null default '',
  hero_image_url text,
  content jsonb not null default '[]',
  tone text not null default 'upbeat',
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sent', 'cancelled')),
  ai_brief jsonb,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_newsletters_status on newsletters(status);
create index idx_newsletters_scheduled on newsletters(scheduled_at) where status = 'scheduled';
create or replace function set_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end; $$;
create trigger newsletters_updated_at before update on newsletters
  for each row execute function set_updated_at();
alter table newsletters enable row level security;

-- newsletter_subscribers table
create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  status text not null default 'active'
    check (status in ('active', 'unsubscribed', 'bounced')),
  unsubscribe_token text unique not null default encode(gen_random_bytes(24), 'hex'),
  source text not null default 'public_signup',
  subscribed_at timestamptz default now(),
  unsubscribed_at timestamptz
);
create index idx_subscribers_status on newsletter_subscribers(status);
create index idx_subscribers_token on newsletter_subscribers(unsubscribe_token);
alter table newsletter_subscribers enable row level security;

-- newsletter_send_log table
create table newsletter_send_log (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references newsletters(id) on delete cascade,
  email text not null,
  resend_message_id text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'bounced')),
  error_message text,
  sent_at timestamptz default now(),
  opened_at timestamptz,
  clicked_at timestamptz
);
create index idx_send_log_newsletter_id on newsletter_send_log(newsletter_id);
create index idx_send_log_resend_id on newsletter_send_log(resend_message_id);
alter table newsletter_send_log enable row level security;

-- settings columns
alter table settings add column if not exists resend_api_key text;
alter table settings add column if not exists newsletter_from_name text default 'Purple Acorns Creations';
alter table settings add column if not exists newsletter_from_email text;
alter table settings add column if not exists newsletter_admin_emails text;
alter table settings add column if not exists newsletter_scheduled_send_time time default '10:00';
alter table settings add column if not exists ai_api_key text;
