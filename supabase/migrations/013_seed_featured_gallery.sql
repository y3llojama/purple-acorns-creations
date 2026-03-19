-- Replace placeholder featured items with the 5 processed local images.
-- Run in the Supabase dashboard SQL Editor.
--
-- Uses relative paths — Next.js serves these from /public/gallery/ in dev,
-- and they can be swapped for Supabase Storage URLs later without a schema change.

-- Remove old CC-placeholder items that were marked featured
DELETE FROM gallery WHERE is_featured = true AND url LIKE '%flickr%';

-- Insert the 5 processed images as featured items
-- sort_order 10–50 leaves room for admin-added items above (1–9) and below
INSERT INTO gallery (url, alt_text, is_featured, sort_order)
VALUES
  ('/gallery/featured-sunflower-earrings.jpg',   'Sunflower Earrings',       true, 10),
  ('/gallery/featured-gold-flatlay.jpg',          'Brass Collection',         true, 20),
  ('/gallery/featured-moonlit-lace-earrings.jpg', 'Moonlit Lace Earrings',    true, 30),
  ('/gallery/featured-rose-sword-earrings.jpg',   'Roses & Swords Earrings',  true, 40),
  ('/gallery/featured-sunflower-card.jpg',        'Sunflower Drop Earrings',  true, 50)
ON CONFLICT DO NOTHING;
