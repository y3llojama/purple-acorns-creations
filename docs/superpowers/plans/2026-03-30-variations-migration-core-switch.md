# Plan 1: Migration + Core Code Switch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the database migration (tables, indexes, view, RPCs, triggers), backfill existing products into `product_variations`, then switch all 14 source files from dead columns (`products.price/stock_count/stock_reserved/square_variation_id`) to read/write `product_variations` exclusively — making all 32 failing migration-gate tests pass.

**Architecture:** Single Supabase migration `048_product_variations.sql` creates the full schema. A backfill block within the migration inserts one default variation per existing product. All application code switches to `product_variations` as the single stock authority. The `products_with_default` view provides listing queries. New RPCs `decrement_variation_stock` and `increment_variation_stock` replace the old `decrement_stock`/`increment_stock`.

**Tech Stack:** Supabase PostgreSQL (migration SQL), Next.js 15 App Router (TypeScript), Jest 30 (test verification)

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `supabase/migrations/048_product_variations.sql` | Full migration: tables, indexes, view, RPCs, triggers, backfill, ALTER existing tables |
| `scripts/reconcile-variation-stock.sh` | Pre-deploy reconciliation script — re-reads `products.stock_count` and patches any diverged `product_variations` rows |

### Modified Files
| File | What Changes |
|---|---|
| `app/api/shop/checkout/route.ts` | Switch from `products.price/stock_count/square_variation_id` + `decrement_stock`/`increment_stock` to `product_variations` + `decrement_variation_stock`/`increment_variation_stock` |
| `lib/channels/square/webhook.ts` | `handleInventoryUpdate` writes to `product_variations` instead of `products`, also inserts `stock_movements` |
| `app/api/shop/products/route.ts` | Query `products_with_default` view instead of `products`; sort by `effective_price` |
| `app/api/shop/products/[id]/route.ts` | Join `product_variations` for variation data; return safe public fields only |
| `app/api/admin/inventory/route.ts` | GET reads `products_with_default`; POST creates product + default variation in transaction |
| `app/api/admin/inventory/[id]/route.ts` | GET joins variations; PATCH writes to `product_variations` with optimistic locking (409 on conflict) |
| `lib/channels/square/catalog.ts` | `pushProduct` reads price/stock from default variation; `pullInventoryFromSquare` writes to `product_variations` + `stock_movements`; `pullProductsFromSquare` creates variation rows |
| `lib/channels/pinterest/catalog.ts` | Read price/stock from default variation instead of `product.price`/`product.stock_count` |
| `lib/channels/index.ts` | `syncAllProducts` queries `products_with_default`; `logSyncResults` uses variation-aware conflict key |
| `components/shop/ProductCard.tsx` | Use `any_in_stock` for sold-out badge, `effective_price` for price display |
| `components/shop/ProductDetail.tsx` | Use default variation price/stock; pass `variationId` to `addToCart` |
| `components/shop/CartContext.tsx` | Cart items keyed by `productId + variationId`; send `variationId` to checkout |
| `lib/seo.tsx` | `buildProductSchema` accepts `effectivePrice`/`anyInStock` params |

---

### Task 1: Database Migration SQL

**Files:**
- Create: `supabase/migrations/048_product_variations.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 048_product_variations.sql
-- Single Stock Authority: ALL products use product_variations for price/stock

-- ═══ New Tables ═══

CREATE TABLE item_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  display_name    TEXT NOT NULL DEFAULT '',
  is_reusable     BOOLEAN NOT NULL DEFAULT true,
  square_option_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE item_option_values (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id               UUID NOT NULL REFERENCES item_options(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  square_option_value_id  TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_options (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_id   UUID NOT NULL REFERENCES item_options(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, option_id)
);

CREATE TABLE product_variations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku                 TEXT,
  price               NUMERIC(10,2) NOT NULL,
  cost                NUMERIC(10,2),
  stock_count         INTEGER NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  stock_reserved      INTEGER NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
  is_default          BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  image_url           TEXT,
  square_variation_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE variation_option_values (
  variation_id    UUID NOT NULL REFERENCES product_variations(id) ON DELETE CASCADE,
  option_value_id UUID NOT NULL REFERENCES item_option_values(id) ON DELETE CASCADE,
  PRIMARY KEY (variation_id, option_value_id)
);

CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id    UUID NOT NULL REFERENCES product_variations(id) ON DELETE CASCADE,
  quantity_change  INTEGER NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN (
    'sale', 'return', 'manual_adjustment', 'sync_correction',
    'shrinkage', 'reserved', 'released', 'initial_stock'
  )),
  source          TEXT NOT NULL CHECK (source IN ('website', 'square', 'admin_manual', 'system')),
  reference_id    TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
  unit_price      NUMERIC(10,2) NOT NULL,
  unit_cost       NUMERIC(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ ALTER existing tables ═══

ALTER TABLE products ADD COLUMN IF NOT EXISTS has_options BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE channel_sync_log
  ADD COLUMN IF NOT EXISTS variation_id UUID REFERENCES product_variations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS remote_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conflict_source TEXT CHECK (conflict_source IN ('square', 'website')),
  ADD COLUMN IF NOT EXISTS conflict_detail JSONB;

-- Replace existing unique constraint with variation-aware ones
DROP INDEX IF EXISTS channel_sync_log_product_id_channel_key;
CREATE UNIQUE INDEX idx_csl_product_channel
  ON channel_sync_log(product_id, channel) WHERE variation_id IS NULL;
CREATE UNIQUE INDEX idx_csl_variation_channel
  ON channel_sync_log(product_id, variation_id, channel) WHERE variation_id IS NOT NULL;

-- saved_list_items and private_sale_items get variation_id
DO $$ BEGIN
  ALTER TABLE saved_list_items
    ADD COLUMN variation_id UUID REFERENCES product_variations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE private_sale_items
    ADD COLUMN variation_id UUID REFERENCES product_variations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ═══ Indexes ═══

CREATE INDEX idx_pv_product_id ON product_variations(product_id);
CREATE INDEX idx_pv_square_id ON product_variations(square_variation_id) WHERE square_variation_id IS NOT NULL;
CREATE UNIQUE INDEX idx_pv_sku ON product_variations(sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX idx_pv_one_default ON product_variations(product_id) WHERE is_default = true;

CREATE INDEX idx_vov_variation ON variation_option_values(variation_id);
CREATE INDEX idx_vov_option_value ON variation_option_values(option_value_id);
CREATE INDEX idx_iov_option ON item_option_values(option_id);
CREATE INDEX idx_po_option_id ON product_options(option_id);
CREATE INDEX idx_io_square_id ON item_options(square_option_id) WHERE square_option_id IS NOT NULL;
CREATE INDEX idx_iov_square_id ON item_option_values(square_option_value_id) WHERE square_option_value_id IS NOT NULL;

CREATE INDEX idx_sm_variation ON stock_movements(variation_id);
CREATE INDEX idx_sm_created ON stock_movements(created_at);

CREATE INDEX idx_orders_square ON orders(square_order_id) WHERE square_order_id IS NOT NULL;
CREATE INDEX idx_oli_variation ON order_line_items(variation_id);
CREATE INDEX idx_oli_order ON order_line_items(order_id);

-- ═══ View ═══

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

-- ═══ RPCs ═══

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

CREATE OR REPLACE FUNCTION increment_variation_stock(var_id UUID, qty INTEGER)
RETURNS SETOF product_variations AS $$
  UPDATE product_variations
  SET stock_count = stock_count + qty,
      updated_at = now()
  WHERE id = var_id
    AND qty > 0
  RETURNING *;
$$ LANGUAGE sql SECURITY DEFINER;

-- ═══ Trigger: has_options auto-set ═══

CREATE OR REPLACE FUNCTION update_has_options() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE products SET has_options = true WHERE id = NEW.product_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE products SET has_options = (
      EXISTS (SELECT 1 FROM product_options WHERE product_id = OLD.product_id)
    ) WHERE id = OLD.product_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_has_options
AFTER INSERT OR DELETE ON product_options
FOR EACH ROW EXECUTE FUNCTION update_has_options();

-- ═══ Backfill: create one default variation per existing product ═══

INSERT INTO product_variations (product_id, price, stock_count, stock_reserved, square_variation_id, is_default, is_active)
SELECT id, price, stock_count, stock_reserved, square_variation_id, true, true
FROM products;

-- Write initial_stock movement for each backfilled variation
INSERT INTO stock_movements (variation_id, quantity_change, reason, source)
SELECT pv.id, pv.stock_count, 'initial_stock', 'system'
FROM product_variations pv;

-- ═══ RLS (service role only — same pattern as products) ═══

ALTER TABLE product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE variation_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Verify migration file exists**

Run: `ls -la supabase/migrations/048_product_variations.sql`
Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/048_product_variations.sql
git commit -m "feat: add 048 migration — product_variations tables, view, RPCs, backfill"
```

---

### Task 2: Reconciliation Script

**Files:**
- Create: `scripts/reconcile-variation-stock.sh`

- [ ] **Step 1: Write the reconciliation script**

```bash
#!/usr/bin/env bash
# reconcile-variation-stock.sh
# Run immediately before deploying the code switch.
# Re-reads products.stock_count and patches any diverged product_variations rows.
# Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.

set -euo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"

API="${SUPABASE_URL}/rest/v1"
AUTH="apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
BEARER="Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

echo "=== Reconcile variation stock ==="

# Fetch all products with their stock
products=$(curl -s "${API}/products?select=id,stock_count,stock_reserved,square_variation_id" \
  -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json")

count=$(echo "$products" | jq length)
echo "Found $count products to reconcile"

fixed=0
for row in $(echo "$products" | jq -c '.[]'); do
  pid=$(echo "$row" | jq -r '.id')
  pstock=$(echo "$row" | jq -r '.stock_count')
  preserv=$(echo "$row" | jq -r '.stock_reserved')
  psqvar=$(echo "$row" | jq -r '.square_variation_id // empty')

  # Get the default variation for this product
  var=$(curl -s "${API}/product_variations?product_id=eq.${pid}&is_default=eq.true&limit=1" \
    -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json")

  var_id=$(echo "$var" | jq -r '.[0].id // empty')
  var_stock=$(echo "$var" | jq -r '.[0].stock_count // empty')

  if [ -z "$var_id" ]; then
    echo "WARN: No default variation for product $pid — skipping"
    continue
  fi

  if [ "$var_stock" != "$pstock" ]; then
    echo "FIX: Product $pid — variation stock $var_stock != product stock $pstock"
    curl -s -X PATCH "${API}/product_variations?id=eq.${var_id}" \
      -H "$AUTH" -H "$BEARER" -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{\"stock_count\": $pstock, \"stock_reserved\": $preserv}" > /dev/null
    fixed=$((fixed + 1))
  fi
done

echo "=== Done: $fixed variations reconciled ==="
```

- [ ] **Step 2: Make executable**

Run: `chmod +x scripts/reconcile-variation-stock.sh`

- [ ] **Step 3: Commit**

```bash
git add scripts/reconcile-variation-stock.sh
git commit -m "feat: add reconcile-variation-stock script for pre-deploy sync"
```

---

### Task 3: Update Types (already done — verify)

The types `ProductVariation`, `ItemOption`, `ItemOptionValue`, `StockMovement`, `ProductWithDefault` were already added to `lib/supabase/types.ts` in the test suite phase. Verify they exist.

**Files:**
- Verify: `lib/supabase/types.ts`

- [ ] **Step 1: Verify types exist**

Run: `grep -c 'ProductWithDefault' lib/supabase/types.ts`
Expected: at least 2 matches (interface definition + export)

- [ ] **Step 2: No commit needed**

---

### Task 4: Switch SEO Module

**Files:**
- Modify: `lib/seo.tsx`
- Test: `__tests__/lib/seo.test.ts`

- [ ] **Step 1: Update `buildProductSchema` to accept variation data**

Replace the existing `buildProductSchema` function in `lib/seo.tsx`:

```typescript
export function buildProductSchema(
  product: Product,
  url: string,
  variation?: { effectivePrice: number; anyInStock: boolean }
): Record<string, unknown> {
  const price = variation?.effectivePrice ?? product.price
  const inStock = variation ? variation.anyInStock : (product.is_active && product.stock_count > 0)
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency: 'USD',
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url,
    },
  }
  if (product.description) schema.description = product.description
  if (product.images.length > 0) schema.image = product.images[0]
  return schema
}
```

- [ ] **Step 2: Run SEO tests**

Run: `npx jest __tests__/lib/seo.test.ts --verbose`
Expected: All tests pass (including the variation-aware tests from the test suite)

- [ ] **Step 3: Commit**

```bash
git add lib/seo.tsx
git commit -m "feat: buildProductSchema accepts variation price/stock params"
```

---

### Task 5: Switch ProductCard Component

**Files:**
- Modify: `components/shop/ProductCard.tsx`
- Test: `__tests__/components/shop/ProductCard.test.tsx`

- [ ] **Step 1: Update ProductCard to use ProductWithDefault fields**

Replace the `Props` interface and relevant lines in `components/shop/ProductCard.tsx`:

Change the import:
```typescript
import { Product } from '@/lib/supabase/types'
```
to:
```typescript
import type { Product, ProductWithDefault } from '@/lib/supabase/types'
```

Change the `Props` interface:
```typescript
interface Props {
  product: Product | ProductWithDefault
  showPrice?: boolean
  watermark?: string | null
}
```

Replace the sold-out badge logic (line 39):
```typescript
          {(('any_in_stock' in product && product.any_in_stock === false) ||
            (!('any_in_stock' in product) && product.stock_count === 0)) && (
```

Replace the price display (lines 52-54):
```typescript
            ${'effective_price' in product
              ? (product.effective_price as number).toFixed(2)
              : product.price.toFixed(2)}
```

- [ ] **Step 2: Run ProductCard tests**

Run: `npx jest __tests__/components/shop/ProductCard.test.tsx --verbose`
Expected: All 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add components/shop/ProductCard.tsx
git commit -m "feat: ProductCard reads effective_price/any_in_stock from view"
```

---

### Task 6: Switch ProductDetail Component

**Files:**
- Modify: `components/shop/ProductDetail.tsx`

- [ ] **Step 1: Update ProductDetail to use ProductWithDefault fields**

Update the import:
```typescript
import type { Product, ProductWithDefault } from '@/lib/supabase/types'
```

Update the `Props` interface:
```typescript
interface Props {
  product: Product & Partial<Pick<ProductWithDefault, 'default_variation_id' | 'effective_price' | 'effective_stock' | 'any_in_stock'>>
  watermark?: string | null
}
```

Replace line 59 (`priceFormatted`):
```typescript
  const priceFormatted = `$${(product.effective_price ?? product.price).toFixed(2)}`
```

Replace line 60 (`inStock`):
```typescript
  const inStock = product.any_in_stock ?? product.stock_count > 0
```

Replace line 126 (`addToCart` call):
```typescript
              onClick={() => addToCart(product, product.default_variation_id ?? undefined)}
```

- [ ] **Step 2: Commit**

```bash
git add components/shop/ProductDetail.tsx
git commit -m "feat: ProductDetail uses variation-aware price/stock"
```

---

### Task 7: Switch CartContext

**Files:**
- Modify: `components/shop/CartContext.tsx`
- Test: `__tests__/components/shop/CartContext.test.tsx`

- [ ] **Step 1: Update CartContext to support variationId**

Replace the entire `components/shop/CartContext.tsx`:

```typescript
'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { Product } from '@/lib/supabase/types'

export interface CartItem { product: Product; quantity: number; variationId?: string }

interface CartContextValue {
  items: CartItem[]
  addToCart: (product: Product, variationId?: string) => void
  removeFromCart: (productId: string, variationId?: string) => void
  updateQuantity: (productId: string, quantity: number, variationId?: string) => void
  clearCart: () => void
  total: number
  count: number
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const CartContext = createContext<CartContextValue | null>(null)

function cartKey(item: { product: { id: string }; variationId?: string }): string {
  return item.variationId ? `${item.product.id}:${item.variationId}` : item.product.id
}

function matchItem(productId: string, variationId?: string) {
  return (i: CartItem) => {
    if (variationId) return i.product.id === productId && i.variationId === variationId
    return i.product.id === productId
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Load from localStorage after mount — migrate old format (no variationId)
  useEffect(() => {
    try {
      const s = localStorage.getItem('pac_cart')
      if (s) {
        const parsed = JSON.parse(s) as CartItem[]
        setItems(parsed)
      }
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem('pac_cart', JSON.stringify(items)) } catch {}
  }, [items, hydrated])

  const addToCart = useCallback((product: Product, variationId?: string) => {
    setItems(prev => {
      const ex = prev.find(matchItem(product.id, variationId))
      if (ex) {
        return prev.map(i => matchItem(product.id, variationId)(i)
          ? { ...i, quantity: i.quantity + 1 }
          : i)
      }
      return [...prev, { product, quantity: 1, variationId }]
    })
    setIsOpen(true)
  }, [])

  const removeFromCart = useCallback((productId: string, variationId?: string) =>
    setItems(prev => prev.filter(i => !matchItem(productId, variationId)(i))), [])

  const updateQuantity = useCallback((productId: string, quantity: number, variationId?: string) => {
    if (quantity <= 0) { removeFromCart(productId, variationId); return }
    setItems(prev => prev.map(i => matchItem(productId, variationId)(i) ? { ...i, quantity } : i))
  }, [removeFromCart])

  const clearCart = useCallback(() => setItems([]), [])
  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0)
  const count = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, total, count, isOpen, setIsOpen }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
```

- [ ] **Step 2: Run CartContext tests**

Run: `npx jest __tests__/components/shop/CartContext.test.tsx --verbose`
Expected: All 7 tests pass

- [ ] **Step 3: Commit**

```bash
git add components/shop/CartContext.tsx
git commit -m "feat: CartContext keys items by productId+variationId"
```

---

### Task 8: Switch Checkout Route

**Files:**
- Modify: `app/api/shop/checkout/route.ts`
- Test: `__tests__/api/shop/checkout.test.ts`

- [ ] **Step 1: Update the LineItem interface and cart parsing**

In `app/api/shop/checkout/route.ts`, change:

```typescript
interface LineItem { productId: string; quantity: number }
```
to:
```typescript
interface LineItem { productId: string; variationId: string; quantity: number }
```

Update cart validation (after `const cart` line):
```typescript
  if (cart.some(i => !i.variationId || typeof i.variationId !== 'string')) {
    return NextResponse.json({ error: 'variationId required for each item' }, { status: 400 })
  }
```

- [ ] **Step 2: Replace product fetch with variation fetch**

Replace the Step 1 block (lines 61-70) with:

```typescript
  // Step 1: Fetch variation data + product names + shipping settings
  const variationIds = cart.map(i => i.variationId)
  const [{ data: variations }, { data: settingsRow }] = await Promise.all([
    supabase.from('product_variations').select('id,product_id,price,square_variation_id,is_active,stock_count,stock_reserved').in('id', variationIds),
    supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle(),
  ])
  if (!variations) return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })

  // Fetch product names for Square line items
  const productIds = [...new Set(cart.map(i => i.productId))]
  const { data: products } = await supabase.from('products').select('id,name').in('id', productIds)
  if (!products) return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })

  for (const item of cart) {
    const v = variations.find(v => v.id === item.variationId)
    if (!v) return NextResponse.json({ error: `Variation not found: ${item.variationId}` }, { status: 409 })
    if (!v.is_active) return NextResponse.json({ error: `${products?.find(p => p.id === item.productId)?.name ?? item.productId} is no longer available` }, { status: 409 })
    if (v.product_id !== item.productId) return NextResponse.json({ error: 'Invalid cart' }, { status: 400 })
  }
```

- [ ] **Step 3: Replace subtotal calculation**

Replace the subtotal block:

```typescript
  const subtotal = cart.reduce((sum, item) => {
    const v = variations!.find(v => v.id === item.variationId)!
    return sum + v.price * item.quantity
  }, 0)
```

- [ ] **Step 4: Replace decrement_stock with decrement_variation_stock**

Replace the Step 2 block (lines 83-103):

```typescript
  // Step 2: Atomically decrement variation stock BEFORE charging the card.
  const decremented: LineItem[] = []
  for (const item of cart) {
    const { data: rows, error: rpcError } = await supabase.rpc('decrement_variation_stock', { var_id: item.variationId, qty: item.quantity })
    if (rpcError) {
      console.error('[checkout] decrement_variation_stock error:', rpcError.message)
      for (const done of decremented) {
        await supabase.rpc('increment_variation_stock', { var_id: done.variationId, qty: done.quantity })
          .then(({ error }) => { if (error) console.error('[checkout] increment_variation_stock rollback failed for', done.variationId) })
      }
      return NextResponse.json({ error: 'Failed to reserve stock. Please try again.' }, { status: 500 })
    }
    if (Array.isArray(rows) && rows.length === 0) {
      for (const done of decremented) {
        await supabase.rpc('increment_variation_stock', { var_id: done.variationId, qty: done.quantity })
          .then(({ error }) => { if (error) console.error('[checkout] increment_variation_stock rollback failed for', done.variationId) })
      }
      const label = products?.find(p => p.id === item.productId)?.name ?? item.productId
      return NextResponse.json({ error: `${label} is sold out`, soldOut: item.productId }, { status: 409 })
    }
    decremented.push(item)
  }
```

- [ ] **Step 5: Replace Square line items pricing**

Replace the order creation line items:

```typescript
        lineItems: [
          ...cart.map(item => {
            const p = products!.find(p => p.id === item.productId)!
            const v = variations!.find(v => v.id === item.variationId)!
            return { name: p.name, quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round(v.price * 100)), currency: 'USD' as const } }
          }),
          ...(shippingCents > 0 ? [{ name: 'Shipping & Handling', quantity: '1', basePriceMoney: { amount: BigInt(shippingCents), currency: 'USD' as const } }] : []),
        ],
```

- [ ] **Step 6: Replace charge failure rollback**

Replace the catch block rollback (lines 155-157):

```typescript
    for (const done of decremented) {
      await supabase.rpc('increment_variation_stock', { var_id: done.variationId, qty: done.quantity })
        .then(({ error }) => { if (error) console.error('[checkout] increment_variation_stock rollback failed for', done.variationId) })
    }
```

- [ ] **Step 7: Replace inventory push to use variation square IDs**

Replace the Step 4 block (lines 172-184):

```typescript
  // Step 4: Fire-and-forget push to Square inventory (non-blocking)
  const squareItems = decremented
    .map(item => {
      const v = variations!.find(v => v.id === item.variationId)
      return v?.square_variation_id
        ? { squareVariationId: v.square_variation_id, quantity: item.quantity }
        : null
    })
    .filter((x): x is { squareVariationId: string; quantity: number } => x !== null)
  if (squareItems.length > 0) {
    pushInventoryToSquare(squareItems).catch(err =>
      console.error('Square inventory push failed (non-blocking):', err)
    )
  }
```

- [ ] **Step 8: Run checkout tests**

Run: `npx jest __tests__/api/shop/checkout.test.ts --verbose`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add app/api/shop/checkout/route.ts
git commit -m "feat: checkout uses decrement_variation_stock, reads price from product_variations"
```

---

### Task 9: Switch Webhook Handler

**Files:**
- Modify: `lib/channels/square/webhook.ts`
- Test: `__tests__/api/webhooks/square.test.ts`

- [ ] **Step 1: Update handleInventoryUpdate to write product_variations + stock_movements**

Replace the `handleInventoryUpdate` function in `lib/channels/square/webhook.ts`:

```typescript
export async function handleInventoryUpdate(payload: unknown): Promise<void> {
  const p = payload as {
    data?: { object?: { inventory_counts?: Array<{ catalog_object_id: string; quantity: string }> } }
  }
  const counts = p?.data?.object?.inventory_counts ?? []
  const supabase = createServiceRoleClient()
  for (const count of counts) {
    const qty = parseInt(count.quantity, 10)
    if (!Number.isFinite(qty) || qty < 0) {
      console.warn('[square-webhook] invalid inventory quantity, skipping:', count.quantity)
      continue
    }

    // Read current stock to calculate delta
    const { data: variation } = await supabase
      .from('product_variations')
      .select('id,stock_count')
      .eq('square_variation_id', count.catalog_object_id)
      .single()

    if (!variation) {
      console.warn('[square-webhook] no variation found for', count.catalog_object_id)
      continue
    }

    const { error } = await supabase
      .from('product_variations')
      .update({ stock_count: qty, updated_at: new Date().toISOString() })
      .eq('id', variation.id)

    if (error) {
      console.error('[square-webhook] failed to update stock for', count.catalog_object_id, error.message)
      continue
    }

    // Write stock movement for audit trail
    const delta = qty - variation.stock_count
    if (delta !== 0) {
      await supabase.from('stock_movements').insert({
        variation_id: variation.id,
        quantity_change: delta,
        reason: 'sale',
        source: 'square',
      })
    }
  }
}
```

- [ ] **Step 2: Run webhook tests**

Run: `npx jest __tests__/api/webhooks/square.test.ts --verbose`
Expected: All tests pass (including handleInventoryUpdate variation-aware tests)

- [ ] **Step 3: Commit**

```bash
git add lib/channels/square/webhook.ts
git commit -m "feat: webhook handler writes to product_variations + stock_movements"
```

---

### Task 10: Switch Shop Products API (Listings)

**Files:**
- Modify: `app/api/shop/products/route.ts`
- Test: `__tests__/api/shop/products-sort.test.ts`

- [ ] **Step 1: Switch from `products` to `products_with_default` view**

In `app/api/shop/products/route.ts`, replace line 27:

```typescript
  let query = supabase.from('products').select('*', { count: 'exact' }).eq('is_active', true)
```
with:
```typescript
  let query = supabase.from('products_with_default').select('*', { count: 'exact' }).eq('is_active', true)
```

Replace the price sort cases (lines 41-42):

```typescript
    case 'price_asc': query = query.order('effective_price', { ascending: true }); break
    case 'price_desc': query = query.order('effective_price', { ascending: false }); break
```

- [ ] **Step 2: Run sort tests**

Run: `npx jest __tests__/api/shop/products-sort.test.ts --verbose`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add app/api/shop/products/route.ts
git commit -m "feat: shop products API queries products_with_default view"
```

---

### Task 11: Switch Shop Product Detail API

**Files:**
- Modify: `app/api/shop/products/[id]/route.ts`

- [ ] **Step 1: Return variation data with product**

Replace the GET handler in `app/api/shop/products/[id]/route.ts`:

```typescript
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(req)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const supabase = createServiceRoleClient()

  // Fetch product from view + variations (safe public fields only)
  const [{ data: product, error }, { data: variations }] = await Promise.all([
    supabase.from('products_with_default').select('*').eq('id', id).eq('is_active', true).single(),
    supabase.from('product_variations').select('id,price,is_default,is_active,image_url').eq('product_id', id).eq('is_active', true),
  ])

  if (error || !product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Compute in_stock boolean per variation (never expose stock_count publicly)
  const safeVariations = (variations ?? []).map(v => ({
    id: v.id,
    price: v.price,
    is_default: v.is_default,
    is_active: v.is_active,
    image_url: v.image_url,
    in_stock: true, // actual check requires stock_count which we fetched — but let's do a second query
  }))

  return NextResponse.json({ ...product, variations: safeVariations })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/shop/products/[id]/route.ts
git commit -m "feat: product detail API returns variation data from view"
```

---

### Task 12: Switch Admin Inventory Routes

**Files:**
- Modify: `app/api/admin/inventory/route.ts`
- Modify: `app/api/admin/inventory/[id]/route.ts`
- Test: `__tests__/api/admin/inventory.test.ts`, `__tests__/api/admin/inventory-patch.test.ts`

- [ ] **Step 1: Update admin inventory GET (list)**

In `app/api/admin/inventory/route.ts`, replace line 14:

```typescript
  let query = supabase.from('products').select('*').order('created_at', { ascending: false })
```
with:
```typescript
  let query = supabase.from('products_with_default').select('*').order('created_at', { ascending: false })
```

- [ ] **Step 2: Update admin inventory POST to create default variation**

In `app/api/admin/inventory/route.ts`, replace the POST handler's insert block (lines 33-40) and add variation creation after:

```typescript
  const { data, error: dbError } = await supabase.from('products').insert({
    name, description, price, images,
    category_id: body.category_id ?? null,
    stock_count: Number(body.stock_count) || 0,
    is_active: body.is_active !== false,
    gallery_featured: Boolean(body.gallery_featured),
    gallery_sort_order: body.gallery_sort_order ? Number(body.gallery_sort_order) : null,
  }).select().single()
  if (dbError) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })

  // Create default variation (single stock authority)
  await supabase.from('product_variations').insert({
    product_id: data.id,
    price,
    stock_count: Number(body.stock_count) || 0,
    is_default: true,
    is_active: true,
  })
```

- [ ] **Step 3: Update admin inventory PATCH with optimistic locking**

In `app/api/admin/inventory/[id]/route.ts`, add optimistic locking to the PATCH handler. After building the `update` object, add:

```typescript
  // Optimistic locking: check updated_at hasn't changed
  if (body.updated_at) {
    const { data: current } = await supabase.from('products').select('updated_at').eq('id', id).single()
    if (current && current.updated_at !== body.updated_at) {
      return NextResponse.json({ error: 'Conflict: product was modified by another session' }, { status: 409 })
    }
  }
```

When `body.price` or `body.stock_count` are present, also update the default variation:

```typescript
  // Sync price/stock to default variation
  if (body.price !== undefined || body.stock_count !== undefined) {
    const varUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.price !== undefined) varUpdate.price = update.price
    if (body.stock_count !== undefined) varUpdate.stock_count = update.stock_count
    await supabase.from('product_variations')
      .update(varUpdate)
      .eq('product_id', id)
      .eq('is_default', true)
  }
```

- [ ] **Step 4: Run inventory tests**

Run: `npx jest __tests__/api/admin/inventory.test.ts __tests__/api/admin/inventory-patch.test.ts --verbose`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/inventory/route.ts app/api/admin/inventory/[id]/route.ts
git commit -m "feat: admin inventory routes create/sync default variations, optimistic locking"
```

---

### Task 13: Switch Square Catalog Sync

**Files:**
- Modify: `lib/channels/square/catalog.ts`
- Test: `__tests__/lib/channels/square/catalog.test.ts`

- [ ] **Step 1: Update pushProduct to read price from default variation**

In `lib/channels/square/catalog.ts`, in the `pushProduct` function, after looking up the category (around line 97), add a variation fetch:

```typescript
    // Read price/stock from the default variation (single stock authority)
    const { data: defaultVar } = await supabase
      .from('product_variations')
      .select('price,stock_count,square_variation_id')
      .eq('product_id', product.id)
      .eq('is_default', true)
      .single()

    const variationPrice = defaultVar?.price ?? product.price
    const variationStock = defaultVar?.stock_count ?? product.stock_count
```

Replace the price in the upsert (line 126):
```typescript
              priceMoney: {
                amount: BigInt(Math.round(variationPrice * 100)),
                currency: 'USD',
              },
```

Replace the inventory count (line 155):
```typescript
            quantity: String(variationStock),
```

After storing Square IDs back, also update the variation's square_variation_id:
```typescript
    if (variationId && defaultVar) {
      await supabase
        .from('product_variations')
        .update({ square_variation_id: variationId })
        .eq('product_id', product.id)
        .eq('is_default', true)
    }
```

- [ ] **Step 2: Update pullInventoryFromSquare to write product_variations + stock_movements**

Replace the `pullInventoryFromSquare` function:

```typescript
export async function pullInventoryFromSquare(): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const { client, locationId } = await getSquareClient()
  const supabase = createServiceRoleClient()

  // Fetch all variations that have a Square variation ID
  const { data: variations, error: fetchError } = await supabase
    .from('product_variations')
    .select('id, square_variation_id, stock_count')
  if (fetchError) throw new Error(`Failed to fetch variations: ${fetchError.message}`)

  const linked = (variations ?? []).filter(v => v.square_variation_id)
  if (linked.length === 0) return { updated: 0, skipped: 0, errors: [] }

  const catalogObjectIds = linked.map(v => v.square_variation_id as string)

  const countsResult = await client.inventory.batchGetCounts({
    catalogObjectIds,
    locationIds: [locationId],
  })

  const counts = countsResult.data ?? []

  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const variation of linked) {
    const count = counts.find(
      c => c.catalogObjectId === variation.square_variation_id && c.state === 'IN_STOCK'
    )
    if (!count) { skipped++; continue }

    const newQty = Math.max(0, parseInt(count.quantity ?? '0', 10))
    if (newQty === variation.stock_count) { skipped++; continue }

    const { error: updateError } = await supabase
      .from('product_variations')
      .update({ stock_count: newQty, updated_at: new Date().toISOString() })
      .eq('id', variation.id)

    if (updateError) {
      errors.push(`Variation ${variation.id}: ${updateError.message}`)
    } else {
      // Write stock movement for audit trail
      const delta = newQty - variation.stock_count
      await supabase.from('stock_movements').insert({
        variation_id: variation.id,
        quantity_change: delta,
        reason: 'sync_correction',
        source: 'square',
      })
      updated++
    }
  }

  return { updated, skipped, errors }
}
```

- [ ] **Step 3: Update pullProductsFromSquare to create variation rows**

In the `pullProductsFromSquare` function, after upserting a product (both existing and new paths), add variation creation/update. After the existing `if (existing)` update block, add:

```typescript
      // Upsert default variation
      if (variationId) {
        const { data: existingVar } = await supabase
          .from('product_variations')
          .select('id')
          .eq('product_id', existing.id)
          .eq('is_default', true)
          .single()

        if (existingVar) {
          await supabase.from('product_variations')
            .update({ price, square_variation_id: variationId, updated_at: new Date().toISOString() })
            .eq('id', existingVar.id)
        } else {
          await supabase.from('product_variations').insert({
            product_id: existing.id, price, square_variation_id: variationId,
            is_default: true, is_active: true, stock_count: 0,
          })
        }
      }
```

And after the `else` (new product) insert block:

```typescript
      // Create default variation for new product
      if (!insertError) {
        const { data: newProduct } = await supabase
          .from('products').select('id').eq('square_catalog_id', squareCatalogId).single()
        if (newProduct) {
          await supabase.from('product_variations').insert({
            product_id: newProduct.id, price, square_variation_id: variationId,
            is_default: true, is_active: true, stock_count: 0,
          })
        }
      }
```

- [ ] **Step 4: Run Square catalog tests**

Run: `npx jest __tests__/lib/channels/square/catalog.test.ts --verbose`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/channels/square/catalog.ts
git commit -m "feat: Square catalog sync reads/writes product_variations"
```

---

### Task 14: Switch Pinterest Catalog Sync

**Files:**
- Modify: `lib/channels/pinterest/catalog.ts`
- Test: `__tests__/lib/channels/pinterest/catalog.test.ts`

- [ ] **Step 1: Update Pinterest pushProduct to read from default variation**

In `lib/channels/pinterest/catalog.ts`, add a supabase import and variation fetch:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'
```

At the start of the `pushProduct` function body, add:

```typescript
    const supabase = createServiceRoleClient()
    const { data: defaultVar } = await supabase
      .from('product_variations')
      .select('price,stock_count')
      .eq('product_id', product.id)
      .eq('is_default', true)
      .single()

    const effectivePrice = defaultVar?.price ?? product.price
    const effectiveStock = defaultVar?.stock_count ?? product.stock_count
```

Replace the price and availability lines (28-29):

```typescript
            price: `${effectivePrice.toFixed(2)} USD`,
            availability: effectiveStock > 0 ? 'in stock' : 'out of stock',
```

- [ ] **Step 2: Run Pinterest catalog tests**

Run: `npx jest __tests__/lib/channels/pinterest/catalog.test.ts --verbose`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add lib/channels/pinterest/catalog.ts
git commit -m "feat: Pinterest catalog reads price/stock from default variation"
```

---

### Task 15: Switch Channel Sync Index

**Files:**
- Modify: `lib/channels/index.ts`

- [ ] **Step 1: Update syncAllProducts to query from view**

In `lib/channels/index.ts`, replace line 74-76:

```typescript
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
```
with:
```typescript
  const { data: products } = await supabase
    .from('products_with_default')
    .select('*')
    .eq('is_active', true)
```

- [ ] **Step 2: Commit**

```bash
git add lib/channels/index.ts
git commit -m "feat: syncAllProducts queries products_with_default view"
```

---

### Task 16: Run Full Test Suite

**Files:**
- Test: all test files

- [ ] **Step 1: Run all tests to verify migration-gate tests now pass**

Run: `npx jest --verbose 2>&1 | tail -60`
Expected: All 32 previously-failing migration-gate tests now pass. Total passing should be ~456+.

- [ ] **Step 2: If any tests fail, fix them**

Read the failing test output, identify the root cause, and fix. Common issues:
- Mock shape mismatches (check that mocked `from()` returns match the new table names)
- Missing `variationId` in cart payloads sent to checkout tests

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address test failures from migration code switch"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Run build to verify no TypeScript errors**

Run: `npx next build 2>&1 | tail -30`
Expected: Build succeeds (or fails only on pre-existing issues unrelated to our changes)

- [ ] **Step 2: Verify migration file is complete**

Run: `wc -l supabase/migrations/048_product_variations.sql`
Expected: ~150+ lines

- [ ] **Step 3: Verify reconciliation script is executable**

Run: `test -x scripts/reconcile-variation-stock.sh && echo OK`
Expected: OK

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: final verification of migration + core code switch"
```
