-- Saved lists (favorites) with anonymous token-based ownership and sharing.

CREATE TABLE saved_lists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  edit_token    UUID UNIQUE,
  slug          TEXT UNIQUE,
  is_snapshot   BOOLEAN NOT NULL DEFAULT false,
  source_list_id UUID REFERENCES saved_lists(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraint: slugs must be lowercase alphanumeric + hyphens, max 60 chars
ALTER TABLE saved_lists ADD CONSTRAINT slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9-]{1,60}$');

CREATE INDEX idx_saved_lists_last_accessed ON saved_lists (last_accessed_at);

CREATE TABLE saved_list_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID NOT NULL REFERENCES saved_lists(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, product_id)
);

CREATE INDEX idx_saved_list_items_list ON saved_list_items (list_id);
