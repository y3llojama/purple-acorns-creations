# Markets Intel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/admin/markets` page with tabbed tables (Craft Fairs + Stores & Collectives) seeded with real New England data, full CRUD, client-side search, background AI-powered discovery, and a 24-hour Vercel cron refresh.

**Architecture:** Two new Supabase tables (`craft_fairs`, `artist_venues`) with admin-only RLS. `DiscoveryProvider`/`DiscoveryBanner` are currently a layout-level singleton wrapping all admin pages with no props — they must be moved out of the shared layout and into each individual page so each can configure its own endpoint. A tabbed `MarketsManager` client component handles search + CRUD. A shared `lib/markets-discovery.ts` module holds the Tavily + AI extraction logic reused by both the on-demand discover route and the daily cron route.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + service role client), Tavily search API, configurable AI provider (Claude/OpenAI/Groq), Vercel cron jobs, Jest + Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/023_markets.sql` | Create | `craft_fairs` + `artist_venues` tables, UNIQUE constraints, RLS, `updated_at` triggers |
| `supabase/migrations/024_markets_seed.sql` | Create | ~20 craft fairs + ~12 stores/collectives initial data |
| `lib/supabase/types.ts` | Modify | Add `CraftFair` and `ArtistVenue` types |
| `app/admin/(dashboard)/layout.tsx` | Modify | Remove `<DiscoveryProvider>` and `<DiscoveryBanner>` — move to individual page components |
| `components/admin/DiscoveryProvider.tsx` | Modify | Accept `endpoint`, `pollEndpoint`, `noun` props |
| `components/admin/DiscoveryBanner.tsx` | Modify | Accept `searchingMessage` prop |
| `app/admin/(dashboard)/events/page.tsx` | Modify | Wrap `EventsManager` in `<DiscoveryProvider>` + render `<DiscoveryBanner>` directly |
| `lib/markets-discovery.ts` | Create | Shared `runMarketsDiscovery()` function (Tavily + AI + insert logic) |
| `app/admin/(dashboard)/markets/page.tsx` | Create | Server component — fetch both tables, wrap in `<DiscoveryProvider>` |
| `components/admin/MarketsManager.tsx` | Create | Tabbed UI, client-side search, CRUD, discovery button, `<DiscoveryBanner>` |
| `app/api/admin/markets/route.ts` | Create | GET `{ craft_fairs, artist_venues }` / POST / PUT / DELETE (both tables via `?table=` param) |
| `app/api/admin/markets/fairs/route.ts` | Create | GET flat array of `craft_fairs` (used by discovery polling) |
| `app/api/admin/markets/discover/route.ts` | Create | POST — calls `runMarketsDiscovery()`, guarded by `requireAdminSession()` |
| `app/api/cron/markets-refresh/route.ts` | Create | GET — calls `runMarketsDiscovery()`, guarded by `Authorization: Bearer CRON_SECRET` |
| `vercel.json` | Modify | Add `/api/cron/markets-refresh` at `0 4 * * *` |
| `components/admin/AdminSidebar.tsx` | Modify | Add Markets nav item |
| `__tests__/components/admin/MarketsManager.test.tsx` | Create | Render, tab switch, search filter, form visibility tests |

---

## Task 1: Database Migration — Tables + Triggers

**Files:**
- Create: `supabase/migrations/023_markets.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/023_markets.sql
create table if not exists craft_fairs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text not null,
  website_url text,
  instagram_url text,
  years_in_operation text,
  avg_artists text,
  avg_shoppers text,
  typical_months text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists artist_venues (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location text not null,
  website_url text,
  instagram_url text,
  hosting_model text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at on row changes
-- Note: the project already has a set_updated_at() function from an earlier migration.
-- Reuse it here rather than creating a duplicate function with a different name.
create trigger craft_fairs_updated_at
  before update on craft_fairs
  for each row execute function set_updated_at();

create trigger artist_venues_updated_at
  before update on artist_venues
  for each row execute function set_updated_at();

-- No public SELECT — admin only via service role
alter table craft_fairs enable row level security;
alter table artist_venues enable row level security;
```

> **Note:** `UNIQUE` on `name` is required for `ON CONFLICT (name) DO NOTHING` in the seed.

- [ ] **Step 2: Apply migration in Supabase SQL editor**

Open Supabase dashboard → SQL editor → paste and run `023_markets.sql`. Verify both tables appear in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/023_markets.sql
git commit -m "feat: add craft_fairs and artist_venues tables with RLS and unique name constraint"
```

---

## Task 2: Seed Data Migration

**Files:**
- Create: `supabase/migrations/024_markets_seed.sql`

- [ ] **Step 1: Write the seed migration**

```sql
-- supabase/migrations/024_markets_seed.sql
-- New England Craft Fairs (seeded 2026-03-22)
insert into craft_fairs (name, location, website_url, instagram_url, years_in_operation, avg_artists, avg_shoppers, typical_months, notes)
values
  ('Boston Renegade Craft Fair', 'Boston, MA', 'https://renegadecraft.com/boston', 'https://www.instagram.com/renegadecraft/', 'est. 2003', '200+', '10,000+', 'October', null),
  ('Providence Flea', 'Providence, RI', 'https://providenceflea.com', 'https://www.instagram.com/providenceflea/', 'est. 2011', '60–100', '2,000–5,000', 'May–October (weekly)', null),
  ('Cambridge Arts River Festival', 'Cambridge, MA', 'https://cambridgearts.org/programs/riverfestival/', null, 'est. 1978', '100+', '50,000+', 'June', null),
  ('South End Open Market', 'Boston, MA', 'https://southendopenmarket.com', 'https://www.instagram.com/southendopenmarket/', 'est. 2006', '80–120', '3,000–8,000', 'May–October (Sundays)', null),
  ('Vermont Holiday Craft Fair', 'Burlington, VT', 'https://vhcf.org', null, 'est. 1975', '150+', '5,000+', 'November', null),
  ('CraftBoston Holiday', 'Boston, MA', 'https://societyofcrafts.org/craftboston', 'https://www.instagram.com/craftboston/', 'est. 1993', '100+', '8,000+', 'December', null),
  ('Worcester Craft Center Craft Fair', 'Worcester, MA', 'https://worcestercraftcenter.org', null, 'est. 1960s', '50–80', '1,000–3,000', 'November', null),
  ('Northampton Arts & Crafts Fair', 'Northampton, MA', null, null, '20+ years', '80–120', '2,000–4,000', 'May', null),
  ('Portland Flea-for-All', 'Portland, ME', 'https://portlandfleatreasures.com', 'https://www.instagram.com/portlandfleatreasures/', 'est. 2010', '60–90', '1,500–3,000', 'May–October (Sundays)', null),
  ('Seacoast Artist Association Fair', 'Exeter, NH', 'https://seacoastartist.org', null, '50+ years', '50–80', '1,000–2,500', 'July', null),
  ('Deerfield Craft Fair', 'Deerfield, NH', 'https://nhcrafts.org/deerfield', 'https://www.instagram.com/nhcraftsfairs/', 'est. 1971', '250+', '10,000+', 'September', null),
  ('League of NH Craftsmen Fair', 'Newbury, NH', 'https://nhcrafts.org/fair', null, 'est. 1933', '200+', '15,000+', 'August', null),
  ('Newport Craft Fair', 'Newport, RI', null, null, '10+ years', '40–60', '1,000–2,000', 'October', null),
  ('Waltham Mills Open Studios', 'Waltham, MA', 'https://walthamcreativearts.com', null, '15+ years', '80+', '2,000+', 'November', null),
  ('Lowell Summer Music Series Market', 'Lowell, MA', 'https://lowellsummermusic.org', 'https://www.instagram.com/lowellsummermusic/', 'est. 1982', '30–50', '3,000+', 'July–August', null),
  ('Marlborough Harvest Day Craft Fair', 'Marlborough, MA', 'https://visit-marlborough.com', null, '20+ years', '50–80', '2,000–4,000', 'October', null),
  ('Big E Eastern States Exposition', 'West Springfield, MA', 'https://thebige.com', 'https://www.instagram.com/thebige/', 'est. 1916', '100+', '100,000+ (total fair)', 'September', null),
  ('SoWa Open Market', 'Boston, MA', 'https://sowaboston.com', 'https://www.instagram.com/sowaboston/', 'est. 2006', '100+', '5,000+', 'May–October (Sundays)', null),
  ('Jamaica Plain Open Studios', 'Jamaica Plain, MA', 'https://jpopenStudios.org', 'https://www.instagram.com/jpopenStudios/', 'est. 1994', '100+', '5,000+', 'October', null),
  ('Putnam Arts Council Craft Fair', 'Putnam, CT', null, null, '15+ years', '30–50', '500–1,500', 'November', null)
on conflict (name) do nothing;

-- Artist-Hosting Stores & Collectives
insert into artist_venues (name, location, website_url, instagram_url, hosting_model, notes)
values
  ('Brighton Bazaar', 'Brighton, MA', 'https://www.brightonbazaar.com', 'https://www.instagram.com/brightonbazaar/', 'Vendor market / pop-up collective', 'Was selling here until recently'),
  ('Imagine Gift Store', 'Narragansett, RI', null, null, 'Consignment', 'Was selling here'),
  ('Coop Gallery', 'Northampton, MA', 'https://coopgallery.org', 'https://www.instagram.com/coopgallery/', 'Member cooperative / consignment', null),
  ('Artisan''s Asylum Shop', 'Somerville, MA', 'https://artisansasylum.com', 'https://www.instagram.com/artisansasylum/', 'Member collective retail', null),
  ('Made in Lowell', 'Lowell, MA', null, 'https://www.instagram.com/madeinlowell/', 'Consignment / local artist focus', null),
  ('The Maker''s Toolbox', 'Worcester, MA', null, null, 'Consignment + booth rental', null),
  ('Circle of Crafts', 'Plymouth, MA', null, null, 'Collective / consignment', null),
  ('Craftland', 'Providence, RI', 'https://craftlandshop.com', 'https://www.instagram.com/craftlandshop/', 'Curated consignment / wholesale', null),
  ('Reverie Boutique', 'Portsmouth, NH', null, 'https://www.instagram.com/reverieboutiqueph/', 'Consignment / local artists', null),
  ('Wild Craft Emporium', 'Portland, ME', null, null, 'Collective / booth rental', null),
  ('Trident Booksellers & Café', 'Boston, MA', 'https://www.tridentbookscafe.com', 'https://www.instagram.com/tridentbooksboston/', 'Rotating art display / consignment', null),
  ('The Paper Store', 'Various MA/NH/RI', 'https://thepaperstore.com', null, 'Local artist wholesale program', null)
on conflict (name) do nothing;
```

- [ ] **Step 2: Apply in Supabase SQL editor**

Run `024_markets_seed.sql`. Verify rows appear in both tables.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/024_markets_seed.sql
git commit -m "feat: seed craft fairs and artist venues with New England data"
```

---

## Task 3: TypeScript Types

**Files:**
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Append types to end of file**

```typescript
export interface CraftFair {
  id: string
  name: string
  location: string
  website_url: string | null
  instagram_url: string | null
  years_in_operation: string | null
  avg_artists: string | null
  avg_shoppers: string | null
  typical_months: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ArtistVenue {
  id: string
  name: string
  location: string
  website_url: string | null
  instagram_url: string | null
  hosting_model: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat: add CraftFair and ArtistVenue types"
```

---

## Task 4: Refactor DiscoveryProvider — Move Out of Layout, Make Configurable

**Files:**
- Modify: `app/admin/(dashboard)/layout.tsx` — REMOVE DiscoveryProvider and DiscoveryBanner
- Modify: `components/admin/DiscoveryProvider.tsx` — add `endpoint`, `pollEndpoint`, `noun` props
- Modify: `components/admin/DiscoveryBanner.tsx` — add `searchingMessage` prop
- Modify: `app/admin/(dashboard)/events/page.tsx` — wrap EventsManager with its own DiscoveryProvider + render DiscoveryBanner

> **Why:** `DiscoveryProvider` is currently a singleton in `app/admin/(dashboard)/layout.tsx` with no props, hardcoded to the events endpoints. Moving it to individual pages allows each page to configure its own endpoint without a shared-state collision.

- [ ] **Step 1: Remove DiscoveryProvider and DiscoveryBanner from layout.tsx**

Replace the content of `app/admin/(dashboard)/layout.tsx`:

```tsx
import AdminSidebar from '@/components/admin/AdminSidebar'
import { getSettings } from '@/lib/theme'
import styles from './layout.module.css'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <AdminSidebar businessName={settings.business_name} />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Update DiscoveryProvider to accept endpoint/pollEndpoint/noun props**

Replace the content of `components/admin/DiscoveryProvider.tsx`:

```tsx
'use client'
import { createContext, useContext, useState, useCallback, useRef } from 'react'

type DiscoverState = 'idle' | 'searching' | 'done'

interface DiscoveryContextValue {
  state: DiscoverState
  message: string | null
  error: string | null
  startDiscovery: () => void
  dismiss: () => void
}

const DiscoveryContext = createContext<DiscoveryContextValue>({
  state: 'idle',
  message: null,
  error: null,
  startDiscovery: () => {},
  dismiss: () => {},
})

export function useDiscovery() {
  return useContext(DiscoveryContext)
}

interface ProviderProps {
  children: React.ReactNode
  endpoint: string        // POST target, e.g. '/api/admin/events/discover'
  pollEndpoint: string    // GET for count polling, must return a flat JSON array
  noun?: string           // plural noun for success messages, default: 'item'
}

export function DiscoveryProvider({ children, endpoint, pollEndpoint, noun = 'item' }: ProviderProps) {
  const [state, setState] = useState<DiscoverState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resolvedRef = useRef(false)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const resolve = useCallback((msg: string | null, err: string | null) => {
    if (resolvedRef.current) return
    resolvedRef.current = true
    stopPolling()
    setMessage(msg)
    setError(err)
    setState('done')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback(() => {
    setState('idle')
    setMessage(null)
    setError(null)
    resolvedRef.current = false
  }, [])

  const startDiscovery = useCallback(async () => {
    if (state === 'searching') return
    setState('searching')
    setMessage(null)
    setError(null)
    resolvedRef.current = false

    let baseCount = 0
    try {
      const r = await fetch(pollEndpoint)
      if (r.ok) { const data = await r.json(); baseCount = Array.isArray(data) ? data.length : 0 }
    } catch { /* best-effort */ }

    const discoverPromise = fetch(endpoint, { method: 'POST', keepalive: true })
      .then(r => r.ok ? r.json() : r.json().then((d: { error?: string }) => ({ error: d.error ?? 'Discovery failed. Please try again.' })))
      .catch(() => ({ error: 'Discovery failed. Please try again.' }))

    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const r = await fetch(pollEndpoint)
        if (r.ok) {
          const data = await r.json()
          const newCount = Array.isArray(data) ? data.length : 0
          if (newCount > baseCount) {
            const added = newCount - baseCount
            resolve(`${added} ${noun}${added !== 1 ? 's' : ''} added!`, null)
            return
          }
        }
      } catch { /* best-effort */ }
      if (attempts >= 20) stopPolling()
    }, 5000)

    discoverPromise.then((data: { added?: number; skipped?: number; error?: string }) => {
      if (data.error) {
        resolve(null, data.error)
      } else if ((data.added ?? 0) > 0) {
        const added = data.added!
        resolve(`${added} ${noun}${added !== 1 ? 's' : ''} added${data.skipped ? `, ${data.skipped} already in your list` : ''}!`, null)
      } else {
        resolve('No new items found.', null)
      }
    })
  }, [state, resolve, endpoint, pollEndpoint, noun])

  return (
    <DiscoveryContext.Provider value={{ state, message, error, startDiscovery, dismiss }}>
      {children}
    </DiscoveryContext.Provider>
  )
}
```

- [ ] **Step 3: Update DiscoveryBanner to accept searchingMessage prop**

Replace content of `components/admin/DiscoveryBanner.tsx`:

```tsx
'use client'
import { useDiscovery } from './DiscoveryProvider'

interface Props { searchingMessage?: string }

export default function DiscoveryBanner({ searchingMessage = 'Searching in the background — you can keep using the admin while this runs.' }: Props) {
  const { state, message, error, dismiss } = useDiscovery()
  if (state === 'idle') return null

  const searching = state === 'searching'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 20px',
        marginBottom: '20px',
        borderRadius: '4px',
        border: `1px solid ${error ? '#c05050' : 'var(--color-border)'}`,
        background: error ? '#fff5f5' : 'var(--color-surface)',
        fontSize: '15px',
        color: error ? '#c05050' : 'var(--color-text)',
      }}
    >
      <span>{searching ? searchingMessage : (error ?? message)}</span>
      {!searching && (
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--color-text-muted)', lineHeight: 1, padding: '4px 8px', minHeight: '36px' }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update events/page.tsx to wrap with its own DiscoveryProvider**

Replace content of `app/admin/(dashboard)/events/page.tsx`:

```tsx
import { createServiceRoleClient } from '@/lib/supabase/server'
import EventsManager from '@/components/admin/EventsManager'
import { DiscoveryProvider } from '@/components/admin/DiscoveryProvider'
import DiscoveryBanner from '@/components/admin/DiscoveryBanner'

export const metadata = { title: 'Admin — Events' }

export default async function EventsAdminPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('events').select('*').order('date')
  return (
    <DiscoveryProvider
      endpoint="/api/admin/events/discover"
      pollEndpoint="/api/admin/events"
      noun="event"
    >
      <DiscoveryBanner searchingMessage="Searching for events in the background — you can keep using the admin while this runs." />
      <EventsManager initialEvents={data ?? []} />
    </DiscoveryProvider>
  )
}
```

> **Also:** Remove the `<DiscoveryBanner />` render from `EventsManager.tsx` if it renders it internally. Check the component — if `DiscoveryBanner` is rendered inside `EventsManager`, remove it (it's now rendered in the page wrapper above). If it's not rendered there, no change needed.

- [ ] **Step 5: Verify events discovery still works**

Run `scripts/dev.sh`. Navigate to `/admin/events`. Click "Find Events". Verify banner appears and no console errors.

- [ ] **Step 6: Commit**

```bash
git add app/admin/\(dashboard\)/layout.tsx \
        app/admin/\(dashboard\)/events/page.tsx \
        components/admin/DiscoveryProvider.tsx \
        components/admin/DiscoveryBanner.tsx
git commit -m "refactor: move DiscoveryProvider to page-level scope, add endpoint/pollEndpoint/noun props"
```

---

## Task 5: Markets API Routes

**Files:**
- Create: `app/api/admin/markets/route.ts`
- Create: `app/api/admin/markets/fairs/route.ts`

### `app/api/admin/markets/route.ts`

- [ ] **Step 1: Write the combined CRUD route**

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

type TableName = 'craft_fairs' | 'artist_venues'

function resolveTable(url: string): TableName | null {
  const param = new URL(url).searchParams.get('table')
  if (param === 'fairs') return 'craft_fairs'
  if (param === 'venues') return 'artist_venues'
  return null
}

function sanitizeUrls(body: Record<string, unknown>) {
  return {
    website_url: body.website_url ? (isValidHttpsUrl(String(body.website_url)) ? String(body.website_url) : null) : null,
    instagram_url: body.instagram_url ? (isValidHttpsUrl(String(body.instagram_url)) ? String(body.instagram_url) : null) : null,
  }
}

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const [{ data: craft_fairs }, { data: artist_venues }] = await Promise.all([
    supabase.from('craft_fairs').select('*').order('name'),
    supabase.from('artist_venues').select('*').order('name'),
  ])
  return NextResponse.json({ craft_fairs: craft_fairs ?? [], artist_venues: artist_venues ?? [] })
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const table = resolveTable(request.url)
  if (!table) return NextResponse.json({ error: 'table param required: fairs or venues' }, { status: 400 })
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const name = sanitizeText(clampLength(String(body.name ?? ''), 200))
  const location = sanitizeText(clampLength(String(body.location ?? ''), 300))
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!location) return NextResponse.json({ error: 'location required' }, { status: 400 })
  const { website_url, instagram_url } = sanitizeUrls(body)
  const notes = body.notes ? sanitizeText(clampLength(String(body.notes), 1000)) || null : null
  const supabase = createServiceRoleClient()
  const shared = { name, location, website_url, instagram_url, notes }

  if (table === 'craft_fairs') {
    const { data, error: dbError } = await supabase.from('craft_fairs').insert({
      ...shared,
      years_in_operation: body.years_in_operation ? sanitizeText(clampLength(String(body.years_in_operation), 100)) || null : null,
      avg_artists: body.avg_artists ? sanitizeText(clampLength(String(body.avg_artists), 100)) || null : null,
      avg_shoppers: body.avg_shoppers ? sanitizeText(clampLength(String(body.avg_shoppers), 100)) || null : null,
      typical_months: body.typical_months ? sanitizeText(clampLength(String(body.typical_months), 200)) || null : null,
    }).select().single()
    if (dbError) return NextResponse.json({ error: 'Failed to create fair' }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } else {
    const { data, error: dbError } = await supabase.from('artist_venues').insert({
      ...shared,
      hosting_model: body.hosting_model ? sanitizeText(clampLength(String(body.hosting_model), 200)) || null : null,
    }).select().single()
    if (dbError) return NextResponse.json({ error: 'Failed to create venue' }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }
}

export async function PUT(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const table = resolveTable(request.url)
  if (!table) return NextResponse.json({ error: 'table param required: fairs or venues' }, { status: 400 })
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const { id, ...fields } = body as { id?: string } & Record<string, unknown>
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const update: Record<string, string | null> = {}
  if (fields.name !== undefined) update.name = sanitizeText(clampLength(String(fields.name), 200))
  if (fields.location !== undefined) update.location = sanitizeText(clampLength(String(fields.location), 300))
  if (fields.website_url !== undefined) update.website_url = fields.website_url ? (isValidHttpsUrl(String(fields.website_url)) ? String(fields.website_url) : null) : null
  if (fields.instagram_url !== undefined) update.instagram_url = fields.instagram_url ? (isValidHttpsUrl(String(fields.instagram_url)) ? String(fields.instagram_url) : null) : null
  if (fields.notes !== undefined) update.notes = fields.notes ? sanitizeText(clampLength(String(fields.notes), 1000)) || null : null
  if (table === 'craft_fairs') {
    if (fields.years_in_operation !== undefined) update.years_in_operation = fields.years_in_operation ? sanitizeText(clampLength(String(fields.years_in_operation), 100)) || null : null
    if (fields.avg_artists !== undefined) update.avg_artists = fields.avg_artists ? sanitizeText(clampLength(String(fields.avg_artists), 100)) || null : null
    if (fields.avg_shoppers !== undefined) update.avg_shoppers = fields.avg_shoppers ? sanitizeText(clampLength(String(fields.avg_shoppers), 100)) || null : null
    if (fields.typical_months !== undefined) update.typical_months = fields.typical_months ? sanitizeText(clampLength(String(fields.typical_months), 200)) || null : null
  } else {
    if (fields.hosting_model !== undefined) update.hosting_model = fields.hosting_model ? sanitizeText(clampLength(String(fields.hosting_model), 200)) || null : null
  }
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from(table).update(update).eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const table = resolveTable(request.url)
  if (!table) return NextResponse.json({ error: 'table param required: fairs or venues' }, { status: 400 })
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from(table).delete().eq('id', String(body.id))
  if (dbError) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Write the combined polling route**

This endpoint is polled by `DiscoveryProvider` every 5s during discovery. It must cover **both** tables so the banner correctly detects additions regardless of whether a discovery run adds fairs, venues, or both.

```typescript
// app/api/admin/markets/fairs/route.ts
// Despite the path name, returns a combined flat array of IDs from both tables.
// DiscoveryProvider only needs the array length to detect new rows.
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const [{ data: fairs }, { data: venues }] = await Promise.all([
    supabase.from('craft_fairs').select('id'),
    supabase.from('artist_venues').select('id'),
  ])
  return NextResponse.json([...(fairs ?? []), ...(venues ?? [])])
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/markets/route.ts app/api/admin/markets/fairs/route.ts
git commit -m "feat: add markets admin API routes (CRUD + polling endpoint)"
```

---

## Task 6: Shared Discovery Logic

**Files:**
- Create: `lib/markets-discovery.ts`

This module is the single source of truth for the Tavily + AI discovery logic. Both the on-demand `/api/admin/markets/discover` route and the cron `/api/cron/markets-refresh` route import from here.

- [ ] **Step 1: Write lib/markets-discovery.ts**

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

interface SearchResult { title: string; url: string; description?: string }

interface DiscoveredFair {
  type: 'fair'
  name: string
  location: string
  website_url?: string
  instagram_url?: string
  years_in_operation?: string
  avg_artists?: string
  avg_shoppers?: string
  typical_months?: string
}

interface DiscoveredVenue {
  type: 'venue'
  name: string
  location: string
  website_url?: string
  instagram_url?: string
  hosting_model?: string
}

type Discovered = DiscoveredFair | DiscoveredVenue

const SEARCH_QUERIES = [
  'craft fair "New England" 2026 artists vendors Massachusetts Rhode Island Connecticut',
  'art fair market 2026 Boston MA NH RI VT ME artists handmade',
  'artist collective store consignment "New England" handmade craft vendors',
  'craft market holiday 2025 2026 Massachusetts "vendor applications"',
  '"artist venue" OR "maker market" OR "pop-up market" Boston Providence Portland Maine',
]

async function tavilySearch(apiKey: string, query: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 15 }),
  })
  if (!res.ok) throw new Error(`Tavily error ${res.status}`)
  const data = await res.json()
  return (data?.results ?? []).map((r: { title: string; url: string; content?: string }) => ({
    title: r.title, url: r.url, description: r.content,
  }))
}

async function callAiProvider(provider: string, apiKey: string, prompt: string): Promise<string> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 3000,
        system: 'You are a data extraction tool. Output only valid JSON arrays. No prose, no markdown. Your entire response must be a single JSON array starting with [ and ending with ].',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic error ${res.status}`)
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  }
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) throw new Error(`OpenAI error ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }
  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) throw new Error(`Groq error ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }
  throw new Error(`Unsupported AI provider: ${provider}`)
}

export interface DiscoveryResult { added: number; skipped: number }
export interface DiscoveryError { error: string }

export async function runMarketsDiscovery(
  searchApiKey: string,
  aiProvider: string,
  aiApiKey: string
): Promise<DiscoveryResult | DiscoveryError> {
  let allResults: SearchResult[]
  try {
    const sets = await Promise.all(SEARCH_QUERIES.map(q => tavilySearch(searchApiKey, q)))
    const seen = new Set<string>()
    allResults = []
    for (const results of sets) {
      for (const r of results) {
        if (!seen.has(r.url)) { seen.add(r.url); allResults.push(r) }
      }
    }
  } catch (err) {
    console.error('[markets-discovery] Tavily failed:', err)
    return { error: 'Search failed. Please try again.' }
  }

  if (allResults.length === 0) return { added: 0, skipped: 0 }

  const snippets = allResults.map((r, i) => `${i + 1}) ${r.title}\nURL: ${r.url}\n${r.description ?? ''}`).join('\n\n')

  const prompt = `Extract New England art/craft fairs and artist-hosting stores or collectives from these search results. Only include venues in MA, NH, RI, VT, CT, or ME.

For each result return a JSON object with:
- Craft fairs: { "type": "fair", "name": "", "location": "city, state", "website_url": "https://...", "instagram_url": "https://...", "years_in_operation": "", "avg_artists": "", "avg_shoppers": "", "typical_months": "" }
- Stores/collectives: { "type": "venue", "name": "", "location": "city, state", "website_url": "https://...", "instagram_url": "https://...", "hosting_model": "" }

Search results:
${snippets}

Return a single JSON array. Omit fields you have no data for. Return [] if nothing qualifies.`

  let rawText: string
  try {
    rawText = await callAiProvider(aiProvider, aiApiKey, prompt)
  } catch (err) {
    console.error('[markets-discovery] AI failed:', err)
    return { error: 'Extraction failed. Please try again.' }
  }

  let discovered: Discovered[]
  try {
    const end = rawText.lastIndexOf(']')
    if (end === -1) return { added: 0, skipped: 0 }
    let depth = 0, start = -1
    for (let i = end; i >= 0; i--) {
      if (rawText[i] === ']') depth++
      else if (rawText[i] === '[') { depth--; if (depth === 0) { start = i; break } }
    }
    if (start === -1) return { added: 0, skipped: 0 }
    discovered = JSON.parse(rawText.slice(start, end + 1))
    if (!Array.isArray(discovered)) throw new Error('Not an array')
  } catch (err) {
    console.error('[markets-discovery] JSON parse error:', err)
    return { error: 'Discovery failed. Please try again.' }
  }

  const supabase = createServiceRoleClient()
  let added = 0, skipped = 0

  for (const item of discovered) {
    if (typeof item.name !== 'string' || !item.name.trim()) continue
    if (typeof item.location !== 'string' || !item.location.trim()) continue

    const name = sanitizeText(clampLength(item.name.trim(), 200))
    const location = sanitizeText(clampLength(item.location.trim(), 300))
    const website_url = item.website_url && isValidHttpsUrl(item.website_url) ? item.website_url : null
    const instagram_url = item.instagram_url && isValidHttpsUrl(item.instagram_url) ? item.instagram_url : null

    if (item.type === 'fair') {
      const { data: existing } = await supabase.from('craft_fairs').select('id').ilike('name', name).single()
      if (existing) { skipped++; continue }
      const { error: insertError } = await supabase.from('craft_fairs').insert({
        name, location, website_url, instagram_url,
        years_in_operation: item.years_in_operation ? sanitizeText(clampLength(item.years_in_operation, 100)) || null : null,
        avg_artists: item.avg_artists ? sanitizeText(clampLength(item.avg_artists, 100)) || null : null,
        avg_shoppers: item.avg_shoppers ? sanitizeText(clampLength(item.avg_shoppers, 100)) || null : null,
        typical_months: item.typical_months ? sanitizeText(clampLength(item.typical_months, 200)) || null : null,
      })
      if (insertError) { console.error('[markets-discovery] insert fair error:', insertError); continue }
      added++
    } else if (item.type === 'venue') {
      const { data: existing } = await supabase.from('artist_venues').select('id').ilike('name', name).single()
      if (existing) { skipped++; continue }
      const { error: insertError } = await supabase.from('artist_venues').insert({
        name, location, website_url, instagram_url,
        hosting_model: item.hosting_model ? sanitizeText(clampLength(item.hosting_model, 200)) || null : null,
      })
      if (insertError) { console.error('[markets-discovery] insert venue error:', insertError); continue }
      added++
    }
  }

  return { added, skipped }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/markets-discovery.ts
git commit -m "feat: add shared markets discovery logic (Tavily + AI extraction)"
```

---

## Task 7: Discovery API Route + Cron Route

**Files:**
- Create: `app/api/admin/markets/discover/route.ts`
- Create: `app/api/cron/markets-refresh/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Write the on-demand discover route**

```typescript
// app/api/admin/markets/discover/route.ts
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptSettings } from '@/lib/crypto'
import { runMarketsDiscovery } from '@/lib/markets-discovery'

export const maxDuration = 60

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data: settingsRow, error: settingsError } = await supabase
    .from('settings').select('search_api_key, ai_provider, ai_api_key').single()
  if (settingsError) return NextResponse.json({ error: 'Failed to load settings.' }, { status: 500 })

  const settings = settingsRow ? decryptSettings(settingsRow) : null
  const searchApiKey = process.env.SEARCH_API_KEY ?? settings?.search_api_key
  const aiProvider = settings?.ai_provider
  const aiApiKey = process.env.AI_API_KEY ?? settings?.ai_api_key

  if (!searchApiKey) return NextResponse.json({ error: 'Tavily API key not configured. Add it in Admin → Integrations → Event Search.' }, { status: 503 })
  if (!aiProvider || !aiApiKey) return NextResponse.json({ error: 'AI provider not configured. Set AI provider and key in Admin → Integrations.' }, { status: 503 })

  const result = await runMarketsDiscovery(searchApiKey, aiProvider, aiApiKey)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Write the cron route**

```typescript
// app/api/cron/markets-refresh/route.ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptSettings } from '@/lib/crypto'
import { runMarketsDiscovery } from '@/lib/markets-discovery'

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { data: settingsRow } = await supabase
    .from('settings').select('search_api_key, ai_provider, ai_api_key').single()

  if (!settingsRow) return NextResponse.json({ skipped: true, reason: 'no settings' })

  const settings = decryptSettings(settingsRow)
  const searchApiKey = process.env.SEARCH_API_KEY ?? settings?.search_api_key
  const aiProvider = settings?.ai_provider
  const aiApiKey = process.env.AI_API_KEY ?? settings?.ai_api_key

  if (!searchApiKey || !aiProvider || !aiApiKey) {
    return NextResponse.json({ skipped: true, reason: 'missing API keys' })
  }

  const result = await runMarketsDiscovery(searchApiKey, aiProvider, aiApiKey)
  return NextResponse.json(result)
}
```

- [ ] **Step 3: Add cron entry to vercel.json**

```json
{
  "crons": [
    { "path": "/api/cron/newsletter-send", "schedule": "0 10 * * *" },
    { "path": "/api/cron/sync", "schedule": "0 3 * * *" },
    { "path": "/api/cron/markets-refresh", "schedule": "0 4 * * *" }
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/markets/discover/route.ts app/api/cron/markets-refresh/route.ts vercel.json
git commit -m "feat: add markets discover route and 24h cron refresh"
```

---

## Task 8: MarketsManager Component + Admin Page

**Files:**
- Create: `app/admin/(dashboard)/markets/page.tsx`
- Create: `components/admin/MarketsManager.tsx`

- [ ] **Step 1: Write the markets admin page (server component)**

```tsx
// app/admin/(dashboard)/markets/page.tsx
import { createServiceRoleClient } from '@/lib/supabase/server'
import MarketsManager from '@/components/admin/MarketsManager'
import { DiscoveryProvider } from '@/components/admin/DiscoveryProvider'
import DiscoveryBanner from '@/components/admin/DiscoveryBanner'
import type { CraftFair, ArtistVenue } from '@/lib/supabase/types'

export const metadata = { title: 'Admin — Markets' }

export default async function MarketsAdminPage() {
  const supabase = createServiceRoleClient()
  const [{ data: craft_fairs }, { data: artist_venues }] = await Promise.all([
    supabase.from('craft_fairs').select('*').order('name'),
    supabase.from('artist_venues').select('*').order('name'),
  ])
  return (
    <DiscoveryProvider
      endpoint="/api/admin/markets/discover"
      pollEndpoint="/api/admin/markets/fairs"
      noun="market"
    >
      <DiscoveryBanner searchingMessage="Searching for markets in the background — you can keep using the admin while this runs." />
      <MarketsManager
        initialFairs={(craft_fairs ?? []) as CraftFair[]}
        initialVenues={(artist_venues ?? []) as ArtistVenue[]}
      />
    </DiscoveryProvider>
  )
}
```

- [ ] **Step 2: Write MarketsManager component**

Create `components/admin/MarketsManager.tsx` with the full implementation below:

```tsx
'use client'
import { useState, useMemo } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useDiscovery } from './DiscoveryProvider'
import { isValidHttpsUrl } from '@/lib/validate'
import type { CraftFair, ArtistVenue } from '@/lib/supabase/types'

type Tab = 'fairs' | 'venues'

const emptyFairForm = {
  name: '', location: '', website_url: '', instagram_url: '',
  years_in_operation: '', avg_artists: '', avg_shoppers: '', typical_months: '', notes: '',
}
const emptyVenueForm = {
  name: '', location: '', website_url: '', instagram_url: '', hosting_model: '', notes: '',
}

type FairForm = typeof emptyFairForm
type VenueForm = typeof emptyVenueForm

interface Props {
  initialFairs: CraftFair[]
  initialVenues: ArtistVenue[]
}

function matches(obj: Record<string, unknown>, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return Object.values(obj).some(v => typeof v === 'string' && v.toLowerCase().includes(lower))
}

export default function MarketsManager({ initialFairs, initialVenues }: Props) {
  const [fairs, setFairs] = useState<CraftFair[]>(initialFairs)
  const [venues, setVenues] = useState<ArtistVenue[]>(initialVenues)
  const [tab, setTab] = useState<Tab>('fairs')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [fairForm, setFairForm] = useState<FairForm>(emptyFairForm)
  const [venueForm, setVenueForm] = useState<VenueForm>(emptyVenueForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; table: 'fairs' | 'venues' } | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const { state: discoverState, startDiscovery } = useDiscovery()

  const filteredFairs = useMemo(() => fairs.filter(f => matches(f as unknown as Record<string, unknown>, search)), [fairs, search])
  const filteredVenues = useMemo(() => venues.filter(v => matches(v as unknown as Record<string, unknown>, search)), [venues, search])

  function fairField(k: keyof FairForm) {
    return {
      value: fairForm[k],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setFairForm(f => ({ ...f, [k]: e.target.value })),
    }
  }
  function venueField(k: keyof VenueForm) {
    return {
      value: venueForm[k],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setVenueForm(f => ({ ...f, [k]: e.target.value })),
    }
  }

  function handleEditFair(fair: CraftFair) {
    setEditId(fair.id)
    setFairForm({
      name: fair.name, location: fair.location,
      website_url: fair.website_url ?? '', instagram_url: fair.instagram_url ?? '',
      years_in_operation: fair.years_in_operation ?? '', avg_artists: fair.avg_artists ?? '',
      avg_shoppers: fair.avg_shoppers ?? '', typical_months: fair.typical_months ?? '',
      notes: fair.notes ?? '',
    })
    setShowForm(true); setStatus('idle')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleEditVenue(venue: ArtistVenue) {
    setEditId(venue.id)
    setVenueForm({
      name: venue.name, location: venue.location,
      website_url: venue.website_url ?? '', instagram_url: venue.instagram_url ?? '',
      hosting_model: venue.hosting_model ?? '', notes: venue.notes ?? '',
    })
    setShowForm(true); setStatus('idle')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelForm() {
    setShowForm(false); setEditId(null)
    setFairForm(emptyFairForm); setVenueForm(emptyVenueForm); setStatus('idle')
  }

  async function handleSaveFair(e: React.FormEvent) {
    e.preventDefault(); setStatus('saving')
    const website_url = fairForm.website_url && isValidHttpsUrl(fairForm.website_url) ? fairForm.website_url : undefined
    const instagram_url = fairForm.instagram_url && isValidHttpsUrl(fairForm.instagram_url) ? fairForm.instagram_url : undefined
    const body = { ...fairForm, website_url, instagram_url }
    try {
      if (editId) {
        const res = await fetch('/api/admin/markets?table=fairs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...body }) })
        if (!res.ok) { setStatus('error'); return }
        setFairs(fs => fs.map(f => f.id === editId ? { ...f, ...fairForm, website_url: website_url ?? null, instagram_url: instagram_url ?? null } : f))
      } else {
        const res = await fetch('/api/admin/markets?table=fairs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { setStatus('error'); return }
        const newFair = await res.json()  // must await BEFORE setFairs — can't await inside setState callback
        setFairs(fs => [...fs, newFair])
      }
      handleCancelForm()
    } catch { setStatus('error') }
  }

  async function handleSaveVenue(e: React.FormEvent) {
    e.preventDefault(); setStatus('saving')
    const website_url = venueForm.website_url && isValidHttpsUrl(venueForm.website_url) ? venueForm.website_url : undefined
    const instagram_url = venueForm.instagram_url && isValidHttpsUrl(venueForm.instagram_url) ? venueForm.instagram_url : undefined
    const body = { ...venueForm, website_url, instagram_url }
    try {
      if (editId) {
        const res = await fetch('/api/admin/markets?table=venues', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...body }) })
        if (!res.ok) { setStatus('error'); return }
        setVenues(vs => vs.map(v => v.id === editId ? { ...v, ...venueForm, website_url: website_url ?? null, instagram_url: instagram_url ?? null } : v))
      } else {
        const res = await fetch('/api/admin/markets?table=venues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { setStatus('error'); return }
        const newVenue = await res.json()  // must await BEFORE setVenues
        setVenues(vs => [...vs, newVenue])
      }
      handleCancelForm()
    } catch { setStatus('error') }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/admin/markets?table=${deleteTarget.table}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
      if (!res.ok) { setDeleteTarget(null); return }
      if (deleteTarget.table === 'fairs') setFairs(fs => fs.filter(f => f.id !== deleteTarget.id))
      else setVenues(vs => vs.filter(v => v.id !== deleteTarget.id))
    } catch { /* keep in list */ }
    setDeleteTarget(null)
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }
  const btnPrimary: React.CSSProperties = { background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 20px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }
  const btnOutline: React.CSSProperties = { ...btnPrimary, background: 'transparent', color: 'var(--color-primary)', border: '2px solid var(--color-primary)' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', margin: 0 }}>Markets</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={startDiscovery} disabled={discoverState === 'searching'}
            style={{ ...btnOutline, opacity: discoverState === 'searching' ? 0.7 : 1, cursor: discoverState === 'searching' ? 'not-allowed' : 'pointer' }}>
            {discoverState === 'searching' ? 'Searching…' : 'Find Markets'}
          </button>
          <button onClick={() => { setShowForm(s => !s); if (showForm && editId) handleCancelForm() }} style={btnPrimary}>
            + Add New
          </button>
        </div>
      </div>

      {/* Search */}
      <input type="search" placeholder="Search all markets…" value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ ...inputStyle, marginBottom: '16px', maxWidth: '400px' }}
        aria-label="Search markets" />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: '20px' }}>
        {(['fairs', 'venues'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setShowForm(false); setEditId(null); setFairForm(emptyFairForm); setVenueForm(emptyVenueForm); setStatus('idle') }} style={{
            background: 'none', border: 'none',
            borderBottom: tab === t ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
            padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
            fontWeight: tab === t ? '600' : '400', marginBottom: '-2px', minHeight: '48px',
          }}>
            {t === 'fairs' ? `Craft Fairs (${fairs.length})` : `Stores & Collectives (${venues.length})`}
          </button>
        ))}
      </div>

      {/* Forms */}
      {showForm && tab === 'fairs' && (
        <form onSubmit={handleSaveFair} style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>{editId ? 'Edit Craft Fair' : 'New Craft Fair'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div><label htmlFor="fair-name" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Name *</label><input id="fair-name" required {...fairField('name')} style={inputStyle} /></div>
            <div><label htmlFor="fair-location" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Location *</label><input id="fair-location" required {...fairField('location')} placeholder="City, State" style={inputStyle} /></div>
            <div><label htmlFor="fair-website" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Website (https://...)</label><input id="fair-website" {...fairField('website_url')} placeholder="https://..." style={inputStyle} /></div>
            <div><label htmlFor="fair-ig" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Instagram (https://...)</label><input id="fair-ig" {...fairField('instagram_url')} placeholder="https://www.instagram.com/..." style={inputStyle} /></div>
            <div><label htmlFor="fair-years" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Years in Operation</label><input id="fair-years" {...fairField('years_in_operation')} placeholder="e.g. est. 2008" style={inputStyle} /></div>
            <div><label htmlFor="fair-artists" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Avg Artists</label><input id="fair-artists" {...fairField('avg_artists')} placeholder="e.g. 80–120" style={inputStyle} /></div>
            <div><label htmlFor="fair-shoppers" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Avg Shoppers</label><input id="fair-shoppers" {...fairField('avg_shoppers')} placeholder="e.g. 5,000+" style={inputStyle} /></div>
            <div><label htmlFor="fair-months" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Typical Month(s)</label><input id="fair-months" {...fairField('typical_months')} placeholder="e.g. November, December" style={inputStyle} /></div>
          </div>
          <div style={{ marginTop: '16px' }}><label htmlFor="fair-notes" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Notes</label><textarea id="fair-notes" rows={3} {...fairField('notes')} placeholder="Relationship status, application notes, etc." style={inputStyle} /></div>
          {status === 'error' && <p role="alert" style={{ color: '#c05050', marginTop: '8px' }}>Error saving. Please try again.</p>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button type="submit" disabled={status === 'saving'} style={btnPrimary}>{status === 'saving' ? 'Saving…' : 'Save Fair'}</button>
            <button type="button" onClick={handleCancelForm} style={btnOutline}>Cancel</button>
          </div>
        </form>
      )}

      {showForm && tab === 'venues' && (
        <form onSubmit={handleSaveVenue} style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>{editId ? 'Edit Store / Collective' : 'New Store / Collective'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div><label htmlFor="venue-name" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Name *</label><input id="venue-name" required {...venueField('name')} style={inputStyle} /></div>
            <div><label htmlFor="venue-location" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Location *</label><input id="venue-location" required {...venueField('location')} placeholder="City, State" style={inputStyle} /></div>
            <div><label htmlFor="venue-website" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Website (https://...)</label><input id="venue-website" {...venueField('website_url')} placeholder="https://..." style={inputStyle} /></div>
            <div><label htmlFor="venue-ig" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Instagram (https://...)</label><input id="venue-ig" {...venueField('instagram_url')} placeholder="https://www.instagram.com/..." style={inputStyle} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label htmlFor="venue-model" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Hosting Model</label><input id="venue-model" {...venueField('hosting_model')} placeholder="e.g. consignment, booth rental, pop-up" style={inputStyle} /></div>
          </div>
          <div style={{ marginTop: '16px' }}><label htmlFor="venue-notes" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Notes</label><textarea id="venue-notes" rows={3} {...venueField('notes')} placeholder="Current relationship, past experience, contact info…" style={inputStyle} /></div>
          {status === 'error' && <p role="alert" style={{ color: '#c05050', marginTop: '8px' }}>Error saving. Please try again.</p>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button type="submit" disabled={status === 'saving'} style={btnPrimary}>{status === 'saving' ? 'Saving…' : 'Save Venue'}</button>
            <button type="button" onClick={handleCancelForm} style={btnOutline}>Cancel</button>
          </div>
        </form>
      )}

      {/* Tables */}
      {tab === 'fairs' && <FairsTable fairs={filteredFairs} search={search} onEdit={handleEditFair} onDelete={id => setDeleteTarget({ id, table: 'fairs' })} />}
      {tab === 'venues' && <VenuesTable venues={filteredVenues} search={search} onEdit={handleEditVenue} onDelete={id => setDeleteTarget({ id, table: 'venues' })} />}

      {deleteTarget && (
        <ConfirmDialog
          message="Delete this entry? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function LinkButtons({ website_url, instagram_url }: { website_url: string | null; instagram_url: string | null }) {
  return (
    <span style={{ display: 'flex', gap: '6px' }}>
      {website_url && <a href={website_url} target="_blank" rel="noopener noreferrer" aria-label="Website" style={{ fontSize: '13px', color: 'var(--color-primary)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '2px 8px', textDecoration: 'none' }}>web ↗</a>}
      {instagram_url && <a href={instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ fontSize: '13px', color: 'var(--color-primary)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '2px 8px', textDecoration: 'none' }}>IG ↗</a>}
    </span>
  )
}

function FairsTable({ fairs, search, onEdit, onDelete }: { fairs: CraftFair[]; search: string; onEdit: (f: CraftFair) => void; onDelete: (id: string) => void }) {
  if (fairs.length === 0) return <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>{search ? 'No craft fairs match your search.' : 'No craft fairs yet. Click "+ Add New" to add one.'}</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
            {['Name', 'Location', 'Links', 'Est.', 'Artists', 'Shoppers', 'Month(s)', 'Notes', 'Actions'].map(h => (
              <th key={h} style={{ padding: '8px 12px', fontWeight: '600' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fairs.map(f => (
            <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: '500', color: 'var(--color-primary)' }}>{f.name}</td>
              <td style={{ padding: '10px 12px' }}>{f.location}</td>
              <td style={{ padding: '10px 12px' }}><LinkButtons website_url={f.website_url} instagram_url={f.instagram_url} /></td>
              <td style={{ padding: '10px 12px' }}>{f.years_in_operation ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{f.avg_artists ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{f.avg_shoppers ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{f.typical_months ?? '—'}</td>
              <td style={{ padding: '10px 12px', maxWidth: '180px' }}>
                <span title={f.notes ?? undefined} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.notes ?? '—'}</span>
              </td>
              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                <button onClick={() => onEdit(f)} aria-label={`Edit ${f.name}`} style={{ background: 'none', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', padding: '6px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '36px', marginRight: '6px' }}>Edit</button>
                <button onClick={() => onDelete(f.id)} aria-label={`Delete ${f.name}`} style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '6px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '36px' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VenuesTable({ venues, search, onEdit, onDelete }: { venues: ArtistVenue[]; search: string; onEdit: (v: ArtistVenue) => void; onDelete: (id: string) => void }) {
  if (venues.length === 0) return <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>{search ? 'No stores/collectives match your search.' : 'No stores or collectives yet. Click "+ Add New" to add one.'}</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
            {['Name', 'Location', 'Links', 'Hosting Model', 'Notes', 'Actions'].map(h => (
              <th key={h} style={{ padding: '8px 12px', fontWeight: '600' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {venues.map(v => (
            <tr key={v.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: '500', color: 'var(--color-primary)' }}>{v.name}</td>
              <td style={{ padding: '10px 12px' }}>{v.location}</td>
              <td style={{ padding: '10px 12px' }}><LinkButtons website_url={v.website_url} instagram_url={v.instagram_url} /></td>
              <td style={{ padding: '10px 12px' }}>{v.hosting_model ?? '—'}</td>
              <td style={{ padding: '10px 12px', maxWidth: '200px' }}>
                <span title={v.notes ?? undefined} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.notes ?? '—'}</span>
              </td>
              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                <button onClick={() => onEdit(v)} aria-label={`Edit ${v.name}`} style={{ background: 'none', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', padding: '6px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '36px', marginRight: '6px' }}>Edit</button>
                <button onClick={() => onDelete(v.id)} aria-label={`Delete ${v.name}`} style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '6px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '36px' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/\(dashboard\)/markets/page.tsx components/admin/MarketsManager.tsx
git commit -m "feat: add MarketsManager component and admin markets page"
```

---

## Task 9: Add Markets to Admin Sidebar

**Files:**
- Modify: `components/admin/AdminSidebar.tsx`

- [ ] **Step 1: Add Map icon to import and Markets to NAV_ITEMS**

In the lucide-react import line, add `Map`:

```typescript
import {
  LayoutDashboard, FileText, Calendar, Image, MessageSquare,
  Palette, Plug, Mail, BarChart2, ClipboardList,
  ChevronLeft, ChevronRight, ExternalLink, LogOut,
  Package, Radio, Map,
} from 'lucide-react'
```

In `NAV_ITEMS`, add after Events:

```typescript
{ href: '/admin/markets', label: 'Markets', Icon: Map },
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/AdminSidebar.tsx
git commit -m "feat: add Markets to admin sidebar nav"
```

---

## Task 10: Tests

**Files:**
- Create: `__tests__/components/admin/MarketsManager.test.tsx`

- [ ] **Step 1: Write the tests**

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import MarketsManager from '@/components/admin/MarketsManager'
import { DiscoveryProvider } from '@/components/admin/DiscoveryProvider'
import type { CraftFair, ArtistVenue } from '@/lib/supabase/types'

const mockFair: CraftFair = {
  id: '1', name: 'Boston Renegade Craft Fair', location: 'Boston, MA',
  website_url: 'https://renegadecraft.com/boston', instagram_url: null,
  years_in_operation: 'est. 2003', avg_artists: '200+', avg_shoppers: '10,000+',
  typical_months: 'October', notes: null, created_at: '2026-01-01', updated_at: '2026-01-01',
}

const mockVenue: ArtistVenue = {
  id: '2', name: 'Craftland', location: 'Providence, RI',
  website_url: 'https://craftlandshop.com', instagram_url: null,
  hosting_model: 'Curated consignment', notes: null,
  created_at: '2026-01-01', updated_at: '2026-01-01',
}

function renderMarkets(fairs = [mockFair], venues = [mockVenue]) {
  return render(
    <DiscoveryProvider
      endpoint="/api/admin/markets/discover"
      pollEndpoint="/api/admin/markets/fairs"
      noun="market"
    >
      <MarketsManager initialFairs={fairs} initialVenues={venues} />
    </DiscoveryProvider>
  )
}

describe('MarketsManager', () => {
  beforeEach(() => { global.fetch = jest.fn() })
  afterEach(() => jest.resetAllMocks())

  it('renders page title', () => {
    renderMarkets()
    expect(screen.getByRole('heading', { name: /markets/i })).toBeInTheDocument()
  })

  it('shows craft fairs tab active by default with fair data', () => {
    renderMarkets()
    expect(screen.getByText('Boston Renegade Craft Fair')).toBeInTheDocument()
  })

  it('switches to Stores & Collectives tab and shows venue data', () => {
    renderMarkets()
    fireEvent.click(screen.getByRole('button', { name: /stores & collectives/i }))
    expect(screen.getByText('Craftland')).toBeInTheDocument()
  })

  it('filters fairs by search term', () => {
    const extraFair: CraftFair = { ...mockFair, id: '3', name: 'Providence Flea', location: 'Providence, RI' }
    renderMarkets([mockFair, extraFair])
    fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), { target: { value: 'providence' } })
    expect(screen.queryByText('Boston Renegade Craft Fair')).not.toBeInTheDocument()
    expect(screen.getByText('Providence Flea')).toBeInTheDocument()
  })

  it('shows fair form when + Add New clicked on fairs tab', () => {
    renderMarkets()
    fireEvent.click(screen.getByRole('button', { name: /\+ add new/i }))
    expect(screen.getByRole('heading', { name: /new craft fair/i })).toBeInTheDocument()
  })

  it('shows venue form when + Add New clicked on venues tab', () => {
    renderMarkets()
    fireEvent.click(screen.getByRole('button', { name: /stores & collectives/i }))
    fireEvent.click(screen.getByRole('button', { name: /\+ add new/i }))
    expect(screen.getByRole('heading', { name: /new store \/ collective/i })).toBeInTheDocument()
  })

  it('shows correct tab counts', () => {
    renderMarkets([mockFair], [mockVenue])
    expect(screen.getByRole('button', { name: /craft fairs \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stores & collectives \(1\)/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
scripts/test.sh __tests__/components/admin/MarketsManager.test.tsx
```

Expected: all pass

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
scripts/test.sh
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add __tests__/components/admin/MarketsManager.test.tsx
git commit -m "test: add MarketsManager component tests"
```

---

## Task 11: End-to-End Smoke Test

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2: Start dev server and navigate to /admin/markets**

```bash
scripts/dev.sh
```

Verify:
- Page loads, both tabs render with seeded data
- Search input filters the active tab in real time
- "+ Add New" opens the correct form for each tab
- Edit pre-populates the form; save updates the row
- Delete shows the confirm dialog and removes the row
- "Find Markets" button shows the discovery banner with correct message
- Website / IG links open in new tab
- Navigate to `/admin/events` and verify events discovery still works

- [ ] **Step 3: Final fixup commit if needed**

```bash
git add -p
git commit -m "fix: address smoke test findings in markets feature"
```
