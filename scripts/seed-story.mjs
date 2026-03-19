#!/usr/bin/env node
// Seed the story content into Supabase.
// Usage: node scripts/seed-story.mjs

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, '..', '.env.local')

// Parse .env.local manually (no dotenv dependency needed)
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('=').map((p, i) => i === 0 ? p.trim() : l.slice(l.indexOf('=') + 1).trim()))
)

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const STORY_TEASER = `We are Swati and Anouka — a mother and daughter who have always made things, side by side. Purple Acorns grew from shared evenings, a love of nature and culture, and the belief that handmade pieces should feel like a fresh way of seeing the world.`

const STORY_FULL = `## Our Story

We are Swati and Anouka — a mother and daughter, and makers of things.

For as long as we can remember, our hands have needed to be busy. Put on a show, pick up a project. Some evenings it's crochet. Others, it might be wire and stone, or sketching the wing of a dragonfly. We call it *creating as we consume* — the quiet hum of making that runs underneath ordinary life.

**Swati** has always found joy in creative expression, moving through mediums the way others move through seasons — mosaics, clay pottery, henna, baking custom cakes, quilting, knitting, and now jewellery. Not as a restless search, but as a natural curiosity: *what does this material want to become?*

**Anouka** is awed by the natural world. She draws fauna — particularly insects — with an attention that turns the overlooked into the extraordinary. She experiments at the edges of materials: stone and wire, wood and metal, fabric threaded with metal — always asking what happens when two unlike things are brought together.

Both of us are deeply inspired by the art and craft of our own culture. We carry those patterns, those colours, those ways of making — and we bring them into everything we create, alongside the new.

One day, Anouka looked around at the pieces we had made and asked a simple question: *could this be something?* That curiosity became Purple Acorns Creations.

The name comes from two things close to us. Purple is a colour we have always loved — in all its shades, from soft lavender to deep violet. And Acorns was Anouka's nickname at the time. Small. Full of potential. Something that starts quietly and grows.

We believe handmade things carry something that manufactured things cannot — the trace of a decision, a moment, a pair of hands. We make jewellery and wearable art that draws from nature, from culture, and from a willingness to see past what jewellery is *supposed* to look like. Traditional formats are a starting point, not a boundary.

We hope our pieces bring you a little of what making them brings us: joy, wonder, and a fresh way of seeing.

— Swati & Anouka`

const records = [
  { key: 'story_teaser',       value: STORY_TEASER },
  { key: 'story_full',         value: STORY_FULL },
  { key: 'story_full__format', value: 'markdown' },
]

const headers = {
  'Content-Type': 'application/json',
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Prefer': 'resolution=merge-duplicates',
}

for (const record of records) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/content?on_conflict=key`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...record, updated_at: new Date().toISOString() }),
    }
  )

  if (!res.ok) {
    const text = await res.text()
    console.error(`✗ Failed to upsert "${record.key}": ${res.status} ${text}`)
    process.exit(1)
  }

  console.log(`✓ ${record.key}`)
}

console.log('\nDone — story content is live.')
