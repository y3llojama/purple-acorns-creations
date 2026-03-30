# Square Options & Product Variations

**Date:** 2026-03-30
**Status:** Approved (rev 2 — incorporates domain architect, store owner, and CPA reviews)
**Approach:** Hybrid — relational options, lightweight variations (Approach C)

## Overview

Add support for product variations (size, color, stone type, pattern, etc.) managed via reusable option sets in the admin UI, with bidirectional sync to Square's Item Options API. Products without variations continue working unchanged in the UI — but all products use `product_variations` as the single authoritative source for price and stock.

## Context

Purple Acorns sells handmade artisan goods. Most products are one-of-a-kind (single variation), but a meaningful subset has options: kantha jackets in size x color, brass rings in sizes, semi-precious stone rings by stone type, crochet patterns by design x size. The variation matrix is **sparse** — not every combination exists for every product.

### Square's Model

| Concept | Square Object | Example |
|---|---|---|
| Option type | `CatalogItemOption` | "Size", "Color" |
| Option value | `CatalogItemOptionValue` | "Small", "Red" |
| Sellable SKU | `CatalogItemVariation` | "Small, Red" — own price + inventory |

Square tracks inventory at the `CatalogItemVariation` level. Each variation has its own `price_money`, `sku`, and `track_inventory` flag. Up to 250 variations per item.

## Key Architectural Decision: Single Stock Authority

**All products — including simple ones — use `product_variations` as the single authoritative source for price, stock, and Square variation ID.** Simple products have exactly one variation row (their "Regular" variation). This eliminates the dual-stock state problem where `products.stock_count` and `product_variations.stock_count` could diverge during migration.

After migration:
- `products.price`, `products.stock_count`, `products.stock_reserved`, `products.square_variation_id` become **unused columns** (retained temporarily for rollback safety, then dropped)
- All code paths (checkout, webhooks, sync, private sales) read/write `product_variations` exclusively
- One set of RPCs, one source of truth, no dual-write window

## Data Model

### New Tables

#### `item_options` — Reusable option definitions (shared across products)

```sql
CREATE TABLE item_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                    -- e.g., "Size", "Color"
  display_name    TEXT NOT NULL DEFAULT '',         -- customer-facing label (empty = use name)
  is_reusable     BOOLEAN NOT NULL DEFAULT true,   -- false = per-product custom option
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

**Delete protection on values:** Before deleting an `item_option_values` row, the application must check `variation_option_values` references. Block the delete if count > 0 and show which products/variations use that value. This prevents orphaned variations losing their option-value links.

#### `product_options` — Which options are attached to a product

```sql
CREATE TABLE product_options (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES item_options(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, option_id)
);
```

#### `product_variations` — Single authoritative source for price/stock (ALL products)

```sql
CREATE TABLE product_variations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku                 TEXT,
  price               NUMERIC(10,2) NOT NULL,
  cost                NUMERIC(10,2),                 -- manufacturing/wholesale cost (for COGS)
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

**Variation uniqueness:** A trigger on `variation_option_values` INSERT verifies no existing active variation for the same product shares the identical set of option values (using `array_agg` comparison). Prevents duplicate "Large, Blue" rows.

#### `stock_movements` — Inventory audit trail

```sql
CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id    UUID NOT NULL REFERENCES product_variations(id) ON DELETE CASCADE,
  quantity_change  INTEGER NOT NULL,                 -- positive = stock in, negative = stock out
  reason          TEXT NOT NULL CHECK (reason IN (
    'sale', 'return', 'manual_adjustment', 'sync_correction',
    'shrinkage', 'reserved', 'released', 'initial_stock'
  )),
  source          TEXT NOT NULL CHECK (source IN ('website', 'square', 'admin_manual', 'system')),
  note            TEXT,                              -- optional free-text (e.g., "damaged at Savannah market")
  admin_user_id   TEXT,                              -- who made the change (for manual adjustments)
  square_order_id TEXT,                              -- link to Square order if applicable
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### `orders` / `order_line_items` — Local sales ledger

```sql
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_order_id TEXT,
  channel         TEXT NOT NULL CHECK (channel IN ('website', 'square_pos')),
  total_amount    NUMERIC(10,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'partial_refund')),
  customer_email  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  variation_id    UUID NOT NULL REFERENCES product_variations(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(10,2) NOT NULL,            -- price at time of sale (snapshot)
  unit_cost       NUMERIC(10,2),                     -- cost at time of sale (snapshot, for COGS)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Changes to `products` Table

```sql
ALTER TABLE products ADD COLUMN has_options BOOLEAN NOT NULL DEFAULT false;
```

`has_options` is maintained by a trigger on `product_options` INSERT/DELETE. It means "option selectors should be shown in the UI," not "variations exist" (all products have at least one variation).

After migration, `products.price`, `products.stock_count`, `products.stock_reserved`, and `products.square_variation_id` are **retained but unused** — all reads/writes go through `product_variations`. These columns are dropped in a later cleanup migration after validation.

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

-- Product options reverse lookup (usage count, delete protection)
CREATE INDEX idx_po_option_id ON product_options(option_id);

-- Square ID lookups (pull sync)
CREATE INDEX idx_io_square_id ON item_options(square_option_id) WHERE square_option_id IS NOT NULL;
CREATE INDEX idx_iov_square_id ON item_option_values(square_option_value_id) WHERE square_option_value_id IS NOT NULL;

-- Stock movements (audit queries)
CREATE INDEX idx_sm_variation ON stock_movements(variation_id);
CREATE INDEX idx_sm_created ON stock_movements(created_at);

-- Orders
CREATE INDEX idx_orders_square ON orders(square_order_id) WHERE square_order_id IS NOT NULL;
CREATE INDEX idx_oli_variation ON order_line_items(variation_id);
CREATE INDEX idx_oli_order ON order_line_items(order_id);
```

### Database View for Product Listings

```sql
CREATE VIEW products_with_default AS
SELECT
  p.*,
  pv.id          AS default_variation_id,
  pv.price       AS effective_price,
  pv.stock_count AS effective_stock,
  pv.sku         AS default_sku,
  EXISTS (
    SELECT 1 FROM product_variations pv2
    WHERE pv2.product_id = p.id
      AND pv2.is_active = true
      AND pv2.stock_count - pv2.stock_reserved > 0
  ) AS any_in_stock
FROM products p
LEFT JOIN product_variations pv
  ON pv.product_id = p.id AND pv.is_default = true;
```

Shop listing APIs query this view to avoid N+1 queries. `any_in_stock` powers the product card stock badge without exposing exact counts.

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
    AND qty > 0
    AND stock_count - stock_reserved >= qty
    AND is_active = true
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER;
```

#### `increment_variation_stock`

For checkout rollback:

```sql
CREATE OR REPLACE FUNCTION increment_variation_stock(var_id UUID, qty INTEGER)
RETURNS SETOF product_variations AS $$
  UPDATE product_variations
  SET stock_count = stock_count + qty,
      updated_at = now()
  WHERE id = var_id
    AND qty > 0
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER;
```

#### Variation-aware private sale RPCs

`create_private_sale_variation`, `release_private_sale_variation_stock`, `fulfill_private_sale_variation` — same `FOR UPDATE` locking pattern as existing private sale functions, operating on `product_variations.stock_reserved`.

**Lock order:** Always lock `product_variations` rows. Never touch `products.stock_reserved` after migration. This prevents deadlocks from cross-table lock acquisition.

#### At-least-one-default enforcement

Deferred constraint trigger that fires at transaction end: if any product has `has_options = true` (or any `product_variations` rows) but zero default variations, the trigger auto-promotes the first active variation to default. If no active variations exist, it raises an exception.

### Related Table Changes

```sql
-- Sync log: per-variation tracking + conflict fields
-- Unique constraint updated to accommodate variation-level entries
ALTER TABLE channel_sync_log
  ADD COLUMN variation_id UUID REFERENCES product_variations(id) ON DELETE CASCADE,
  ADD COLUMN last_synced_at TIMESTAMPTZ,
  ADD COLUMN remote_updated_at TIMESTAMPTZ,
  ADD COLUMN conflict_source TEXT CHECK (conflict_source IN ('square', 'website')),
  ADD COLUMN conflict_detail JSONB;

-- Replace existing unique constraint with variation-aware one
-- Product-level: (product_id, channel) WHERE variation_id IS NULL
-- Variation-level: (product_id, variation_id, channel) WHERE variation_id IS NOT NULL
DROP INDEX IF EXISTS channel_sync_log_product_id_channel_key;
CREATE UNIQUE INDEX idx_csl_product_channel
  ON channel_sync_log(product_id, channel) WHERE variation_id IS NULL;
CREATE UNIQUE INDEX idx_csl_variation_channel
  ON channel_sync_log(product_id, variation_id, channel) WHERE variation_id IS NOT NULL;

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

- **List view** — all reusable option sets (`is_reusable = true`) with usage count badge
- **Create/edit** — name the option, add/reorder/remove values via drag handles
- **Delete protection** — cannot delete an option set in use; show which products use it
- **Value-level delete protection** — cannot remove a value that is used by any variation; show which products/variations use it

### Product Form Changes

#### When `has_options` is OFF (default)

Current form unchanged — single price, single stock count. Under the hood these read/write the product's sole `product_variations` row, but the UI is identical to today.

#### When `has_options` is toggled ON

- Price and stock fields replaced with inline message: **"Prices and stock are managed per variation below"**
- **Options panel** appears:
  - Attach existing option sets from dropdown, OR create a custom inline option (`is_reusable = false`)
  - Reorder attached options (drag handle)
  - Remove an option from this product
- **Variations table** appears below:
  - Columns (left to right): Default (radio), Option values, Price, Cost (optional), Stock, SKU, Active (toggle)
  - **"Add variation"** button — pick option values from dropdowns, set price/stock
    - Option value dropdowns include a **"+ Create new value"** entry at the bottom — prompts: "Add to shared [Color] set, or just this product?"
  - **"Generate all combinations"** button — fills the table with cross-product. Generated rows default to `is_active: false`, `stock_count: 0`, and **price pre-populated from the product's current price** (from the existing default variation). Clear label: "Review and activate each variation before saving."
  - **"Clone"** button per row — duplicates with `stock: 0, active: false`
  - Inline editing for price/stock/cost
  - Bulk select + delete for cleaning up unwanted generated combinations
  - First variation auto-selected as default; save validation enforces exactly one default

#### Toggling `has_options` back OFF

Prompt: "Which variation's price should become the product price?" with a dropdown of existing variations. The selected variation becomes the sole "Regular" variation; others are deactivated.

#### Unsaved Changes Protection

When `has_options` is on and the variations table has data, disable the modal backdrop-click-to-dismiss. Show a `ConfirmDialog` ("You have unsaved variations. Discard them?") if the user tries to cancel.

### Inventory Manager Changes

- Products with variations show a **"3 variations"** badge in the list view
- Expanding a product row shows variation-level: option values, stock, price, sync status
- **"Mark sold"** fast action button on each expanded variation row (sets `stock_count = 0`)
- **"Sold X"** action — enter quantity sold, system decrements (writes `stock_movements` entry with reason `manual_adjustment`)
- **"Quick Stock Update" mode** — toggle at the top of the inventory list:
  - Desktop: inline-editable stock fields across all visible products/variations
  - Mobile: simplified view showing only product name, variation name, and stock field
  - Single "Save all" button submits all changes in one batch
  - Every change writes a `stock_movements` ledger entry with reason `manual_adjustment`
- **SKU nudges** — variations without SKUs show a subtle "No SKU" badge. Bulk "Generate SKUs" action creates from pattern (e.g., `KNTH-SM-BLU`)

### Mobile-First Admin Design

The entire admin UI must be fully usable on mobile (phone screens, 375px+). Key patterns:

- **Inventory Manager list:** Single-column card layout on mobile. Each product card shows name, category, stock badge, and expand chevron. Expanded state shows variations as stacked rows (not a horizontal table).
- **Product Form:** Variations table becomes a card stack on mobile — each card shows the option values as a header, with price/stock/SKU as labeled fields below. Default radio and active toggle are prominent at the top of each card.
- **Quick Stock Update:** Mobile view is a flat list of product/variation names with a numeric input next to each. No columns for price, SKU, sync status — just name and stock.
- **Option Sets:** List with swipe-to-delete on values. Add value via bottom sheet, not modal.
- **Inventory Report:** Card-based layout on mobile. Filters in a collapsible header. CSV export button sticky at bottom.
- **Conflict Resolution:** Full-width comparison cards — "Square: 3" vs "Website: 5" side by side with large tap targets for resolution buttons.
- **Touch targets:** 48px minimum throughout (per CLAUDE.md accessibility requirement).

### Concurrent Update Detection

When the admin saves changes to a product or variation, the system detects if the data was modified by another source (Square webhook, another admin session) since it was loaded:

- **Mechanism:** On load, the admin UI captures `updated_at` for each variation. On save, the API checks: `WHERE id = var_id AND updated_at = captured_updated_at`. If the row was modified in between (by a webhook or another session), the UPDATE matches zero rows.
- **On conflict detected:** The save is rejected with a clear message:
  - **"This item was updated by Square while you were editing. Square set stock to 3. Your change: 5. Which value should we keep?"**
  - Or: **"Another admin session updated this item. Reload to see the latest values?"**
- **Applies to:** All variation fields (price, stock, cost, is_active, is_default) and option value names
- **Stock movements:** The concurrent update itself is logged as a `stock_movements` entry so the audit trail captures both the webhook/external change and the admin's resolution

### Conflict Resolution UI

When sync conflicts exist, a warning badge appears on the affected product in the inventory manager. Expanding shows:

- Per-field comparison framed as: **"Square says 3 in stock. Website says 5. Which is correct?"**
- Shows which side (Square / Website) made the last change
- Two buttons to resolve: "Use Square value" / "Use Website value"
- Resolving updates the local value, writes a `stock_movements` entry with reason `sync_correction`, and pushes to Square (or vice versa), clearing the conflict

## Public Shop UI

### Product Card (`ProductCard.tsx`)

- Displays the **default variation's price** (via `products_with_default` view)
- Stock badge uses `any_in_stock` from the view: "In Stock" or "Out of Stock"
- No exact stock counts exposed publicly

### Product Detail Page (`ProductDetail.tsx`)

- **Option selectors** below product name — one button group per attached option (only shown when `has_options = true`)
- Default variation pre-selected on load
- On selection change:
  - Price updates to selected variation's price
  - Stock status updates (in stock / out of stock for that combination)
  - If variation has `image_url`, carousel scrolls to that image
- **Unavailable combinations greyed out** with dimmed styling + "Sold out" tooltip
  - A combination is unavailable if: no active variation exists for it, OR the variation's `stock_count - stock_reserved <= 0`
  - Smart cascading: selecting "Small" recalculates which colors are available for "Small"
  - Availability matrix returned in a single joined query per product (not per-selection)
- **Add to Cart** sends `product_id` + `variation_id` (always — even simple products send their sole variation ID)
- Products without options: no selectors shown, behaves exactly as today visually
- **Deactivated variation in cart:** If a variation becomes inactive while in a customer's cart, checkout returns a clear error: "Sorry, [Variation Name] is no longer available" (not a generic error)

### Public API Security

- `GET /api/shop/products/[id]` returns variation data with only: `id`, `price`, `is_default`, `is_active`, `in_stock` (boolean, computed server-side), option value names
- **Never expose** `stock_count`, `stock_reserved`, `sku`, or `cost` publicly
- Validate `variation_id` against `UUID_RE` pattern before any DB query
- Rate limit unchanged (existing rate limiter on the endpoint)

## Cart & Checkout

### Cart Changes (`CartContext.tsx`)

- Cart items always reference both `product_id` and `variation_id`
- Display: product name + selected option values (e.g., "Kantha Jacket — Small, Blue"). Simple products show just the product name.
- Two items with same product but different variations are separate line items
- Price read from variation, not parent product

### Checkout Validation

1. Validate `variation_id` is a valid UUID
2. Fetch `product_variations` row — verify it exists, `is_active = true`, and `product_id` matches
3. Resolve price from `product_variations.price` server-side — **never trust client-supplied price**
4. Snapshot `unit_cost` from `product_variations.cost` (for COGS tracking in `order_line_items`)
5. Call `decrement_variation_stock(variation_id, qty)` — atomic, returns empty set if insufficient stock
6. Write `stock_movements` entry: `reason: 'sale', source: 'website'`
7. Push inventory to Square using `product_variations.square_variation_id` (not `products.square_variation_id`)
8. Write `orders` + `order_line_items` records locally (with `channel: 'website'`)
9. Rollback on failure: call `increment_variation_stock` for all previously decremented variations, write compensating `stock_movements` entries

### Private Sales

`stock_reserved` on `product_variations` is the sole authority. Variation-aware RPCs handle the reserve/release/fulfill cycle. Reserved-but-not-sold inventory remains the business's inventory (not revenue, not liability).

**Reservation expiration:** `private_sale_items` should track `reserved_at`. A scheduled cleanup job alerts the admin (or auto-releases) reservations older than a configurable threshold (default: 7 days).

### Saved Lists

`saved_list_items.variation_id` optionally stores the specific variation. If the variation is later deleted, the FK is `SET NULL` and the saved item falls back to the parent product.

## Bidirectional Sync with Square

### Push (Website -> Square)

#### Simple products (no options)

One `CatalogItem` with one `CatalogItemVariation` ("Regular"). **No delete-then-recreate for products that have Square order history.** Use version-based upsert (pass existing `version` field from Square) for idempotent updates.

#### Products with options

1. Check `item_options.square_option_id` — if already set, skip option creation (reuse existing Square option)
2. For new options: upsert `CatalogItemOption` with deterministic idempotency key (`option-push-{optionId}`)
3. Upsert `CatalogItemOptionValue` objects for any values missing `square_option_value_id`
4. Upsert `CatalogItem` with `item_options` referencing the option IDs
5. **Never delete-then-recreate a CatalogItem that has options** — destroys Square order history. Use upsert with version field.
6. Upsert each `CatalogItemVariation` with `item_option_values`, price, SKU
7. Set inventory per variation via `inventory.batchCreateChanges()`
8. Store returned Square IDs back in our tables

#### Sync locking

Before starting a push for a product, acquire an advisory lock:

```sql
SELECT pg_try_advisory_xact_lock(hashtext(product_id::text))
```

If the lock is held (concurrent sync in progress), skip this product and log a warning. Same lock used for pull.

### Pull (Square -> Website)

1. Fetch all `ITEM`, `ITEM_OPTION`, and `ITEM_VARIATION` catalog objects (iterate all pages)
2. Match options by `square_option_id` — upsert into `item_options` / `item_option_values`
3. **Sanitize all string fields** from Square (`sanitizeText()`) before upserting
4. For each item:
   - If it has options: set `has_options = true` via trigger (inserting `product_options` rows)
   - Upsert `product_variations` with price, SKU, Square IDs
   - Upsert `variation_option_values` links
   - Iterate **all** variations (not just `[0]` as current code does)
5. Pull inventory counts per variation — write `stock_movements` entries with reason `sync_correction` for any changes
6. If no default variation is set, mark the first active one as default

### Conflict Detection

**Catalog-level conflicts** (name, description, options) use Square's `CatalogItem.updated_at`:
1. Store `remote_updated_at` (Square's item-level `updated_at`) in the product-level `channel_sync_log` row
2. A conflict exists when both sides changed since last sync

**Inventory-level conflicts** (stock counts) use Square's inventory count timestamps (`calculated_at`):
1. Compare per-variation, using the inventory counts API's timestamps
2. This avoids false positives where editing one variation flags all siblings

On conflict:
- Write to `channel_sync_log` with `status: 'conflict'`, `conflict_source` (most recent side), `conflict_detail` (field-level diffs)
- Do NOT auto-resolve — surface in admin UI

### Webhook Handler Update

`lib/channels/square/webhook.ts` operates on `product_variations` exclusively:

```
1. Receive inventory count update with catalog_object_id
2. UPDATE product_variations SET stock_count = qty WHERE square_variation_id = catalog_object_id
3. Write stock_movements entry: reason 'sale', source 'square'
```

No fallback to `products` table needed — all products have variation rows after migration.

### Offline/Delayed Webhooks

Square retries webhooks for up to 72 hours on failure. If the website is unreachable during a market (no signal), Square queues the events. When connectivity returns, webhooks arrive and stock updates. As a safety net, the manual "Sync from Square" button in the inventory manager performs a full inventory pull that catches any missed webhooks.

## Inventory Report

New report in the admin reports section.

### Content

- **Scope: ALL products** — both simple and variation products, unified in one view
- Simple products appear as a single row; variation products are grouped with nested variation rows
- **View toggle:** "Items only" (no prices) vs "Items + Prices"
- **Columns (Items + Prices mode):** Product name, Option values, SKU, Price, Cost, Stock, Reserved, Available, Sync status
- **Columns (Items only mode):** Product name, Option values, Stock, Reserved, Available, Sync status
- **Summary row per product:** Total stock, number of out-of-stock variations
- **Grand total row** at the bottom: total items across all products
- **Filters:** Category, stock status (All / Low stock / Out of stock), sync status (All / Synced / Conflict)
- **Sync status column:** Conditionally hidden when `squareSyncEnabled` is false
- **Low stock highlighting:** Red (0 available), Amber (<=3 available)
- **CSV export — two formats:**
  1. **Inventory Status** — operational view (current design)
  2. **Accounting Export** — QuickBooks/Xero compatible: Item Name, SKU, Description, Sales Price, Cost, Quantity On Hand, with sensible account name defaults

### Additional Financial Reports (future, enabled by new data model)

The `orders`, `order_line_items`, `stock_movements`, and `cost` fields enable these reports without schema changes:
- **Inventory Valuation:** On-hand inventory at cost (for Schedule C / Form 1125-A)
- **COGS Report:** Beginning inventory + purchases - ending inventory
- **Sales by Variation:** Revenue, units sold, average price per variation per period
- **Channel Sales Summary:** Revenue by channel (website vs Square POS) per period
- **Sell-Through Rate:** Units sold / (sold + on hand) per variation

## Migration Strategy

### Single-phase migration with reconciliation script

**Migration:**
1. Create all new tables (`item_options`, `item_option_values`, `product_options`, `product_variations`, `variation_option_values`, `stock_movements`, `orders`, `order_line_items`)
2. Create indexes, constraints, triggers, view, RPCs
3. Add `has_options` column + trigger to `products`
4. Alter `channel_sync_log`, `saved_list_items`, `private_sale_items`
5. **Backfill ALL products** (not just those with `square_variation_id`):
   - For each product, insert one `product_variations` row copying `price`, `stock_count`, `stock_reserved`, `square_variation_id` with `is_default = true`, `is_active = true`
   - Products without `square_variation_id` get a variation row with `square_variation_id = NULL`
   - Write a `stock_movements` entry per product: `reason: 'initial_stock', source: 'system'`
6. Retain `products.price/stock_count/stock_reserved/square_variation_id` as unused columns

**Reconciliation script** (`scripts/reconcile-variation-stock.sh`):
- Run immediately before code deploy
- Re-reads current `products.stock_count` for each product and updates the backfilled `product_variations` row if it diverged during the migration window
- Logs any discrepancies found

**Deploy:** All code paths switch to `product_variations` exclusively. No fallbacks to `products` columns.

**Cleanup migration (later):**
- Entry criteria (all must pass before running):
  ```sql
  -- No stock divergence between old and new columns
  SELECT COUNT(*) FROM products p
  JOIN product_variations pv ON pv.product_id = p.id AND pv.is_default = true
  WHERE p.stock_count != pv.stock_count;
  -- Must return 0

  -- All products have at least one variation
  SELECT COUNT(*) FROM products p
  WHERE NOT EXISTS (SELECT 1 FROM product_variations pv WHERE pv.product_id = p.id);
  -- Must return 0

  -- At least one full sync cycle completed after deploy
  -- (verify via channel_sync_log timestamps)
  ```
- Drop `products.price`, `products.stock_count`, `products.stock_reserved`, `products.square_variation_id`
- Drop old `decrement_stock` / `increment_stock` RPCs

**Rollback plan for migration:**
- DOWN migration script drops all new tables, columns, triggers, and view
- Safety assertion at top: `IF (SELECT COUNT(*) FROM order_line_items) > 0 THEN RAISE EXCEPTION 'Cannot rollback after orders have been recorded'`
- Must be executed within the deploy window before any variation-specific data is written

## Multi-Channel Considerations

### Channel Adapter Interface

Use a capability-check pattern instead of optional methods:

```typescript
export interface ChannelAdapter {
  push(product: Product): Promise<SyncResult>
  fullSync(products: Product[]): Promise<SyncResult[]>
}

export interface VariationAwareAdapter extends ChannelAdapter {
  pushVariation(product: Product, variation: ProductVariation): Promise<SyncResult>
}

// Usage: if ('pushVariation' in adapter) { ... }
```

`SyncResult` gains `variationId?: string` for per-variation tracking.

### Pinterest

Pinterest's catalog supports item groups with `item_group_id`. Variation products push as grouped items with per-variation price and availability. Rate limiting must be respected (Pinterest allows ~10 req/s).

### Etsy (future)

Etsy uses per-listing variations (not shared options). The `is_reusable` flag on `item_options` helps the Etsy adapter distinguish shared sets from per-product custom options. Etsy sync denormalizes at push time. The schema supports this without changes.

## Input Validation & Security

- **Admin endpoints:** All new CRUD routes call `requireAdminSession()`
- **Sanitization:** `sanitizeText()` on all string fields (option names, value names, display names, SKUs) before insert/update — both from admin input and Square pull
- **Checkout:** Price resolved server-side from `product_variations.price`; `variation_id` validated against `UUID_RE` and verified to belong to the `product_id`; `variation.is_active` must be `true`
- **Public API:** Strip `stock_count`, `stock_reserved`, `sku`, and `cost` from responses; return computed `in_stock: boolean`
- **Rate limiting:** Existing rate limiter on `/api/shop/products/[id]` covers variation data
- **RLS:** New tables follow existing pattern — all writes via service role client, no public write access
- **Stock movements:** Every stock change writes a ledger entry — provides full audit trail

## Prerequisite: Existing Inventory Management Gaps

The audit revealed that mobile responsiveness and concurrent update detection are missing from the **existing** inventory management system. These must be addressed as part of this work — not just for the new variations UI, but for all existing admin screens.

### Mobile Gaps in Existing Code

| Component | File | Issue |
|---|---|---|
| **Product table** | `InventoryManager.tsx:297-368` | 7-column table with no responsive breakpoint. Needs card layout on mobile. |
| **Product form modal** | `InventoryManager.tsx:371-407` | `maxWidth: 600px`, no mobile breakpoint. Overflows on <600px screens. |
| **Toolbar** | `InventoryManager.tsx:191-278` | Search input `maxWidth: 240px` + button group `marginLeft: auto` fails when wrapped on small screens. |
| **Image drag-and-drop** | `ProductForm.tsx:220-286` | 80px images with 6px-offset remove button. No touch-friendly drag handle. Desktop-centric drag UX. |
| **Form inputs** | `ProductForm.tsx:332` | Gallery sort order hardcoded `width: 120px`. |
| **Category drag handle** | `CategoryManager.tsx:188-227` | Braille character "⠿" is ~14px wide — impossible to tap on mobile. |
| **Category form** | `CategoryManager.tsx:363-388` | Fixed-position form at 639px breakpoint, no safe-area padding for notched phones. |
| **Category buttons** | `CategoryManager.tsx:218-219` | `minHeight: 44px` but `padding: 4px 10px` — odd proportions, cramped on mobile. |
| **Global admin CSS** | `globals.css` | No responsive styles for admin tables, modals, buttons, or input fields. |

**Fixes required (included in this implementation):**

1. **Product list → card layout** on screens <=640px. Single-column cards with product image, name, price, stock badge, and expand chevron. Action buttons as icon buttons in card header.
2. **Product form modal → full-screen on mobile.** `position: fixed; inset: 0` below 640px with safe-area padding.
3. **Toolbar → stacked layout** on mobile. Search full-width, filter dropdown below, action buttons as a bottom-fixed bar.
4. **Image management → touch-friendly.** Larger remove buttons (32px, no negative offset). Replace drag-and-drop with long-press reorder or up/down arrow buttons on mobile.
5. **Category drag → mobile-friendly handle.** Replace braille character with a visible grip icon (hamburger lines), minimum 44px tap target. On mobile, use up/down arrow buttons instead of drag.
6. **Category form → full-screen on mobile** with safe-area padding for notched phones.
7. **Global admin responsive CSS.** Add `@media (max-width: 640px)` rules for admin table cells, modal widths, button font sizes, and input field sizing (16px minimum to prevent iOS auto-zoom).

### Concurrent Update Gaps in Existing Code

| Component | File:Line | Issue |
|---|---|---|
| **Product PATCH** | `inventory/[id]/route.ts:43` | Blindly calls `.update()` — no `updated_at` check. Two admins editing the same product: last write silently wins. |
| **Square webhook** | `webhook.ts:30-33` | Updates `stock_count` without checking if admin is mid-edit. Webhook change can be silently overwritten when admin saves. |
| **Checkout** | `checkout/route.ts:62,85` | Does not fetch `updated_at`; `decrement_stock` RPC has no version check. |
| **Product create** | `inventory/route.ts:33-40` | No idempotency key. Network timeout + retry creates duplicate products. |
| **Category PATCH** | `categories/[id]` | Same pattern as product PATCH — no version check. |
| **Category reorder** | `CategoryManager.tsx:177-182` | Two-update swap not atomic. Concurrent reorders can interleave. |
| **All admin forms** | `ProductForm`, `CategoryManager` | No UI feedback when data was modified by another session or webhook since the form loaded. |

**Fixes required (included in this implementation):**

1. **Optimistic locking on all PATCH endpoints.** Client sends `updated_at` with every save. Server adds `.eq('updated_at', clientUpdatedAt)` to the update query. If zero rows match, return HTTP 409 Conflict with the current server state.

2. **Conflict UI in all admin forms.** When a 409 is received:
   - Show: "This item was modified while you were editing."
   - If source is identifiable (webhook vs admin): "Updated by Square" or "Updated by another admin session."
   - Options: "Reload latest" (discard local changes) or "Overwrite" (force save with current `updated_at`).
   - For stock-specific conflicts: show both values — "Your value: 5. Current value: 3 (updated by Square). Which to keep?"

3. **Webhook writes include timestamp logging.** After updating stock, write a `stock_movements` entry. Admin forms can detect "stock changed since you loaded" and show an inline alert even before save.

4. **Product create idempotency.** Client generates a UUID request ID, sent as `Idempotency-Key` header. Server checks for duplicate within a 5-minute window before inserting.

5. **Category reorder atomicity.** Replace two separate updates with a single Supabase RPC that swaps `sort_order` values in one transaction.

6. **Checkout version awareness.** The `decrement_variation_stock` RPC (new) is inherently safe (atomic WHERE clause). But the price fetched at checkout start should be re-verified at charge time — if price changed between page load and checkout submit, show "Price has been updated to $X. Continue?"

## Out of Scope (Future)

- Per-variation multiple images (beyond single `image_url`)
- Variation-specific deep-link URLs (`?variant=large-gold`)
- Configurable low-stock threshold (currently hardcoded at 3)
- CSV import for bulk stock updates
- Etsy channel adapter
- Batch "add new value to all products using option X" workflow
- Financial reports UI (data model supports them; UI deferred)
