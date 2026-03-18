#!/usr/bin/env node
// Seed placeholder jewelry images (Creative Commons, via Openverse/Flickr)
// Usage: node scripts/seed-placeholder-images.mjs
// Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load .env.local manually (no dotenv dependency needed)
const env = {}
try {
  readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
  })
} catch { /* .env.local not found, fall through to process.env */ }

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const gallery = [
  { url: 'https://live.staticflickr.com/5606/15367822050_a5c7f07a60.jpg',  alt_text: 'Gold and silver wedding ring set — handcrafted',           category: 'rings',     sort_order: 1 },
  { url: 'https://live.staticflickr.com/3152/2828720276_abb2ce600e.jpg',   alt_text: 'Pearl sterling silver wire-wrapped ring',                  category: 'rings',     sort_order: 2 },
  { url: 'https://live.staticflickr.com/3114/3238697956_7bef4b18ef_b.jpg', alt_text: 'Briolette pendant handmade fashion necklace',               category: 'necklaces', sort_order: 3 },
  { url: 'https://live.staticflickr.com/4134/4819195662_ebb19bc96d.jpg',   alt_text: 'Blue beaded artisan necklace',                             category: 'necklaces', sort_order: 4 },
  { url: 'https://live.staticflickr.com/3508/3216462713_5d90c201a0_b.jpg', alt_text: 'Handmade fashion earrings',                                category: 'earrings',  sort_order: 5 },
  { url: 'https://live.staticflickr.com/3273/2948282925_ed69243b0a_b.jpg', alt_text: 'Briolette peridot drop earrings',                          category: 'earrings',  sort_order: 6 },
  { url: 'https://live.staticflickr.com/4104/4988209903_c4f3f0a9a1_b.jpg', alt_text: 'Colorful beaded bracelets',                                category: 'bracelets', sort_order: 7 },
  { url: 'https://live.staticflickr.com/3344/3205772253_7fb2ba1b2b.jpg',   alt_text: 'Peyote beaded cuff bracelet',                              category: 'bracelets', sort_order: 8 },
  { url: 'https://live.staticflickr.com/4121/4818572769_5543dc4d3c.jpg',   alt_text: 'Crochet beaded pull-tab necklace with pendant',            category: 'crochet',   sort_order: 9 },
  { url: 'https://live.staticflickr.com/3077/3247078310_cdf30325fd_b.jpg', alt_text: 'Artisan handmade jewelry collection flat lay',             category: 'other',     sort_order: 10 },
]

const products = [
  { name: 'Luna Pendant Necklace',  price: 48.00, description: 'Handcrafted briolette pendant on a delicate sterling silver chain. Each piece is one of a kind.', image_url: 'https://live.staticflickr.com/3114/3238697956_7bef4b18ef_b.jpg', sort_order: 1, is_active: true },
  { name: 'Silver Ring Set',        price: 36.00, description: 'A matching set of gold and silver rings, perfect for stacking. Handmade with care.',               image_url: 'https://live.staticflickr.com/5606/15367822050_a5c7f07a60.jpg',  sort_order: 2, is_active: true },
  { name: 'Crochet Bead Bracelet',  price: 28.00, description: 'Hand-crocheted with love using seed beads in our signature color palette. No two are alike.',     image_url: 'https://live.staticflickr.com/4104/4988209903_c4f3f0a9a1_b.jpg', sort_order: 3, is_active: true },
  { name: 'Briolette Drop Earrings',price: 42.00, description: 'Elegant peridot briolette drop earrings on sterling silver hooks. Light, airy, and beautiful.',   image_url: 'https://live.staticflickr.com/3273/2948282925_ed69243b0a_b.jpg', sort_order: 4, is_active: true },
]

async function seed() {
  console.log('Clearing existing gallery and featured_products...')
  await supabase.from('gallery').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('featured_products').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  console.log('Inserting gallery images...')
  const { error: gErr } = await supabase.from('gallery').insert(gallery)
  if (gErr) { console.error('gallery insert error:', gErr.message); process.exit(1) }

  console.log('Inserting featured products...')
  const { error: pErr } = await supabase.from('featured_products').insert(products)
  if (pErr) { console.error('featured_products insert error:', pErr.message); process.exit(1) }

  console.log('Done! Seeded', gallery.length, 'gallery images and', products.length, 'featured products.')
}

seed()
