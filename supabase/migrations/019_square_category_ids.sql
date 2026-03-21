-- Cache Square CATEGORY object IDs for each product category.
-- Stored as a JSONB map: { "rings": "SQID...", "necklaces": "SQID...", ... }
-- Populated by ensureSquareCategories() in lib/channels/square/catalog.ts.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS square_category_ids JSONB;
