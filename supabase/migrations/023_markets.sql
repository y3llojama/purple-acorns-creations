-- supabase/migrations/023_markets.sql
create table if not exists craft_fairs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text not null,
  website_url text,
  instagram_url text,
  years_in_operation text,
  avg_artists text,
  avg_shoppers text,
  typical_months text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists artist_venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text not null,
  website_url text,
  instagram_url text,
  hosting_model text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reuse existing set_updated_at() function from earlier migrations
create trigger craft_fairs_updated_at
  before update on craft_fairs
  for each row execute function set_updated_at();

create trigger artist_venues_updated_at
  before update on artist_venues
  for each row execute function set_updated_at();

-- No public SELECT — admin only via service role
alter table craft_fairs enable row level security;
alter table artist_venues enable row level security;
