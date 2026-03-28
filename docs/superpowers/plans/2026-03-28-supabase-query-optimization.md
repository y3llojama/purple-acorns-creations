# Supabase Query Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Supabase API usage by consolidating redundant queries and moving aggregation logic from JS into SQL.

**Architecture:** Three independent changes: (1) replace 8 sequential analytics queries with a single Supabase RPC call, (2) eliminate the duplicate `getSettings()` call in root layout's `generateMetadata`, (3) consolidate the home page's 8 queries into fewer calls. Each change is independently deployable and testable.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL (RPC functions), TypeScript

**Rollback:** Tag `pre-supabase-refactor` on commit `33a4780`

---

## Task 1: Analytics Summary — Replace 8 Queries with 1 RPC

The analytics summary route (`app/api/admin/analytics/summary/route.ts`) currently runs 8 sequential Supabase queries. Two of them (`visitorRows`, `pageRows`) fetch **all matching rows** into Node.js memory just to count uniques or find the top entry. This is the single biggest source of unnecessary Supabase load.

We'll create a PostgreSQL function that does all aggregation server-side in one round-trip.

**Files:**
- Create: `supabase/migrations/047_analytics_summary_rpc.sql`
- Modify: `app/api/admin/analytics/summary/route.ts`

### Step 1: Write the migration

- [ ] Create `supabase/migrations/047_analytics_summary_rpc.sql` with this content:

```sql
-- Single RPC that returns the full analytics summary for a given period.
-- Replaces 8 sequential JS-side queries with one server-side call.

create or replace function analytics_summary(since timestamptz)
returns json
language sql
stable
as $$
  select json_build_object(
    'totalViews', (
      select count(*)
      from analytics_events
      where event_type = 'page_view' and created_at >= since
    ),
    'uniqueVisitors', (
      select count(distinct ip_hash)
      from analytics_events
      where event_type = 'page_view' and created_at >= since
    ),
    'topPage', (
      select json_build_object('path', page_path, 'views', cnt)
      from (
        select page_path, count(*) as cnt
        from analytics_events
        where event_type = 'page_view' and created_at >= since
        group by page_path
        order by cnt desc
        limit 1
      ) t
    ),
    'topReferrer', (
      select json_build_object('source', referrer, 'count', cnt)
      from (
        select referrer, count(*) as cnt
        from analytics_events
        where event_type = 'page_view' and created_at >= since and referrer is not null
        group by referrer
        order by cnt desc
        limit 1
      ) t
    ),
    'contactSubmissions', (
      select count(*)
      from analytics_events
      where event_type = 'contact_submit' and created_at >= since
    ),
    'shopClicks', (
      select count(*)
      from analytics_events
      where event_type = 'shop_click' and created_at >= since
    ),
    'newsletterSubscribes', (
      select count(*)
      from analytics_events
      where event_type = 'newsletter_subscribe' and created_at >= since
    ),
    'shareClicks', (
      select count(*)
      from analytics_events
      where event_type = 'share_click' and created_at >= since
    )
  );
$$;
```

- [ ] Commit: `feat: add analytics_summary RPC function`

### Step 2: Update the route to use the RPC

- [ ] Replace the body of `app/api/admin/analytics/summary/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { periodToDate } from '@/lib/analytics'

export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const period = request.nextUrl.searchParams.get('period') ?? '7d'
  const since = periodToDate(period)

  const supabase = createServiceRoleClient()

  const { data, error: rpcError } = await supabase.rpc('analytics_summary', {
    since: since.toISOString(),
  })

  if (rpcError) {
    console.error('[analytics/summary] RPC error:', rpcError.message)
    return NextResponse.json(
      { error: 'Failed to load analytics summary' },
      { status: 500 },
    )
  }

  return NextResponse.json(data)
}
```

- [ ] Commit: `refactor: use analytics_summary RPC instead of 8 sequential queries`

### Step 3: Verify

- [ ] Run `scripts/build.sh` — confirm no TypeScript errors
- [ ] Manually test: load the admin analytics page, confirm all stats render correctly for different period values (1d, 7d, 30d, all)

---

## Task 2: Eliminate Duplicate `getSettings()` in Root Layout

`app/layout.tsx` calls `getSettings()` twice: once in `generateMetadata()` (line 10) and once in `RootLayout()` (line 30). React's `cache()` deduplicates within a single RSC render, but `generateMetadata()` runs in a separate execution context in Next.js 15 — so this is 2 DB queries per page load.

Fix: extract only the fields `generateMetadata` needs (just `business_name`) from a shared fetch, or accept the React `cache()` behaviour and instead make `generateMetadata` use a lightweight query.

The cleanest approach: since `generateMetadata` only needs `business_name`, hardcode it there (it's already the default and unlikely to change per-request). This eliminates the DB call entirely.

**Files:**
- Modify: `app/layout.tsx`

### Step 1: Remove `getSettings()` from `generateMetadata`

- [ ] Edit `app/layout.tsx` — replace `generateMetadata` to not call `getSettings()`:

```typescript
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getSettings } from '@/lib/theme'
import { deriveCustomThemeVars } from '@/lib/color'
import type { ThemeVars } from '@/lib/color'
import './globals.css'

// business_name rarely changes and is always loaded in RootLayout below.
// Fetching settings again here doubled DB hits on every page load because
// generateMetadata runs in a separate RSC execution context from the page.
const SITE_NAME = 'Purple Acorns Creations'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.purpleacornz.com'),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description:
    'Handcrafted jewelry by a mother-daughter duo. Crochet jewelry, sterling silver, brass, and artisan pieces made with love.',
  openGraph: {
    siteName: SITE_NAME,
    images: ['/og-image.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // ... rest unchanged
```

- [ ] Commit: `perf: remove duplicate getSettings() from generateMetadata`

### Step 2: Verify

- [ ] Run `scripts/build.sh` — no errors
- [ ] Check that `<title>` and OG tags still render correctly on the live site

---

## Task 3: Consolidate Home Page Queries

`app/(public)/page.tsx` runs 7 parallel queries + 1 sequential query = 8 DB calls per home page load. Two optimizations:

1. **Remove redundant `getSettings()`** — the public layout (`app/(public)/layout.tsx`) already fetches settings in the same request. React `cache()` deduplicates here since they share the same RSC render context. However, we can confirm this is working by checking. If `cache()` is working, this is already fine.

2. **Merge the sequential event query into the `Promise.all`** — the `events` query runs after the parallel batch for no reason. Move it into `Promise.all`.

**Files:**
- Modify: `app/(public)/page.tsx`

### Step 1: Move event query into Promise.all

- [ ] Edit `app/(public)/page.tsx` — merge the event query into the existing `Promise.all`:

Replace:
```typescript
  const [content, settings, featured, gallery, followAlongResult, heroSlides] = await Promise.all([
    getAllContent(),
    getSettings(),
    supabase.from('products').select('*').eq('is_active', true).eq('gallery_featured', true).order('gallery_sort_order').limit(8).then(r => r.data ?? []),
    supabase.from('gallery').select('*').eq('is_featured', false).order('sort_order').limit(8).then(r => r.data ?? []),
    supabase.from('follow_along_photos').select('*').order('display_order').then(r => r.data ?? []),
    supabase
      .from('hero_slides')
      .select('id, url, alt_text, sort_order')
      .order('sort_order')
      .then(r => r.data ?? []),
  ])

  // Show only explicitly featured upcoming events on the homepage tile
  const { data: eventData } = await supabase
    .from('events').select('*').eq('featured', true).gte('date', today).order('date').limit(1).single()
```

With:
```typescript
  const [content, settings, featured, gallery, followAlongResult, heroSlides, { data: eventData }] = await Promise.all([
    getAllContent(),
    getSettings(),
    supabase.from('products').select('*').eq('is_active', true).eq('gallery_featured', true).order('gallery_sort_order').limit(8).then(r => r.data ?? []),
    supabase.from('gallery').select('*').eq('is_featured', false).order('sort_order').limit(8).then(r => r.data ?? []),
    supabase.from('follow_along_photos').select('*').order('display_order').then(r => r.data ?? []),
    supabase.from('hero_slides').select('id, url, alt_text, sort_order').order('sort_order').then(r => r.data ?? []),
    supabase.from('events').select('*').eq('featured', true).gte('date', today).order('date').limit(1).single(),
  ])
```

- [ ] Commit: `perf: parallelize event query on home page`

### Step 2: Verify

- [ ] Run `scripts/build.sh` — no errors
- [ ] Load home page — confirm event section still renders (or is correctly absent when no featured event exists)

---

## Summary of Impact

| Change | Queries Before | Queries After | Savings per Request |
|--------|---------------|---------------|-------------------|
| Analytics summary RPC | 8 sequential | 1 RPC | 7 fewer round-trips + no row-level fetches |
| Root layout generateMetadata | 2 (settings x2) | 1 | 1 fewer per page load |
| Home page event query | 7 parallel + 1 sequential | 8 parallel | Faster wall-clock time (no sequential wait) |

**Total: ~9 fewer DB round-trips per analytics page load, ~1 fewer per every page load, faster home page.**
