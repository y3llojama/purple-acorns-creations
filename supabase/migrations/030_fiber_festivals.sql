create table if not exists fiber_festivals (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text not null,
  website_url text,
  instagram_url text,
  years_in_operation text,
  avg_artists text,
  avg_shoppers text,
  typical_months text,
  fiber_focus text,
  accepts_non_fiber text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger fiber_festivals_updated_at
  before update on fiber_festivals
  for each row execute function set_updated_at();

alter table fiber_festivals enable row level security;
