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

`pin_click` replaces the current `share_click` with `channel: 'pinterest'` pattern for clarity. Existing `share_click` events with `channel: 'pinterest'` remain in the DB for historical data — the product-engagement queries include both.

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

Fire inside `toggle()` after the API call succeeds. Determine which event based on whether the product was added or removed.

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

### API Routes

| Route | Returns |
|---|---|
| `GET /api/admin/analytics/product-funnel?period=7d` | Aggregate funnel counts |
| `GET /api/admin/analytics/product-timeseries?period=7d` | Daily breakdown by event type |
| `GET /api/admin/analytics/product-table?period=7d` | Per-product engagement rows |

All routes are admin-auth-protected.

---

## Rate Limiting & Privacy

- All new events go through the existing `/api/analytics/track` endpoint — same 30-events-per-60s rate limit applies
- IP hashing with daily rotating salt (existing pattern)
- No new PII collected — `product_id` is the only metadata field

---

## File Changes Summary

| File | Change |
|---|---|
| `lib/analytics.ts` | Add new event types to `ALLOWED_EVENT_TYPES` |
| `components/shop/ProductCard.tsx` | Fire `product_click` and replace pinterest `share_click` with `pin_click` |
| `components/shop/ProductDetail.tsx` | Fire `shop_click` and replace pinterest `share_click` with `pin_click` |
| `lib/saved-items.ts` | Fire `product_save` / `product_unsave` in `toggle()` |
| `supabase/migrations/045_product_engagement_indexes.sql` | GIN + composite indexes on `analytics_events` |
| `app/admin/(dashboard)/analytics/page.tsx` | Add Product Engagement summary section |
| `app/admin/(dashboard)/analytics/products/page.tsx` | New dedicated product analytics page |
| `app/api/admin/analytics/product-engagement/route.ts` | Summary + top 10 API |
| `app/api/admin/analytics/product-funnel/route.ts` | Funnel aggregation API |
| `app/api/admin/analytics/product-timeseries/route.ts` | Daily engagement breakdown API |
| `app/api/admin/analytics/product-table/route.ts` | Full product table API |
