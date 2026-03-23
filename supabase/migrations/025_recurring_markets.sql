create table if not exists recurring_markets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text not null,
  website_url text,
  instagram_url text,
  frequency text,
  typical_months text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger recurring_markets_updated_at
  before update on recurring_markets
  for each row execute function set_updated_at();

alter table recurring_markets enable row level security;
