# Favorites & Sharing — Design Spec

**Date:** 2026-03-27
**Status:** Final (post-review)

## Overview

Replace the current localStorage-based saved items system with a database-backed favorites list that supports sharing. Visitors can save items via a heart icon, share individual product links or their entire favorites list, and collaborate on live shared lists.

## Goals

1. Persist favorites server-side so they survive browser clears
2. Shareable favorites list via human-readable permalink
3. Two share modes: snapshot (copy) and live (editable by anyone with the link)
4. Add items from a shared list to your own list
5. Heart badge in shop nav showing saved count
6. Copy-to-clipboard sharing for individual items

## Icon System

| Icon | Lucide Name | Action | Context |
|------|-------------|--------|---------|
| Heart (outline/filled) | `Heart` | Toggle item in my list | Product cards, detail page, own saved page |
| Link | `Link2` | Copy link to clipboard | Individual items + saved list page |
| Heart with plus | `HeartPlus` | Add item from shared list to my list | Shared snapshot list cards |
| Heart handshake | `HeartHandshake` | Indicates collaborator modified live list | Live shared list activity indicator |

## Data Model

### `saved_lists` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK, `gen_random_uuid()` |
| `token` | UUID | UNIQUE, NOT NULL. Owner's credential stored in localStorage |
| `edit_token` | UUID | UNIQUE, nullable. Separate write credential for live shared lists, embedded in share URL |
| `slug` | TEXT | UNIQUE, nullable. Human-readable, generated on first share action |
| `is_snapshot` | BOOLEAN | DEFAULT false. True for snapshot copies |
| `source_list_id` | UUID | FK → saved_lists(id) ON DELETE SET NULL, nullable. Tracks lineage for analytics; not queried in any user-facing flow |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now(). Updated on any item add/remove — used for live list change detection |
| `last_accessed_at` | TIMESTAMPTZ | DEFAULT now(). Updated on writes only (not reads) for future TTL cleanup |

**Indexes:**
- UNIQUE on `token`
- UNIQUE on `edit_token` (where edit_token IS NOT NULL)
- UNIQUE on `slug` (where slug IS NOT NULL)
- Index on `last_accessed_at` (for future TTL cleanup queries)

### `saved_list_items` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK, `gen_random_uuid()` |
| `list_id` | UUID | FK → saved_lists(id) ON DELETE CASCADE, NOT NULL |
| `product_id` | UUID | FK → products(id) ON DELETE CASCADE, NOT NULL |
| `added_at` | TIMESTAMPTZ | DEFAULT now() |

**Constraints:**
- UNIQUE on `(list_id, product_id)` — prevent duplicate saves
- CASCADE deletes: removing a list removes its items; removing a product removes it from all lists
- Hard cap: maximum 200 items per list (enforced at API layer, not DB constraint)

### RLS Policies

- No RLS policies — all access goes through API routes using the service role client (consistent with existing patterns)

## API Routes

### Input Validation (all endpoints)

All endpoints that accept `token`, `edit_token`, `my_token`, or `product_id` must validate them as UUIDs using `isValidUuid()` from `lib/validate.ts`. Return 400 on invalid format.

All slugs must match `/^[a-z0-9-]{1,60}$/` — strict lowercase alphanumeric + hyphens, max 60 chars.

### Rate Limiting

Per-endpoint rate limits with in-memory maps. All rate maps must include a pruning step on each check (consistent with existing `contact/route.ts` and `analytics/track/route.ts` patterns).

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `POST /saved-lists` | 5 | 1 hour | List creation — shared bucket with lazy creation |
| `POST /saved-lists/me` | 60 | 1 min | Fetching own list |
| `POST /saved-lists/items` | 30 | 1 min | Add item. Lazy creation counts against the 5/hr bucket |
| `POST /saved-lists/items/remove` | 30 | 1 min | Remove item |
| `POST /saved-lists/share` | 10 | 1 min | Share actions |
| `GET /saved-lists/[slug]` | 30 | 1 min | Public shared list view. Rate-limit 404s separately: 10/min per IP |
| `POST /saved-lists/[slug]/add-to-mine` | 20 | 1 min | Add from shared list |
| `POST /saved-lists/stop-sharing` | 5 | 1 min | Revoke sharing |

### `POST /api/shop/saved-lists`

Create a new favorites list. Called lazily on first heart action if no token exists in localStorage.

**Request:** `{}` (empty body)
**Response:** `{ token: string, id: string }`

Creates a `saved_lists` row with a new `token`. Returns token for localStorage storage. Counts against the 5/hr list creation limit.

### `POST /api/shop/saved-lists/me`

Fetch the visitor's own list with item details. Uses POST to keep the token out of URLs/logs.

**Request:** `{ token: string }`
**Response:**
```json
{
  "id": "uuid",
  "slug": "rings-necklaces-a8k2m3p7" | null,
  "updated_at": "2026-03-27T...",
  "items": [
    {
      "product_id": "uuid",
      "name": "Silver Cuff",
      "price": 45.00,
      "images": ["url1"],
      "availability": "in_stock",
      "added_at": "2026-03-27T..."
    }
  ]
}
```

Joins `saved_list_items` to `products` table. Only returns products where `is_active = true`. Returns categorical `availability` instead of raw `stock_count`:
- `"in_stock"`: `stock_count - stock_reserved > 5`
- `"low_stock"`: `stock_count - stock_reserved` is 1–5
- `"sold_out"`: `stock_count - stock_reserved <= 0`

### `POST /api/shop/saved-lists/items`

Add an item to the visitor's list.

**Request:** `{ token: string, product_id: string }`
**Response:** `{ success: true }`

**Validation:**
1. Validate `token` and `product_id` as UUIDs
2. Look up product: must exist, `is_active = true`, and not gated behind a private sale token
3. Look up list by token; if not found, create lazily (counts against 5/hr creation limit)
4. Check list is not a snapshot (`is_snapshot = false`) — return 403 if snapshot
5. Check item count < 200 — return 422 if at cap
6. Upsert into `saved_list_items` (ignore if already exists)
7. Update `updated_at` and `last_accessed_at` on the list

### `POST /api/shop/saved-lists/items/remove`

Remove an item from a list. Uses POST instead of DELETE to avoid body-stripping by edge proxies.

**Request:** `{ token: string, product_id: string }`
**Response:** `{ success: true }`

**Authorization:** Token must match the list's `token` OR `edit_token`. Rejects writes to snapshot lists (`is_snapshot = true` → 403).

Updates `updated_at` and `last_accessed_at`.

### `POST /api/shop/saved-lists/share`

Generate a share link for the visitor's list.

**Request:** `{ token: string, mode: "copy" | "live" }`
**Response:** `{ slug: string, url: string }`

**`mode: "copy"` (snapshot):**
1. Create a new `saved_lists` row with `is_snapshot: true`, a new unique `token` (not the owner's), `source_list_id` pointing to original
2. Duplicate all `saved_list_items` into the new list
3. Generate slug, assign to the new list
4. Return the snapshot's slug and full URL

**`mode: "live"`:**
1. If the list already has a slug, return it (and existing `edit_token`)
2. Otherwise generate slug AND `edit_token`, assign both to the existing list
3. Return the slug and full URL with `edit_token` in the URL fragment: `/shop/saved/{slug}#edit={edit_token}`

The `edit_token` is in the URL fragment (after `#`) so it is never sent to the server in HTTP requests, never logged by proxies/CDNs, and never appears in Referer headers. The client reads it from `window.location.hash` and includes it in API request bodies for write operations.

### `POST /api/shop/saved-lists/stop-sharing`

Revoke sharing for a list. Nulls out the `slug` and `edit_token`.

**Request:** `{ token: string }`
**Response:** `{ success: true }`

Only the owner (via `token`) can stop sharing. Existing shared URLs will return 404 after this.

### `GET /api/shop/saved-lists/[slug]`

Public endpoint to view a shared list by slug.

**Response:**
```json
{
  "id": "uuid",
  "is_snapshot": true,
  "is_live": false,
  "updated_at": "2026-03-27T...",
  "items": [
    {
      "product_id": "uuid",
      "name": "Silver Cuff",
      "price": 45.00,
      "images": ["url1"],
      "availability": "in_stock",
      "added_at": "2026-03-27T..."
    }
  ]
}
```

Only returns active products (`is_active = true`). Returns categorical `availability` (not raw `stock_count`).

**The owner token is NEVER returned in this response.** For live lists, `is_live: true` signals to the client that editing is possible — the client reads the `edit_token` from the URL fragment (`window.location.hash`).

Rate-limits 404 responses separately (10/min per IP) to slow slug enumeration.

### `POST /api/shop/saved-lists/[slug]/add-to-mine`

Add a single item from a shared list to the visitor's own list.

**Request:** `{ my_token: string, product_id: string }`
**Response:** `{ success: true }`

**Validation:**
1. Validate `my_token` and `product_id` as UUIDs
2. Verify the slug exists and contains the `product_id`
3. Verify product is active (`is_active = true`)
4. Create visitor's list lazily if needed (counts against 5/hr creation limit)
5. Check visitor's list item count < 200
6. Upsert item into visitor's list

## Slug Generation

**Format:** `{descriptors}-{suffix}`

**Descriptors:** Up to 3 unique category names from the list's items, kebab-cased.
- Fallback if no categories: first 2-3 product names, truncated to 20 chars each
- Fallback if empty list: `favorites`
- Strict character filter: only `a-z`, `0-9`, `-` survive. All other characters stripped.

**Suffix:** 8 random lowercase alphanumeric characters (`36^8 ≈ 2.8 trillion` combinations)

**Total slug max length:** 60 characters (truncate descriptors if needed to fit)

**Examples:**
- `rings-necklaces-earrings-a8k2m3p7`
- `silver-cuff-opal-ring-x9w4b2n1`
- `favorites-q9w2k7j3`

**Reserved prefixes:** Slugs matching `share`, `me`, `items`, or any future route segment are rejected — regenerate if collision.

**Collision handling:** If the generated slug already exists, regenerate the suffix (retry up to 3 times, then extend suffix to 10 chars).

## UI Changes

### HeartButton (refactored)

`components/shop/HeartButton.tsx` — refactored to call API instead of localStorage.

- On first heart: POST to create list if no token in localStorage, then POST to add item
- Toggle behavior: POST to add, POST to remove
- Optimistic UI: update heart state immediately, revert on API error
- Same visual: outline Heart = not saved, filled Heart = saved

### Nav Heart Badge

Heart icon in shop navigation area (next to cart).
- Shows count badge when items > 0
- Links to `/shop/saved`
- Uses the same `useSavedItems` hook (refactored to API-backed)

### Saved Items Page (`/shop/saved`)

Refactored to fetch from API by token.

**New elements:**
- **Share section:** Two buttons below the header
  - "Share a Copy" — calls share API with `mode: "copy"`, copies URL to clipboard, shows toast
  - "Share Live List" — calls share API with `mode: "live"`, copies URL to clipboard (including fragment), shows toast
  - "Stop Sharing" — shown when list has a slug, calls stop-sharing endpoint, confirms via dialog
- **Link2 icon** on each card — copies individual product URL (`/shop/{id}`) to clipboard with toast
- **Heart (filled)** on each card — removes from list (existing behavior, now API-backed)

### Shared List Page (`/shop/saved/[slug]`)

New page for viewing shared lists.

**Route design:** Lives at `app/(public)/shop/saved/[slug]/page.tsx`. The existing `app/(public)/shop/saved/page.tsx` (no slug) is the owner's page. No route conflict in Next.js App Router. The `[slug]` page validates that the slug doesn't match reserved words before querying.

**Snapshot lists (`is_snapshot: true`):**
- Read-only banner: "Shared favorites list"
- Each card shows `HeartPlus` icon — "Add to my favorites" tooltip
- Tapping HeartPlus calls `/add-to-mine` endpoint
- Toast confirmation: "Added to your favorites"
- `Link2` icon on each card to copy individual product URL

**Live lists (`is_snapshot: false`):**
- Banner: "Shared live list — anyone with this link can add or remove items. Share carefully."
- Client reads `edit_token` from URL fragment (`window.location.hash`)
- If `edit_token` present: full Heart toggle (add/remove) using `edit_token` for authorization
- If no `edit_token` in URL: read-only view (same as snapshot, with HeartPlus to add to own list)
- `HeartHandshake` indicator shown when `updated_at` from API differs from last-known value in localStorage
- `Link2` icon on each card
- **Polling:** Every 30 seconds, re-fetch `GET /saved-lists/[slug]` to detect changes. Compare `updated_at` against stored value. Show HeartHandshake indicator for 5 seconds when a change is detected. Stop polling when tab is hidden (`document.hidden`).

### Product Card & Detail Page

- Existing `Heart` button — no visual change, now API-backed
- New `Link2` button alongside heart — copies product URL to clipboard
- Toast: "Link copied!"

### Toast Component

Simple toast notification using `aria-live="polite"` and `role="status"` for accessibility. Renders in a fixed position at the bottom of the viewport, above the nav z-index. Auto-dismisses after 3 seconds.
- "Link copied!"
- "Added to your favorites"
- "List link copied!"

## `useSavedItems` Hook Refactor

`lib/saved-items.ts` refactored from localStorage-only to API-backed with localStorage token cache.

### Updated `SavedItem` interface

```typescript
export interface SavedItem {
  product_id: string
  name: string
  price: number
  images: string[]
  availability: 'in_stock' | 'low_stock' | 'sold_out'
  added_at: string
}
```

### Hook API

```
State:
- token: string | null (from localStorage key 'pa-list-token')
- items: SavedItem[] (from API)
- loading: boolean
- count: number

On mount:
1. Check for migration (see below)
2. Read token from localStorage
3. If token exists, POST /api/shop/saved-lists/me with { token }
4. Populate items state

toggle(productId, productMeta):
1. Optimistic update (flip UI state immediately)
2. If no token: POST /api/shop/saved-lists → store token in localStorage
3. POST /saved-lists/items (add) or POST /saved-lists/items/remove (remove)
4. On error: revert optimistic update, show toast with error

isSaved(id):
- Check local items state (same as before)
```

## Migration Path

### Supabase Migration

New migration file: `supabase/migrations/044_saved_lists.sql`

1. Create `saved_lists` table with all columns
2. Create `saved_list_items` table
3. Add indexes and unique constraints

### localStorage Migration (one-time)

The refactored `useSavedItems` hook detects old `pa-saved-items` localStorage data and migrates it to the database on first load.

**Idempotency protocol:**
1. Check for `pa-saved-items` key in localStorage (old data exists)
2. Check for `pa-migration-in-progress` key (previous attempt didn't complete)
3. If migration flag exists, skip migration (previous partial run) — clear the flag and old data, start fresh
4. Set `pa-migration-in-progress = true` in localStorage
5. POST to create list → receive token
6. POST each item to add (sequentially, not in parallel)
7. Store token as `pa-list-token`
8. Remove `pa-saved-items` and `pa-migration-in-progress`

If the tab closes mid-migration: on next load, the flag is detected, old data is cleared, and the visitor starts fresh. The orphaned partial DB list is cleaned up by future TTL.

## Edge Cases

1. **Product deleted after being saved:** CASCADE delete removes from all lists. API responses only return active products.
2. **Visitor clears localStorage:** Token is lost. They start a fresh list. Old list remains in DB until TTL cleanup. This is documented — no recovery without accounts.
3. **Slug collision:** Retry with new suffix (8 chars), extend to 10 chars after 3 retries.
4. **Empty list shared:** Slug still generated (`favorites-xxxxxxxx`). Shared page shows "This list is empty" message.
5. **Live list token conflict:** If a visitor already has their own list token and visits a live shared list, the edit_token from the URL fragment is used for that list's writes only. Their own list token is unaffected. No localStorage collision.
6. **Product out of stock:** Still shown in favorites with a "Sold out" badge (consistent with current product card behavior).
7. **Private sale products:** Rejected at the items endpoint — cannot be added to any saved list.
8. **Snapshot immutability:** All write endpoints (add item, remove item) reject requests where `is_snapshot = true` with a 403.
9. **Stop sharing a live list:** Owner calls stop-sharing endpoint. Slug and edit_token are nulled. Existing shared URLs return 404. Items remain in the owner's list.
10. **200-item cap reached:** API returns 422 with message "List is full (max 200 items)." UI shows toast with the message.

## Future Considerations (Not in Scope)

- TTL cleanup job for orphaned lists (can be a scheduled Supabase function later)
- Analytics on shared list engagement (leveraging `source_list_id` lineage)
- Email/SMS sharing (currently clipboard only)
- Account-based favorites (if user accounts are ever added)
- Soft delete / undo for live list modifications
