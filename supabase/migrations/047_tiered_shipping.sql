-- Tiered shipping: separate rates for US domestic, Canada/Mexico, and international.
-- Existing shipping_mode + shipping_value remain as the US domestic tier.
-- New tiers default to free shipping (value = 0) until admin configures them.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS shipping_mode_canada_mexico  TEXT          NOT NULL DEFAULT 'fixed'
    CHECK (shipping_mode_canada_mexico IN ('fixed', 'percentage')),
  ADD COLUMN IF NOT EXISTS shipping_value_canada_mexico NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (shipping_value_canada_mexico >= 0),
  ADD COLUMN IF NOT EXISTS shipping_mode_intl           TEXT          NOT NULL DEFAULT 'fixed'
    CHECK (shipping_mode_intl IN ('fixed', 'percentage')),
  ADD COLUMN IF NOT EXISTS shipping_value_intl          NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (shipping_value_intl >= 0);
