-- Settings (single row)
create table settings (
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
  updated_at timestamptz default now()
);
insert into settings (id) values (gen_random_uuid());

-- Events
create table events (
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
create table gallery (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  alt_text text not null,
  category text check (category in ('rings','necklaces','earrings','bracelets','crochet','other')),
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

-- Featured products
create table featured_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null,
  description text,
  image_url text not null,
  square_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

-- Content key-value store
create table content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz default now()
);

-- Seed default content keys
insert into content (key, value) values
  ('hero_tagline', 'Handcrafted with intention, worn with joy.'),
  ('hero_subtext', 'Crochet jewelry, sterling silver, and artisan pieces made with love by a mother-daughter duo.'),
  ('story_teaser', 'We are Purple Acorns Creations — a mother and daughter who share a passion for making things by hand.'),
  ('story_full', '<p>Our story begins at the kitchen table...</p><p>Add your full story here via the admin panel.</p>'),
  ('privacy_policy', '<h1>Privacy Policy</h1><p><strong>Last updated:</strong> March 2026</p><p>${BUSINESS_NAME} ("we", "us", or "our") operates this website.</p><h2>Information We Collect</h2><ul><li><strong>Email address</strong> — when you subscribe to our newsletter</li><li><strong>Name and message</strong> — when you submit our contact form</li></ul><h2>Third-Party Services</h2><ul><li><strong>Square</strong> — handles all payments</li><li><strong>Mailchimp</strong> — manages our email list</li><li><strong>Vercel Analytics</strong> — anonymous page views only, no cookies</li><li><strong>Behold.so</strong> — displays our Instagram feed</li></ul><h2>Contact</h2><p>Questions? <a href="${CONTACT_FORM}">Send us a message</a>.</p>'),
  ('terms_of_service', '<h1>Terms of Service</h1><p><strong>Last updated:</strong> March 2026</p><h2>Handmade Products</h2><p>All products are handmade. Slight variations are natural and not defects.</p><h2>Purchases &amp; Returns</h2><p>All purchases are processed through Square. Contact us within 7 days of receiving your order with any issues.</p><h2>Contact</h2><p>Questions? <a href="${CONTACT_FORM}">Send us a message</a>.</p>');

-- RLS policies
alter table settings enable row level security;
alter table events enable row level security;
alter table gallery enable row level security;
alter table featured_products enable row level security;
alter table content enable row level security;

-- Public reads for safe, non-sensitive tables
-- settings is intentionally excluded: it contains mailchimp_api_key and other secrets.
-- All settings reads use createServiceRoleClient() (server-side only) which bypasses RLS.
create policy "Public read events" on events for select using (true);
create policy "Public read gallery" on gallery for select using (true);
create policy "Public read products" on featured_products for select using (true);
create policy "Public read content" on content for select using (true);

-- All writes and all settings reads go through service_role key (server-side only, bypasses RLS)
