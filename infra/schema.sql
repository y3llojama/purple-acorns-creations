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
  updated_at timestamptz default now(),
  -- Shipping config (added in 038)
  shipping_mode  text          not null default 'fixed',
  shipping_value numeric(10,2) not null default 0 check (shipping_value >= 0)
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
  ('hero_subtext', 'Crochet jewelry, sterling silver, and artisan pieces made with love by a mother-daughter duo.'),
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

-- Products table — inventory source of truth (added in 018, stock_reserved added in 038)
CREATE TABLE IF NOT EXISTS products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  description          TEXT,
  price                NUMERIC(10,2) NOT NULL,
  category             TEXT NOT NULL CHECK (category IN ('rings','necklaces','earrings','bracelets','crochet','other')),
  stock_count          INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  stock_reserved       INTEGER NOT NULL DEFAULT 0,   -- units held by active private sales
  images               TEXT[] NOT NULL DEFAULT '{}'
                       CHECK (array_length(images, 1) IS NULL OR array_length(images, 1) <= 10),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  gallery_featured     BOOLEAN NOT NULL DEFAULT false,
  gallery_sort_order   INTEGER,
  view_count           INTEGER NOT NULL DEFAULT 0,
  square_catalog_id    TEXT,
  square_variation_id  TEXT,
  pinterest_product_id TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atomic stock decrement — respects stock_reserved (updated in 038)
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INTEGER)
RETURNS SETOF products AS $$
  UPDATE products
  SET stock_count = stock_count - qty
  WHERE id = product_id AND stock_count - stock_reserved >= qty
  RETURNING *;
$$ LANGUAGE sql;

-- Atomic view count increment
CREATE OR REPLACE FUNCTION increment_view_count(product_id UUID)
RETURNS void AS $$
  UPDATE products SET view_count = view_count + 1 WHERE id = product_id;
$$ LANGUAGE sql;

-- Atomic stock restore (used to roll back decrements on checkout race condition)
CREATE OR REPLACE FUNCTION increment_stock(product_id UUID, qty INTEGER)
RETURNS void AS $$
  UPDATE products SET stock_count = stock_count + qty WHERE id = product_id;
$$ LANGUAGE sql;

-- Private sales — token-gated sale links (added in 038)
CREATE TABLE IF NOT EXISTS private_sales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  created_by    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  customer_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE private_sales ENABLE ROW LEVEL SECURITY;
-- No public access — service_role key bypasses RLS

-- Line items for each private sale (added in 038)
CREATE TABLE IF NOT EXISTS private_sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  private_sale_id  UUID NOT NULL REFERENCES private_sales(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  custom_price     NUMERIC(10,2) NOT NULL CHECK (custom_price > 0)
);

ALTER TABLE private_sale_items ENABLE ROW LEVEL SECURITY;

-- create_private_sale: atomic insert + reserve stock (added in 038)
CREATE OR REPLACE FUNCTION create_private_sale(sale JSONB, items JSONB)
RETURNS private_sales AS $$
DECLARE
  new_sale   private_sales;
  item       JSONB;
  prod       products;
BEGIN
  INSERT INTO private_sales (created_by, expires_at, customer_note)
  VALUES (
    sale->>'created_by',
    (sale->>'expires_at')::TIMESTAMPTZ,
    sale->>'customer_note'
  )
  RETURNING * INTO new_sale;

  FOR item IN SELECT * FROM jsonb_array_elements(items) LOOP
    INSERT INTO private_sale_items (private_sale_id, product_id, quantity, custom_price)
    VALUES (
      new_sale.id,
      (item->>'product_id')::UUID,
      (item->>'quantity')::INTEGER,
      (item->>'custom_price')::NUMERIC
    );

    SELECT * INTO prod FROM products WHERE id = (item->>'product_id')::UUID FOR UPDATE;
    IF prod.stock_count - prod.stock_reserved < (item->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', item->>'product_id';
    END IF;

    UPDATE products
    SET stock_reserved = stock_reserved + (item->>'quantity')::INTEGER
    WHERE id = (item->>'product_id')::UUID;
  END LOOP;

  RETURN new_sale;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- release_private_sale_stock: atomic revoke + release reserved stock (added in 038)
CREATE OR REPLACE FUNCTION release_private_sale_stock(sale_id UUID)
RETURNS void AS $$
DECLARE
  item private_sale_items;
BEGIN
  UPDATE private_sales
  SET revoked_at = NOW()
  WHERE id = sale_id AND revoked_at IS NULL;

  FOR item IN SELECT * FROM private_sale_items WHERE private_sale_id = sale_id LOOP
    UPDATE products
    SET stock_reserved = GREATEST(stock_reserved - item.quantity, 0)
    WHERE id = item.product_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- fulfill_private_sale: atomic complete — deducts stock and marks sale used (added in 038)
CREATE OR REPLACE FUNCTION fulfill_private_sale(sale_id UUID)
RETURNS private_sales AS $$
DECLARE
  sale private_sales;
  item private_sale_items;
BEGIN
  SELECT * INTO sale FROM private_sales WHERE id = sale_id FOR UPDATE;

  IF sale.used_at IS NOT NULL OR sale.revoked_at IS NOT NULL OR sale.expires_at <= NOW() THEN
    RAISE EXCEPTION 'SALE_NOT_ACTIVE';
  END IF;

  FOR item IN SELECT * FROM private_sale_items WHERE private_sale_id = sale_id LOOP
    UPDATE products
    SET stock_count = stock_count - item.quantity,
        stock_reserved = GREATEST(stock_reserved - item.quantity, 0)
    WHERE id = item.product_id;
  END LOOP;

  UPDATE private_sales SET used_at = NOW() WHERE id = sale_id
  RETURNING * INTO sale;

  RETURN sale;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
