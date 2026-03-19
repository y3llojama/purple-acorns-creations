#!/usr/bin/env node
// Seeds all gallery images (featured + non-featured) into a fresh production DB.
// Safe to re-run — skips rows whose URL already exists.
//
// Usage (from project root):
//   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
//   node scripts/seed-production-gallery.mjs

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.')
  process.exit(1)
}

const supabase = createClient(url, key)

const rows = [
  // Featured — shown in the featured grid on the homepage
  { url: '/gallery/featured-sunflower-earrings.jpg',   alt_text: 'Sunflower Earrings',       is_featured: true,  sort_order: 10 },
  { url: '/gallery/featured-gold-flatlay.jpg',          alt_text: 'Brass Collection',         is_featured: true,  sort_order: 20 },
  { url: '/gallery/featured-moonlit-lace-earrings.jpg', alt_text: 'Moonlit Lace Earrings',    is_featured: true,  sort_order: 30 },
  { url: '/gallery/featured-rose-sword-earrings.jpg',   alt_text: 'Roses & Swords Earrings',  is_featured: true,  sort_order: 40 },
  { url: '/gallery/featured-sunflower-card.jpg',        alt_text: 'Locket Necklace',          is_featured: true,  sort_order: 50 },

  // Non-featured — shown in the scrollable story strip
  { url: '/gallery/gallery-owl-earrings.jpg',           alt_text: 'Owl Earrings',             is_featured: false, sort_order: 10 },
  { url: '/gallery/gallery-eye-chandelier-earrings.jpg',alt_text: 'Eye Chandelier Earrings',  is_featured: false, sort_order: 20 },
  { url: '/gallery/gallery-octopus-earrings.jpg',       alt_text: 'Octopus Earrings',         is_featured: false, sort_order: 30 },
  { url: '/gallery/gallery-dragonfly-earrings.jpg',     alt_text: 'Dragonfly Earrings',       is_featured: false, sort_order: 40 },
  { url: '/gallery/gallery-sunflower-necklace.jpg',     alt_text: 'Sunflower Necklace',       is_featured: false, sort_order: 50 },
  { url: '/gallery/gallery-seahorse-necklace.jpg',      alt_text: 'Seahorse Necklace',        is_featured: false, sort_order: 60 },
  { url: '/gallery/gallery-locket-necklace.jpg',        alt_text: 'Silver Heart Locket',      is_featured: false, sort_order: 70 },
]

async function seed() {
  // Check what's already in the DB so we don't duplicate
  const { data: existing, error: fetchErr } = await supabase.from('gallery').select('url')
  if (fetchErr) { console.error('fetch error:', fetchErr.message); process.exit(1) }

  const existingUrls = new Set((existing ?? []).map(r => r.url))
  const toInsert = rows.filter(r => !existingUrls.has(r.url))

  if (toInsert.length === 0) {
    console.log('All gallery rows already exist — nothing to insert.')
    return
  }

  const { error: insErr } = await supabase.from('gallery').insert(toInsert)
  if (insErr) { console.error('insert error:', insErr.message); process.exit(1) }

  console.log(`Inserted ${toInsert.length} rows (${rows.length - toInsert.length} already existed).`)
  toInsert.forEach(r => console.log(' +', r.url))
}

seed()
