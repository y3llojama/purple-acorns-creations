-- supabase/migrations/038_private_sales_shipping.sql

-- 1. Add stock_reserved to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_reserved INTEGER NOT NULL DEFAULT 0;

-- 2. Add CHECK constraint to stock_count (floor at 0)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_stock_count_non_negative'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_stock_count_non_negative CHECK (stock_count >= 0);
  END IF;
END $$;

-- 3. Update decrement_stock to respect stock_reserved
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INTEGER)
RETURNS SETOF products AS $$
  UPDATE products
  SET stock_count = stock_count - qty
  WHERE id = product_id AND stock_count - stock_reserved >= qty
  RETURNING *;
$$ LANGUAGE sql;

-- 4. Shipping config in settings
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS shipping_mode  TEXT          NOT NULL DEFAULT 'fixed'
    CHECK (shipping_mode IN ('fixed', 'percentage')),
  ADD COLUMN IF NOT EXISTS shipping_value NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (shipping_value >= 0);

-- 5. private_sales table
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

-- 6. private_sale_items table
CREATE TABLE IF NOT EXISTS private_sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  private_sale_id  UUID NOT NULL REFERENCES private_sales(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  custom_price     NUMERIC(10,2) NOT NULL CHECK (custom_price > 0)
);

ALTER TABLE private_sale_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS private_sale_items_sale_id_idx ON private_sale_items(private_sale_id);

-- 7. create_private_sale: atomic insert + reserve
CREATE OR REPLACE FUNCTION create_private_sale(sale JSONB, items JSONB)
RETURNS private_sales AS $$
DECLARE
  new_sale   private_sales;
  item       JSONB;
  prod       products;
BEGIN
  -- Insert sale row
  INSERT INTO private_sales (created_by, expires_at, customer_note)
  VALUES (
    sale->>'created_by',
    (sale->>'expires_at')::TIMESTAMPTZ,
    sale->>'customer_note'
  )
  RETURNING * INTO new_sale;

  -- Insert items and reserve stock
  FOR item IN SELECT * FROM jsonb_array_elements(items) LOOP
    -- Lock row first, then check available stock
    SELECT * INTO prod FROM products WHERE id = (item->>'product_id')::UUID FOR UPDATE;
    IF prod.stock_count - prod.stock_reserved < (item->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', item->>'product_id';
    END IF;

    UPDATE products
    SET stock_reserved = stock_reserved + (item->>'quantity')::INTEGER
    WHERE id = (item->>'product_id')::UUID;

    INSERT INTO private_sale_items (private_sale_id, product_id, quantity, custom_price)
    VALUES (
      new_sale.id,
      (item->>'product_id')::UUID,
      (item->>'quantity')::INTEGER,
      (item->>'custom_price')::NUMERIC
    );
  END LOOP;

  RETURN new_sale;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. release_private_sale_stock: soft-revoke + release reserved stock
-- revoked_at update is fully idempotent (only sets if not already set)
-- stock_reserved decrement is safe to call multiple times — GREATEST guard
-- prevents negative values, though only the first effective call fully decrements
CREATE OR REPLACE FUNCTION release_private_sale_stock(sale_id UUID)
RETURNS void AS $$
DECLARE
  item private_sale_items;
BEGIN
  -- Soft-revoke (idempotent — only sets if not already set)
  UPDATE private_sales
  SET revoked_at = NOW()
  WHERE id = sale_id AND revoked_at IS NULL;

  -- Release reserved stock (GREATEST guard prevents negative)
  FOR item IN SELECT * FROM private_sale_items WHERE private_sale_id = sale_id LOOP
    UPDATE products
    SET stock_reserved = GREATEST(stock_reserved - item.quantity, 0)
    WHERE id = item.product_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. fulfill_private_sale: atomic complete
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
    -- Lock product row before decrementing (prevents race with concurrent public checkout)
    PERFORM id FROM products WHERE id = item.product_id FOR UPDATE;
    -- Decrement stock_count (CHECK constraint enforces >= 0)
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
