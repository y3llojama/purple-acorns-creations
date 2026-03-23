# Markets Intel — Design Spec

**Date:** 2026-03-22
**Status:** Approved

## Overview

A new admin page (`/admin/markets`) for Purple Acorns Creations to track New England craft fairs and artist-hosting stores/collectives. The objective is market expansion intelligence: identify venues where the business is not yet selling and track relationship status via free-text notes.

---

## Data Schema

### `craft_fairs` table

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| name | text NOT NULL | |
| location | text NOT NULL | e.g. "Portsmouth, NH" |
| website_url | text | nullable, validated https |
| instagram_url | text | nullable |
| years_in_operation | text | e.g. "12 years", "est. 2008" |
| avg_artists | text | e.g. "80–120" |
| avg_shoppers | text | e.g. "5,000+" |
| typical_months | text | e.g. "November, December" |
| notes | text | free-text relationship/status |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

### `artist_venues` table

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| name | text NOT NULL | |
| location | text NOT NULL | |
| website_url | text | nullable, validated https |
| instagram_url | text | nullable |
| hosting_model | text | e.g. "consignment", "booth rental", "pop-up" |
| notes | text | free-text relationship/status |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

Both tables: no public SELECT (admin-only, service role client).

---

## UI Layout

**Route:** `/admin/markets`
**Nav:** added to admin dashboard sidebar

- Sticky header: page title "Markets" + text search input (client-side, filters active tab)
- Two tabs: "Craft Fairs" | "Stores & Collectives"
- Table per tab — columns match schema; notes truncated with expand
- Links (website/instagram) render as icon buttons, open `target="_blank" rel="noopener noreferrer"`
- "Find Markets" button — fires background discovery search (same pattern as Events "Find Events")
- "+ Add" button — opens modal form
- Edit (pencil) per row — opens modal pre-populated
- Delete per row — reuses `ConfirmDialog`
- No pagination (small dataset)

---

## Background Discovery

**On-demand:** "Find Markets" button uses the existing `DiscoveryProvider`/`DiscoveryBanner` pattern. Both components are refactored to accept configuration props:

- `DiscoveryProvider` accepts `endpoint: string` (POST target) and `pollEndpoint: string` (GET for count polling)
- `DiscoveryBanner` accepts `searchingMessage: string` (replaces hardcoded "Searching for events…" text)
- Each manager wraps its own `<DiscoveryProvider>` instance — no shared singleton
- `MarketsManager` uses `endpoint="/api/admin/markets/discover"` and `pollEndpoint="/api/admin/markets/fairs"` (returns flat array for count polling)

Discovery flow:
- POST `/api/admin/markets/discover` with `keepalive: true`
- Polls `/api/admin/markets/fairs` every 5s for `craft_fairs` row count increase (flat array response)
- `export const maxDuration = 60` on the discover route
- Same Tavily + AI extraction pipeline as events
- AI prompt targets New England craft fairs and artist-hosting stores/collectives
- Deduplicates by name `ILIKE` (case-insensitive) — no date field, so name alone is the key
- Returns `{ added, skipped }`

**24-hour cron:** `/api/cron/markets-refresh` added to `vercel.json` at schedule `0 4 * * *`. Uses `GET` method (Vercel cron always calls GET). Authenticates via `Authorization: Bearer <CRON_SECRET>` header — same pattern as existing cron routes. Calls same discovery logic without requiring admin session.

---

## Data Seeding

Initial curated list inserted via Supabase migration (`supabase/migrations/XXX_markets_seed.sql`):
- ~20 New England craft fairs with real intel (researched)
- ~10–15 artist-hosting stores/collectives including Brighton Bazaar (past) and Imagine Gift Store RI (past)
- Uses `INSERT ... ON CONFLICT DO NOTHING` (idempotent)

---

## Security

- All admin API routes guarded by `requireAdminSession()`
- Cron route guarded by `Authorization: Bearer <CRON_SECRET>` check (GET, same as existing cron routes)
- Both `website_url` and `instagram_url` validated with `isValidHttpsUrl()` before insert/update
- Text fields sanitized with `sanitizeText()` / `clampLength()`
- Rate limiting on all public-facing routes (not applicable here — admin only)

---

## File Inventory

**New files:**
- `supabase/migrations/XXX_markets.sql` — tables + RLS + `updated_at` BEFORE UPDATE trigger on both tables
- `supabase/migrations/XXX_markets_seed.sql` — initial researched data (committed in same PR)
- `app/admin/(dashboard)/markets/page.tsx` — server component
- `components/admin/MarketsManager.tsx` — tabbed UI, search, CRUD
- `app/api/admin/markets/route.ts` — GET (returns `{ craft_fairs: [...], artist_venues: [...] }`) / POST / PUT / DELETE
- `app/api/admin/markets/fairs/route.ts` — GET flat array of craft_fairs (used for polling row count)
- `app/api/admin/markets/discover/route.ts` — background search (`maxDuration = 60`, POST)
- `app/api/cron/markets-refresh/route.ts` — 24h cron (GET)
- `__tests__/components/admin/MarketsManager.test.tsx` — unit tests

**Modified files:**
- `components/admin/DiscoveryProvider.tsx` — accept `endpoint` and `pollEndpoint` props
- `components/admin/DiscoveryBanner.tsx` — accept `searchingMessage` prop
- `vercel.json` — add `/api/cron/markets-refresh` cron entry
- Admin nav component — add Markets link
