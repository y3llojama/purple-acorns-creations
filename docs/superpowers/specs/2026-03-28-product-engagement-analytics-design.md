# Product Engagement Analytics — Design Spec

## Overview

Track product-level user interactions (view, click, save, unsave, pin, shop) and surface engagement analytics in the admin dashboard. Abandon rate is derived from the relationship between views and positive actions (saves + shop clicks).

## Goals

- Track every meaningful product interaction as an analytics event
- Provide a conversion funnel view across all products (views > clicks > saves > pins > shop clicks)
- Surface a summary on the existing analytics page with a link to a dedicated product analytics page
- Keep the existing `analytics_events` table as the single source of truth — no denormalized counters

## Non-Goals

- No public-facing favorite/engagement counts (admin-only)
- No custom date range picker (reuse existing period selector)
- No `unpin_click` event (un-pinning happens on Pinterest, not in our app)
- No `abandon` event (derived metric, not tracked)

---

## Data Model

### New Event Types

Added to `ALLOWED_EVENT_TYPES` in `lib/analytics.ts`:

| Event type | Fired when | Metadata |
|---|---|---|
| `product_click` | Product card clicked from any listing page | `{ product_id }` |
| `shop_click` | Buy / Square checkout link clicked | `{ product_id }` |
| `product_save` | Heart button toggled ON | `{ product_id }` |
| `product_unsave` | Heart button toggled OFF | `{ product_id }` |
| `pin_click` | Pinterest share button clicked | `{ product_id }` |

`shop_click` already exists in `ALLOWED_EVENT_TYPES` but is never fired — we wire it up.

`pin_click` replaces the current `share_click` with `channel: 'pinterest'` pattern for clarity. Existing `share_click` events with `channel: 'pinterest'` remain in the DB for historical data — all product-engagement queries count both `pin_click` events AND legacy `share_click` events where `metadata->>'channel' = 'pinterest'`.

### Existing summary route update (#7)

The existing `/api/admin/analytics/summary` route currently counts `share_click` events for the "Share Clicks" card. Update it to also count `pin_click` events so the main analytics page total stays accurate after the migration to the new event type.

### Derived Metrics

- **Abandon rate** = `(views - saves - shop_clicks) / views` per product, clamped to 0-100%
- **Save rate** = `saves / views`
- **Shop conversion** = `shop_clicks / views`

### Migration

New migration file adds:

1. GIN index on `analytics_events.metadata` for fast `metadata->>'product_id'` queries
2. Partial composite index on `(event_type, created_at DESC)` filtered to the new event types

No new tables. No schema changes to `products`.

### Existing `view_count`

The `view_count` column on `products` stays as-is. For the engagement funnel, views are derived from `page_view` events where `page_path` matches the pattern `/shop/<uuid>` (e.g., `/shop/a1b2c3d4-...`). The UUID is extracted from the path and joined against the `products` table to get product names. This keeps the funnel consistent (all metrics from the same events table, same time period).

---

## Client-Side Event Tracking

All events use the existing batched `queueEvent()` pattern from `AnalyticsTracker.tsx` or direct `fetch('/api/analytics/track', ...)` with `keepalive: true`.

### `product_click` — ProductCard.tsx

Fire on card click (the link/anchor wrapping the card), before navigation. Use `keepalive: true` to survive page transition.

```
{ event_type: 'product_click', page_path: window.location.pathname, metadata: { product_id } }
```

### `shop_click` — ProductDetail.tsx

Fire on Buy / Square checkout button click. The event type already exists in the allowed list.

```
{ event_type: 'shop_click', page_path: window.location.pathname, metadata: { product_id } }
```

### `product_save` / `product_unsave` — lib/saved-items.ts

Fire inside `toggle()` **only after `res.ok`** from the save/unsave API call — never optimistically. If the API call fails, no analytics event is sent. Determine which event based on whether the product was added or removed.

```
{ event_type: 'product_save' | 'product_unsave', page_path: window.location.pathname, metadata: { product_id } }
```

### `pin_click` — ProductCard.tsx, ProductDetail.tsx

Replace the existing inline `share_click` with `channel: 'pinterest'` calls. Fire as `pin_click` instead.

```
{ event_type: 'pin_click', page_path: window.location.pathname, metadata: { product_id } }
```

---

## Admin Dashboard — Main Analytics Page

### New "Product Engagement" section

Added below existing sections on `/admin/analytics`. Contains:

**Summary cards (single row):**

| Card | Value |
|---|---|
| Product Clicks | Count of `product_click` events in period |
| Total Saves | Net saves (`product_save` minus `product_unsave`) in period |
| Shop Clicks | Count of `shop_click` events in period |
| Pin Shares | Count of `pin_click` events in period |
| Save Rate | saves / views as percentage |
| Shop Conversion | shop_clicks / views as percentage |

**Top 10 Products table:**

Columns: Product name, Views, Clicks, Saves, Shop Clicks, Pins, Abandon Rate. Sorted by views descending. Each row links to the dedicated product analytics page.

**"View all" link** at the bottom navigates to `/admin/analytics/products`.

### API Route

`GET /api/admin/analytics/product-engagement?period=7d`

Returns `{ cards: { ... }, topProducts: [...] }`.

---

## Admin Dashboard — Dedicated Product Analytics Page

New page at `/admin/analytics/products`. Admin-auth-protected via `requireAdminSession()`.

### Period selector

Same as existing analytics page: Today / 7 Days / 30 Days / All Time. Defaults to 7 Days.

### Section 1: Conversion Funnel

Graduated bar chart showing the aggregate funnel across all products:

Views > Clicks > Saves > Pins > Shop Clicks

Each bar shows the count and percentage relative to views. Heights are proportional.

### Section 2: Engagement Over Time

Stacked daily bar chart. Each day shows:
- Clicks (indigo)
- Saves (pink)
- Shop Clicks (amber)

Legend below the chart. X-axis shows dates for the selected period.

### Section 3: All Products Table

Full sortable table with every active product:

| Column | Source |
|---|---|
| Product | Product name |
| Views | `page_view` events with matching product path |
| Clicks | `product_click` events |
| Saves | Net `product_save` minus `product_unsave` |
| Pins | `pin_click` events |
| Shop | `shop_click` events |
| Abandon | `(views - saves - shop_clicks) / views` |

Default sort: views descending. Clickable column headers to re-sort.

### API Routes (#9 — consolidated)

Two routes instead of four. The summary route on the main analytics page stays separate because it serves a different page.

| Route | Returns |
|---|---|
| `GET /api/admin/analytics/product-engagement?period=7d` | Summary cards + top 10 (for main analytics page) |
| `GET /api/admin/analytics/products?period=7d&page=1&limit=50` | Funnel, timeseries, and full product table (for dedicated page) |

The dedicated page route returns all three sections in one response:
```json
{
  "funnel": { "views": 1247, "clicks": 773, "saves": 225, "pins": 150, "shop_clicks": 62 },
  "timeseries": [{ "date": "2026-03-28", "clicks": 42, "saves": 12, "shop_clicks": 3 }, ...],
  "products": [{ "id": "...", "name": "...", "views": 142, "clicks": 89, ... }, ...],
  "pagination": { "page": 1, "limit": 50, "total": 24 }
}
```

All routes are admin-auth-protected. Period parameter validated against `['1d', '7d', '30d', 'all']`. Responses include `Cache-Control: private, max-age=60`.

---

## Server-Side Validation

### product_id UUID validation (#1)

The `/api/analytics/track` route must validate that `metadata.product_id`, when present, is a valid UUID. Reject with `400` if it fails the regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`. This prevents injection of arbitrary strings into the metadata JSONB column.

### Period parameter allowlist (#6)

All admin analytics API routes must validate the `period` query parameter against the allowlist `['1d', '7d', '30d', 'all']`. Reject with `400` for any other value. Add `Cache-Control: private, max-age=60` header to all responses (1-minute cache for admin). The product table route supports `?page=1&limit=50` pagination (default limit 50, max 100).

### Product name sanitization (#10)

All admin dashboard components that render product names must pass them through `sanitizeText()` from `lib/sanitize.ts` before display. Product names come from the DB and are generally trusted, but defense-in-depth requires sanitization of any value rendered as HTML.

---

## Rate Limiting & Privacy

- All new events go through the existing `/api/analytics/track` endpoint — same 30-events-per-60s rate limit applies
- IP hashing with daily rotating salt (existing pattern)
- No new PII collected — `product_id` is the only metadata field

---

## Legal & Compliance

### Privacy policy update (#3)

Before deploying, update the site privacy policy to disclose the new product interaction tracking (clicks, saves, pins, shop clicks). The existing policy covers page views — extend it to cover engagement events. Migration `045_update_privacy_policy_tracking_disclosure.sql` already exists; verify it covers the new event types or add a follow-up migration.

### Consent / opt-out mechanism (#4)

Document a legitimate interest assessment for these analytics: the events are anonymous (no user accounts, IP-hashed with daily salt, session-scoped), contain no PII, and serve the legitimate business interest of understanding product engagement. Add a note to the privacy policy explaining this basis. No cookie consent banner is needed since we use `sessionStorage` (not cookies) and no cross-site tracking occurs.

### Data retention (#8)

Add an automated retention policy: a `pg_cron` job that deletes `analytics_events` rows older than 12 months, running weekly. This limits data accumulation and supports data minimization principles. Add this in the migration file.

```sql
SELECT cron.schedule(
  'analytics-events-retention',
  '0 3 * * 0',  -- weekly, Sunday 3am UTC
  $$DELETE FROM analytics_events WHERE created_at < now() - interval '12 months'$$
);
```

---

## File Changes Summary

| File | Change |
|---|---|
| `lib/analytics.ts` | Add new event types to `ALLOWED_EVENT_TYPES` |
| `app/api/analytics/track/route.ts` | Add UUID validation for `metadata.product_id` |
| `components/shop/ProductCard.tsx` | Fire `product_click` and replace pinterest `share_click` with `pin_click` |
| `components/shop/ProductDetail.tsx` | Fire `shop_click` and replace pinterest `share_click` with `pin_click` |
| `lib/saved-items.ts` | Fire `product_save` / `product_unsave` in `toggle()` after `res.ok` |
| `supabase/migrations/047_product_engagement_indexes.sql` | GIN + composite indexes on `analytics_events` + pg_cron 12-month retention job |
| `app/api/admin/analytics/summary/route.ts` | Count `pin_click` alongside legacy `share_click` for share totals |
| `app/admin/(dashboard)/analytics/page.tsx` | Add Product Engagement summary section, sanitize product names |
| `app/admin/(dashboard)/analytics/products/page.tsx` | New dedicated product analytics page, sanitize product names |
| `app/api/admin/analytics/product-engagement/route.ts` | Summary cards + top 10 API (period allowlist, caching) |
| `app/api/admin/analytics/products/route.ts` | Consolidated funnel + timeseries + product table API (period allowlist, pagination, caching) |
