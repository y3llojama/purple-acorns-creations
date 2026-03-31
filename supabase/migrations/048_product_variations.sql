-- 048_product_variations.sql
-- Single Stock Authority: ALL products use product_variations for price/stock

-- ═══ New Tables ═══

CREATE TABLE item_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  display_name    TEXT NOT NULL DEFAULT '',
  is_reusable     BOOLEAN NOT NULL DEFAULT true,
  square_option_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE item_option_values (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id               UUID NOT NULL REFERENCES item_options(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  square_option_value_id  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_options (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES item_options(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, option_id)
);

CREATE TABLE product_variations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku                 TEXT,
  price               NUMERIC(10,2) NOT NULL,
  cost                NUMERIC(10,2),
  stock_count         INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  stock_reserved      INTEGER NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
  is_default          BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  image_url           TEXT,
  square_variation_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE variation_option_values (
  variation_id    UUID NOT NULL REFERENCES product_variations(id) ON DELETE CASCADE,
  option_value_id UUID NOT NULL REFERENCES item_option_values(id) ON DELETE CASCADE,
  PRIMARY KEY (variation_id, option_value_id)
);

CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id    UUID NOT NULL REFERENCES product_variations(id) ON DELETE CASCADE,
  quantity_change  INTEGER NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN (
    'sale', 'return', 'manual_adjustment', 'sync_correction',
    'shrinkage', 'reserved', 'released', 'initial_stock'
  )),
  source          TEXT NOT NULL CHECK (source IN ('website', 'square', 'admin_manual', 'system')),
  reference_id    TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_order_id TEXT,
  channel         TEXT NOT NULL CHECK (channel IN ('website', 'square_pos')),
  total_amount    NUMERIC(10,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'partial_refund')),
  customer_email  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  variation_id    UUID NOT NULL REFERENCES product_variations(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(10,2) NOT NULL,
  unit_cost       NUMERIC(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ ALTER existing tables ═══

ALTER TABLE products ADD COLUMN IF NOT EXISTS has_options BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE channel_sync_log
  ADD COLUMN IF NOT EXISTS variation_id UUID REFERENCES product_variations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS remote_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conflict_source TEXT CHECK (conflict_source IN ('square', 'website')),
  ADD COLUMN IF NOT EXISTS conflict_detail JSONB;

-- Replace existing unique constraint with variation-aware ones
ALTER TABLE channel_sync_log DROP CONSTRAINT IF EXISTS channel_sync_log_product_id_channel_key;
CREATE UNIQUE INDEX idx_csl_product_channel
  ON channel_sync_log(product_id, channel) WHERE variation_id IS NULL;
CREATE UNIQUE INDEX idx_csl_variation_channel
  ON channel_sync_log(product_id, variation_id, channel) WHERE variation_id IS NOT NULL;

-- saved_list_items and private_sale_items get variation_id
DO $$ BEGIN
  ALTER TABLE saved_list_items
    ADD COLUMN variation_id UUID REFERENCES product_variations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE private_sale_items
    ADD COLUMN variation_id UUID REFERENCES product_variations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ═══ Indexes ═══

CREATE INDEX idx_pv_product_id ON product_variations(product_id);
CREATE INDEX idx_pv_square_id ON product_variations(square_variation_id) WHERE square_variation_id IS NOT NULL;
CREATE UNIQUE INDEX idx_pv_sku ON product_variations(sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX idx_pv_one_default ON product_variations(product_id) WHERE is_default = true;

CREATE INDEX idx_vov_variation ON variation_option_values(variation_id);
CREATE INDEX idx_vov_option_value ON variation_option_values(option_value_id);
CREATE INDEX idx_iov_option ON item_option_values(option_id);
CREATE INDEX idx_po_option_id ON product_options(option_id);
CREATE INDEX idx_io_square_id ON item_options(square_option_id) WHERE square_option_id IS NOT NULL;
CREATE INDEX idx_iov_square_id ON item_option_values(square_option_value_id) WHERE square_option_value_id IS NOT NULL;

CREATE INDEX idx_sm_variation ON stock_movements(variation_id);
CREATE INDEX idx_sm_created ON stock_movements(created_at);

CREATE INDEX idx_orders_square ON orders(square_order_id) WHERE square_order_id IS NOT NULL;
CREATE INDEX idx_oli_variation ON order_line_items(variation_id);
CREATE INDEX idx_oli_order ON order_line_items(order_id);

-- ═══ View ═══

CREATE VIEW products_with_default AS
SELECT
  p.*,
  pv.id          AS default_variation_id,
  pv.price       AS effective_price,
  pv.stock_count AS effective_stock,
  pv.sku         AS default_sku,
  EXISTS (
    SELECT 1 FROM product_variations pv2
    WHERE pv2.product_id = p.id
      AND pv2.is_active = true
      AND pv2.stock_count - pv2.stock_reserved > 0
  ) AS any_in_stock
FROM products p
LEFT JOIN product_variations pv
  ON pv.product_id = p.id AND pv.is_default = true;

-- ═══ RPCs ═══

CREATE OR REPLACE FUNCTION decrement_variation_stock(var_id UUID, qty INTEGER)
RETURNS SETOF product_variations AS $$
  UPDATE product_variations
  SET stock_count = stock_count - qty,
      updated_at = now()
  WHERE id = var_id
    AND qty > 0
    AND stock_count - stock_reserved >= qty
    AND is_active = true
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_variation_stock(var_id UUID, qty INTEGER)
RETURNS SETOF product_variations AS $$
  UPDATE product_variations
  SET stock_count = stock_count + qty,
      updated_at = now()
  WHERE id = var_id
    AND qty > 0
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER;

-- ═══ Trigger: has_options auto-set ═══

CREATE OR REPLACE FUNCTION update_has_options() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products SET has_options = true WHERE id = NEW.product_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products SET has_options = (
      EXISTS (SELECT 1 FROM product_options WHERE product_id = OLD.product_id)
    ) WHERE id = OLD.product_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_has_options
AFTER INSERT OR DELETE ON product_options
FOR EACH ROW EXECUTE FUNCTION update_has_options();

-- ═══ Backfill: create one default variation per existing product ═══

INSERT INTO product_variations (product_id, price, stock_count, stock_reserved, square_variation_id, is_default, is_active)
SELECT id, price, stock_count, stock_reserved, square_variation_id, true, true
FROM products;

-- Write initial_stock movement for each backfilled variation
INSERT INTO stock_movements (variation_id, quantity_change, reason, source)
SELECT pv.id, pv.stock_count, 'initial_stock', 'system'
FROM product_variations pv;

-- ═══ RLS (service role only — same pattern as products) ═══

ALTER TABLE product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;
