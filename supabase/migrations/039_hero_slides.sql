-- supabase/migrations/039_hero_slides.sql
create table hero_slides (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  alt_text     text not null,
  sort_order   int  not null default 0,
  created_at   timestamptz default now()
);

-- Service role only: enable RLS with no permissive policies so anon role cannot read
alter table hero_slides enable row level security;

alter table settings
  add column hero_transition  text default 'crossfade'
    check (hero_transition in ('crossfade', 'slide')),
  add column hero_interval_ms int  default 5000
    check (hero_interval_ms between 2000 and 30000);
