-- Add square_url to gallery items so featured pieces can link to Square product pages
alter table gallery add column square_url text;

-- Drop the unused featured_products table (gallery with is_featured + square_url replaces it)
drop policy if exists "Public read products" on featured_products;
drop table if exists featured_products;
