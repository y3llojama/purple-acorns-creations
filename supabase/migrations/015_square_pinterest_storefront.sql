-- Products table — inventory source of truth
CREATE TABLE products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  description          TEXT,
  price                NUMERIC(10,2) NOT NULL,
  category             TEXT NOT NULL CHECK (category IN ('rings','necklaces','earrings','bracelets','crochet','other')),
  stock_count          INTEGER NOT NULL DEFAULT 0,
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

-- Channel sync log — per-product, per-channel sync state
CREATE TABLE channel_sync_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('square','pinterest','etsy')),
  status      TEXT NOT NULL CHECK (status IN ('pending','synced','error','conflict')),
  synced_at   TIMESTAMPTZ,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel)
);

-- Atomic stock decrement — returns updated row only if stock was available
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INTEGER)
RETURNS SETOF products AS $$
  UPDATE products
  SET stock_count = stock_count - qty
  WHERE id = product_id AND stock_count >= qty
  RETURNING *;
$$ LANGUAGE sql;

-- Link gallery photos to products
ALTER TABLE gallery ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Settings: OAuth tokens + channel config (drop iframe URL)
ALTER TABLE settings
  DROP COLUMN IF EXISTS square_store_url,
  ADD COLUMN IF NOT EXISTS square_access_token     TEXT,
  ADD COLUMN IF NOT EXISTS square_refresh_token    TEXT,
  ADD COLUMN IF NOT EXISTS square_location_id      TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_catalog_id    TEXT,
  ADD COLUMN IF NOT EXISTS gallery_max_items       INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS square_sync_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinterest_sync_enabled  BOOLEAN NOT NULL DEFAULT false;
