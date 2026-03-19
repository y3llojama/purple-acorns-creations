#!/usr/bin/env node
// Seed the 5 processed local images as featured gallery items.
// Removes old Flickr placeholder featured rows first.
// Usage: node scripts/seed-featured-local.mjs

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
try {
  readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
  })
} catch { /* fall through to process.env */ }

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const featured = [
  { url: '/gallery/featured-sunflower-earrings.jpg',   alt_text: 'Sunflower Earrings',       is_featured: true, sort_order: 10 },
  { url: '/gallery/featured-gold-flatlay.jpg',          alt_text: 'Brass Collection',         is_featured: true, sort_order: 20 },
  { url: '/gallery/featured-moonlit-lace-earrings.jpg', alt_text: 'Moonlit Lace Earrings',    is_featured: true, sort_order: 30 },
  { url: '/gallery/featured-rose-sword-earrings.jpg',   alt_text: 'Roses & Swords Earrings',  is_featured: true, sort_order: 40 },
  { url: '/gallery/featured-sunflower-card.jpg',        alt_text: 'Sunflower Drop Earrings',  is_featured: true, sort_order: 50 },
]

async function seed() {
  // Remove old Flickr placeholder featured rows
  const { error: delErr } = await supabase
    .from('gallery')
    .delete()
    .eq('is_featured', true)
    .like('url', '%flickr%')

  if (delErr) { console.error('delete error:', delErr.message); process.exit(1) }
  console.log('Removed old Flickr featured rows.')

  // Insert local images
  const { error: insErr } = await supabase.from('gallery').insert(featured)
  if (insErr) { console.error('insert error:', insErr.message); process.exit(1) }

  console.log(`Done! Inserted ${featured.length} featured images.`)
}

seed()
