# Square Options & Product Variations

**Date:** 2026-03-30
**Status:** Approved
**Approach:** Hybrid — relational options, lightweight variations (Approach C)

## Overview

Add support for product variations (size, color, stone type, pattern, etc.) managed via reusable option sets in the admin UI, with bidirectional sync to Square's Item Options API. Products without variations continue working unchanged.

## Context

Purple Acorns sells handmade artisan goods. Most products are one-of-a-kind (single variation), but a meaningful subset has options: kantha jackets in size x color, brass rings in sizes, semi-precious stone rings by stone type, crochet patterns by design x size. The variation matrix is **sparse** — not every combination exists for every product.

### Square's Model

| Concept | Square Object | Example |
|---|---|---|
| Option type | `CatalogItemOption` | "Size", "Color" |
| Option value | `CatalogItemOptionValue` | "Small", "Red" |
| Sellable SKU | `CatalogItemVariation` | "Small, Red" — own price + inventory |

Square tracks inventory at the `CatalogItemVariation` level. Each variation has its own `price_money`, `sku`, and `track_inventory` flag. Up to 250 variations per item.

## Data Model

### New Tables

#### `item_options` — Reusable option definitions (shared across products)

```sql
CREATE TABLE item_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                    -- e.g., "Size", "Color"
  display_name    TEXT,                             -- customer-facing label (defaults to name)
  square_option_id TEXT,                            -- Square CatalogItemOption ID
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `item_option_values` — Values within an option

```sql
CREATE TABLE item_option_values (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id               UUID NOT NULL REFERENCES item_options(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,             -- e.g., "Small", "Red"
  sort_order              INTEGER NOT NULL DEFAULT 0,
  square_option_value_id  TEXT,                      -- Square CatalogItemOptionValue ID
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `product_options` — Which options are attached to a product

```sql
CREATE TABLE product_options (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES item_options(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, option_id)
);
```

#### `product_variations` — Sellable SKUs with own price/inventory

```sql
CREATE TABLE product_variations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku                 TEXT,
  price               NUMERIC(10,2) NOT NULL,
  stock_count         INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  stock_reserved      INTEGER NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
  is_default          BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  image_url           TEXT,                          -- per-variation hero image (nullable, falls back to product images[0])
  square_variation_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `variation_option_values` — Links a variation to its specific option values

```sql
CREATE TABLE variation_option_values (
  variation_id    UUID NOT NULL REFERENCES product_variations(id) ON DELETE CASCADE,
  option_value_id UUID NOT NULL REFERENCES item_option_values(id) ON DELETE CASCADE,
  PRIMARY KEY (variation_id, option_value_id)
);
```

### Changes to `products` Table

```sql
-- Generated column — always consistent, zero maintenance
-- Actual implementation: use a trigger since Postgres generated columns
-- cannot reference other tables. Trigger on product_options INSERT/DELETE
-- updates has_options on the parent product.
ALTER TABLE products ADD COLUMN has_options BOOLEAN NOT NULL DEFAULT false;
```

`has_options` is maintained by a trigger on `product_options` INSERT/DELETE rather than application code, preventing drift. Existing `price`, `stock_count`, `stock_reserved`, `square_variation_id` remain for simple products.

### Required Indexes

```sql
-- Variation lookup (checkout, webhook, inventory sync)
CREATE INDEX idx_pv_product_id ON product_variations(product_id);
CREATE INDEX idx_pv_square_id ON product_variations(square_variation_id) WHERE square_variation_id IS NOT NULL;
CREATE UNIQUE INDEX idx_pv_sku ON product_variations(sku) WHERE sku IS NOT NULL;

-- Exactly one default per product
CREATE UNIQUE INDEX idx_pv_one_default ON product_variations(product_id) WHERE is_default = true;

-- Option value joins (shop UI)
CREATE INDEX idx_vov_variation ON variation_option_values(variation_id);
CREATE INDEX idx_vov_option_value ON variation_option_values(option_value_id);
CREATE INDEX idx_iov_option ON item_option_values(option_id);

-- Square ID lookups (pull sync)
CREATE INDEX idx_io_square_id ON item_options(square_option_id) WHERE square_option_id IS NOT NULL;
CREATE INDEX idx_iov_square_id ON item_option_values(square_option_value_id) WHERE square_option_value_id IS NOT NULL;
```

### Database View for Product Listings

```sql
CREATE VIEW products_with_default AS
SELECT
  p.*,
  pv.id          AS default_variation_id,
  pv.price       AS effective_price,
  pv.stock_count AS effective_stock,
  pv.sku         AS default_sku
FROM products p
LEFT JOIN product_variations pv
  ON pv.product_id = p.id AND pv.is_default = true;
```

Shop listing APIs query this view to avoid N+1 queries for default variation data.

### New RPC Functions

#### `decrement_variation_stock`

Atomic stock decrement matching the existing `decrement_stock` pattern:

```sql
CREATE OR REPLACE FUNCTION decrement_variation_stock(var_id UUID, qty INTEGER)
RETURNS SETOF product_variations AS $$
  UPDATE product_variations
  SET stock_count = stock_count - qty,
      updated_at = now()
  WHERE id = var_id
    AND stock_count - stock_reserved >= qty
    AND is_active = true
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER;
```

#### Variation-aware private sale RPCs

`create_private_sale_variation`, `release_private_sale_variation_stock`, `fulfill_private_sale_variation` — same `FOR UPDATE` locking pattern as existing private sale functions, operating on `product_variations.stock_reserved`.

### Related Table Changes

```sql
-- Sync log: per-variation error tracking + conflict fields
ALTER TABLE channel_sync_log
  ADD COLUMN variation_id UUID REFERENCES product_variations(id) ON DELETE CASCADE,
  ADD COLUMN last_synced_at TIMESTAMPTZ,
  ADD COLUMN remote_updated_at TIMESTAMPTZ,
  ADD COLUMN conflict_source TEXT CHECK (conflict_source IN ('square', 'website')),
  ADD COLUMN conflict_detail JSONB;

-- Saved lists: remember specific variation
ALTER TABLE saved_list_items
  ADD COLUMN variation_id UUID REFERENCES product_variations(id) ON DELETE SET NULL;

-- Private sale items: target specific variation
ALTER TABLE private_sale_items
  ADD COLUMN variation_id UUID REFERENCES product_variations(id) ON DELETE SET NULL;
```

## Admin UI

### Option Sets Management

New section in admin settings (alongside Categories):

- **List view** — all reusable option sets with usage count badge (number of products using each)
- **Create/edit** — name the option, add/reorder/remove values via drag handles
- **Delete protection** — cannot delete an option set that is in use by products; show which products use it

### Product Form Changes

#### When `has_options` is OFF (default)

Current form unchanged — single price, single stock count. Simple products stay simple.

#### When `has_options` is toggled ON

- Price and stock fields replaced with inline message: **"Prices and stock are managed per variation below"**
- **Options panel** appears:
  - Attach existing option sets from dropdown, OR create a custom inline option
  - Reorder attached options (drag handle)
  - Remove an option from this product
- **Variations table** appears below:
  - Columns (left to right): Default (radio), Option values, Price, Stock, SKU, Active (toggle)
  - **"Add variation"** button — pick option values from dropdowns, set price/stock
    - Option value dropdowns include a **"+ Create new value"** entry at the bottom — prompts: "Add to shared [Color] set, or just this product?"
  - **"Generate all combinations"** button — fills the table with cross-product, but all generated rows default to `is_active: false` and `stock_count: 0`. Clear label: "Review and activate each variation before saving."
  - **"Clone"** button per row — duplicates with `stock: 0, active: false` (efficient for large option sets like stone types)
  - Inline editing for price/stock
  - Bulk select + delete for cleaning up unwanted generated combinations
  - First variation auto-selected as default; save validation enforces exactly one default

#### Toggling `has_options` back OFF

Prompt: "Which variation's price should become the product price?" with a dropdown of existing variations.

#### Unsaved Changes Protection

When `has_options` is on and the variations table has data, disable the modal backdrop-click-to-dismiss. Show a `ConfirmDialog` ("You have unsaved variations. Discard them?") if the user tries to cancel.

### Inventory Manager Changes

- Products with variations show a **"3 variations"** badge in the list view
- Expanding a product row shows variation-level: option values, stock, price, sync status
- **"Mark sold"** fast action button on each expanded variation row (sets `stock_count = 0`)
- **"Quick Stock Update" mode** — toggle at the top of the inventory list that makes stock count fields inline-editable across all visible products/variations, with a single "Save all" button. Primary use case: post-craft-fair stock adjustments.

### Conflict Resolution UI

When sync conflicts exist, a warning badge appears on the affected product in the inventory manager. Expanding shows:

- Per-field comparison framed as: **"Square says 3 in stock. Website says 5. Which is correct?"**
- Shows which side (Square / Website) made the last change
- Two buttons to resolve: "Use Square value" / "Use Website value"
- Resolving updates the local value and pushes to Square (or vice versa), clearing the conflict

## Public Shop UI

### Product Card (`ProductCard.tsx`)

- Displays the **default variation's price** (via `products_with_default` view)
- Stock badge: "In Stock" if any variation has `stock_count - stock_reserved > 0`, "Out of Stock" if all depleted

### Product Detail Page (`ProductDetail.tsx`)

- **Option selectors** below product name — one button group per attached option
- Default variation pre-selected on load
- On selection change:
  - Price updates to selected variation's price
  - Stock status updates (in stock / out of stock for that combination)
  - If variation has `image_url`, carousel scrolls to that image
- **Unavailable combinations greyed out** with dimmed styling + "Sold out" tooltip
  - A combination is unavailable if: no active variation exists for it, OR the variation's `stock_count - stock_reserved <= 0`
  - Smart cascading: selecting "Small" recalculates which colors are available for "Small"
- **Add to Cart** sends `product_id` + `variation_id`
- Products without options: no selectors, behaves exactly as today

### Public API Security

- `GET /api/shop/products/[id]` returns variation data with only: `id`, `price`, `is_default`, `is_active`, `in_stock` (boolean, computed server-side), option value names
- **Never expose** `stock_count`, `stock_reserved`, or `sku` publicly
- Validate `variation_id` against `UUID_RE` pattern before any DB query
- Rate limit unchanged (existing rate limiter on the endpoint)

## Cart & Checkout

### Cart Changes (`CartContext.tsx`)

- Cart items reference both `product_id` and `variation_id` (nullable for simple products)
- Display: product name + selected option values (e.g., "Kantha Jacket — Small, Blue")
- Two items with same product but different variations are separate line items
- Price read from variation, not parent product

### Checkout Validation

1. Validate `variation_id` is a valid UUID
2. Verify `variation_id` belongs to the given `product_id` (`product_variations.product_id = product_id`)
3. Verify `product_variations.is_active = true`
4. Resolve price from `product_variations.price` server-side — **never trust client-supplied price**
5. Call `decrement_variation_stock(variation_id, qty)` — atomic, returns empty set if insufficient stock
6. Rollback loop: if any line item fails, re-increment all previously decremented variations

### Private Sales

`stock_reserved` on `product_variations` works identically to `products.stock_reserved`. Variation-aware RPCs handle the reserve/release/fulfill cycle.

### Saved Lists

`saved_list_items.variation_id` optionally stores the specific variation. If the variation is later deleted, the FK is `SET NULL` and the saved item falls back to the parent product.

## Bidirectional Sync with Square

### Push (Website -> Square)

#### Simple products (no options)

Same as today — one `CatalogItem` with one "Regular" `CatalogItemVariation`.

#### Products with options

1. Check `item_options.square_option_id` — if already set, skip option creation (reuse existing Square option)
2. For new options: upsert `CatalogItemOption` with deterministic idempotency key (`option-push-{optionId}`)
3. Upsert `CatalogItemOptionValue` objects for any values missing `square_option_value_id`
4. Upsert `CatalogItem` with `item_options` referencing the option IDs
5. Upsert each `CatalogItemVariation` with `item_option_values`, price, SKU
6. Set inventory per variation via `inventory.batchCreateChanges()`
7. Store returned Square IDs back in our tables

#### Sync locking

Before starting a push for a product, acquire an advisory lock:

```sql
SELECT pg_try_advisory_xact_lock(hashtext(product_id::text))
```

If the lock is held (concurrent sync in progress), skip this product and log a warning. Same lock used for pull. Prevents concurrent push/pull from corrupting state during the multi-step API call window.

### Pull (Square -> Website)

1. Fetch all `ITEM`, `ITEM_OPTION`, and `ITEM_VARIATION` catalog objects (iterate all pages)
2. Match options by `square_option_id` — upsert into `item_options` / `item_option_values`
3. **Sanitize all string fields** from Square (`sanitizeText()` on option names, value names, variation names, SKUs) before upserting
4. For each item with options:
   - Set `has_options = true` via trigger (inserting `product_options` rows triggers it)
   - Upsert `product_variations` with price, SKU, Square IDs
   - Upsert `variation_option_values` links
   - Iterate **all** variations (not just `[0]` as current code does)
5. Pull inventory counts per variation
6. If no default variation is set, mark the first active one as default

### Conflict Detection

Two-condition check (not raw `updated_at` comparison):

1. Store `last_synced_at` and `remote_updated_at` (Square's `updated_at`) per sync log entry
2. A conflict exists when BOTH conditions are true:
   - Square's `updated_at` > `remote_updated_at` (Square changed since last sync)
   - Supabase's `updated_at` > `last_synced_at` (website changed since last sync)
3. On conflict: write to `channel_sync_log` with:
   - `status: 'conflict'`
   - `conflict_source`: whichever side has the more recent `updated_at`
   - `conflict_detail`: JSON of field-level diffs (e.g., `{ "price": { "website": 1200, "square": 1500 } }`)
4. Do NOT auto-resolve — surface in admin UI for manual resolution

### Webhook Handler Update

`lib/channels/square/webhook.ts` must become variation-aware:

```
1. Receive inventory count update with catalog_object_id
2. Try: UPDATE product_variations SET stock_count = qty WHERE square_variation_id = catalog_object_id
3. If no rows matched: fall back to UPDATE products SET stock_count = qty WHERE square_variation_id = catalog_object_id
```

This ensures both new variation products and legacy simple products receive webhook inventory updates.

## Inventory Report

New report in the admin reports section.

### Content

- **Scope:** All products with `has_options = true`
- **Grouped by product** with variation rows nested underneath
- **View toggle:** "Items only" (no prices) vs "Items + Prices"
- **Columns (Items + Prices mode):** Product name, Option values, SKU, Price, Stock, Reserved, Available, Sync status
- **Columns (Items only mode):** Product name, Option values, Stock, Reserved, Available, Sync status
- **Summary row per product:** Total stock, number of out-of-stock variations
- **Filters:** Category, stock status (All / Low stock / Out of stock), sync status (All / Synced / Conflict)
- **Sync status column:** Conditionally hidden when `squareSyncEnabled` is false
- **Low stock highlighting:** Red (0 available), Amber (<=3 available)
- **CSV export**

## Migration Strategy

Two-phase migration to ensure zero downtime:

### Phase 1: Create tables, backfill, deploy

**Migration A:**
1. Create all new tables (`item_options`, `item_option_values`, `product_options`, `product_variations`, `variation_option_values`)
2. Create indexes, constraints, view, RPCs
3. Add trigger on `product_options` to maintain `products.has_options`
4. Alter `channel_sync_log`, `saved_list_items`, `private_sale_items`
5. **Backfill:** For every existing product with `square_variation_id`, insert one `product_variations` row copying `price`, `stock_count`, `stock_reserved`, `square_variation_id` with `is_default = true`
6. **Do NOT drop** `products.square_variation_id`, `products.price`, `products.stock_count`, `products.stock_reserved`

**Deploy:** Update all code paths to prefer `product_variations` with fallback to `products` columns:
- Checkout: branch on `variation_id` presence
- Webhook handler: try `product_variations` first, fall back to `products`
- Shop API: use `products_with_default` view
- Sync: iterate all variations on pull

### Phase 2: Cleanup (later, after validation)

**Migration B:**
- For simple products (`has_options = false`): `products.price`/`stock_count`/`stock_reserved` remain as the canonical source
- For variation products: these columns become unused (application code no longer reads them)
- Optionally drop `products.square_variation_id` for variation products or leave it as a denormalized reference

## Multi-Channel Considerations

### Pinterest

The `ChannelAdapter` interface gains an optional `pushVariation` method:

```typescript
export interface ChannelAdapter {
  push(product: Product): Promise<SyncResult>
  pushVariation?(product: Product, variation: ProductVariation): Promise<SyncResult>
  fullSync(products: Product[]): Promise<SyncResult[]>
}
```

Pinterest's catalog supports item groups with `item_group_id`. Variation products push as grouped items with per-variation price and availability.

`SyncResult` gains `variationId?: string` for per-variation tracking.

### Etsy (future)

Etsy uses per-listing variations (not shared options). The `item_options` reusability is a Square/DB concept — Etsy sync will denormalize at push time. The schema supports this without changes.

## Input Validation & Security

- **Admin endpoints:** All new CRUD routes call `requireAdminSession()`
- **Sanitization:** `sanitizeText()` on all string fields (option names, value names, display names, SKUs) before insert/update — both from admin input and Square pull
- **Checkout:** Price resolved server-side from `product_variations.price`; `variation_id` validated against `UUID_RE` and verified to belong to the `product_id`
- **Public API:** Strip `stock_count`, `stock_reserved`, `sku` from responses; return computed `in_stock: boolean`
- **Rate limiting:** Existing rate limiter on `/api/shop/products/[id]` covers variation data (same endpoint, joined query)
- **RLS:** New tables follow existing pattern — all writes via service role client, no public write access

## Out of Scope (Future)

- Per-variation multiple images (beyond single `image_url`)
- Variation-specific deep-link URLs (`?variant=large-gold`)
- Configurable low-stock threshold (currently hardcoded at 3)
- CSV import for bulk stock updates
- Etsy channel adapter
