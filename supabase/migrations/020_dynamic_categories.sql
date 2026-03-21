-- 020_dynamic_categories.sql
-- Creates categories table, seeds 6 rows, migrates products & gallery,
-- drops legacy category text columns and settings.square_category_ids.

-- 1. Create categories table
create table if not exists categories (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique,
  parent_id        uuid references categories(id) null,
  sort_order       integer not null default 9999,
  category_type    text not null default 'REGULAR_CATEGORY'
                     check (category_type in ('REGULAR_CATEGORY', 'MENU_CATEGORY')),
  online_visibility boolean not null default true,
  seo_title        text,
  seo_description  text,
  seo_permalink    text,
  square_category_id text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2. Seed the 6 existing categories (slugs match current products.category values)
insert into categories (name, slug, sort_order) values
  ('Rings',     'rings',     0),
  ('Necklaces', 'necklaces', 1),
  ('Earrings',  'earrings',  2),
  ('Bracelets', 'bracelets', 3),
  ('Crochet',   'crochet',   4),
  ('Other',     'other',     5)
on conflict (slug) do nothing;

-- 3. Add category_id FK to products
alter table products
  add column if not exists category_id uuid references categories(id);

-- 4. Backfill products (join on slug = existing lowercase text value)
update products
  set category_id = c.id
  from categories c
  where c.slug = products.category;

-- 5. Drop products.category CHECK constraint and column
alter table products drop column if exists category;

-- 6. Add category_id FK to gallery
alter table gallery
  add column if not exists category_id uuid references categories(id);

-- 7. Backfill gallery
update gallery
  set category_id = c.id
  from categories c
  where c.slug = gallery.category;

-- 8. Drop gallery.category CHECK constraint and column
alter table gallery drop column if exists category;

-- 9. Drop settings.square_category_ids (superseded by categories.square_category_id)
alter table settings drop column if exists square_category_ids;
