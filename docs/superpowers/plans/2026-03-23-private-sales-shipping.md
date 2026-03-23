# Private Sales + Shipping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-configurable shipping costs to public checkout, and a private tokenized sale link system that reserves inventory and lets specific customers pay with a shipping address.

**Architecture:** DB migration adds `stock_reserved` to products, two new tables (`private_sales`, `private_sale_items`), three atomic PL/pgSQL functions (`create_private_sale`, `release_private_sale_stock`, `fulfill_private_sale`), and shipping columns to settings. Shipping is built first (smaller surface), then private sales. Square remains the source of truth for orders; no PII is stored in Supabase.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service role), Square Web Payments SDK, Jest

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `supabase/migrations/038_private_sales_shipping.sql` | All schema changes + DB functions |
| `lib/shipping.ts` | `calculateShipping()` shared utility |
| `lib/private-sales.ts` | `releaseExpiredSales()` helper (called by admin list route) |
| `app/api/shop/shipping-config/route.ts` | Public GET endpoint — returns `{shipping_mode, shipping_value}` for client-side preview |
| `app/api/admin/private-sales/route.ts` | GET list + POST create |
| `app/api/admin/private-sales/[id]/route.ts` | DELETE (revoke) |
| `app/api/shop/private-sale/[token]/route.ts` | GET public sale details |
| `app/api/shop/private-sale/[token]/checkout/route.ts` | POST checkout |
| `components/admin/PrivateSaleList.tsx` | List table with status badges |
| `components/admin/PrivateSaleForm.tsx` | `'use client'` create form |
| `components/shop/PrivateSaleCheckout.tsx` | `'use client'` checkout widget |
| `app/admin/(dashboard)/private-sales/page.tsx` | Server component — list view |
| `app/admin/(dashboard)/private-sales/new/page.tsx` | Server component shell |
| `app/(public)/private-sale/[token]/page.tsx` | Server component — validates token, renders checkout |

### Modified files
| Path | Change |
|---|---|
| `lib/supabase/types.ts` | Add `PrivateSale`, `PrivateSaleItem`, `ShippingAddress`, `ShippingConfig`; update `Product`, `Settings` |
| `supabase/migrations/018_square_pinterest_storefront.sql` | Do NOT edit (history) — changes go in 038 |
| `infra/schema.sql` | Reflect all schema additions |
| `app/api/shop/checkout/route.ts` | Add required shipping, update stock check |
| `components/shop/CheckoutForm.tsx` | Add shipping address fields + shipping line item |
| `app/api/admin/settings/route.ts` | Handle `shipping_mode` + `shipping_value` |
| `app/admin/(dashboard)/settings/page.tsx` | Add Shipping section |
| `.env.example` | Add `NEXT_PUBLIC_SITE_URL` placeholder |

### Test files
| Path | Tests |
|---|---|
| `__tests__/lib/shipping.test.ts` | `calculateShipping` — fixed, percentage, zero |
| `__tests__/api/admin/private-sales.test.ts` | POST create validation, GET list |
| `__tests__/api/shop/private-sale-checkout.test.ts` | Checkout — 410, payment fail, fulfill fail refund |
| `__tests__/api/shop/checkout.test.ts` | Update existing — shipping required, stock_reserved check |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/038_private_sales_shipping.sql`
- Modify: `infra/schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/038_private_sales_shipping.sql

-- 1. Add stock_reserved to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_reserved INTEGER NOT NULL DEFAULT 0;

-- 2. Add CHECK constraint to stock_count (floor at 0)
ALTER TABLE products ADD CONSTRAINT products_stock_count_non_negative CHECK (stock_count >= 0);

-- 3. Update decrement_stock to respect stock_reserved
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INTEGER)
RETURNS SETOF products AS $$
  UPDATE products
  SET stock_count = stock_count - qty
  WHERE id = product_id AND stock_count - stock_reserved >= qty
  RETURNING *;
$$ LANGUAGE sql;

-- 4. Shipping config in settings
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS shipping_mode  TEXT          NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS shipping_value NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (shipping_value >= 0);

-- 5. private_sales table
CREATE TABLE IF NOT EXISTS private_sales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  created_by    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  customer_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE private_sales ENABLE ROW LEVEL SECURITY;
-- No public access — service_role key bypasses RLS

-- 6. private_sale_items table
CREATE TABLE IF NOT EXISTS private_sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  private_sale_id  UUID NOT NULL REFERENCES private_sales(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  custom_price     NUMERIC(10,2) NOT NULL CHECK (custom_price > 0)
);

ALTER TABLE private_sale_items ENABLE ROW LEVEL SECURITY;

-- 7. create_private_sale: atomic insert + reserve
CREATE OR REPLACE FUNCTION create_private_sale(sale JSONB, items JSONB)
RETURNS private_sales AS $$
DECLARE
  new_sale   private_sales;
  item       JSONB;
  prod       products;
BEGIN
  -- Insert sale row
  INSERT INTO private_sales (created_by, expires_at, customer_note)
  VALUES (
    sale->>'created_by',
    (sale->>'expires_at')::TIMESTAMPTZ,
    sale->>'customer_note'
  )
  RETURNING * INTO new_sale;

  -- Insert items and reserve stock
  FOR item IN SELECT * FROM jsonb_array_elements(items) LOOP
    INSERT INTO private_sale_items (private_sale_id, product_id, quantity, custom_price)
    VALUES (
      new_sale.id,
      (item->>'product_id')::UUID,
      (item->>'quantity')::INTEGER,
      (item->>'custom_price')::NUMERIC
    );

    -- Lock row and check available stock
    SELECT * INTO prod FROM products WHERE id = (item->>'product_id')::UUID FOR UPDATE;
    IF prod.stock_count - prod.stock_reserved < (item->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', item->>'product_id';
    END IF;

    UPDATE products
    SET stock_reserved = stock_reserved + (item->>'quantity')::INTEGER
    WHERE id = (item->>'product_id')::UUID;
  END LOOP;

  RETURN new_sale;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. release_private_sale_stock: atomic revoke + release
CREATE OR REPLACE FUNCTION release_private_sale_stock(sale_id UUID)
RETURNS void AS $$
DECLARE
  item private_sale_items;
BEGIN
  -- Soft-revoke (idempotent — only sets if not already set)
  UPDATE private_sales
  SET revoked_at = NOW()
  WHERE id = sale_id AND revoked_at IS NULL;

  -- Release reserved stock (GREATEST guard prevents negative)
  FOR item IN SELECT * FROM private_sale_items WHERE private_sale_id = sale_id LOOP
    UPDATE products
    SET stock_reserved = GREATEST(stock_reserved - item.quantity, 0)
    WHERE id = item.product_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. fulfill_private_sale: atomic complete
CREATE OR REPLACE FUNCTION fulfill_private_sale(sale_id UUID)
RETURNS private_sales AS $$
DECLARE
  sale private_sales;
  item private_sale_items;
BEGIN
  SELECT * INTO sale FROM private_sales WHERE id = sale_id FOR UPDATE;

  IF sale.used_at IS NOT NULL OR sale.revoked_at IS NOT NULL OR sale.expires_at <= NOW() THEN
    RAISE EXCEPTION 'SALE_NOT_ACTIVE';
  END IF;

  FOR item IN SELECT * FROM private_sale_items WHERE private_sale_id = sale_id LOOP
    -- Decrement stock_count (CHECK constraint enforces >= 0)
    UPDATE products
    SET stock_count = stock_count - item.quantity,
        stock_reserved = GREATEST(stock_reserved - item.quantity, 0)
    WHERE id = item.product_id;
  END LOOP;

  UPDATE private_sales SET used_at = NOW() WHERE id = sale_id
  RETURNING * INTO sale;

  RETURN sale;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Apply migration to local Supabase (or note for manual apply)**

```bash
# If using local Supabase:
npx supabase db push
# If remote only, apply via Supabase dashboard SQL editor
```

Expected: No errors. Tables `private_sales`, `private_sale_items` exist. `products` has `stock_reserved` column.

- [ ] **Step 3: Update `infra/schema.sql`**

Add the same DDL to `infra/schema.sql` so it reflects current schema state. Add after the existing `products` table block:

```sql
-- (in products table definition, add column:)
--   stock_reserved INTEGER NOT NULL DEFAULT 0,
-- (add constraint:)
-- ALTER TABLE products ADD CONSTRAINT products_stock_count_non_negative CHECK (stock_count >= 0);

-- private_sales
CREATE TABLE IF NOT EXISTS private_sales ( ... ); -- full DDL from migration

-- private_sale_items
CREATE TABLE IF NOT EXISTS private_sale_items ( ... ); -- full DDL from migration
```

Also add the three new functions and the settings columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/038_private_sales_shipping.sql infra/schema.sql
git commit -m "feat: migration — private sales tables + shipping config + updated decrement_stock"
```

---

## Task 2: Types

**Files:**
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Add new types and update existing**

In `lib/supabase/types.ts`, add after the existing `Product` interface:

```ts
export interface ShippingAddress {
  name: string
  address1: string
  address2?: string
  city: string
  state: string
  zip: string
  country: string
}

export interface ShippingConfig {
  mode: 'fixed' | 'percentage'
  value: number
}

export interface PrivateSale {
  id: string
  token: string
  created_by: string
  expires_at: string
  used_at: string | null
  revoked_at: string | null
  customer_note: string | null
  created_at: string
  items?: PrivateSaleItem[]
}

export interface PrivateSaleItem {
  id: string
  private_sale_id: string
  product_id: string
  quantity: number
  custom_price: number
  product?: Pick<Product, 'id' | 'name' | 'description' | 'price' | 'images' | 'is_active'>
}
```

Update `Product` interface — add `stock_reserved: number` after `stock_count`:

```ts
stock_count: number
stock_reserved: number   // ADD THIS
```

Update `Settings` interface — add after `reply_email_footer`:

```ts
shipping_mode: 'fixed' | 'percentage'
shipping_value: number
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors related to the new types.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat: add PrivateSale, ShippingAddress, ShippingConfig types; update Product + Settings"
```

---

## Task 3: Shipping Utility

**Files:**
- Create: `lib/shipping.ts`
- Create: `__tests__/lib/shipping.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/lib/shipping.test.ts
import { calculateShipping } from '@/lib/shipping'

describe('calculateShipping', () => {
  it('returns 0 when shipping_value is 0', () => {
    expect(calculateShipping(100, { shipping_mode: 'fixed', shipping_value: 0 })).toBe(0)
  })

  it('returns the fixed value regardless of subtotal', () => {
    expect(calculateShipping(45, { shipping_mode: 'fixed', shipping_value: 8.50 })).toBe(8.50)
    expect(calculateShipping(200, { shipping_mode: 'fixed', shipping_value: 8.50 })).toBe(8.50)
  })

  it('calculates percentage of subtotal rounded to 2 decimal places', () => {
    expect(calculateShipping(100, { shipping_mode: 'percentage', shipping_value: 10 })).toBe(10)
    expect(calculateShipping(13.99, { shipping_mode: 'percentage', shipping_value: 10 })).toBe(1.40)
  })

  it('calculates correct cent total for Square', () => {
    const subtotal = 45.00
    const shipping = calculateShipping(subtotal, { shipping_mode: 'fixed', shipping_value: 8.50 })
    expect(Math.round((subtotal + shipping) * 100)).toBe(5350)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
scripts/test.sh __tests__/lib/shipping.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/shipping'`

- [ ] **Step 3: Implement the utility**

```ts
// lib/shipping.ts
import type { Settings } from '@/lib/supabase/types'

export function calculateShipping(
  subtotal: number,
  settings: Pick<Settings, 'shipping_mode' | 'shipping_value'>
): number {
  if (settings.shipping_value === 0) return 0
  if (settings.shipping_mode === 'fixed') return settings.shipping_value
  return parseFloat(((subtotal * settings.shipping_value) / 100).toFixed(2))
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
scripts/test.sh __tests__/lib/shipping.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/shipping.ts __tests__/lib/shipping.test.ts
git commit -m "feat: calculateShipping utility with tests"
```

---

## Task 4: Update Public Checkout — Shipping + Stock Check

**Files:**
- Modify: `app/api/shop/checkout/route.ts`
- Modify: `components/shop/CheckoutForm.tsx`
- Modify: `__tests__/api/shop/checkout.test.ts`

- [ ] **Step 1: Add failing tests for new checkout behaviour**

Append to `__tests__/api/shop/checkout.test.ts`:

```ts
it('returns 400 when shipping address is missing', async () => {
  const { POST } = await import('@/app/api/shop/checkout/route')
  const req = new Request('http://localhost/api/shop/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart: [{ productId: 'p1', quantity: 1 }], sourceId: 'tok_test' }),
    // no shipping field
  })
  expect((await POST(req)).status).toBe(400)
})

it('returns 400 when shipping fields are incomplete', async () => {
  const { POST } = await import('@/app/api/shop/checkout/route')
  const req = new Request('http://localhost/api/shop/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cart: [{ productId: 'p1', quantity: 1 }],
      sourceId: 'tok_test',
      shipping: { name: 'Jane' }, // missing required fields
    }),
  })
  expect((await POST(req)).status).toBe(400)
})
```

- [ ] **Step 2: Run new tests — expect FAIL**

```bash
scripts/test.sh __tests__/api/shop/checkout.test.ts
```

- [ ] **Step 3: Update `app/api/shop/checkout/route.ts`**

The file currently takes `{cart, sourceId}`. You'll modify it to also require `shipping`.

Key changes (reference the full existing file at `app/api/shop/checkout/route.ts`):

1. Import `calculateShipping` and `ShippingAddress`:
```ts
import { calculateShipping } from '@/lib/shipping'
import { sanitizeText } from '@/lib/sanitize'
import type { ShippingAddress } from '@/lib/supabase/types'
```

2. After parsing `sourceId`, parse and validate shipping:
```ts
const shipping: ShippingAddress | null = body.shipping && typeof body.shipping === 'object' ? body.shipping as ShippingAddress : null
const requiredFields: (keyof ShippingAddress)[] = ['name', 'address1', 'city', 'state', 'zip', 'country']
if (!shipping || requiredFields.some(f => !shipping[f])) {
  return NextResponse.json({ error: 'Shipping address required' }, { status: 400 })
}
// Sanitize all shipping fields
const cleanShipping: ShippingAddress = {
  name:     sanitizeText(shipping.name).slice(0, 100),
  address1: sanitizeText(shipping.address1).slice(0, 200),
  address2: shipping.address2 ? sanitizeText(shipping.address2).slice(0, 200) : undefined,
  city:     sanitizeText(shipping.city).slice(0, 100),
  state:    sanitizeText(shipping.state).slice(0, 100),
  zip:      sanitizeText(shipping.zip).slice(0, 20),
  country:  sanitizeText(shipping.country).slice(0, 10),
}
```

3. Fetch shipping settings alongside products:
```ts
const [{ data: products }, { data: settingsRow }] = await Promise.all([
  supabase.from('products').select('id,name,price,stock_count,stock_reserved,square_variation_id').in('id', cart.map(i => i.productId)),
  supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle(),
])
```

4. Update the per-item stock check to use `stock_count - stock_reserved`:
```ts
if (p.stock_count - (p.stock_reserved ?? 0) < item.quantity) {
  return NextResponse.json({ error: `${p.name} is sold out`, soldOut: item.productId }, { status: 409 })
}
```

5. Calculate shipping and add as a line item:
```ts
const subtotal = cart.reduce((sum, item) => {
  const p = products.find(p => p.id === item.productId)!
  return sum + p.price * item.quantity
}, 0)
const shippingCost = calculateShipping(subtotal, settingsRow ?? { shipping_mode: 'fixed', shipping_value: 0 })
const shippingCents = Math.round(shippingCost * 100)
const totalCents = Math.round(subtotal * 100) + shippingCents
```

6. Add shipping to the Square order `lineItems` array:
```ts
lineItems: [
  ...cart.map(item => {
    const p = products.find(p => p.id === item.productId)!
    return { name: p.name, quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round(p.price * 100)), currency: 'USD' } }
  }),
  ...(shippingCents > 0 ? [{ name: 'Shipping & Handling', quantity: '1', basePriceMoney: { amount: BigInt(shippingCents), currency: 'USD' } }] : []),
],
fulfillments: [{
  type: 'SHIPMENT',
  state: 'PROPOSED',
  shipmentDetails: {
    recipient: {
      displayName: cleanShipping.name,
      address: {
        addressLine1: cleanShipping.address1,
        addressLine2: cleanShipping.address2 || undefined,
        locality: cleanShipping.city,
        administrativeDistrictLevel1: cleanShipping.state,
        postalCode: cleanShipping.zip,
        country: cleanShipping.country as 'US',
      },
    },
  },
}],
```

- [ ] **Step 4: Run all checkout tests — expect PASS**

```bash
scripts/test.sh __tests__/api/shop/checkout.test.ts
```

- [ ] **Step 5: Update `components/shop/CheckoutForm.tsx`**

Add shipping address state and form fields. The component is `'use client'`.

1. Add state above existing state:
```ts
const [shipping, setShipping] = useState({
  name: '', address1: '', address2: '', city: '', state: '', zip: '', country: 'US',
})
```

2. Add a helper for controlled inputs:
```ts
function shippingField(field: keyof typeof shipping) {
  return {
    value: shipping[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setShipping(prev => ({ ...prev, [field]: e.target.value })),
    required: field !== 'address2',
    style: { width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', marginBottom: '8px', minHeight: '48px' } as React.CSSProperties,
  }
}
```

3. Add shipping address section to JSX, before the `#square-card-container` div:
```tsx
<div style={{ marginBottom: '24px' }}>
  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--color-primary)' }}>Shipping Address</h3>
  <input placeholder="Full name" {...shippingField('name')} />
  <input placeholder="Address line 1" {...shippingField('address1')} />
  <input placeholder="Address line 2 (optional)" {...shippingField('address2')} required={false} />
  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
    <input placeholder="City" {...shippingField('city')} />
    <input placeholder="State" {...shippingField('state')} />
  </div>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
    <input placeholder="ZIP code" {...shippingField('zip')} />
    <input placeholder="Country" {...shippingField('country')} />
  </div>
</div>
```

4. Add shipping display in the order summary section. This requires fetching shipping config — add a `useEffect` to fetch it:
```ts
const [shippingCost, setShippingCost] = useState<number | null>(null)

useEffect(() => {
  fetch('/api/shop/shipping-config')
    .then(r => r.json())
    .then(d => {
      // calculateShipping imported from lib/shipping
      const cost = calculateShipping(total, d)
      setShippingCost(cost)
    })
    .catch(() => setShippingCost(0))
}, [total])
```

**Note:** You need a public endpoint for the shipping config. Add `app/api/shop/shipping-config/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle()
  return NextResponse.json({ shipping_mode: data?.shipping_mode ?? 'fixed', shipping_value: data?.shipping_value ?? 0 })
}
```

5. Display shipping in summary:
```tsx
{shippingCost !== null && shippingCost > 0 && (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
    <span>Shipping & Handling</span>
    <span>${shippingCost.toFixed(2)}</span>
  </div>
)}
<div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
  <span>Total</span>
  <span>${(total + (shippingCost ?? 0)).toFixed(2)}</span>
</div>
```

6. Include `shipping` in the checkout fetch body:
```ts
body: JSON.stringify({
  cart: items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
  sourceId: result.token,
  shipping: {
    name: shipping.name,
    address1: shipping.address1,
    address2: shipping.address2 || undefined,
    city: shipping.city,
    state: shipping.state,
    zip: shipping.zip,
    country: shipping.country,
  },
}),
```

7. Update the Pay button label:
```tsx
{loading ? 'Processing...' : `Pay $${(total + (shippingCost ?? 0)).toFixed(2)}`}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/shop/checkout/route.ts components/shop/CheckoutForm.tsx app/api/shop/shipping-config/route.ts __tests__/api/shop/checkout.test.ts
git commit -m "feat: add required shipping address + shipping cost to public checkout"
```

---

## Task 5: Admin Settings — Shipping Config

**Files:**
- Modify: `app/api/admin/settings/route.ts`
- Modify (or create): `app/admin/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Add shipping fields to settings API**

In `app/api/admin/settings/route.ts`, add after the `reply_email_footer` block (before `update.updated_at = ...`):

```ts
if (body.shipping_mode !== undefined) {
  const mode = String(body.shipping_mode)
  update.shipping_mode = ['fixed', 'percentage'].includes(mode) ? mode : 'fixed'
}
if (body.shipping_value !== undefined) {
  const val = parseFloat(String(body.shipping_value))
  if (isNaN(val) || val < 0) return NextResponse.json({ error: 'shipping_value must be >= 0' }, { status: 400 })
  update.shipping_value = val.toFixed(2)
}
```

- [ ] **Step 2: Add shipping section to admin settings page**

Find `app/admin/(dashboard)/settings/page.tsx`. Add a new **Shipping** section in the form. The pattern used by other settings sections is a `<section>` with a `<h2>` and controlled inputs that POST to `/api/admin/settings`.

Add the shipping section (find an appropriate place, e.g. after the storefront section):

```tsx
{/* Shipping */}
<section style={{ marginBottom: '40px' }}>
  <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: 'var(--color-primary)' }}>
    Shipping & Handling
  </h2>
  <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
    <div>
      <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
        Mode
      </label>
      <select
        value={shippingMode}
        onChange={e => setShippingMode(e.target.value as 'fixed' | 'percentage')}
        style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', minHeight: '48px' }}
      >
        <option value="fixed">Fixed fee per order ($)</option>
        <option value="percentage">Percentage of subtotal (%)</option>
      </select>
    </div>
    <div>
      <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
        {shippingMode === 'fixed' ? 'Amount ($)' : 'Percentage (%)'}
      </label>
      <input
        type="number" min="0" step="0.01"
        value={shippingValue}
        onChange={e => setShippingValue(e.target.value)}
        style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', width: '120px', minHeight: '48px' }}
      />
    </div>
    <button onClick={saveShipping} style={{ padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', fontSize: '14px', cursor: 'pointer', minHeight: '48px' }}>
      Save Shipping
    </button>
  </div>
  <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
    Set to $0 / 0% to offer free shipping. Applies to all orders (shop checkout and private sale links).
  </p>
</section>
```

Add the corresponding state and save handler near other settings state:
```ts
const [shippingMode, setShippingMode] = useState<'fixed' | 'percentage'>(settings.shipping_mode ?? 'fixed')
const [shippingValue, setShippingValue] = useState(String(settings.shipping_value ?? 0))

async function saveShipping() {
  await fetch('/api/admin/settings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shipping_mode: shippingMode, shipping_value: parseFloat(shippingValue) || 0 }),
  })
}
```

Make sure `settings` is fetched server-side including the new fields. Check the existing page's server component data fetch and add `shipping_mode, shipping_value` to the select.

- [ ] **Step 3: Add `NEXT_PUBLIC_SITE_URL` to `.env.example`**

```bash
# In .env.example, add:
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/settings/route.ts app/admin/(dashboard)/settings/page.tsx .env.example
git commit -m "feat: shipping config in admin settings"
```

---

## Task 6: Admin Private Sales API

**Files:**
- Create: `app/api/admin/private-sales/route.ts`
- Create: `app/api/admin/private-sales/[id]/route.ts`
- Create: `__tests__/api/admin/private-sales.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/api/admin/private-sales.test.ts
/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({
  requireAdminSession: jest.fn().mockResolvedValue({ user: { email: 'admin@test.com' }, error: null }),
}))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: jest.fn().mockResolvedValue({
      data: { id: 'sale1', token: 'token-uuid', expires_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() },
      error: null,
    }),
  })),
}))

describe('POST /api/admin/private-sales', () => {
  beforeEach(() => jest.resetModules())

  it('returns 400 when items is empty', async () => {
    const { POST } = await import('@/app/api/admin/private-sales/route')
    const req = new Request('http://localhost/api/admin/private-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [], expiresIn: '7d' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 400 when expiresIn is invalid', async () => {
    const { POST } = await import('@/app/api/admin/private-sales/route')
    const req = new Request('http://localhost/api/admin/private-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1, customPrice: 45 }], expiresIn: '99d' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 400 when customPrice is not positive', async () => {
    const { POST } = await import('@/app/api/admin/private-sales/route')
    const req = new Request('http://localhost/api/admin/private-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1, customPrice: 0 }], expiresIn: '7d' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 201 with valid body', async () => {
    const { POST } = await import('@/app/api/admin/private-sales/route')
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    const req = new Request('http://localhost/api/admin/private-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1, customPrice: 45 }], expiresIn: '7d' }),
    })
    expect((await POST(req)).status).toBe(201)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
scripts/test.sh __tests__/api/admin/private-sales.test.ts
```

- [ ] **Step 3: Implement `app/api/admin/private-sales/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'
import { releaseExpiredSales } from '@/lib/private-sales'

const EXPIRES_IN_MAP: Record<string, string> = {
  '48h': '48 hours',
  '7d':  '7 days',
  '14d': '14 days',
}

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))

  const supabase = createServiceRoleClient()

  // Auto-release expired links (up to 50)
  await releaseExpiredSales(supabase)

  const from = (page - 1) * limit
  const { data, error: dbError, count } = await supabase
    .from('private_sales')
    .select('*, items:private_sale_items(*, product:products(id,name,images,is_active))', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (dbError) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

export async function POST(request: Request) {
  const { user, error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const items: Array<{ productId: string; quantity: number; customPrice: number }> = Array.isArray(body.items) ? body.items : []
  const expiresIn: string = typeof body.expiresIn === 'string' ? body.expiresIn : ''
  const customerNote: string = typeof body.customerNote === 'string' ? sanitizeText(body.customerNote).slice(0, 500) : ''

  if (!items.length) return NextResponse.json({ error: 'items required' }, { status: 400 })
  if (!EXPIRES_IN_MAP[expiresIn]) return NextResponse.json({ error: 'expiresIn must be 48h, 7d, or 14d' }, { status: 400 })
  for (const item of items) {
    if (!item.productId || typeof item.productId !== 'string') return NextResponse.json({ error: 'productId required' }, { status: 400 })
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return NextResponse.json({ error: 'quantity must be positive integer' }, { status: 400 })
    if (typeof item.customPrice !== 'number' || item.customPrice <= 0) return NextResponse.json({ error: 'customPrice must be > 0' }, { status: 400 })
    const cents = Math.round(item.customPrice * 100)
    if (Math.abs(cents / 100 - item.customPrice) > 0.001) return NextResponse.json({ error: 'customPrice max 2 decimal places' }, { status: 400 })
  }

  // Validate products exist and are active
  const supabase = createServiceRoleClient()
  const { data: products } = await supabase
    .from('products').select('id,is_active').in('id', items.map(i => i.productId))
  for (const item of items) {
    const p = products?.find(p => p.id === item.productId)
    if (!p) return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 400 })
    if (!p.is_active) return NextResponse.json({ error: `Product not active: ${item.productId}` }, { status: 400 })
  }

  // Single atomic RPC call
  const expiresAt = new Date()
  if (expiresIn === '48h') expiresAt.setHours(expiresAt.getHours() + 48)
  else if (expiresIn === '7d') expiresAt.setDate(expiresAt.getDate() + 7)
  else expiresAt.setDate(expiresAt.getDate() + 14)

  const salePayload = { created_by: user.email, expires_at: expiresAt.toISOString(), customer_note: customerNote || null }
  const itemsPayload = items.map(i => ({ product_id: i.productId, quantity: i.quantity, custom_price: i.customPrice }))

  const { data: sale, error: rpcError } = await supabase.rpc('create_private_sale', { sale: salePayload, items: itemsPayload })
  if (rpcError) {
    if (rpcError.message.includes('INSUFFICIENT_STOCK')) return NextResponse.json({ error: 'Insufficient stock for one or more items' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to create private sale' }, { status: 500 })
  }

  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/private-sale/${sale.token}`
  return NextResponse.json({ id: sale.id, token: sale.token, expiresAt: sale.expires_at, url }, { status: 201 })
}
```

Create the helper module `lib/private-sales.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export async function releaseExpiredSales(supabase: SupabaseClient) {
  const { data: expired } = await supabase
    .from('private_sales')
    .select('id')
    .lt('expires_at', new Date().toISOString())
    .is('used_at', null)
    .is('revoked_at', null)
    .limit(50)

  if (!expired?.length) return
  await Promise.all(expired.map(s => supabase.rpc('release_private_sale_stock', { sale_id: s.id })))
}
```

- [ ] **Step 4: Implement `app/api/admin/private-sales/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const supabase = createServiceRoleClient()

  const { data: sale } = await supabase.from('private_sales').select('id,used_at,revoked_at').eq('id', id).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (sale.used_at || sale.revoked_at) return NextResponse.json({ error: 'Link is already used or revoked' }, { status: 409 })

  const { error: rpcError } = await supabase.rpc('release_private_sale_stock', { sale_id: id })
  if (rpcError) return NextResponse.json({ error: 'Failed to revoke' }, { status: 500 })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
scripts/test.sh __tests__/api/admin/private-sales.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/private-sales/ lib/private-sales.ts __tests__/api/admin/private-sales.test.ts
git commit -m "feat: admin private sales API (create, list, revoke)"
```

---

## Task 7: Public Private Sale API

**Files:**
- Create: `app/api/shop/private-sale/[token]/route.ts`
- Create: `app/api/shop/private-sale/[token]/checkout/route.ts`
- Create: `__tests__/api/shop/private-sale-checkout.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/api/shop/private-sale-checkout.test.ts
/**
 * @jest-environment node
 */
jest.mock('@/lib/channels/square/client', () => ({ getSquareClient: jest.fn() }))

const mockSale = {
  id: 'sale1',
  token: 'tok-uuid',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  used_at: null, revoked_at: null,
  items: [{ product_id: 'p1', quantity: 1, custom_price: 45 }],
}

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'private_sales') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockSale }),
      }
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { shipping_mode: 'fixed', shipping_value: 0 } }),
      }
      if (table === 'products') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'p1', stock_count: 5, stock_reserved: 0 } }),
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
    }),
    rpc: jest.fn().mockResolvedValue({ data: { ...mockSale, used_at: new Date().toISOString() }, error: null }),
  })),
}))

describe('POST /api/shop/private-sale/[token]/checkout', () => {
  beforeEach(() => jest.resetModules())

  const validBody = {
    sourceId: 'sq_tok',
    shipping: { name: 'Jane', address1: '123 Main', city: 'Portland', state: 'OR', zip: '97201', country: 'US' },
  }

  it('returns 400 when shipping address missing', async () => {
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'sq_tok' }),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('returns 402 and error message when Square payment fails', async () => {
    const { getSquareClient } = await import('@/lib/channels/square/client') as any
    getSquareClient.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order1' } }) },
        payments: { create: jest.fn().mockRejectedValue(new Error('Card declined')) },
      },
      locationId: 'loc1',
    })
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(402)
    const data = await res.json()
    expect(data.error).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
scripts/test.sh __tests__/api/shop/private-sale-checkout.test.ts
```

- [ ] **Step 3: Implement `app/api/shop/private-sale/[token]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 30
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { token } = await params
  const supabase = createServiceRoleClient()

  const { data: sale } = await supabase
    .from('private_sales')
    .select('id, expires_at, used_at, revoked_at, items:private_sale_items(quantity, custom_price, product:products(id,name,description,price,images,is_active))')
    .eq('token', token)
    .maybeSingle()

  // All invalid states return 410 (no enumeration side-channel)
  if (!sale) return NextResponse.json({ error: 'This link is no longer available' }, { status: 410 })
  if (sale.used_at || sale.revoked_at) return NextResponse.json({ error: 'This link is no longer available' }, { status: 410 })

  // Lazy expiry cleanup
  if (new Date(sale.expires_at) <= new Date()) {
    await supabase.rpc('release_private_sale_stock', { sale_id: sale.id })
    return NextResponse.json({ error: 'This link is no longer available' }, { status: 410 })
  }

  const { data: settings } = await supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle()

  return NextResponse.json({
    items: sale.items,
    expiresAt: sale.expires_at,
    shipping: { mode: settings?.shipping_mode ?? 'fixed', value: settings?.shipping_value ?? 0 },
  })
}
```

- [ ] **Step 4: Implement `app/api/shop/private-sale/[token]/checkout/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSquareClient } from '@/lib/channels/square/client'
import { calculateShipping } from '@/lib/shipping'
import { sanitizeText } from '@/lib/sanitize'
import type { ShippingAddress } from '@/lib/supabase/types'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 10
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const sourceId: string = typeof body.sourceId === 'string' ? body.sourceId : ''
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 })

  const shippingRaw = body.shipping
  const requiredFields: (keyof ShippingAddress)[] = ['name', 'address1', 'city', 'state', 'zip', 'country']
  if (!shippingRaw || requiredFields.some(f => !shippingRaw[f])) {
    return NextResponse.json({ error: 'Shipping address required' }, { status: 400 })
  }
  const cleanShipping: ShippingAddress = {
    name:     sanitizeText(String(shippingRaw.name)).slice(0, 100),
    address1: sanitizeText(String(shippingRaw.address1)).slice(0, 200),
    address2: shippingRaw.address2 ? sanitizeText(String(shippingRaw.address2)).slice(0, 200) : undefined,
    city:     sanitizeText(String(shippingRaw.city)).slice(0, 100),
    state:    sanitizeText(String(shippingRaw.state)).slice(0, 100),
    zip:      sanitizeText(String(shippingRaw.zip)).slice(0, 20),
    country:  sanitizeText(String(shippingRaw.country)).slice(0, 10),
  }

  const supabase = createServiceRoleClient()

  // Validate token
  const { data: sale } = await supabase
    .from('private_sales')
    .select('id, expires_at, used_at, revoked_at, items:private_sale_items(product_id, quantity, custom_price)')
    .eq('token', token)
    .maybeSingle()

  if (!sale || sale.used_at || sale.revoked_at || new Date(sale.expires_at) <= new Date()) {
    return NextResponse.json({ error: 'This link is no longer available' }, { status: 410 })
  }

  // Belt-and-suspenders stock check
  for (const item of sale.items) {
    const { data: prod } = await supabase.from('products').select('stock_count,stock_reserved').eq('id', item.product_id).maybeSingle()
    if (!prod || prod.stock_count - prod.stock_reserved < item.quantity) {
      return NextResponse.json({ error: 'Item no longer available' }, { status: 409 })
    }
  }

  // Calculate totals
  const { data: settings } = await supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle()
  const subtotal = sale.items.reduce((sum: number, i: { custom_price: number; quantity: number }) => sum + i.custom_price * i.quantity, 0)
  const shippingCost = calculateShipping(subtotal, settings ?? { shipping_mode: 'fixed', shipping_value: 0 })
  const shippingCents = Math.round(shippingCost * 100)
  const totalCents = Math.round(subtotal * 100) + shippingCents

  let orderId = ''
  let paymentId = ''
  try {
    const { client, locationId } = await getSquareClient()

    const orderResult = await client.orders.create({
      order: {
        locationId,
        lineItems: [
          ...sale.items.map((item: { custom_price: number; quantity: number }) => ({
            name: `Item (private sale)`,
            quantity: String(item.quantity),
            basePriceMoney: { amount: BigInt(Math.round(item.custom_price * 100)), currency: 'USD' },
          })),
          ...(shippingCents > 0 ? [{ name: 'Shipping & Handling', quantity: '1', basePriceMoney: { amount: BigInt(shippingCents), currency: 'USD' } }] : []),
        ],
        fulfillments: [{
          type: 'SHIPMENT',
          state: 'PROPOSED',
          shipmentDetails: {
            recipient: {
              displayName: cleanShipping.name,
              address: {
                addressLine1: cleanShipping.address1,
                addressLine2: cleanShipping.address2 || undefined,
                locality: cleanShipping.city,
                administrativeDistrictLevel1: cleanShipping.state,
                postalCode: cleanShipping.zip,
                country: cleanShipping.country as 'US',
              },
            },
          },
        }],
      },
      idempotencyKey: crypto.randomUUID(),
    })
    orderId = orderResult.order?.id ?? ''

    const paymentResult = await client.payments.create({
      sourceId, orderId, locationId,
      amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
      idempotencyKey: crypto.randomUUID(),
    })
    paymentId = paymentResult.payment?.id ?? ''
  } catch (err) {
    return NextResponse.json({ error: 'Payment failed — please try a different card', detail: String(err) }, { status: 402 })
  }

  // Fulfill (atomic) — refund if DB fails
  const { error: fulfillError } = await supabase.rpc('fulfill_private_sale', { sale_id: sale.id })
  if (fulfillError) {
    console.error('fulfill_private_sale failed after payment. paymentId:', paymentId, 'sale_id:', sale.id, fulfillError)
    try {
      const { client } = await getSquareClient()
      await client.refunds.refundPayment({
        paymentId,
        idempotencyKey: `refund-${paymentId}`,
        amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
        reason: 'Fulfillment error — automatic refund',
      })
    } catch (refundErr) {
      console.error('Refund also failed. Manual intervention required. paymentId:', paymentId, refundErr)
    }
    return NextResponse.json({ error: 'Order processing error. If charged, a refund has been issued.' }, { status: 500 })
  }

  return NextResponse.json({ orderId, paymentId })
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
scripts/test.sh __tests__/api/shop/private-sale-checkout.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add app/api/shop/private-sale/ __tests__/api/shop/private-sale-checkout.test.ts
git commit -m "feat: public private sale API (token validation + checkout)"
```

---

## Task 8: Customer-Facing Private Sale Page

**Files:**
- Create: `app/(public)/private-sale/[token]/page.tsx`
- Create: `components/shop/PrivateSaleCheckout.tsx`

- [ ] **Step 1: Create the `'use client'` checkout component**

`components/shop/PrivateSaleCheckout.tsx` — mirrors the pattern of `CheckoutForm.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { calculateShipping } from '@/lib/shipping'
import type { PrivateSaleItem, ShippingAddress } from '@/lib/supabase/types'

interface SaleData {
  items: PrivateSaleItem[]
  expiresAt: string
  shipping: { mode: 'fixed' | 'percentage'; value: number }
}

interface SquareCard {
  attach: (container: HTMLElement) => Promise<void>
  tokenize: () => Promise<{ status: string; token?: string; errors?: Array<{ message: string }> }>
}
interface SquarePayments {
  card: () => Promise<SquareCard>
}
declare global {
  interface Window {
    Square?: { payments: (appId: string, locationId: string) => Promise<SquarePayments> }
  }
}

export default function PrivateSaleCheckout({ sale, token }: { sale: SaleData; token: string }) {
  const router = useRouter()
  const cardRef = useRef<SquareCard | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [shipping, setShipping] = useState<ShippingAddress>({
    name: '', address1: '', address2: '', city: '', state: '', zip: '', country: 'US',
  })
  const [timeLeft, setTimeLeft] = useState('')

  // Expiry countdown
  useEffect(() => {
    function update() {
      const diff = new Date(sale.expiresAt).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Expired'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setTimeLeft(h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`)
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [sale.expiresAt])

  // Square SDK init (same pattern as CheckoutForm)
  useEffect(() => {
    let cancelled = false; let attempts = 0
    async function init() {
      if (cancelled) return
      if (!window.Square) {
        if (++attempts >= 20) { setError('Payment form failed to load. Please refresh.'); return }
        setTimeout(init, 500); return
      }
      if (!containerRef.current) { setTimeout(init, 500); return }
      const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? ''
      const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? ''
      const payments = await window.Square.payments(appId, locationId)
      if (cancelled) return
      const card = await payments.card()
      if (cancelled) return
      await card.attach(containerRef.current)
      if (cancelled) return
      cardRef.current = card; setSdkReady(true)
    }
    init()
    return () => { cancelled = true }
  }, [])

  const subtotal = sale.items.reduce((sum, item) => sum + (item.custom_price ?? 0) * item.quantity, 0)
  const shippingCost = calculateShipping(subtotal, { shipping_mode: sale.shipping.mode, shipping_value: sale.shipping.value })

  function shippingInput(field: keyof ShippingAddress, placeholder: string, required = true) {
    return (
      <input
        placeholder={placeholder}
        value={shipping[field] ?? ''}
        onChange={e => setShipping(prev => ({ ...prev, [field]: e.target.value }))}
        required={required}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', marginBottom: '8px', minHeight: '48px', boxSizing: 'border-box' }}
      />
    )
  }

  async function handlePay() {
    if (!cardRef.current || !sdkReady) return
    const requiredFields: (keyof ShippingAddress)[] = ['name', 'address1', 'city', 'state', 'zip', 'country']
    if (requiredFields.some(f => !shipping[f])) { setError('Please fill in all shipping fields'); return }
    setLoading(true); setError(null)
    try {
      const result = await cardRef.current.tokenize()
      if (result.status !== 'OK' || !result.token) {
        setError(result.errors?.[0]?.message ?? 'Card error — please try again'); return
      }
      const res = await fetch(`/api/shop/private-sale/${token}/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: result.token, shipping }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Payment failed'); return }
      router.push(`/shop/confirmation/${data.orderId}`)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '8px' }}>Your Private Sale</h1>
      {timeLeft && <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>Link expires: {timeLeft}</p>}

      {/* Items */}
      <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px' }}>
        {sale.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>{item.product?.name ?? 'Item'} × {item.quantity}</span>
            <span>${((item.custom_price ?? 0) * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        {shippingCost > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>Shipping & Handling</span>
            <span>${shippingCost.toFixed(2)}</span>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
          <span>Total</span><span>${(subtotal + shippingCost).toFixed(2)}</span>
        </div>
      </div>

      {/* Shipping address */}
      <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--color-primary)' }}>Shipping Address</h2>
      {shippingInput('name', 'Full name')}
      {shippingInput('address1', 'Address line 1')}
      {shippingInput('address2', 'Address line 2 (optional)', false)}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
        {shippingInput('city', 'City')}
        {shippingInput('state', 'State')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {shippingInput('zip', 'ZIP code')}
        {shippingInput('country', 'Country')}
      </div>

      {/* Square card widget */}
      <div ref={containerRef} id="square-card-container-private" style={{ marginBottom: '16px', minHeight: '89px', marginTop: '24px' }} />
      {error && <p role="alert" style={{ color: 'var(--color-error)', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
      <button
        onClick={handlePay}
        disabled={loading || !sdkReady}
        style={{ width: '100%', padding: '16px', background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', fontSize: '18px', cursor: loading ? 'not-allowed' : 'pointer', minHeight: '48px', opacity: (!sdkReady || loading) ? 0.7 : 1 }}
      >
        {loading ? 'Processing...' : `Pay $${(subtotal + shippingCost).toFixed(2)}`}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create the server component page**

Query Supabase directly — do NOT HTTP-fetch the API route. Self-referencing HTTP calls from server components add latency and can fail in some deployment environments. This matches the pattern used by all other server components in this project.

`app/(public)/private-sale/[token]/page.tsx`:

```tsx
import { createServiceRoleClient } from '@/lib/supabase/server'
import PrivateSaleCheckout from '@/components/shop/PrivateSaleCheckout'

interface PageProps { params: Promise<{ token: string }> }

function Unavailable() {
  return (
    <main style={{ maxWidth: '520px', margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '16px' }}>
        Link Unavailable
      </h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        This private sale link has expired, been used, or is no longer valid.
      </p>
    </main>
  )
}

export default async function PrivateSalePage({ params }: PageProps) {
  const { token } = await params
  const supabase = createServiceRoleClient()

  const { data: sale } = await supabase
    .from('private_sales')
    .select('id, expires_at, used_at, revoked_at, items:private_sale_items(quantity, custom_price, product:products(id,name,description,price,images,is_active))')
    .eq('token', token)
    .maybeSingle()

  if (!sale || sale.used_at || sale.revoked_at) return <Unavailable />
  if (new Date(sale.expires_at) <= new Date()) {
    // Lazy expiry cleanup (fire-and-forget — page still renders unavailable)
    supabase.rpc('release_private_sale_stock', { sale_id: sale.id }).catch(console.error)
    return <Unavailable />
  }

  const { data: settings } = await supabase
    .from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle()

  const saleData = {
    items: sale.items,
    expiresAt: sale.expires_at,
    shipping: { mode: (settings?.shipping_mode ?? 'fixed') as 'fixed' | 'percentage', value: settings?.shipping_value ?? 0 },
  }

  return <PrivateSaleCheckout sale={saleData} token={token} />
}
```

- [ ] **Step 3: Verify Square SDK script tag is in the layout**

Check `app/(public)/layout.tsx` (or the root layout). The Square Web Payments SDK `<Script>` tag should already be there from the existing checkout feature. If not present in the public layout, add:

```tsx
import Script from 'next/script'
// In the layout:
<Script src="https://sandbox.web.squarecdn.com/v1/square.js" strategy="beforeInteractive" />
```

Use `sandbox.web.squarecdn.com` for sandbox env, `web.squarecdn.com` for production. Check `next.config.js` for existing CSP that may need updating to allow this domain.

- [ ] **Step 4: Commit**

```bash
git add app/(public)/private-sale/ components/shop/PrivateSaleCheckout.tsx
git commit -m "feat: private sale customer page + checkout widget"
```

---

## Task 9: Admin Private Sales UI

**Files:**
- Create: `components/admin/PrivateSaleList.tsx`
- Create: `components/admin/PrivateSaleForm.tsx`
- Create: `app/admin/(dashboard)/private-sales/page.tsx`
- Create: `app/admin/(dashboard)/private-sales/new/page.tsx`

- [ ] **Step 1: Look at an existing admin list page for patterns**

Read `app/admin/(dashboard)/messages/page.tsx` to understand the server component + client component split pattern used throughout admin.

- [ ] **Step 2: Create `components/admin/PrivateSaleList.tsx`**

`'use client'` component. Props: `initialData: { data: PrivateSale[]; total: number }`.

Status badge logic:
```ts
function getStatus(sale: PrivateSale): 'active' | 'expired' | 'used' | 'revoked' {
  if (sale.used_at) return 'used'
  if (sale.revoked_at) return 'revoked'
  if (new Date(sale.expires_at) <= new Date()) return 'expired'
  return 'active'
}
```

Badge colors: active = green (`#16a34a`), expired = gray, used = blue, revoked = red.

Render a table with columns: Customer note, Items summary, Total value, Expiry, Status badge, Copy link button (active only), Revoke button (active only).

Revoke calls `DELETE /api/admin/private-sales/${id}` then refreshes the list.
Copy calls `navigator.clipboard.writeText(url)`.

The URL for an active sale: `${process.env.NEXT_PUBLIC_SITE_URL}/private-sale/${sale.token}`.

- [ ] **Step 3: Create `components/admin/PrivateSaleForm.tsx`**

`'use client'` component. Renders the create form.

State:
```ts
const [selectedProducts, setSelectedProducts] = useState<Array<{ product: Product; quantity: number; customPrice: number }>>([])
const [expiresIn, setExpiresIn] = useState<'48h' | '7d' | '14d'>('7d')
const [customerNote, setCustomerNote] = useState('')
const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
const [products, setProducts] = useState<Product[]>([])
const [search, setSearch] = useState('')
```

On mount, fetch active products: `GET /api/shop/products?limit=100`. Filter by search client-side.

Submit handler calls `POST /api/admin/private-sales`, on success shows the generated URL with a copy button.

Expiry selector:
```tsx
<select value={expiresIn} onChange={e => setExpiresIn(e.target.value as '48h' | '7d' | '14d')}>
  <option value="48h">48 hours</option>
  <option value="7d">7 days</option>
  <option value="14d">14 days</option>
</select>
```

- [ ] **Step 4: Create server component pages**

`app/admin/(dashboard)/private-sales/page.tsx`:
```tsx
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PrivateSaleList from '@/components/admin/PrivateSaleList'
import Link from 'next/link'

export default async function PrivateSalesPage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')

  const supabase = createServiceRoleClient()
  const { data, count } = await supabase
    .from('private_sales')
    .select('*, items:private_sale_items(*, product:products(id,name))', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, 19)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)' }}>Private Sales</h1>
        <Link href="/admin/private-sales/new" style={{ padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-accent)', borderRadius: '4px', textDecoration: 'none', fontSize: '14px', minHeight: '48px', display: 'inline-flex', alignItems: 'center' }}>
          Create Link
        </Link>
      </div>
      <PrivateSaleList initialData={{ data: data ?? [], total: count ?? 0 }} />
    </div>
  )
}
```

`app/admin/(dashboard)/private-sales/new/page.tsx`:
```tsx
import { requireAdminSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PrivateSaleForm from '@/components/admin/PrivateSaleForm'

export default async function NewPrivateSalePage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '24px' }}>Create Private Sale Link</h1>
      <PrivateSaleForm />
    </div>
  )
}
```

- [ ] **Step 5: Add "Private Sales" to admin sidebar nav**

Find the admin sidebar/nav component (likely in `components/admin/` or `app/admin/(dashboard)/layout.tsx`). Add a nav item:
```tsx
<Link href="/admin/private-sales">Private Sales</Link>
```

- [ ] **Step 6: Commit**

```bash
git add components/admin/PrivateSaleList.tsx components/admin/PrivateSaleForm.tsx app/admin/(dashboard)/private-sales/
git commit -m "feat: admin private sales UI (list + create form)"
```

---

## Task 10: Full Test Run + Cleanup

- [ ] **Step 1: Run full test suite**

```bash
scripts/test.sh
```

Expected: All tests pass. No failures.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Manual smoke test checklist**

- [ ] Admin settings: set shipping to $8.50 fixed → save → reload → value persists
- [ ] Public shop: add item to cart, checkout → shipping address fields shown, shipping line item shown
- [ ] Admin private sales: create a link for 1 item at custom price, 7d expiry
- [ ] Visit private sale URL → item shown with custom price + shipping line item
- [ ] Complete checkout on private sale → redirected to `/shop/confirmation/[orderId]`
- [ ] Admin private sales list: link shows as "Used"
- [ ] Create another link → revoke it → link shows as "Revoked"
- [ ] Visit revoked link URL → "This link is no longer available"

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: private sales + shipping — complete"
```
