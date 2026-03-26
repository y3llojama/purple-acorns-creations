-- Add featured flag to events so admin can pin one event to the homepage tile.
-- Only one event should be featured at a time (enforced in application logic).
ALTER TABLE events ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
