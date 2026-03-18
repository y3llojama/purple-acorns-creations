-- Follow Along: curated photo gallery mode for the Instagram/Follow Along section
-- Adds a mode toggle to settings and a dedicated table for follow-along photos

ALTER TABLE settings ADD COLUMN follow_along_mode text DEFAULT 'widget'
  CHECK (follow_along_mode IN ('gallery', 'widget'));

CREATE TABLE follow_along_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE follow_along_photos ENABLE ROW LEVEL SECURITY;
-- No public SELECT policy — reads go through service role on server side

CREATE INDEX idx_follow_along_photos_order ON follow_along_photos (display_order);
