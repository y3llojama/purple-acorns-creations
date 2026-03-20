# Square + Pinterest Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Square.site iframe with a native product inventory, bidirectional Square sync, Pinterest integration, and on-site checkout via Square Web Payments SDK.

**Architecture:** Site is source of truth — products managed in admin, pushed to Square and Pinterest via channel adapters. Square webhooks keep stock counts current after POS sales. Square Web Payments SDK handles on-site checkout (tokenization client-side, charge server-side) without card data touching this server.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + Storage), `square` npm package (Node.js SDK), Square Web Payments SDK (CDN, browser-only), Pinterest Catalog API v5 (fetch), Vercel Cron Jobs, Node.js `crypto` (AES-256-GCM), lucide-react

**Worktree:** `.worktrees/square-storefront` on branch `feat/square-pinterest-storefront`

**Spec:** `docs/superpowers/specs/2026-03-20-square-pinterest-storefront-design.md`

---

## Codebase Conventions (read before any task)

- **Auth on admin routes:** always call `const { error } = await requireAdminSession()` at the top; return `error` if truthy
- **Supabase server client:** `createServiceRoleClient()` from `@/lib/supabase/server`
- **Input sanitization:** `sanitizeText()` / `sanitizeContent()` from `@/lib/sanitize` — always sanitize before rendering HTML
- **URL validation:** `isValidHttpsUrl()` from `@/lib/validate`
- **Rate limiting:** 60s window per IP on all public API routes (see existing routes for pattern)
- **CSS:** CSS custom properties only — no Tailwind, no hardcoded colours; use `var(--color-primary)`, `var(--color-accent)`, `var(--color-surface)`, `var(--color-border)`, `var(--color-text-muted)`, `var(--color-bg)`
- **Touch targets:** min 48px height/width on interactive elements
- **No `role="banner"`** on `<header>` — it's implicit
- **`cookies()` in Next.js 15** must be awaited
- **`'use client'`** components cannot export `metadata`
- **Styles:** inline style objects throughout (see existing components for pattern — no CSS modules, no Tailwind)
- **Tests:** Jest + jsdom; run with `scripts/test.sh`; env vars in `jest.setup.env.js`
- **HTML rendering:** always call `sanitizeContent(html)` from `lib/sanitize.ts` before injecting any user-supplied HTML into the DOM

---

## File Map

### New files
**Infrastructure**
- `supabase/migrations/015_square_pinterest_storefront.sql`
- `lib/crypto.ts` — AES-256-GCM encryptToken / decryptToken
- `lib/channels/types.ts` — ChannelAdapter interface, Product, SyncResult
- `lib/channels/index.ts` — syncProduct, syncAllProducts, getChannelConfig

**Square**
- `lib/channels/square/client.ts` — getSquareClient (decrypt tokens → Square SDK client)
- `lib/channels/square/catalog.ts` — pushProduct, fullSync
- `lib/channels/square/webhook.ts` — verifySquareSignature, handleInventoryUpdate, handleCatalogConflict
- `app/api/admin/channels/square/connect/route.ts`
- `app/api/admin/channels/square/callback/route.ts`
- `app/api/webhooks/square/route.ts`

**Pinterest**
- `lib/channels/pinterest/client.ts` — getPinterestHeaders (decrypt tokens)
- `lib/channels/pinterest/catalog.ts` — pushProduct, fullSync
- `app/api/admin/channels/pinterest/connect/route.ts`
- `app/api/admin/channels/pinterest/callback/route.ts`

**Sync routes**
- `app/api/cron/sync/route.ts` — CRON_SECRET bearer auth
- `app/api/admin/sync/route.ts` — requireAdminSession
- `app/api/admin/channels/route.ts` — GET status, PATCH toggle/dismiss conflict
- `vercel.json` — cron schedule

**Admin API**
- `app/api/admin/inventory/route.ts` — GET list, POST create
- `app/api/admin/inventory/[id]/route.ts` — GET, PATCH, DELETE

**Admin UI**
- `app/admin/(dashboard)/inventory/page.tsx`
- `app/admin/(dashboard)/channels/page.tsx`
- `components/admin/InventoryManager.tsx`
- `components/admin/ProductForm.tsx`
- `components/admin/ChannelsManager.tsx`
- `components/admin/SquareChannelCard.tsx`
- `components/admin/PinterestChannelCard.tsx`

**Shop API**
- `app/api/shop/products/route.ts` — GET list (paginated, filtered, sorted)
- `app/api/shop/products/[id]/route.ts` — GET single
- `app/api/shop/products/[id]/view/route.ts` — POST increment view_count
- `app/api/shop/checkout/route.ts` — POST checkout

**Shop UI**
- `app/(public)/shop/layout.tsx` — Pinterest + Square SDK scripts
- `app/(public)/shop/[id]/page.tsx`
- `app/(public)/shop/saved/page.tsx`
- `app/(public)/shop/confirmation/[orderId]/page.tsx`
- `components/shop/ProductGrid.tsx`
- `components/shop/ProductCard.tsx`
- `components/shop/CategoryFilter.tsx`
- `components/shop/ProductDetail.tsx`
- `components/shop/ImageCarousel.tsx`
- `components/shop/CartContext.tsx`
- `components/shop/CartDrawer.tsx`
- `components/shop/CartButton.tsx`
- `components/shop/HeartButton.tsx`
- `components/shop/CheckoutForm.tsx`
- `components/home/GalleryScroller.tsx`

**Tests**
- `__tests__/lib/crypto.test.ts`
- `__tests__/api/shop/checkout.test.ts`
- `__tests__/api/webhooks/square.test.ts`
- `__tests__/api/admin/inventory.test.ts`
- `__tests__/api/cron/sync.test.ts`

### Modified files
- `lib/supabase/types.ts` — add Product, ChannelSyncLog; update Settings
- `next.config.js` — extend CSP (Square SDK + Pinterest), add Square image domain
- `jest.setup.env.js` — add OAUTH_ENCRYPTION_KEY, CRON_SECRET, Square/Pinterest env vars
- `components/admin/AdminSidebar.tsx` — add Inventory + Channels to NAV_ITEMS
- `components/admin/IntegrationsEditor.tsx` — remove Square Store URL section
- `app/(public)/shop/page.tsx` — replace iframe with ProductGrid
- `app/page.tsx` — add GalleryScroller; update ModernFeaturedGrid to use products table

---

## Task 1: Packages, Env Vars, DB Migration, Types

**Files:**
- Create: `supabase/migrations/015_square_pinterest_storefront.sql`
- Modify: `lib/supabase/types.ts`
- Modify: `jest.setup.env.js`
- Create: `vercel.json`

- [ ] **Step 1: Install Square Node.js SDK**

```bash
cd .worktrees/square-storefront
npm install square
```

- [ ] **Step 2: Write DB migration**

Create `supabase/migrations/015_square_pinterest_storefront.sql`:

```sql
-- Products table — inventory source of truth
CREATE TABLE products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  description          TEXT,
  price                NUMERIC(10,2) NOT NULL,
  category             TEXT NOT NULL CHECK (category IN ('rings','necklaces','earrings','bracelets','crochet','other')),
  stock_count          INTEGER NOT NULL DEFAULT 0,
  images               TEXT[] NOT NULL DEFAULT '{}'
                       CHECK (array_length(images, 1) IS NULL OR array_length(images, 1) <= 10),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  gallery_featured     BOOLEAN NOT NULL DEFAULT false,
  gallery_sort_order   INTEGER,
  view_count           INTEGER NOT NULL DEFAULT 0,
  square_catalog_id    TEXT,
  square_variation_id  TEXT,
  pinterest_product_id TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Channel sync log — per-product, per-channel sync state
CREATE TABLE channel_sync_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL CHECK (channel IN ('square','pinterest','etsy')),
  status      TEXT NOT NULL CHECK (status IN ('pending','synced','error','conflict')),
  synced_at   TIMESTAMPTZ,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel)
);

-- Atomic stock decrement — returns updated row only if stock was available
CREATE OR REPLACE FUNCTION decrement_stock(product_id UUID, qty INTEGER)
RETURNS SETOF products AS $$
  UPDATE products
  SET stock_count = stock_count - qty
  WHERE id = product_id AND stock_count >= qty
  RETURNING *;
$$ LANGUAGE sql;

-- Link gallery photos to products
ALTER TABLE gallery ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Settings: OAuth tokens + channel config (drop iframe URL)
ALTER TABLE settings
  DROP COLUMN IF EXISTS square_store_url,
  ADD COLUMN IF NOT EXISTS square_access_token     TEXT,
  ADD COLUMN IF NOT EXISTS square_refresh_token    TEXT,
  ADD COLUMN IF NOT EXISTS square_location_id      TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_access_token  TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_catalog_id    TEXT,
  ADD COLUMN IF NOT EXISTS gallery_max_items       INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS square_sync_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinterest_sync_enabled  BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 3: Update `lib/supabase/types.ts`**

Add after existing types:

```typescript
export type ProductCategory = 'rings' | 'necklaces' | 'earrings' | 'bracelets' | 'crochet' | 'other'
export type ChannelStatus = 'pending' | 'synced' | 'error' | 'conflict'
export type Channel = 'square' | 'pinterest' | 'etsy'

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  category: ProductCategory
  stock_count: number
  images: string[]
  is_active: boolean
  gallery_featured: boolean
  gallery_sort_order: number | null
  view_count: number
  square_catalog_id: string | null
  square_variation_id: string | null
  pinterest_product_id: string | null
  created_at: string
  updated_at: string
}

export interface ChannelSyncLog {
  id: string
  product_id: string
  channel: Channel
  status: ChannelStatus
  synced_at: string | null
  error: string | null
  created_at: string
}
```

Also update the `Settings` interface — remove `square_store_url`, add the new columns:

```typescript
  // Remove: square_store_url
  square_access_token: string | null
  square_refresh_token: string | null
  square_location_id: string | null
  pinterest_access_token: string | null
  pinterest_refresh_token: string | null
  pinterest_catalog_id: string | null
  gallery_max_items: number
  square_sync_enabled: boolean
  pinterest_sync_enabled: boolean
```

- [ ] **Step 4: Add env vars to `jest.setup.env.js`**

```javascript
process.env.OAUTH_ENCRYPTION_KEY = 'a'.repeat(64) // 32-byte hex (test only)
process.env.CRON_SECRET = 'test-cron-secret'
process.env.SQUARE_APPLICATION_ID = 'sandbox-sq0idb-test'
process.env.SQUARE_APPLICATION_SECRET = 'sandbox-sq0csb-test'
process.env.SQUARE_ENVIRONMENT = 'sandbox'
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = 'test-webhook-key'
process.env.PINTEREST_APP_ID = 'test-pinterest-app-id'
process.env.PINTEREST_APP_SECRET = 'test-pinterest-app-secret'
process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID = 'sandbox-sq0idb-test'
process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID = 'test-location-id'
```

- [ ] **Step 5: Create `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 3 * * *"
    }
  ]
}
```

- [ ] **Step 6: Run tests to confirm nothing broken**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/015_square_pinterest_storefront.sql lib/supabase/types.ts jest.setup.env.js vercel.json package.json package-lock.json
git commit -m "feat: products/channel_sync_log migration, types, Square SDK, vercel cron"
```

---

## Task 2: lib/crypto.ts — Token Encryption

**Files:**
- Create: `lib/crypto.ts`
- Create: `__tests__/lib/crypto.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/crypto.test.ts`:

```typescript
import { encryptToken, decryptToken } from '@/lib/crypto'

describe('encryptToken / decryptToken', () => {
  it('round-trips a token', () => {
    const original = 'EAAAEMySecret_access_token_12345'
    const ciphertext = encryptToken(original)
    expect(ciphertext).not.toBe(original)
    expect(decryptToken(ciphertext)).toBe(original)
  })

  it('produces different ciphertext each call (random IV)', () => {
    const token = 'same-token'
    const a = encryptToken(token)
    const b = encryptToken(token)
    expect(a).not.toBe(b)
    expect(decryptToken(a)).toBe(token)
    expect(decryptToken(b)).toBe(token)
  })

  it('throws on tampered ciphertext', () => {
    const ct = encryptToken('valid-token')
    const tampered = ct.slice(0, -4) + 'XXXX'
    expect(() => decryptToken(tampered)).toThrow()
  })

  it('throws when OAUTH_ENCRYPTION_KEY is missing', () => {
    const saved = process.env.OAUTH_ENCRYPTION_KEY
    delete process.env.OAUTH_ENCRYPTION_KEY
    expect(() => encryptToken('token')).toThrow('OAUTH_ENCRYPTION_KEY')
    process.env.OAUTH_ENCRYPTION_KEY = saved
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd .worktrees/square-storefront && npx jest __tests__/lib/crypto.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/crypto'`

- [ ] **Step 3: Implement `lib/crypto.ts`**

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function getKey(): Buffer {
  const hex = process.env.OAUTH_ENCRYPTION_KEY
  if (!hex) throw new Error('OAUTH_ENCRYPTION_KEY env var is required')
  return Buffer.from(hex, 'hex')
}

/** Encrypt a plaintext token. Returns base64-encoded iv+tag+ciphertext. */
export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

/** Decrypt a token produced by encryptToken. Throws on tampering. */
export function decryptToken(ciphertext: string): string {
  const key = getKey()
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, IV_BYTES)
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const encrypted = buf.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd .worktrees/square-storefront && npx jest __tests__/lib/crypto.test.ts --no-coverage
```

Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/crypto.ts __tests__/lib/crypto.test.ts
git commit -m "feat: AES-256-GCM token encryption helpers"
```

---

## Task 3: Channel Adapter Types + Sync Index

**Files:**
- Create: `lib/channels/types.ts`
- Create: `lib/channels/index.ts`

- [ ] **Step 1: Create `lib/channels/types.ts`**

```typescript
import type { Product } from '@/lib/supabase/types'

export type { Product }

export interface SyncResult {
  productId: string
  channel: 'square' | 'pinterest' | 'etsy'
  success: boolean
  error?: string
}

export interface ChannelAdapter {
  push(product: Product): Promise<SyncResult>
  fullSync(products: Product[]): Promise<SyncResult[]>
}
```

- [ ] **Step 2: Create `lib/channels/index.ts`**

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Product, SyncResult } from './types'

export async function getChannelConfig(): Promise<{
  squareEnabled: boolean
  pinterestEnabled: boolean
}> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('square_sync_enabled, pinterest_sync_enabled')
    .single()
  return {
    squareEnabled: data?.square_sync_enabled ?? false,
    pinterestEnabled: data?.pinterest_sync_enabled ?? false,
  }
}

/** Push a single product to all enabled channels. Fire-and-forget safe. */
export async function syncProduct(product: Product): Promise<SyncResult[]> {
  const config = await getChannelConfig()
  const results: SyncResult[] = []

  if (config.squareEnabled) {
    try {
      const { pushProduct } = await import('./square/catalog')
      results.push(await pushProduct(product))
    } catch (err) {
      results.push({ productId: product.id, channel: 'square', success: false, error: String(err) })
    }
  }

  if (config.pinterestEnabled) {
    try {
      const { pushProduct } = await import('./pinterest/catalog')
      results.push(await pushProduct(product))
    } catch (err) {
      results.push({ productId: product.id, channel: 'pinterest', success: false, error: String(err) })
    }
  }

  await logSyncResults(results)
  return results
}

/** Sync all active products to all enabled channels. */
export async function syncAllProducts(): Promise<SyncResult[]> {
  const supabase = createServiceRoleClient()
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
  if (!products?.length) return []

  const allResults: SyncResult[] = []
  for (const product of products) {
    const results = await syncProduct(product as Product)
    allResults.push(...results)
  }
  return allResults
}

async function logSyncResults(results: SyncResult[]): Promise<void> {
  const supabase = createServiceRoleClient()
  for (const r of results) {
    await supabase.from('channel_sync_log').upsert({
      product_id: r.productId,
      channel: r.channel,
      status: r.success ? 'synced' : 'error',
      synced_at: r.success ? new Date().toISOString() : null,
      error: r.error ?? null,
    }, { onConflict: 'product_id,channel' })
  }
}
```

- [ ] **Step 3: Run existing tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 4: Commit**

```bash
git add lib/channels/
git commit -m "feat: channel adapter types and sync orchestration"
```

---

## Task 4: Square OAuth + Client

**Files:**
- Create: `lib/channels/square/client.ts`
- Create: `app/api/admin/channels/square/connect/route.ts`
- Create: `app/api/admin/channels/square/callback/route.ts`

- [ ] **Step 1: Create `lib/channels/square/client.ts`**

```typescript
import { Client, Environment } from 'square'
import { decryptToken } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function getSquareClient(): Promise<{ client: Client; locationId: string }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('square_access_token, square_location_id')
    .single()

  if (!data?.square_access_token) throw new Error('Square not connected')

  const accessToken = decryptToken(data.square_access_token)
  const client = new Client({
    accessToken,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  })
  return { client, locationId: data.square_location_id ?? '' }
}
```

- [ ] **Step 2: Create Square OAuth connect route**

Create `app/api/admin/channels/square/connect/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const appId = process.env.SQUARE_APPLICATION_ID
  if (!appId) return NextResponse.json({ error: 'Square not configured' }, { status: 500 })

  const baseUrl = process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/square/callback`
  const scope = [
    'MERCHANT_PROFILE_READ', 'ITEMS_READ', 'ITEMS_WRITE',
    'INVENTORY_READ', 'INVENTORY_WRITE',
    'ORDERS_READ', 'ORDERS_WRITE',
    'PAYMENTS_READ', 'PAYMENTS_WRITE',
  ].join(' ')

  const url = new URL(`${baseUrl}/oauth2/authorize`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('scope', scope)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('session', 'false')

  return NextResponse.redirect(url.toString())
}
```

- [ ] **Step 3: Create Square OAuth callback route**

Create `app/api/admin/channels/square/callback/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'
import { Client, Environment } from 'square'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=square_denied`)
  }

  const baseUrl = process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const tokenRes = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      client_secret: process.env.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/square/callback`,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=square_token`)
  }

  const tokens = await tokenRes.json()

  const client = new Client({
    accessToken: tokens.access_token,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  })
  const { result: locResult } = await client.locationsApi.listLocations()
  const locationId = locResult.locations?.[0]?.id ?? ''

  const supabase = createServiceRoleClient()
  await supabase.from('settings').update({
    square_access_token: encryptToken(tokens.access_token),
    square_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    square_location_id: locationId,
  })

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?connected=square`)
}
```

- [ ] **Step 4: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 5: Commit**

```bash
git add lib/channels/square/client.ts app/api/admin/channels/square/
git commit -m "feat: Square OAuth connect/callback and client factory"
```

---

## Task 5: Square Catalog Push

**Files:**
- Create: `lib/channels/square/catalog.ts`

- [ ] **Step 1: Create `lib/channels/square/catalog.ts`**

```typescript
import { getSquareClient } from './client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Product, SyncResult } from '@/lib/channels/types'

export async function pushProduct(product: Product): Promise<SyncResult> {
  try {
    const { client, locationId } = await getSquareClient()
    const idempotencyKey = `product-${product.id}-${Date.now()}`

    const { result } = await client.catalogApi.upsertCatalogObject({
      idempotencyKey,
      object: {
        type: 'ITEM',
        id: product.square_catalog_id ?? `#NEW-${product.id}`,
        itemData: {
          name: product.name,
          description: product.description ?? undefined,
          variations: [{
            type: 'ITEM_VARIATION',
            id: product.square_variation_id ?? `#VAR-${product.id}`,
            itemVariationData: {
              name: 'Regular',
              pricingType: 'FIXED_PRICING',
              priceMoney: {
                amount: BigInt(Math.round(product.price * 100)),
                currency: 'USD',
              },
              locationOverrides: [{ locationId, trackInventory: true }],
            },
          }],
        },
      },
    })

    const catalogObjectId = result.catalogObject?.id
    const variationId = result.catalogObject?.itemData?.variations?.[0]?.id
    if (!catalogObjectId) throw new Error('Square upsert returned no catalog object ID')

    const supabase = createServiceRoleClient()
    await supabase.from('products').update({
      square_catalog_id: catalogObjectId,
      square_variation_id: variationId ?? null,
    }).eq('id', product.id)

    if (variationId) {
      await client.inventoryApi.batchChangeInventory({
        idempotencyKey: `inv-${product.id}-${Date.now()}`,
        changes: [{
          type: 'PHYSICAL_COUNT',
          physicalCount: {
            catalogObjectId: variationId,
            locationId,
            quantity: String(product.stock_count),
            occurredAt: new Date().toISOString(),
            state: 'IN_STOCK',
          },
        }],
      })
    }

    return { productId: product.id, channel: 'square', success: true }
  } catch (err) {
    return { productId: product.id, channel: 'square', success: false, error: String(err) }
  }
}

export async function fullSync(products: Product[]): Promise<SyncResult[]> {
  return Promise.all(products.map(pushProduct))
}
```

- [ ] **Step 2: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 3: Commit**

```bash
git add lib/channels/square/catalog.ts
git commit -m "feat: Square catalog push (upsert item + sync inventory count)"
```

---

## Task 6: Square Webhook Handler + Tests

**Files:**
- Create: `lib/channels/square/webhook.ts`
- Create: `app/api/webhooks/square/route.ts`
- Create: `__tests__/api/webhooks/square.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/webhooks/square.test.ts`:

```typescript
import { verifySquareSignature } from '@/lib/channels/square/webhook'
import { createHmac } from 'crypto'

const WEBHOOK_KEY = 'test-webhook-key'
const WEBHOOK_URL = 'https://example.com/api/webhooks/square'

function makeSignature(url: string, body: string): string {
  return createHmac('sha256', WEBHOOK_KEY).update(url + body).digest('base64')
}

describe('verifySquareSignature', () => {
  it('returns true for valid signature', () => {
    const body = JSON.stringify({ type: 'inventory.count.updated' })
    const sig = makeSignature(WEBHOOK_URL, body)
    expect(verifySquareSignature(WEBHOOK_URL, body, sig, WEBHOOK_KEY)).toBe(true)
  })

  it('returns false for tampered body', () => {
    const body = JSON.stringify({ type: 'inventory.count.updated' })
    const sig = makeSignature(WEBHOOK_URL, body)
    expect(verifySquareSignature(WEBHOOK_URL, body + 'x', sig, WEBHOOK_KEY)).toBe(false)
  })

  it('returns false for wrong key', () => {
    const body = JSON.stringify({ type: 'test' })
    const sig = makeSignature(WEBHOOK_URL, body)
    expect(verifySquareSignature(WEBHOOK_URL, body, sig, 'wrong-key')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd .worktrees/square-storefront && npx jest __tests__/api/webhooks/square.test.ts --no-coverage
```

- [ ] **Step 3: Create `lib/channels/square/webhook.ts`**

```typescript
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'

export function verifySquareSignature(
  url: string,
  rawBody: string,
  signatureHeader: string,
  webhookKey: string,
): boolean {
  const expected = createHmac('sha256', webhookKey).update(url + rawBody).digest('base64')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
  } catch {
    return false
  }
}

export async function handleInventoryUpdate(payload: unknown): Promise<void> {
  const p = payload as {
    data?: { object?: { inventory_counts?: Array<{ catalog_object_id: string; quantity: string }> } }
  }
  const counts = p?.data?.object?.inventory_counts ?? []
  const supabase = createServiceRoleClient()
  for (const count of counts) {
    await supabase
      .from('products')
      .update({ stock_count: parseInt(count.quantity, 10) })
      .eq('square_variation_id', count.catalog_object_id)
  }
}

export async function handleCatalogConflict(payload: unknown): Promise<void> {
  const p = payload as { data?: { ids?: string[] } }
  const ids = p?.data?.ids ?? []
  if (!ids.length) return
  const supabase = createServiceRoleClient()
  for (const squareCatalogId of ids) {
    const { data: product } = await supabase
      .from('products').select('id').eq('square_catalog_id', squareCatalogId).single()
    if (!product) continue
    await supabase.from('channel_sync_log').upsert({
      product_id: product.id,
      channel: 'square',
      status: 'conflict',
      error: 'catalog.version.updated received — review and re-sync',
    }, { onConflict: 'product_id,channel' })
  }
}
```

- [ ] **Step 4: Create `app/api/webhooks/square/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { verifySquareSignature, handleInventoryUpdate, handleCatalogConflict } from '@/lib/channels/square/webhook'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-square-hmacsha256-signature') ?? ''
  const webhookKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? ''

  if (!verifySquareSignature(request.url, rawBody, signature, webhookKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: unknown
  try { payload = JSON.parse(rawBody) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = (payload as { type?: string })?.type
  if (eventType === 'inventory.count.updated') await handleInventoryUpdate(payload)
  else if (eventType === 'catalog.version.updated') await handleCatalogConflict(payload)

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 5: Run tests — confirm pass**

```bash
cd .worktrees/square-storefront && npx jest __tests__/api/webhooks/square.test.ts --no-coverage
```

Expected: 3/3 PASS

- [ ] **Step 6: Commit**

```bash
git add lib/channels/square/webhook.ts app/api/webhooks/square/ __tests__/api/webhooks/square.test.ts
git commit -m "feat: Square webhook handler (inventory update + catalog conflict)"
```

---

## Task 7: Pinterest OAuth + Catalog Sync

**Files:**
- Create: `lib/channels/pinterest/client.ts`
- Create: `lib/channels/pinterest/catalog.ts`
- Create: `app/api/admin/channels/pinterest/connect/route.ts`
- Create: `app/api/admin/channels/pinterest/callback/route.ts`

- [ ] **Step 1: Create `lib/channels/pinterest/client.ts`**

```typescript
import { decryptToken } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function getPinterestHeaders(): Promise<{ headers: HeadersInit; catalogId: string | null }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('pinterest_access_token, pinterest_catalog_id')
    .single()
  if (!data?.pinterest_access_token) throw new Error('Pinterest not connected')
  return {
    headers: {
      Authorization: `Bearer ${decryptToken(data.pinterest_access_token)}`,
      'Content-Type': 'application/json',
    },
    catalogId: data.pinterest_catalog_id,
  }
}
```

- [ ] **Step 2: Create `lib/channels/pinterest/catalog.ts`**

```typescript
import { getPinterestHeaders } from './client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Product, SyncResult } from '@/lib/channels/types'

const PINTEREST_API = 'https://api.pinterest.com/v5'

export async function pushProduct(product: Product): Promise<SyncResult> {
  try {
    const { headers, catalogId } = await getPinterestHeaders()
    if (!catalogId) throw new Error('Pinterest catalog ID not configured')

    const res = await fetch(`${PINTEREST_API}/catalogs/items/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        country: 'US',
        language: 'EN',
        operation: 'UPSERT',
        items: [{
          catalog_id: catalogId,
          item_id: product.id,
          operation: 'CREATE_OR_UPDATE',
          attributes: {
            title: product.name,
            description: product.description ?? '',
            link: `${process.env.NEXT_PUBLIC_APP_URL}/shop/${product.id}`,
            image_link: product.images[0] ?? '',
            price: `${product.price.toFixed(2)} USD`,
            availability: product.stock_count > 0 ? 'in stock' : 'out of stock',
            google_product_category: '188',
          },
        }],
      }),
    })

    if (!res.ok) throw new Error(`Pinterest API error ${res.status}: ${await res.text()}`)

    const result = await res.json()
    if (result?.batch_id && !product.pinterest_product_id) {
      const supabase = createServiceRoleClient()
      await supabase.from('products').update({ pinterest_product_id: result.batch_id }).eq('id', product.id)
    }

    return { productId: product.id, channel: 'pinterest', success: true }
  } catch (err) {
    return { productId: product.id, channel: 'pinterest', success: false, error: String(err) }
  }
}

export async function fullSync(products: Product[]): Promise<SyncResult[]> {
  return Promise.all(products.map(pushProduct))
}
```

- [ ] **Step 3: Create Pinterest connect route**

`app/api/admin/channels/pinterest/connect/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const appId = process.env.PINTEREST_APP_ID
  if (!appId) return NextResponse.json({ error: 'Pinterest not configured' }, { status: 500 })
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/pinterest/callback`
  const url = new URL('https://www.pinterest.com/oauth/')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'ads:read,catalogs:read,catalogs:write')
  return NextResponse.redirect(url.toString())
}
```

- [ ] **Step 4: Create Pinterest callback route**

`app/api/admin/channels/pinterest/callback/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_denied`)

  const credentials = Buffer.from(
    `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/pinterest/callback`,
    }),
  })

  if (!tokenRes.ok) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_token`)

  const tokens = await tokenRes.json()
  const supabase = createServiceRoleClient()
  await supabase.from('settings').update({
    pinterest_access_token: encryptToken(tokens.access_token),
    pinterest_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
  })
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?connected=pinterest`)
}
```

- [ ] **Step 5: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 6: Commit**

```bash
git add lib/channels/pinterest/ app/api/admin/channels/pinterest/
git commit -m "feat: Pinterest OAuth and catalog sync"
```

---

## Task 8: Cron + Admin Sync Routes + Channels API

**Files:**
- Create: `app/api/cron/sync/route.ts`
- Create: `app/api/admin/sync/route.ts`
- Create: `app/api/admin/channels/route.ts`
- Create: `__tests__/api/cron/sync.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/cron/sync.test.ts`:

```typescript
describe('GET /api/cron/sync', () => {
  it('returns 401 with no Authorization header', async () => {
    const { GET } = await import('@/app/api/cron/sync/route')
    const req = new Request('http://localhost/api/cron/sync')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 with wrong secret', async () => {
    const { GET } = await import('@/app/api/cron/sync/route')
    const req = new Request('http://localhost/api/cron/sync', {
      headers: { Authorization: 'Bearer wrong-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd .worktrees/square-storefront && npx jest __tests__/api/cron/sync.test.ts --no-coverage
```

- [ ] **Step 3: Create `app/api/cron/sync/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { syncAllProducts } from '@/lib/channels'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const results = await syncAllProducts()
  return NextResponse.json({ synced: results.length, errors: results.filter(r => !r.success).length })
}
```

- [ ] **Step 4: Create `app/api/admin/sync/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { syncAllProducts } from '@/lib/channels'

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const results = await syncAllProducts()
  return NextResponse.json({ synced: results.length, errors: results.filter(r => !r.success).length, details: results })
}
```

- [ ] **Step 5: Create `app/api/admin/channels/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const [{ data: settings }, { data: conflicts }, { data: recentErrors }] = await Promise.all([
    supabase.from('settings').select('square_sync_enabled,pinterest_sync_enabled,square_location_id,pinterest_catalog_id,square_access_token,pinterest_access_token').single(),
    supabase.from('channel_sync_log').select('product_id,channel,error,created_at,products(name)').eq('status', 'conflict'),
    supabase.from('channel_sync_log').select('product_id,channel,error,created_at').eq('status', 'error').order('created_at', { ascending: false }).limit(10),
  ])
  return NextResponse.json({
    square: { connected: !!settings?.square_access_token, enabled: settings?.square_sync_enabled ?? false, locationId: settings?.square_location_id },
    pinterest: { connected: !!settings?.pinterest_access_token, enabled: settings?.pinterest_sync_enabled ?? false, catalogId: settings?.pinterest_catalog_id },
    conflicts: conflicts ?? [],
    recentErrors: recentErrors ?? [],
  })
}

export async function PATCH(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const supabase = createServiceRoleClient()
  const update: Record<string, unknown> = {}
  if (typeof body.square_sync_enabled === 'boolean') update.square_sync_enabled = body.square_sync_enabled
  if (typeof body.pinterest_sync_enabled === 'boolean') update.pinterest_sync_enabled = body.pinterest_sync_enabled
  if (body.pinterest_catalog_id !== undefined) update.pinterest_catalog_id = String(body.pinterest_catalog_id)
  if (Object.keys(update).length > 0) await supabase.from('settings').update(update)
  if (body.dismiss_conflict_product_id && body.dismiss_conflict_channel) {
    await supabase.from('channel_sync_log')
      .update({ status: 'synced', error: null })
      .eq('product_id', body.dismiss_conflict_product_id)
      .eq('channel', body.dismiss_conflict_channel)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Run tests**

```bash
cd .worktrees/square-storefront && npx jest __tests__/api/cron/sync.test.ts --no-coverage
```

Expected: 2/2 PASS

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/ app/api/admin/sync/ app/api/admin/channels/route.ts __tests__/api/cron/
git commit -m "feat: cron sync (CRON_SECRET), admin sync, channels status/toggle API"
```

---

## Task 9: Admin Inventory API + Tests

**Files:**
- Create: `app/api/admin/inventory/route.ts`
- Create: `app/api/admin/inventory/[id]/route.ts`
- Create: `__tests__/api/admin/inventory.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/admin/inventory.test.ts`:

```typescript
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(), insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(), delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'p1', name: 'Test Ring', price: 45, category: 'rings', stock_count: 3, images: [], is_active: true, gallery_featured: false }, error: null }),
    })),
  })),
}))
jest.mock('@/lib/channels', () => ({ syncProduct: jest.fn().mockResolvedValue([]) }))

describe('POST /api/admin/inventory', () => {
  it('rejects missing name', async () => {
    const { POST } = await import('@/app/api/admin/inventory/route')
    const req = new Request('http://localhost/api/admin/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 45, category: 'rings' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('rejects invalid category', async () => {
    const { POST } = await import('@/app/api/admin/inventory/route')
    const req = new Request('http://localhost/api/admin/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ring', price: 45, category: 'invalid' }),
    })
    expect((await POST(req)).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd .worktrees/square-storefront && npx jest __tests__/api/admin/inventory.test.ts --no-coverage
```

- [ ] **Step 3: Create `app/api/admin/inventory/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText, sanitizeContent } from '@/lib/sanitize'
import { syncProduct } from '@/lib/channels'

const VALID_CATEGORIES = ['rings','necklaces','earrings','bracelets','crochet','other'] as const
type ValidCategory = typeof VALID_CATEGORIES[number]

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const search = searchParams.get('search')
  const supabase = createServiceRoleClient()
  let query = supabase.from('products').select('*').order('created_at', { ascending: false })
  if (category && VALID_CATEGORIES.includes(category as ValidCategory)) query = query.eq('category', category)
  if (search) query = query.ilike('name', `%${search}%`)
  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const name = sanitizeText(String(body.name ?? '').trim())
  const description = body.description ? sanitizeContent(String(body.description)) : null
  const price = parseFloat(String(body.price ?? ''))
  const category = String(body.category ?? '')
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (isNaN(price) || price < 0) return NextResponse.json({ error: 'valid price required' }, { status: 400 })
  if (!VALID_CATEGORIES.includes(category as ValidCategory)) {
    return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
  }
  const images = Array.isArray(body.images) ? body.images.slice(0, 10).map(String) : []
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('products').insert({
    name, description, price, category, images,
    stock_count: Number(body.stock_count) || 0,
    is_active: body.is_active !== false,
    gallery_featured: Boolean(body.gallery_featured),
    gallery_sort_order: body.gallery_sort_order ? Number(body.gallery_sort_order) : null,
  }).select().single()
  if (dbError) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  syncProduct(data).catch(console.error)
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/admin/inventory/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText, sanitizeContent } from '@/lib/sanitize'
import { syncProduct } from '@/lib/channels'

const VALID_CATEGORIES = ['rings','necklaces','earrings','bracelets','crochet','other'] as const
type ValidCategory = typeof VALID_CATEGORIES[number]

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('products').select('*').eq('id', id).single()
  if (dbError || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = sanitizeText(String(body.name).trim())
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    update.name = name
  }
  if (body.description !== undefined) update.description = body.description ? sanitizeContent(String(body.description)) : null
  if (body.price !== undefined) {
    const price = parseFloat(String(body.price))
    if (isNaN(price) || price < 0) return NextResponse.json({ error: 'valid price required' }, { status: 400 })
    update.price = price
  }
  if (body.category !== undefined) {
    if (!VALID_CATEGORIES.includes(body.category as ValidCategory)) return NextResponse.json({ error: 'invalid category' }, { status: 400 })
    update.category = body.category
  }
  if (body.images !== undefined) update.images = Array.isArray(body.images) ? body.images.slice(0, 10).map(String) : []
  if (body.stock_count !== undefined) update.stock_count = Number(body.stock_count)
  if (body.is_active !== undefined) update.is_active = Boolean(body.is_active)
  if (body.gallery_featured !== undefined) update.gallery_featured = Boolean(body.gallery_featured)
  if (body.gallery_sort_order !== undefined) update.gallery_sort_order = body.gallery_sort_order ? Number(body.gallery_sort_order) : null
  update.updated_at = new Date().toISOString()
  if (Object.keys(update).length <= 1) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('products').update(update).eq('id', id).select().single()
  if (dbError || !data) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  syncProduct(data).catch(console.error)
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from('products').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Run tests**

```bash
cd .worktrees/square-storefront && npx jest __tests__/api/admin/inventory.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/inventory/ __tests__/api/admin/inventory.test.ts
git commit -m "feat: admin inventory CRUD API routes"
```

---

## Task 10: Admin Inventory + Channels UI

**Files:**
- Create: `components/admin/ProductForm.tsx`
- Create: `components/admin/InventoryManager.tsx`
- Create: `app/admin/(dashboard)/inventory/page.tsx`
- Create: `components/admin/SquareChannelCard.tsx`
- Create: `components/admin/PinterestChannelCard.tsx`
- Create: `components/admin/ChannelsManager.tsx`
- Create: `app/admin/(dashboard)/channels/page.tsx`
- Modify: `components/admin/AdminSidebar.tsx`
- Modify: `components/admin/IntegrationsEditor.tsx`

Follow inline style pattern from `IntegrationsEditor.tsx`. All interactive elements min 48px.

- [ ] **Step 1: Create `components/admin/ProductForm.tsx`**

Client component. Props: `product?: Product` (undefined = create mode), `onSave: () => void`, `onCancel: () => void`.

Fields: name (text), description (textarea), price (number), category (select with all 6 options), stock_count (number), images (reuse existing `ImageUploader` with `bucket="products"`), is_active (checkbox/toggle), gallery_featured (checkbox), gallery_sort_order (number input, visible only when gallery_featured = true).

On submit: POST `/api/admin/inventory` or PATCH `/api/admin/inventory/${product.id}`. Call `onSave()` on success. Show inline error on failure.

- [ ] **Step 2: Create `components/admin/InventoryManager.tsx`**

Client component. Props: `initialProducts: Product[]`.

- Search input (debounced 300ms) + category filter buttons + active filter
- Table: thumbnail (40×40px), name, category, price, stock badge, gallery featured star, active toggle, Edit / Delete buttons
- "Add Product" button → renders `ProductForm` in a modal overlay (or inline expand)
- On edit/delete, refetch from `/api/admin/inventory` to stay fresh
- Sync status column: last sync result from `channel_sync_log`

- [ ] **Step 3: Create `app/admin/(dashboard)/inventory/page.tsx`**

```typescript
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import InventoryManager from '@/components/admin/InventoryManager'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Inventory' }

export default async function InventoryPage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')
  const supabase = createServiceRoleClient()
  const { data: products } = await supabase.from('products').select('*').order('created_at', { ascending: false })
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Inventory</h1>
      <InventoryManager initialProducts={products ?? []} />
    </div>
  )
}
```

- [ ] **Step 4: Create `components/admin/SquareChannelCard.tsx`**

Client component. Props: `status: { connected: boolean; enabled: boolean; locationId: string | null }`, `conflicts: Array<{ product_id: string; channel: string; error: string; products: { name: string } }>`, `recentErrors: Array<{ error: string; created_at: string }>`, `onRefresh: () => void`.

Shows:
- Square logo/heading, connected badge (green ✓ / red ✗)
- "Connect Square" button (links to `/api/admin/channels/square/connect`) if not connected
- Sync toggle (calls PATCH `/api/admin/channels` with `{ square_sync_enabled: bool }`)
- "Sync Now" button (calls POST `/api/admin/sync`)
- Conflict panel: if `conflicts.length > 0`, list affected product names with "Mark Reviewed" buttons (calls PATCH `/api/admin/channels` with `dismiss_conflict_product_id`)
- Error log: last 10 errors in an expandable list

- [ ] **Step 5: Create `components/admin/PinterestChannelCard.tsx`**

Similar structure to SquareChannelCard. Also includes:
- Pinterest catalog ID text input (save via PATCH `/api/admin/channels` with `{ pinterest_catalog_id }`)
- "Connect Pinterest" button (links to `/api/admin/channels/pinterest/connect`)

Plus static Etsy placeholder card (greyed out, `pointer-events: none`, "Coming soon — sync your products to Etsy").

- [ ] **Step 6: Create `components/admin/ChannelsManager.tsx`**

Client component. Fetches GET `/api/admin/channels` on mount. Passes status + refresh callback to `SquareChannelCard` and `PinterestChannelCard`.

- [ ] **Step 7: Create `app/admin/(dashboard)/channels/page.tsx`**

```typescript
import { requireAdminSession } from '@/lib/auth'
import ChannelsManager from '@/components/admin/ChannelsManager'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Channels' }

export default async function ChannelsPage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Channels</h1>
      <ChannelsManager />
    </div>
  )
}
```

- [ ] **Step 8: Update `components/admin/AdminSidebar.tsx`**

Add two imports from lucide-react and two entries to `NAV_ITEMS`:

```typescript
import { Package, Radio } from 'lucide-react'

// In NAV_ITEMS, add after the Gallery entry:
{ href: '/admin/inventory', label: 'Inventory', Icon: Package },

// Add after the Integrations entry:
{ href: '/admin/channels', label: 'Channels', Icon: Radio },
```

- [ ] **Step 9: Remove Square URL from `components/admin/IntegrationsEditor.tsx`**

Delete the entire `<Section title="Square Store">...</Section>` block and the associated state variables: `square`, `setSquare`, `squareSaved`, `setSquareSaved`.

- [ ] **Step 10: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 11: Commit**

```bash
git add components/admin/ app/admin/\(dashboard\)/inventory/ app/admin/\(dashboard\)/channels/
git commit -m "feat: admin Inventory and Channels sections with Square/Pinterest cards"
```

---

## Task 11: Shop API Routes + CSP Update

**Files:**
- Create: `app/api/shop/products/route.ts`
- Create: `app/api/shop/products/[id]/route.ts`
- Create: `app/api/shop/products/[id]/view/route.ts`
- Modify: `next.config.js`

- [ ] **Step 1: Create `app/api/shop/products/route.ts`**

Public route, no auth. Rate limited (100 req/IP/60s). Paginated 24/page.

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

const VALID_CATEGORIES = ['rings','necklaces','earrings','bracelets','crochet','other']
const VALID_SORTS = ['new','popular','price_asc','price_desc']
const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 100
}

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const sort = searchParams.get('sort') ?? 'new'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  if (!VALID_SORTS.includes(sort)) return NextResponse.json({ error: 'invalid sort' }, { status: 400 })
  const offset = (page - 1) * 24
  const supabase = createServiceRoleClient()
  let query = supabase.from('products').select('*', { count: 'exact' }).eq('is_active', true)
  if (category && VALID_CATEGORIES.includes(category)) query = query.eq('category', category)
  switch (sort) {
    case 'popular': query = query.order('view_count', { ascending: false }); break
    case 'price_asc': query = query.order('price', { ascending: true }); break
    case 'price_desc': query = query.order('price', { ascending: false }); break
    default: query = query.order('created_at', { ascending: false })
  }
  const { data, count, error } = await query.range(offset, offset + 23)
  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json({ products: data, total: count ?? 0, page, pageSize: 24 })
}
```

- [ ] **Step 2: Create `app/api/shop/products/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('products').select('*').eq('id', id).eq('is_active', true).single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create `app/api/shop/products/[id]/view/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceRoleClient()
  // Fetch current count then increment (fallback if RPC not available)
  const { data } = await supabase.from('products').select('view_count').eq('id', id).single()
  if (data) {
    await supabase.from('products').update({ view_count: (data.view_count ?? 0) + 1 }).eq('id', id)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Update `next.config.js` CSP and image domains**

Modify the CSP header value array:
- `script-src`: append `https://web.squarecdn.com https://sandbox.web.squarecdn.com https://assets.pinterest.com`
- `frame-src`: append `https://web.squarecdn.com https://sandbox.web.squarecdn.com`
- `img-src`: append `https://pinimg.com https://i.pinimg.com`
- `connect-src`: append `https://connect.squareup.com https://connect.squareupsandbox.com`

Add to `images.remotePatterns`:
```javascript
{ protocol: 'https', hostname: 'items-images-sandbox.s3.amazonaws.com' },
{ protocol: 'https', hostname: 'items-images.s3.amazonaws.com' },
```

- [ ] **Step 5: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 6: Commit**

```bash
git add app/api/shop/ next.config.js
git commit -m "feat: shop product API routes; update CSP for Square and Pinterest"
```

---

## Task 12: /shop Page + Product Grid UI

**Files:**
- Create: `app/(public)/shop/layout.tsx`
- Modify: `app/(public)/shop/page.tsx`
- Create: `components/shop/ProductCard.tsx`
- Create: `components/shop/CategoryFilter.tsx`
- Create: `components/shop/ProductGrid.tsx`

- [ ] **Step 1: Create `app/(public)/shop/layout.tsx`**

Note: CartProvider added in Task 14. For now, just the scripts:

```typescript
import Script from 'next/script'

const squareSrc = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://web.squarecdn.com/v1/square.js'
  : 'https://sandbox.web.squarecdn.com/v1/square.js'

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Script src={squareSrc} strategy="beforeInteractive" />
      <Script src="//assets.pinterest.com/js/pinit.js" strategy="lazyOnload" />
    </>
  )
}
```

- [ ] **Step 2: Create `components/shop/ProductCard.tsx`**

Client component. Props: `product: Product`, `showPrice?: boolean` (default true).

- `<Link href={'/shop/' + product.id}>` wrapping the whole card
- `<Image>` with square aspect ratio, first of `product.images` or grey placeholder div
- Product name (14px, `var(--color-primary)`, ellipsis overflow)
- Price (13px, `var(--color-text-muted)`) — only when `showPrice=true`
- "Sold out" badge if `stock_count === 0` (text, not colour-only)
- Pinterest Save button: `<a data-pin-do="buttonPin" data-pin-href="..." data-pin-media="..." style={{ pointerEvents: 'none' }}>Save</a>` — Pinterest SDK activates these on load
- Heart button: stub `<button aria-label="Save">♡</button>` — replaced with HeartButton in Task 16

- [ ] **Step 3: Create `components/shop/CategoryFilter.tsx`**

```typescript
'use client'
const CATEGORIES = ['All','rings','necklaces','earrings','bracelets','crochet','other'] as const

interface Props { active: string; onChange: (cat: string) => void }

export default function CategoryFilter({ active, onChange }: Props) {
  return (
    <div role="group" aria-label="Filter by category" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
      {CATEGORIES.map(cat => (
        <button
          key={cat}
          onClick={() => onChange(cat === 'All' ? '' : cat)}
          aria-pressed={active === (cat === 'All' ? '' : cat)}
          style={{
            padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '20px',
            background: active === (cat === 'All' ? '' : cat) ? 'var(--color-primary)' : 'transparent',
            color: active === (cat === 'All' ? '' : cat) ? 'var(--color-accent)' : 'var(--color-primary)',
            cursor: 'pointer', fontSize: '14px', minHeight: '48px', textTransform: 'capitalize',
          }}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create `components/shop/ProductGrid.tsx`**

Client component. Fetches `/api/shop/products` with category/sort/page params. Shows CategoryFilter, sort select, product grid, loading state, pagination, empty state.

- [ ] **Step 5: Rewrite `app/(public)/shop/page.tsx`**

```typescript
import ProductGrid from '@/components/shop/ProductGrid'

export const metadata = { title: 'Shop' }

export default function ShopPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>Shop</h1>
      <ProductGrid />
    </div>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 7: Commit**

```bash
git add app/\(public\)/shop/ components/shop/ProductCard.tsx components/shop/CategoryFilter.tsx components/shop/ProductGrid.tsx
git commit -m "feat: native shop page (replaces iframe), product grid, category filter"
```

---

## Task 13: /shop/[id] Product Detail Page

**Files:**
- Create: `components/shop/ImageCarousel.tsx`
- Create: `components/shop/ProductDetail.tsx`
- Create: `app/(public)/shop/[id]/page.tsx`

- [ ] **Step 1: Create `components/shop/ImageCarousel.tsx`**

Client component. Props: `images: string[]`, `alt: string`. Single image display, prev/next arrows (hidden if 1 image), dot indicators, keyboard arrow key support, `aria-label` on nav buttons.

- [ ] **Step 2: Create `components/shop/ProductDetail.tsx`**

Client component. Props: `product: Product`.
- `ImageCarousel`
- Name (display font, 28px), price, category badge, stock status text
- Description: render HTML using React's innerHTML escape hatch — **always pass through `sanitizeContent()` from `@/lib/sanitize` first** before rendering
- "Add to Cart" button (disabled when sold out) — calls `addToCart` from CartContext (Task 14)
- Heart stub + Pinterest Save button
- On mount: check `sessionStorage.getItem('viewed_' + product.id)` — if unset, POST to `/api/shop/products/${product.id}/view` and set the key
- Related products: fetch `/api/shop/products?category=${product.category}&sort=popular` on mount, show 4 cards

- [ ] **Step 3: Create `app/(public)/shop/[id]/page.tsx`**

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ProductDetail from '@/components/shop/ProductDetail'
import type { Metadata } from 'next'
import type { Product } from '@/lib/supabase/types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('products').select('name,description').eq('id', id).single()
  if (!data) return { title: 'Product Not Found' }
  return { title: data.name, description: data.description ?? undefined }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data: product } = await supabase.from('products').select('*').eq('id', id).eq('is_active', true).single()
  if (!product) notFound()
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '60px 24px' }}>
      <ProductDetail product={product as Product} />
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 5: Commit**

```bash
git add components/shop/ImageCarousel.tsx components/shop/ProductDetail.tsx app/\(public\)/shop/\[id\]/
git commit -m "feat: product detail page with carousel, view count, related products"
```

---

## Task 14: Cart

**Files:**
- Create: `components/shop/CartContext.tsx`
- Create: `components/shop/CartDrawer.tsx`
- Create: `components/shop/CartButton.tsx`
- Modify: `app/(public)/shop/layout.tsx`

- [ ] **Step 1: Create `components/shop/CartContext.tsx`**

```typescript
'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { Product } from '@/lib/supabase/types'

export interface CartItem { product: Product; quantity: number }

interface CartContextValue {
  items: CartItem[]
  addToCart: (product: Product) => void
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  total: number
  count: number
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    try { const s = localStorage.getItem('pac_cart'); if (s) setItems(JSON.parse(s)) } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem('pac_cart', JSON.stringify(items)) } catch {}
  }, [items])

  const addToCart = useCallback((product: Product) => {
    setItems(prev => {
      const ex = prev.find(i => i.product.id === product.id)
      return ex ? prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
                : [...prev, { product, quantity: 1 }]
    })
    setIsOpen(true)
  }, [])

  const removeFromCart = useCallback((productId: string) => setItems(prev => prev.filter(i => i.product.id !== productId)), [])

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) { removeFromCart(productId); return }
    setItems(prev => prev.map(i => i.product.id === productId ? { ...i, quantity } : i))
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

- [ ] **Step 2: Create `components/shop/CartDrawer.tsx`**

Client component. Uses `useCart()`. Focus-trapped on open (follows `ConfirmDialog` pattern from codebase — trap Tab within drawer, restore focus on close, Escape closes).

Props: none.

- Overlay backdrop (`position: fixed, inset: 0, background: rgba(0,0,0,0.4)`, click to close)
- Drawer panel sliding in from right (`position: fixed, top: 0, right: 0, width: 400px, height: 100vh`)
- `role="dialog"`, `aria-modal="true"`, `aria-label="Shopping cart"`
- Close button (×) at top right, `aria-label="Close cart"`
- Line items: 40px image thumbnail, name, `$xx.xx`, quantity adjuster (− qty +), remove ×
- Running total
- "Checkout" button → `router.push('/shop/checkout')` (or link to checkout page)
- Empty state: "Your cart is empty. Browse the shop →"

- [ ] **Step 3: Create `components/shop/CartButton.tsx`**

Client component. `ShoppingBag` icon from lucide-react. Count badge (`position: absolute, top: 0, right: 0`) when `count > 0`. Min 48px. Clicking calls `setIsOpen(true)`.

- [ ] **Step 4: Update `app/(public)/shop/layout.tsx`**

Wrap children in CartProvider; render CartDrawer:

```typescript
import Script from 'next/script'
import { CartProvider } from '@/components/shop/CartContext'
import CartDrawer from '@/components/shop/CartDrawer'

const squareSrc = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://web.squarecdn.com/v1/square.js'
  : 'https://sandbox.web.squarecdn.com/v1/square.js'

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {children}
      <CartDrawer />
      <Script src={squareSrc} strategy="beforeInteractive" />
      <Script src="//assets.pinterest.com/js/pinit.js" strategy="lazyOnload" />
    </CartProvider>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 6: Commit**

```bash
git add components/shop/CartContext.tsx components/shop/CartDrawer.tsx components/shop/CartButton.tsx app/\(public\)/shop/layout.tsx
git commit -m "feat: cart with localStorage persistence, accessible focus-trapped drawer"
```

---

## Task 15: Checkout API + CheckoutForm

**Files:**
- Create: `app/api/shop/checkout/route.ts`
- Create: `components/shop/CheckoutForm.tsx`
- Create: `app/(public)/shop/confirmation/[orderId]/page.tsx`
- Create: `__tests__/api/shop/checkout.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/shop/checkout.test.ts`:

```typescript
jest.mock('@/lib/channels/square/client', () => ({ getSquareClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      then: jest.fn().mockResolvedValue({ data: [{ id: 'p1', name: 'Ring', price: 45, stock_count: 2 }] }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: [{ id: 'p1' }] }),
  })),
}))

describe('POST /api/shop/checkout', () => {
  it('returns 400 with empty cart', async () => {
    const { POST } = await import('@/app/api/shop/checkout/route')
    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart: [], sourceId: 'tok_test' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 400 with missing sourceId', async () => {
    const { POST } = await import('@/app/api/shop/checkout/route')
    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart: [{ productId: 'p1', quantity: 1 }] }),
    })
    expect((await POST(req)).status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd .worktrees/square-storefront && npx jest __tests__/api/shop/checkout.test.ts --no-coverage
```

- [ ] **Step 3: Create `app/api/shop/checkout/route.ts`**

Key logic (charge before decrement — see spec section 7.4):

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSquareClient } from '@/lib/channels/square/client'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 10
}

interface LineItem { productId: string; quantity: number }

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const cart: LineItem[] = Array.isArray(body.cart) ? body.cart : []
  const sourceId: string = typeof body.sourceId === 'string' ? body.sourceId : ''
  if (!cart.length) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 })

  const supabase = createServiceRoleClient()

  // Step 1: Validate stock
  const { data: products } = await supabase
    .from('products').select('id,name,price,stock_count').in('id', cart.map(i => i.productId))
  if (!products) return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })
  for (const item of cart) {
    const p = products.find(p => p.id === item.productId)
    if (!p) return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 409 })
    if (p.stock_count < item.quantity) return NextResponse.json({ error: `${p.name} is sold out`, soldOut: item.productId }, { status: 409 })
  }

  // Steps 2 + 3: Create Square order then charge
  let orderId = ''
  let paymentId = ''
  try {
    const { client, locationId } = await getSquareClient()
    const totalCents = cart.reduce((sum, item) => {
      const p = products.find(p => p.id === item.productId)!
      return sum + Math.round(p.price * 100) * item.quantity
    }, 0)

    const { result: orderResult } = await client.ordersApi.createOrder({
      order: {
        locationId,
        lineItems: cart.map(item => {
          const p = products.find(p => p.id === item.productId)!
          return { name: p.name, quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round(p.price * 100)), currency: 'USD' } }
        }),
      },
      idempotencyKey: `order-${Date.now()}-${Math.random()}`,
    })
    orderId = orderResult.order?.id ?? ''

    const { result: paymentResult } = await client.paymentsApi.createPayment({
      sourceId, orderId, locationId,
      amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
      idempotencyKey: `pay-${Date.now()}-${Math.random()}`,
    })
    paymentId = paymentResult.payment?.id ?? ''
  } catch (err) {
    return NextResponse.json({ error: 'Payment failed', detail: String(err) }, { status: 402 })
  }

  // Step 4: Atomically decrement stock (charge already succeeded)
  for (const item of cart) {
    const { data: rows } = await supabase.rpc('decrement_stock', { product_id: item.productId, qty: item.quantity })
    // Step 5: If decrement returns nothing (race condition — item sold out between validation and charge)
    if (!rows || (Array.isArray(rows) && rows.length === 0)) {
      try {
        const { client } = await getSquareClient()
        await client.refundsApi.refundPayment({
          paymentId, idempotencyKey: `refund-${paymentId}`,
          amountMoney: { amount: BigInt(0), currency: 'USD' },
          reason: 'Item sold out during checkout',
        })
      } catch {}
      return NextResponse.json({ error: 'Item sold out — payment refunded', soldOut: item.productId }, { status: 409 })
    }
  }

  return NextResponse.json({ orderId, paymentId })
}
```

- [ ] **Step 4: Create `components/shop/CheckoutForm.tsx`**

Client component. Loads Square Web Payments SDK card fields. On pay click: tokenize (client-side), POST `{ cart, sourceId }` to `/api/shop/checkout`, redirect to `/shop/confirmation/${orderId}` on success.

```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
import { useCart } from './CartContext'
import { useRouter } from 'next/navigation'

// Square SDK types (loaded via CDN script)
interface SquareCard {
  attach: (selector: string) => Promise<void>
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

export default function CheckoutForm() {
  const { items, total, clearCart } = useCart()
  const router = useRouter()
  const cardRef = useRef<SquareCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sdkReady, setSdkReady] = useState(false)

  useEffect(() => {
    async function init() {
      if (!window.Square) { setTimeout(init, 500); return }
      const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? ''
      const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? ''
      const payments = await window.Square.payments(appId, locationId)
      const card = await payments.card()
      await card.attach('#square-card-container')
      cardRef.current = card
      setSdkReady(true)
    }
    init()
  }, [])

  async function handlePay() {
    if (!cardRef.current || !sdkReady) return
    setLoading(true); setError(null)
    try {
      const result = await cardRef.current.tokenize()
      if (result.status !== 'OK' || !result.token) {
        setError(result.errors?.[0]?.message ?? 'Card error — please try again')
        return
      }
      const res = await fetch('/api/shop/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart: items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
          sourceId: result.token,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Payment failed'); return }
      clearCart()
      router.push(`/shop/confirmation/${data.orderId}`)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '24px' }}>Checkout</h2>
      <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px' }}>
        {items.map(item => (
          <div key={item.product.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>{item.product.name} × {item.quantity}</span>
            <span>${(item.product.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
          <span>Total</span><span>${total.toFixed(2)}</span>
        </div>
      </div>
      <div id="square-card-container" style={{ marginBottom: '24px', minHeight: '89px' }} />
      {error && <p role="alert" style={{ color: '#c0392b', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
      <button
        onClick={handlePay}
        disabled={loading || !sdkReady}
        style={{ width: '100%', padding: '16px', background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', fontSize: '18px', cursor: loading ? 'not-allowed' : 'pointer', minHeight: '48px', opacity: (!sdkReady || loading) ? 0.7 : 1 }}
      >
        {loading ? 'Processing...' : `Pay $${total.toFixed(2)}`}
      </button>
    </div>
  )
}
```

Also create `app/(public)/shop/checkout/page.tsx`:

```typescript
'use client'
import CheckoutForm from '@/components/shop/CheckoutForm'
import { useCart } from '@/components/shop/CartContext'
import Link from 'next/link'

export default function CheckoutPage() {
  const { items } = useCart()
  if (!items.length) return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>Your cart is empty.</p>
      <Link href="/shop" style={{ color: 'var(--color-primary)' }}>Browse the shop →</Link>
    </div>
  )
  return <CheckoutForm />
}
```

- [ ] **Step 5: Create `app/(public)/shop/confirmation/[orderId]/page.tsx`**

```typescript
export default async function ConfirmationPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '24px' }}>Order Confirmed!</h1>
      <p style={{ fontSize: '18px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
        Thank you for your order. You&apos;ll receive a confirmation from Square shortly.
      </p>
      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '40px' }}>Order: {orderId}</p>
      <a href="/shop" style={{ display: 'inline-block', padding: '14px 32px', background: 'var(--color-primary)', color: 'var(--color-accent)', borderRadius: '4px', textDecoration: 'none', fontSize: '16px' }}>
        Continue Shopping
      </a>
    </div>
  )
}
```

- [ ] **Step 6: Run tests**

```bash
cd .worktrees/square-storefront && npx jest __tests__/api/shop/checkout.test.ts --no-coverage
```

Expected: 2/2 PASS

- [ ] **Step 7: Commit**

```bash
git add app/api/shop/checkout/ components/shop/CheckoutForm.tsx app/\(public\)/shop/checkout/ app/\(public\)/shop/confirmation/ __tests__/api/shop/checkout.test.ts
git commit -m "feat: checkout API (charge-first, atomic decrement), CheckoutForm, confirmation page"
```

---

## Task 16: Local Saves + /shop/saved

**Files:**
- Create: `components/shop/HeartButton.tsx`
- Create: `app/(public)/shop/saved/page.tsx`

- [ ] **Step 1: Create `components/shop/HeartButton.tsx`**

```typescript
'use client'
import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'

interface Props { productId: string; productName: string }

const STORAGE_KEY = 'pac_saved'
function getSaved(): string[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] } }
function setSaved(ids: string[]): void { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)) } catch {} }

export default function HeartButton({ productId, productName }: Props) {
  const [saved, setSavedState] = useState(false)

  useEffect(() => { setSavedState(getSaved().includes(productId)) }, [productId])

  function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const current = getSaved()
    const next = current.includes(productId) ? current.filter(id => id !== productId) : [...current, productId]
    setSaved(next); setSavedState(next.includes(productId))
    window.dispatchEvent(new Event('pac_saved_changed'))
  }

  return (
    <button
      onClick={toggle}
      aria-label={saved ? `Remove ${productName} from saved items` : `Save ${productName}`}
      aria-pressed={saved}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', minHeight: '48px', minWidth: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: saved ? '#e63946' : 'var(--color-text-muted)' }}
    >
      <Heart size={20} fill={saved ? '#e63946' : 'none'} stroke={saved ? '#e63946' : 'currentColor'} />
    </button>
  )
}
```

- [ ] **Step 2: Replace heart stubs in `ProductCard.tsx` and `ProductDetail.tsx`** with `import HeartButton from '@/components/shop/HeartButton'` (dynamic import with `ssr: false` to avoid hydration mismatch).

- [ ] **Step 3: Create `app/(public)/shop/saved/page.tsx`**

Client component. Reads saved IDs from localStorage, fetches each product, renders grid.

```typescript
'use client'
import { useEffect, useState } from 'react'
import type { Product } from '@/lib/supabase/types'
import ProductCard from '@/components/shop/ProductCard'
import Link from 'next/link'

export default function SavedPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const ids: string[] = JSON.parse(localStorage.getItem('pac_saved') ?? '[]')
        if (!ids.length) { setLoading(false); return }
        const results = await Promise.all(ids.map(id => fetch(`/api/shop/products/${id}`).then(r => r.ok ? r.json() : null)))
        setProducts(results.filter(Boolean) as Product[])
      } catch {}
      setLoading(false)
    }
    load()
    window.addEventListener('pac_saved_changed', load)
    return () => window.removeEventListener('pac_saved_changed', load)
  }, [])

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading...</div>

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>Saved Items</h1>
      {products.length === 0 ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '18px', marginBottom: '24px' }}>No saved items yet.</p>
          <Link href="/shop" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Browse the shop →</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '32px' }}>
          {products.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 5: Commit**

```bash
git add components/shop/HeartButton.tsx app/\(public\)/shop/saved/
git commit -m "feat: heart button (localStorage saves) and /shop/saved page"
```

---

## Task 17: Homepage — Gallery Scroller + Featured Grid Update

**Files:**
- Create: `components/home/GalleryScroller.tsx`
- Modify: `app/page.tsx`
- Modify: `components/modern/ModernFeaturedGrid.tsx` (check actual filename in `components/modern/`)

- [ ] **Step 1: Create `components/home/GalleryScroller.tsx`**

Server component. Fetches gallery-featured products (by `gallery_sort_order`) then fills remaining slots with behavioral ranking (`view_count` desc). Renders a grid of product image cards, each linking to `/shop/[id]`, showing name + price. Last slot (or below the grid) is a "See everything →" CTA to `/shop`.

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import type { Product } from '@/lib/supabase/types'

export default async function GalleryScroller() {
  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase.from('settings').select('gallery_max_items').single()
  const maxItems = settings?.gallery_max_items ?? 8

  const { data: featured } = await supabase
    .from('products').select('*').eq('is_active', true).eq('gallery_featured', true)
    .order('gallery_sort_order', { ascending: true }).limit(maxItems)

  const featuredIds = (featured ?? []).map((p: Product) => p.id)
  const remaining = maxItems - featuredIds.length

  let filler: Product[] = []
  if (remaining > 0 && featuredIds.length > 0) {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).eq('gallery_featured', false)
      .not('id', 'in', `(${featuredIds.join(',')})`)
      .order('view_count', { ascending: false }).limit(remaining)
    filler = (data ?? []) as Product[]
  } else if (remaining > 0) {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).eq('gallery_featured', false)
      .order('view_count', { ascending: false }).limit(remaining)
    filler = (data ?? []) as Product[]
  }

  const items = [...(featured ?? []), ...filler] as Product[]
  if (!items.length) return null

  return (
    <section aria-label="Explore the collection" style={{ padding: '60px 0', background: 'var(--color-surface)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--color-primary)', marginBottom: '32px', textAlign: 'center' }}>
          Explore the Collection
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          {items.map(product => (
            <Link key={product.id} href={`/shop/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <figure style={{ margin: 0, background: 'var(--color-bg)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
                  {product.images[0] ? (
                    <Image src={product.images[0]} alt={product.name} fill style={{ objectFit: 'cover' }} sizes="(max-width: 640px) 50vw, 200px" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>No image</div>
                  )}
                </div>
                <figcaption style={{ padding: '12px' }}>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-primary)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>${product.price.toFixed(2)}</p>
                </figcaption>
              </figure>
            </Link>
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <Link href="/shop" style={{ display: 'inline-block', padding: '14px 32px', background: 'var(--color-primary)', color: 'var(--color-accent)', borderRadius: '4px', textDecoration: 'none', fontSize: '16px' }}>
            See everything →
          </Link>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Update `app/page.tsx`**

Three changes:
1. Replace `gallery` featured query with `products` query:
```typescript
// Old:
supabase.from('gallery').select('*').eq('is_featured', true).order('sort_order').then(...)
// New:
supabase.from('products').select('*').eq('is_active', true).eq('gallery_featured', true).order('gallery_sort_order').limit(4).then(r => r.data ?? []),
```

2. Update item mapping for `ModernFeaturedGrid`:
```typescript
.map((p: Product) => ({ id: p.id, image_url: p.images[0] ?? '', title: p.name, description: null }))
```

3. Import and insert `<GalleryScroller />` between `<ModernFeaturedGrid ... />` and `<ModernStorySection ... />`.

4. Remove `squareStoreUrl` from `ModernFeaturedGrid` props (pass `null` or remove if optional).

- [ ] **Step 3: Update `components/modern/ModernFeaturedGrid.tsx`**

Find the file in `components/modern/`. Update it to:
- Link each card to `/shop/${item.id}` instead of using `squareStoreUrl`
- **Remove any price display** — Featured Pieces layer is editorial, no prices shown (spec section 6)

- [ ] **Step 4: Run tests**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

- [ ] **Step 5: Commit**

```bash
git add components/home/GalleryScroller.tsx app/page.tsx components/modern/
git commit -m "feat: gallery scroller on homepage; update featured grid to use products table"
```

---

## Task 18: Featured Products Migration + Final Cleanup

**Files:**
- Create: `supabase/migrations/016_migrate_featured_products.sql`

- [ ] **Step 1: Write migration**

```sql
-- Seed products from featured_products (only if products table is empty)
INSERT INTO products (name, description, price, category, images, is_active, gallery_featured, gallery_sort_order)
SELECT
  name,
  description,
  COALESCE(price, 0),
  'other',
  CASE WHEN image_url IS NOT NULL AND image_url != '' THEN ARRAY[image_url] ELSE '{}' END,
  true,
  true,
  sort_order
FROM featured_products
WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1)
  AND name IS NOT NULL AND name != '';
```

- [ ] **Step 2: Full test run**

```bash
cd .worktrees/square-storefront && bash scripts/test.sh
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_migrate_featured_products.sql
git commit -m "feat: seed products table from featured_products on first run"
```

---

## Final Checklist Before Review

- [ ] All tests pass: `bash scripts/test.sh`
- [ ] `OAUTH_ENCRYPTION_KEY` documented as 64 hex chars (32 bytes): generate with `node -e "require('crypto').randomBytes(32).toString('hex')"`
- [ ] `NEXT_PUBLIC_SQUARE_APPLICATION_ID` and `NEXT_PUBLIC_SQUARE_LOCATION_ID` added to env docs
- [ ] `vercel.json` cron correctly defined at `0 3 * * *`
- [ ] CSP in `next.config.js` includes Square SDK and Pinterest domains
- [ ] Square Store URL section removed from `IntegrationsEditor`
- [ ] AdminSidebar has Inventory + Channels nav items
- [ ] `/shop` renders `ProductGrid` (no iframe)
- [ ] Cart persists to `localStorage` key `pac_cart`
- [ ] Checkout: Square charge happens before `decrement_stock` RPC call
- [ ] `decrement_stock` SQL function is in migration 015
- [ ] HeartButton uses `aria-label` with product name, `aria-pressed` attribute
- [ ] Cart drawer is focus-trapped, `role="dialog"`, `aria-modal="true"`
- [ ] Description HTML goes through `sanitizeContent()` before rendering
- [ ] `ModernFeaturedGrid` cards do not show prices
- [ ] `GalleryScroller` cards show prices
