-- Placeholder jewelry images — Creative Commons licensed via Openverse/Flickr
-- Run once in the Supabase dashboard SQL Editor: https://supabase.com/dashboard → SQL Editor
-- These are real CC-licensed photos for development. Replace with your own photos when ready.

-- Clear existing placeholder data (skip if you have real data you want to keep)
DELETE FROM gallery;
DELETE FROM featured_products;

-- Gallery images (mix of categories)
INSERT INTO gallery (url, alt_text, category, sort_order) VALUES
  -- Rings
  ('https://live.staticflickr.com/5606/15367822050_a5c7f07a60.jpg',
   'Gold and silver wedding ring set — handcrafted', 'rings', 1),
  ('https://live.staticflickr.com/3152/2828720276_abb2ce600e.jpg',
   'Pearl sterling silver wire-wrapped ring', 'rings', 2),

  -- Necklaces
  ('https://live.staticflickr.com/3114/3238697956_7bef4b18ef_b.jpg',
   'Briolette pendant handmade fashion necklace', 'necklaces', 3),
  ('https://live.staticflickr.com/4134/4819195662_ebb19bc96d.jpg',
   'Blue beaded artisan necklace', 'necklaces', 4),

  -- Earrings
  ('https://live.staticflickr.com/3508/3216462713_5d90c201a0_b.jpg',
   'Handmade fashion earrings', 'earrings', 5),
  ('https://live.staticflickr.com/3273/2948282925_ed69243b0a_b.jpg',
   'Briolette peridot drop earrings', 'earrings', 6),

  -- Bracelets
  ('https://live.staticflickr.com/4104/4988209903_c4f3f0a9a1_b.jpg',
   'Colorful beaded bracelets', 'bracelets', 7),
  ('https://live.staticflickr.com/3344/3205772253_7fb2ba1b2b.jpg',
   'Peyote beaded cuff bracelet', 'bracelets', 8),

  -- Crochet / other
  ('https://live.staticflickr.com/4121/4818572769_5543dc4d3c.jpg',
   'Crochet beaded pull-tab necklace with pendant', 'crochet', 9),
  ('https://live.staticflickr.com/3077/3247078310_cdf30325fd_b.jpg',
   'Artisan handmade jewelry collection', 'other', 10);

-- Featured products
INSERT INTO featured_products (name, price, description, image_url, sort_order, is_active) VALUES
  ('Luna Pendant Necklace', 48.00,
   'Handcrafted briolette pendant on a delicate sterling silver chain. Each piece is one of a kind.',
   'https://live.staticflickr.com/3114/3238697956_7bef4b18ef_b.jpg', 1, true),

  ('Silver Ring Set', 36.00,
   'A matching set of gold and silver rings, perfect for stacking. Handmade with care.',
   'https://live.staticflickr.com/5606/15367822050_a5c7f07a60.jpg', 2, true),

  ('Crochet Bead Bracelet', 28.00,
   'Hand-crocheted with love using seed beads in our signature color palette. No two are alike.',
   'https://live.staticflickr.com/4104/4988209903_c4f3f0a9a1_b.jpg', 3, true),

  ('Briolette Drop Earrings', 42.00,
   'Elegant peridot briolette drop earrings on sterling silver hooks. Light, airy, and beautiful.',
   'https://live.staticflickr.com/3273/2948282925_ed69243b0a_b.jpg', 4, true);
