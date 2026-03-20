-- Seed products from featured_products (only if products table is empty)
INSERT INTO products (name, description, price, category, images, is_active, gallery_featured, gallery_sort_order)
SELECT
  name,
  description,
  COALESCE(price, 0),
  'other',
  CASE WHEN image_url IS NOT NULL AND image_url != '' THEN ARRAY[image_url] ELSE '{}' END,
  true,
  true,
  sort_order
FROM featured_products
WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1)
  AND name IS NOT NULL AND name != '';
