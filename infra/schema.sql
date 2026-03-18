-- Settings (single row)
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  theme text not null default 'warm-artisan' check (theme in ('warm-artisan', 'soft-botanical')),
  logo_url text,
  square_store_url text,
  contact_email text,
  mailchimp_api_key text,
  mailchimp_audience_id text,
  ai_provider text check (ai_provider in ('claude', 'openai', 'groq')),
  announcement_enabled boolean not null default false,
  announcement_text text,
  announcement_link_url text,
  announcement_link_label text,
  social_instagram text default 'purpleacornz',
  social_facebook text,
  social_tiktok text,
  social_pinterest text,
  social_x text,
  behold_widget_id text,
  smtp_host text default 'smtp.gmail.com',
  smtp_port integer default 587,
  smtp_user text,
  smtp_pass text,
  updated_at timestamptz default now()
);
insert into settings (id) values (gen_random_uuid())
  on conflict do nothing;

-- Events
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  time text,
  location text not null,
  description text,
  link_url text,
  link_label text,
  created_at timestamptz default now()
);

-- Gallery
create table if not exists gallery (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  alt_text text not null,
  category text check (category in ('rings','necklaces','earrings','bracelets','crochet','other')),
  sort_order integer not null default 0,
  is_featured boolean not null default false,
  square_url text,
  created_at timestamptz default now()
);

-- Messages from contact form
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz default now()
);

-- Admin replies to messages
create table if not exists message_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- Content key-value store
create table if not exists content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz default now()
);

-- Seed default content keys
insert into content (key, value) values
  ('hero_tagline', 'Handcrafted with intention, worn with joy.'),
  ('hero_subtext', 'Crochet jewelry, sterling silver, and artisan pieces made with love by a mother-daughter duo in Brooklyn, NY.'),
  ('story_teaser', 'We are Purple Acorns Creations — a mother and daughter who share a passion for making things by hand.'),
  ('story_full', '<p>Our story begins at the kitchen table...</p><p>Add your full story here via the admin panel.</p>'),
  ('privacy_policy', '<h1>Privacy Policy</h1><p>Add your privacy policy here via the admin panel.</p>'),
  ('terms_of_service', '<h1>Terms of Service</h1><p>Add your terms of service here via the admin panel.</p>')
on conflict (key) do nothing;

-- RLS
alter table settings enable row level security;
alter table events enable row level security;
alter table gallery enable row level security;
alter table content enable row level security;
alter table messages enable row level security;
alter table message_replies enable row level security;

-- Public read policies (safe tables only — settings excluded)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'events' and policyname = 'Public read events'
  ) then
    execute 'create policy "Public read events" on events for select using (true)';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'gallery' and policyname = 'Public read gallery'
  ) then
    execute 'create policy "Public read gallery" on gallery for select using (true)';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'content' and policyname = 'Public read content'
  ) then
    execute 'create policy "Public read content" on content for select using (true)';
  end if;
end $$;
