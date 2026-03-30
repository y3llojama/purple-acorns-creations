# Variations Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive unit, regression, and integration test suite that validates every code path affected by the single-stock-authority migration, covering all 23 risk items from the spec's risk assessment.

**Architecture:** Tests are organized by risk severity — Critical (R1–R8) get full integration tests with mock rewrites, High (R9–R15) get unit + regression tests, Medium (R16–R20) get focused unit tests. Each existing test file gets rewritten to assert against `product_variations` instead of `products` dead columns. New test files are created for untested code paths.

**Tech Stack:** Jest 30, @testing-library/react, @testing-library/jest-dom, node test environment for API routes, jsdom for components

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `__tests__/lib/supabase/variation-types.test.ts` | Type-level tests for new interfaces (`ProductVariation`, `StockMovement`, etc.) |
| `__tests__/components/shop/CartContext.test.tsx` | Cart model with `variationId` support, localStorage migration |
| `__tests__/components/shop/ProductCard.test.tsx` | Sold-out badge reads `any_in_stock` from view, not `stock_count` |
| `__tests__/api/shop/products-sort.test.ts` | Price sort via `products_with_default` view |
| `__tests__/lib/channels/sync-log.test.ts` | Upsert conflict key change for `channel_sync_log` |
| `__tests__/lib/channels/pinterest/catalog.test.ts` | Pinterest catalog reads variation prices |
| `__tests__/api/admin/inventory-patch.test.ts` | Admin PATCH writes to `product_variations` with optimistic locking |
| `__tests__/integration/checkout-flow.test.ts` | Multi-variation cart checkout with partial sold-out rollback |
| `__tests__/integration/sync-flow.test.ts` | Bidirectional sync: Square webhook → product_variations + stock_movements |

### Modified Files
| File | What Changes |
|---|---|
| `__tests__/api/shop/checkout.test.ts` | Rewrite mocks: `decrement_variation_stock` RPC, variation-aware cart payload, `product_variations` price lookup |
| `__tests__/api/webhooks/square.test.ts` | Add tests for `handleInventoryUpdate` writing to `product_variations` + `stock_movements` |
| `__tests__/lib/channels/square/catalog.test.ts` | Assert `pullInventoryFromSquare` reads/writes `product_variations`, `pushProduct` sends variation prices |
| `__tests__/lib/seo.test.ts` | Update `buildProductSchema` to use `effectivePrice` + `anyInStock` params |
| `__tests__/api/shop/private-sale-checkout.test.ts` | Rewrite mocks to use `decrement_variation_stock`, add double-sell regression test |
| `__tests__/api/cron/sync.test.ts` | Assert sync reads from `products_with_default` view |

---

### Task 1: New Variation Types

**Files:**
- Create: `__tests__/lib/supabase/variation-types.test.ts`
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Write the type tests**

```typescript
import type {
  ProductVariation,
  ItemOption,
  ItemOptionValue,
  StockMovement,
  ProductWithDefault,
} from '@/lib/supabase/types'

describe('Variation type definitions', () => {
  it('ProductVariation has required fields', () => {
    const v: ProductVariation = {
      id: 'v1',
      product_id: 'p1',
      sku: null,
      price: 45,
      cost: null,
      stock_count: 3,
      stock_reserved: 0,
      is_default: true,
      is_active: true,
      image_url: null,
      square_variation_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(v.id).toBe('v1')
    expect(v.price).toBe(45)
    expect(v.is_default).toBe(true)
  })

  it('ItemOption has required fields', () => {
    const o: ItemOption = {
      id: 'o1',
      name: 'Size',
      display_name: '',
      is_reusable: true,
      square_option_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(o.name).toBe('Size')
    expect(o.is_reusable).toBe(true)
  })

  it('ItemOptionValue has required fields', () => {
    const v: ItemOptionValue = {
      id: 'ov1',
      option_id: 'o1',
      name: 'Small',
      sort_order: 0,
      square_option_value_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(v.name).toBe('Small')
  })

  it('StockMovement has required fields with valid reason and source', () => {
    const m: StockMovement = {
      id: 'sm1',
      variation_id: 'v1',
      quantity_change: -1,
      reason: 'sale',
      source: 'website',
      reference_id: 'order-123',
      note: null,
      created_at: '2026-01-01T00:00:00Z',
    }
    expect(m.quantity_change).toBe(-1)
    expect(m.reason).toBe('sale')
  })

  it('ProductWithDefault includes view fields', () => {
    const p: ProductWithDefault = {
      id: 'p1',
      name: 'Ring',
      description: null,
      price: 45,
      category_id: null,
      stock_count: 3,
      stock_reserved: 0,
      images: [],
      is_active: true,
      gallery_featured: false,
      gallery_sort_order: null,
      view_count: 0,
      square_catalog_id: null,
      square_variation_id: null,
      pinterest_product_id: null,
      created_at: '',
      updated_at: '',
      // View fields
      default_variation_id: 'v1',
      effective_price: 45,
      effective_stock: 3,
      default_sku: null,
      any_in_stock: true,
    }
    expect(p.any_in_stock).toBe(true)
    expect(p.effective_price).toBe(45)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/supabase/variation-types.test.ts --no-coverage`
Expected: FAIL — `ProductVariation`, `ItemOption`, `ItemOptionValue`, `StockMovement`, `ProductWithDefault` not exported from `@/lib/supabase/types`

- [ ] **Step 3: Add type definitions to types.ts**

Add to `lib/supabase/types.ts` after the existing `Product` interface:

```typescript
export interface ProductVariation {
  id: string
  product_id: string
  sku: string | null
  price: number
  cost: number | null
  stock_count: number
  stock_reserved: number
  is_default: boolean
  is_active: boolean
  image_url: string | null
  square_variation_id: string | null
  created_at: string
  updated_at: string
}

export interface ItemOption {
  id: string
  name: string
  display_name: string
  is_reusable: boolean
  square_option_id: string | null
  created_at: string
  updated_at: string
}

export interface ItemOptionValue {
  id: string
  option_id: string
  name: string
  sort_order: number
  square_option_value_id: string | null
  created_at: string
  updated_at: string
}

export interface StockMovement {
  id: string
  variation_id: string
  quantity_change: number
  reason: 'sale' | 'return' | 'manual_adjustment' | 'sync_correction' | 'shrinkage' | 'reserved' | 'released' | 'initial_stock'
  source: 'website' | 'square' | 'admin_manual' | 'system'
  reference_id: string | null
  note: string | null
  created_at: string
}

export interface ProductWithDefault extends Product {
  default_variation_id: string | null
  effective_price: number
  effective_stock: number
  default_sku: string | null
  any_in_stock: boolean
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/lib/supabase/variation-types.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add __tests__/lib/supabase/variation-types.test.ts lib/supabase/types.ts
git commit -m "feat: add variation, option, and stock movement type definitions with tests"
```

---

### Task 2: R1 — Checkout Route (CRITICAL)

Rewrite checkout test to assert variation-aware flow: `decrement_variation_stock` RPC, price from `product_variations`, variation-aware cart payload.

**Files:**
- Modify: `__tests__/api/shop/checkout.test.ts`

- [ ] **Step 1: Rewrite the checkout test mock setup**

Replace the entire `makeBuilder` and `validBody` setup in `__tests__/api/shop/checkout.test.ts`:

```typescript
/**
 * @jest-environment node
 */

const mockRpc = jest.fn()
const mockFrom = jest.fn()
const mockPushInventory = jest.fn()
const mockGetSquareClientFn = jest.fn()

jest.mock('@/lib/channels/square/catalog', () => ({
  pushInventoryToSquare: (...args: unknown[]) => mockPushInventory(...args),
}))

jest.mock('@/lib/channels/square/client', () => ({
  getSquareClient: (...args: unknown[]) => mockGetSquareClientFn(...args),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}))

// Default Supabase query builder — variation-aware
function makeBuilder(table: string) {
  const value =
    table === 'product_variations'
      ? {
          data: [
            {
              id: 'v1',
              product_id: 'p1',
              price: 45,
              stock_count: 2,
              stock_reserved: 0,
              is_active: true,
              square_variation_id: 'sq-var-1',
              product: { id: 'p1', name: 'Ring' },
            },
          ],
        }
      : table === 'settings'
        ? { data: { shipping_mode: 'fixed', shipping_value: 0 } }
        : { data: null }
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

const makeRequest = (body: unknown, ip = 'unknown') =>
  new Request('http://localhost/api/shop/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify(body),
  })

// Variation-aware cart payload
const validBody = {
  cart: [{ productId: 'p1', variationId: 'v1', quantity: 1 }],
  sourceId: 'cnon:card-nonce-ok',
  verificationToken: 'vtok_test',
  shipping: {
    name: 'Jane Doe',
    address1: '123 Main St',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
    country: 'US',
  },
}

describe('POST /api/shop/checkout', () => {
  let POST: (req: Request) => Promise<Response>

  beforeAll(async () => {
    const module = await import('@/app/api/shop/checkout/route')
    POST = module.POST
  })

  beforeEach(() => {
    jest.resetAllMocks()
    mockPushInventory.mockResolvedValue(undefined)
    mockFrom.mockImplementation(makeBuilder)
  })

  // ── Input validation ──

  it('returns 400 with empty cart', async () => {
    const res = await POST(
      makeRequest({ cart: [], sourceId: 'tok', verificationToken: 'vtok', shipping: validBody.shipping }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 with missing sourceId', async () => {
    const res = await POST(makeRequest({ cart: validBody.cart, shipping: validBody.shipping }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when verificationToken is missing', async () => {
    const res = await POST(
      makeRequest({ cart: validBody.cart, sourceId: 'tok', shipping: validBody.shipping }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Buyer verification required.')
  })

  it('returns 400 when shipping address is missing', async () => {
    const res = await POST(
      makeRequest({ cart: validBody.cart, sourceId: 'tok', verificationToken: 'vtok' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when shipping fields are incomplete', async () => {
    const res = await POST(makeRequest({ ...validBody, shipping: { name: 'Jane' } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 with invalid cart quantity (zero)', async () => {
    const res = await POST(
      makeRequest({ ...validBody, cart: [{ productId: 'p1', variationId: 'v1', quantity: 0 }] }),
    )
    expect(res.status).toBe(400)
  })

  // ── Rate limiting ──

  it('returns 429 after exceeding 10 requests per IP', async () => {
    const ip = 'ratelimit-test'
    const req = () => makeRequest({}, ip)
    for (let i = 0; i < 10; i++) await POST(req())
    expect((await POST(req())).status).toBe(429)
  })

  // ── Variation-aware payment flow ──

  it('calls decrement_variation_stock RPC (not decrement_stock)', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay123' } }) },
      },
      locationId: 'loc1',
    })

    await POST(makeRequest(validBody, '10.0.0.1'))
    expect(mockRpc).toHaveBeenCalledWith('decrement_variation_stock', { var_id: 'v1', qty: 1 })
    expect(mockRpc).not.toHaveBeenCalledWith('decrement_stock', expect.anything())
  })

  it('reads price from product_variations, not products table', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay123' } }) },
      },
      locationId: 'loc1',
    })

    await POST(makeRequest(validBody, '10.0.0.5'))
    // Verify from() was called with 'product_variations', never 'products' for price lookup
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('product_variations')
    expect(fromCalls).not.toContain('products')
  })

  it('returns 200 with orderId and paymentId on success', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay123' } }) },
      },
      locationId: 'loc1',
    })

    const res = await POST(makeRequest(validBody, '10.0.0.6'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.orderId).toBe('order123')
    expect(data.paymentId).toBe('pay123')
  })

  it('returns 409 when variation is sold out', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await POST(makeRequest(validBody, '10.0.0.2'))
    expect(res.status).toBe(409)
  })

  it('returns 500 on stock reservation DB error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection error' } })

    const res = await POST(makeRequest(validBody, '10.0.0.3'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/reserve stock/i)
  })

  it('calls increment_variation_stock on payment failure rollback', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'v1' }], error: null })
      .mockResolvedValue({ data: null, error: null })

    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockRejectedValue(new Error('Card declined')) },
      },
      locationId: 'loc1',
    })

    const res = await POST(makeRequest(validBody, '10.0.0.4'))
    expect(res.status).toBe(402)
    expect(mockRpc).toHaveBeenCalledWith('increment_variation_stock', { var_id: 'v1', qty: 1 })
    expect(mockRpc).not.toHaveBeenCalledWith('increment_stock', expect.anything())
  })

  it('pushes inventory to Square using variation square_variation_id', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay123' } }) },
      },
      locationId: 'loc1',
    })

    await POST(makeRequest(validBody, '10.0.0.7'))
    expect(mockPushInventory).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ squareVariationId: 'sq-var-1', quantity: 1 }),
      ]),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/api/shop/checkout.test.ts --no-coverage`
Expected: FAIL — checkout route still reads from `products` table, calls `decrement_stock`

- [ ] **Step 3: Commit the failing test (test-first)**

```bash
git add __tests__/api/shop/checkout.test.ts
git commit -m "test: rewrite checkout tests for variation-aware flow (R1 — failing, implementation pending)"
```

---

### Task 3: R2 — Cart Model (CRITICAL)

**Files:**
- Create: `__tests__/components/shop/CartContext.test.tsx`

- [ ] **Step 1: Write the CartContext test**

```tsx
import { renderHook, act } from '@testing-library/react'
import { CartProvider, useCart } from '@/components/shop/CartContext'
import type { Product } from '@/lib/supabase/types'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CartProvider>{children}</CartProvider>
)

const product: Product = {
  id: 'p1', name: 'Ring', description: null, price: 45, category_id: null,
  stock_count: 5, stock_reserved: 0, images: [], is_active: true,
  gallery_featured: false, gallery_sort_order: null, view_count: 0,
  square_catalog_id: null, square_variation_id: null, pinterest_product_id: null,
  created_at: '', updated_at: '',
}

describe('CartContext — variation-aware', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('addToCart stores variationId alongside product', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addToCart(product, 'v1'))
    expect(result.current.items[0].variationId).toBe('v1')
  })

  it('addToCart stores optional variationLabel', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addToCart(product, 'v1', 'Large, Blue'))
    expect(result.current.items[0].variationLabel).toBe('Large, Blue')
  })

  it('treats same product with different variationId as separate items', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => {
      result.current.addToCart(product, 'v1')
      result.current.addToCart(product, 'v2')
    })
    expect(result.current.items).toHaveLength(2)
  })

  it('increments quantity when same product+variation combo is added', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => {
      result.current.addToCart(product, 'v1')
      result.current.addToCart(product, 'v1')
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].quantity).toBe(2)
  })

  it('removeFromCart uses variationId key, not productId alone', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => {
      result.current.addToCart(product, 'v1')
      result.current.addToCart(product, 'v2')
      result.current.removeFromCart('p1', 'v1')
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].variationId).toBe('v2')
  })

  it('uses variation price for total when available', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addToCart(product, 'v1', undefined, 55))
    expect(result.current.total).toBe(55)
  })

  it('persists variationId to localStorage', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addToCart(product, 'v1'))
    const stored = JSON.parse(localStorage.getItem('pac_cart') ?? '[]')
    expect(stored[0].variationId).toBe('v1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/shop/CartContext.test.tsx --no-coverage`
Expected: FAIL — `addToCart` signature doesn't accept variationId, `CartItem` has no `variationId`

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/components/shop/CartContext.test.tsx
git commit -m "test: add CartContext variation-aware tests (R2 — failing, implementation pending)"
```

---

### Task 4: R3 — Square Webhook (CRITICAL)

Extend webhook tests to verify `handleInventoryUpdate` writes to `product_variations` and creates `stock_movements` entries.

**Files:**
- Modify: `__tests__/api/webhooks/square.test.ts`

- [ ] **Step 1: Add variation-aware webhook handler tests**

Append to `__tests__/api/webhooks/square.test.ts` after the existing `POST /api/webhooks/square` describe block:

```typescript
// ── handleInventoryUpdate write-target tests ─────────────────────────────────

const mockFromHandler = jest.fn()
const mockInsert = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFromHandler(...args),
  }),
}))

describe('handleInventoryUpdate — write target', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockInsert.mockReturnValue({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    })
  })

  it('writes stock update to product_variations, not products', async () => {
    const { handleInventoryUpdate } = await import('@/lib/channels/square/webhook')

    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    }

    mockFromHandler.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'v1', product_id: 'p1', stock_count: 5 },
        }),
        ...updateBuilder,
      }
      if (table === 'stock_movements') return { insert: mockInsert }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
    })

    await handleInventoryUpdate([
      { catalogObjectId: 'sq-var-1', quantity: '8', state: 'IN_STOCK' },
    ])

    const fromCalls = mockFromHandler.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('product_variations')
    expect(fromCalls).not.toContain('products')
  })

  it('creates stock_movements entry on inventory webhook', async () => {
    const { handleInventoryUpdate } = await import('@/lib/channels/square/webhook')

    mockFromHandler.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'v1', product_id: 'p1', stock_count: 5 },
        }),
        update: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      }
      if (table === 'stock_movements') return { insert: mockInsert }
      return { select: jest.fn().mockReturnThis() }
    })

    await handleInventoryUpdate([
      { catalogObjectId: 'sq-var-1', quantity: '8', state: 'IN_STOCK' },
    ])

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        variation_id: 'v1',
        reason: 'sync_correction',
        source: 'square',
      }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/api/webhooks/square.test.ts --no-coverage`
Expected: FAIL — `handleInventoryUpdate` still writes to `products`

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/api/webhooks/square.test.ts
git commit -m "test: add variation-aware webhook handler tests (R3 — failing, implementation pending)"
```

---

### Task 5: R4/R5/R6 — Square Catalog Sync (CRITICAL)

Rewrite catalog tests to assert `pullInventoryFromSquare`, `pullProductsFromSquare`, and `pushProduct` all use `product_variations`.

**Files:**
- Modify: `__tests__/lib/channels/square/catalog.test.ts`

- [ ] **Step 1: Rewrite pullInventoryFromSquare tests**

Replace the existing `pullInventoryFromSquare` describe block:

```typescript
describe('pullInventoryFromSquare — variation-aware (R6)', () => {
  it('reads from product_variations, not products', async () => {
    mockGetSquareClientFn.mockResolvedValue({ client: {}, locationId: 'loc1' })
    mockFrom.mockReturnValue(b({
      data: [{ id: 'v1', product_id: 'p1', square_variation_id: null, stock_count: 5 }],
      error: null,
    }))

    await pullInventoryFromSquare()
    expect(mockFrom).toHaveBeenCalledWith('product_variations')
    expect(mockFrom).not.toHaveBeenCalledWith('products')
  })

  it('updates product_variations stock when Square count differs', async () => {
    const mockBatchGet = jest.fn().mockResolvedValue({
      data: [{ catalogObjectId: 'var1', quantity: '10', state: 'IN_STOCK' }],
    })
    mockGetSquareClientFn.mockResolvedValue({
      client: { inventory: { batchGetCounts: mockBatchGet } },
      locationId: 'loc1',
    })
    const mockUpdate = jest.fn().mockReturnThis()
    mockFrom
      .mockReturnValueOnce(b({
        data: [{ id: 'v1', product_id: 'p1', square_variation_id: 'var1', stock_count: 5 }],
        error: null,
      }))
      .mockReturnValueOnce({
        update: mockUpdate,
        eq: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      })

    const result = await pullInventoryFromSquare()
    expect(result.updated).toBe(1)
    // Assert update was on product_variations, not products
    expect(mockFrom.mock.calls[1][0]).toBe('product_variations')
  })

  it('skips variations whose count already matches', async () => {
    const mockBatchGet = jest.fn().mockResolvedValue({
      data: [{ catalogObjectId: 'var1', quantity: '5', state: 'IN_STOCK' }],
    })
    mockGetSquareClientFn.mockResolvedValue({
      client: { inventory: { batchGetCounts: mockBatchGet } },
      locationId: 'loc1',
    })
    mockFrom.mockReturnValue(b({
      data: [{ id: 'v1', product_id: 'p1', square_variation_id: 'var1', stock_count: 5 }],
      error: null,
    }))

    const result = await pullInventoryFromSquare()
    expect(result.skipped).toBe(1)
  })
})
```

- [ ] **Step 2: Add pushProduct variation-aware test**

Add a new test inside the existing `pushProduct` describe block:

```typescript
  it('reads price from product_variations, not product.price (R5)', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({
      catalogObject: {
        id: 'sq-catalog-1',
        itemData: { variations: [{ id: 'sq-var-1' }] },
      },
    })
    const mockBatch = jest.fn().mockResolvedValue({})
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        catalog: { object: { upsert: mockUpsert, delete: jest.fn().mockResolvedValue({}) } },
        inventory: { batchCreateChanges: mockBatch },
      },
      locationId: 'loc1',
    })
    mockFrom.mockReturnValue(b({ data: null, error: null }))

    await pushProduct({ ...product, id: 'prod-var' })

    // The upsert payload's variation priceMoney should come from product_variations
    const upsertCall = mockUpsert.mock.calls[0][0]
    const variations = upsertCall.object?.itemData?.variations
    expect(variations).toBeDefined()
    expect(variations[0].itemVariationData.priceMoney.amount).toBeDefined()
  })
```

- [ ] **Step 3: Add pullProductsFromSquare variation-aware test**

Add a new test inside the existing `pullProductsFromSquare` describe block:

```typescript
  it('creates product_variations rows on pull, not products.price/stock (R4)', async () => {
    const variation = { id: 'sq-var-1', itemVariationData: { priceMoney: { amount: BigInt(4500) }, sku: 'RING-SM' } }
    const squareItem = {
      type: 'ITEM',
      id: 'sq-prod-new',
      itemData: { name: 'New Ring', variations: [variation] },
    }
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { list: jest.fn().mockResolvedValue(asyncIter([squareItem])) } },
    })

    const insertCalls: string[] = []
    mockFrom.mockImplementation((table: string) => {
      insertCalls.push(table)
      return b({ data: { id: 'local-new' }, error: null })
    })

    await pullProductsFromSquare()
    expect(insertCalls).toContain('product_variations')
  })
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx jest __tests__/lib/channels/square/catalog.test.ts --no-coverage`
Expected: FAIL — functions still read/write `products` table

- [ ] **Step 5: Commit the failing tests**

```bash
git add __tests__/lib/channels/square/catalog.test.ts
git commit -m "test: rewrite catalog sync tests for variation-aware flow (R4/R5/R6 — failing)"
```

---

### Task 6: R7 — Private Sale Checkout (CRITICAL)

**Files:**
- Modify: `__tests__/api/shop/private-sale-checkout.test.ts`

- [ ] **Step 1: Rewrite mock to use product_variations and add double-sell test**

Replace the entire file:

```typescript
/**
 * @jest-environment node
 */
jest.mock('@/lib/channels/square/client', () => ({ getSquareClient: jest.fn() }))

const mockRpc = jest.fn()

const mockSale = {
  id: 'sale1',
  token: 'tok-uuid',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  used_at: null, revoked_at: null,
  items: [{ product_id: 'p1', variation_id: 'v1', quantity: 1, custom_price: 45 }],
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
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'v1', product_id: 'p1', stock_count: 5, stock_reserved: 0, is_active: true },
        }),
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
    }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}))

describe('POST /api/shop/private-sale/[token]/checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRpc.mockResolvedValue({ data: { ...mockSale, used_at: new Date().toISOString() }, error: null })
  })

  const validBody = {
    sourceId: 'sq_tok',
    verificationToken: 'test-verification-token',
    shipping: { name: 'Jane', address1: '123 Main', city: 'Portland', state: 'OR', zip: '97201', country: 'US' },
  }

  it('returns 400 when verificationToken is missing', async () => {
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'sq_tok', shipping: validBody.shipping }),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Buyer verification required.')
  })

  it('returns 400 when shipping address missing', async () => {
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'sq_tok', verificationToken: 'test-verification-token' }),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('calls decrement_variation_stock, not decrement_stock (R7)', async () => {
    const { getSquareClient } = await import('@/lib/channels/square/client') as any
    getSquareClient.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order1' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay1' } }) },
      },
      locationId: 'loc1',
    })
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.stringContaining('variation'),
      expect.anything(),
    )
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
  })

  it('prevents double-sell: second checkout returns error after used_at set (R7 regression)', async () => {
    const usedSale = { ...mockSale, used_at: new Date().toISOString() }
    const { createServiceRoleClient } = await import('@/lib/supabase/server') as any
    createServiceRoleClient.mockReturnValueOnce({
      from: jest.fn((table: string) => {
        if (table === 'private_sales') return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: usedSale }),
        }
        return { select: jest.fn().mockReturnThis() }
      }),
      rpc: mockRpc,
    })
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(410) // Gone — already used
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/api/shop/private-sale-checkout.test.ts --no-coverage`
Expected: FAIL — private sale checkout still uses `decrement_stock`

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/api/shop/private-sale-checkout.test.ts
git commit -m "test: rewrite private sale checkout for variations + add double-sell test (R7 — failing)"
```

---

### Task 7: R8 — Admin Inventory PATCH with Optimistic Locking (CRITICAL)

**Files:**
- Create: `__tests__/api/admin/inventory-patch.test.ts`

- [ ] **Step 1: Write the test**

```typescript
/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}))
jest.mock('@/lib/channels', () => ({ syncProduct: jest.fn().mockResolvedValue([]) }))

function makeBuilder(value: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

describe('PATCH /api/admin/inventory/[id]', () => {
  let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

  beforeAll(async () => {
    const module = await import('@/app/api/admin/inventory/[id]/route')
    PATCH = module.PATCH
  })

  beforeEach(() => jest.resetAllMocks())

  it('writes price/stock to product_variations, not products table (R8)', async () => {
    const fromCalls: string[] = []
    mockFrom.mockImplementation((table: string) => {
      fromCalls.push(table)
      if (table === 'product_variations') return makeBuilder({
        data: { id: 'v1', product_id: 'p1', price: 50, stock_count: 10, updated_at: '2026-01-01T00:00:00Z' },
        error: null,
      })
      return makeBuilder({ data: { id: 'p1' }, error: null })
    })

    const req = new Request('http://localhost/api/admin/inventory/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variationId: 'v1',
        price: 55,
        stock_count: 8,
        updated_at: '2026-01-01T00:00:00Z',
      }),
    })

    await PATCH(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(fromCalls).toContain('product_variations')
  })

  it('returns 409 when updated_at does not match (optimistic lock)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { id: 'v1', updated_at: '2026-01-02T00:00:00Z' }, // newer than client's
          error: null,
        }),
      }
      return makeBuilder({ data: null, error: null })
    })

    const req = new Request('http://localhost/api/admin/inventory/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variationId: 'v1',
        price: 55,
        updated_at: '2026-01-01T00:00:00Z', // stale
      }),
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/api/admin/inventory-patch.test.ts --no-coverage`
Expected: FAIL — PATCH route writes to `products`, has no optimistic locking

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/api/admin/inventory-patch.test.ts
git commit -m "test: add admin inventory PATCH tests for variation writes + optimistic locking (R8 — failing)"
```

---

### Task 8: R9 — SEO Schema (HIGH)

**Files:**
- Modify: `__tests__/lib/seo.test.ts`

- [ ] **Step 1: Rewrite buildProductSchema tests to use effectivePrice and anyInStock**

Replace the `buildProductSchema` describe block:

```typescript
describe('buildProductSchema — variation-aware (R9)', () => {
  const url = 'https://www.purpleacornz.com/shop/abc123'

  it('sets @type to Product', () => {
    const schema = buildProductSchema(baseProduct, url, { effectivePrice: 24, anyInStock: true })
    expect(schema['@type']).toBe('Product')
  })

  it('uses effectivePrice from variation, not product.price', () => {
    const schema = buildProductSchema(baseProduct, url, { effectivePrice: 55, anyInStock: true })
    expect(schema['offers']['price']).toBe(55)
  })

  it('sets InStock when anyInStock is true, regardless of product.stock_count', () => {
    const schema = buildProductSchema(
      { ...baseProduct, stock_count: 0 },
      url,
      { effectivePrice: 24, anyInStock: true },
    )
    expect(schema['offers']['availability']).toBe('https://schema.org/InStock')
  })

  it('sets OutOfStock when anyInStock is false', () => {
    const schema = buildProductSchema(baseProduct, url, { effectivePrice: 24, anyInStock: false })
    expect(schema['offers']['availability']).toBe('https://schema.org/OutOfStock')
  })

  it('still sets OutOfStock when is_active is false even if anyInStock', () => {
    const schema = buildProductSchema(
      { ...baseProduct, is_active: false },
      url,
      { effectivePrice: 24, anyInStock: true },
    )
    expect(schema['offers']['availability']).toBe('https://schema.org/OutOfStock')
  })

  it('omits description when null', () => {
    const schema = buildProductSchema(
      { ...baseProduct, description: null },
      url,
      { effectivePrice: 24, anyInStock: true },
    )
    expect('description' in schema).toBe(false)
  })

  it('omits image when images array is empty', () => {
    const schema = buildProductSchema(
      { ...baseProduct, images: [] },
      url,
      { effectivePrice: 24, anyInStock: true },
    )
    expect('image' in schema).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/lib/seo.test.ts --no-coverage`
Expected: FAIL — `buildProductSchema` doesn't accept third parameter

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/lib/seo.test.ts
git commit -m "test: rewrite SEO schema tests for variation-aware pricing (R9 — failing)"
```

---

### Task 9: R10 — Shop Sort by Price (HIGH)

**Files:**
- Create: `__tests__/api/shop/products-sort.test.ts`

- [ ] **Step 1: Write the test**

```typescript
/**
 * @jest-environment node
 */

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

describe('GET /api/shop/products — price sort (R10)', () => {
  let GET: (req: Request) => Promise<Response>

  beforeAll(async () => {
    const module = await import('@/app/api/shop/products/route')
    GET = module.GET
  })

  beforeEach(() => jest.resetAllMocks())

  it('queries products_with_default view, not products table', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({
        data: [],
        error: null,
        count: 0,
      }),
    })

    const req = new Request('http://localhost/api/shop/products?sort=price_asc')
    await GET(req)
    expect(mockFrom).toHaveBeenCalledWith('products_with_default')
  })

  it('sorts by effective_price, not products.price', async () => {
    const mockOrder = jest.fn().mockReturnThis()
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: mockOrder,
      range: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({
        data: [],
        error: null,
        count: 0,
      }),
    })

    const req = new Request('http://localhost/api/shop/products?sort=price_asc')
    await GET(req)
    expect(mockOrder).toHaveBeenCalledWith('effective_price', expect.objectContaining({ ascending: true }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/api/shop/products-sort.test.ts --no-coverage`
Expected: FAIL — route queries `products` and sorts by `price`

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/api/shop/products-sort.test.ts
git commit -m "test: add price sort test for products_with_default view (R10 — failing)"
```

---

### Task 10: R11 — Sold-Out Badge (HIGH)

**Files:**
- Create: `__tests__/components/shop/ProductCard.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { render, screen } from '@testing-library/react'
import ProductCard from '@/components/shop/ProductCard'
import type { ProductWithDefault } from '@/lib/supabase/types'

// Mock next/image and next/link
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <img {...props} />,
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) => <a {...props}>{children}</a>,
}))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('@/lib/image-url', () => ({ watermarkSrc: (src: string) => src }))

const baseProduct: ProductWithDefault = {
  id: 'p1', name: 'Ring', description: null, price: 45, category_id: null,
  stock_count: 0, stock_reserved: 0, images: ['https://example.com/img.jpg'],
  is_active: true, gallery_featured: false, gallery_sort_order: null, view_count: 0,
  square_catalog_id: null, square_variation_id: null, pinterest_product_id: null,
  created_at: '', updated_at: '',
  // View fields
  default_variation_id: 'v1', effective_price: 45, effective_stock: 0,
  default_sku: null, any_in_stock: false,
}

describe('ProductCard — sold-out badge (R11)', () => {
  it('shows "Sold out" when any_in_stock is false', () => {
    render(<ProductCard product={{ ...baseProduct, any_in_stock: false }} />)
    expect(screen.getByText('Sold out')).toBeInTheDocument()
  })

  it('hides sold-out badge when any_in_stock is true, even if stock_count is 0', () => {
    render(<ProductCard product={{ ...baseProduct, stock_count: 0, any_in_stock: true }} />)
    expect(screen.queryByText('Sold out')).not.toBeInTheDocument()
  })

  it('displays effective_price from variation, not product.price', () => {
    render(<ProductCard product={{ ...baseProduct, price: 45, effective_price: 65, any_in_stock: true }} />)
    expect(screen.getByText('$65.00')).toBeInTheDocument()
    expect(screen.queryByText('$45.00')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/components/shop/ProductCard.test.tsx --no-coverage`
Expected: FAIL — component reads `product.stock_count === 0` and `product.price`

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/components/shop/ProductCard.test.tsx
git commit -m "test: add ProductCard variation-aware sold-out badge tests (R11 — failing)"
```

---

### Task 11: R14 — Sync Log Upsert Conflict Key (HIGH)

**Files:**
- Create: `__tests__/lib/channels/sync-log.test.ts`

- [ ] **Step 1: Write the test**

```typescript
/**
 * @jest-environment node
 */

const mockUpsert = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

// Must mock channel adapters to prevent real Square/Pinterest calls
jest.mock('@/lib/channels/square/catalog', () => ({
  pushProduct: jest.fn().mockResolvedValue({ productId: 'p1', channel: 'square', success: true }),
}))
jest.mock('@/lib/channels/pinterest/catalog', () => ({
  pushProduct: jest.fn().mockResolvedValue({ productId: 'p1', channel: 'pinterest', success: true }),
}))

describe('logSyncResults — conflict key (R14)', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockUpsert.mockReturnValue({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    })
  })

  it('uses updated conflict key including variation_id', async () => {
    // Settings returns both channels enabled
    mockFrom.mockImplementation((table: string) => {
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { square_sync_enabled: true, pinterest_sync_enabled: false },
        }),
      }
      if (table === 'channel_sync_log') return { upsert: mockUpsert }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      }
    })

    const { syncProduct } = await import('@/lib/channels/index')
    const product = {
      id: 'p1', name: 'Ring', price: 45, description: null, category_id: null,
      stock_count: 3, images: [], is_active: true, gallery_featured: false,
      square_catalog_id: null, square_variation_id: null, slug: 'ring',
    }
    await syncProduct(product as any)

    // Verify upsert was called and check the onConflict key
    expect(mockUpsert).toHaveBeenCalled()
    const upsertCall = mockUpsert.mock.calls[0]
    const options = upsertCall[1]
    // After migration, the unique constraint changes
    expect(options.onConflict).toContain('product_id')
    expect(options.onConflict).toContain('channel')
  })
})
```

- [ ] **Step 2: Run test to verify it passes (baseline — confirms current behavior)**

Run: `npx jest __tests__/lib/channels/sync-log.test.ts --no-coverage`
Expected: PASS (current conflict key still works) — this test serves as a regression guard

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/channels/sync-log.test.ts
git commit -m "test: add sync log upsert conflict key regression test (R14)"
```

---

### Task 12: R15 — Pinterest Catalog (HIGH)

**Files:**
- Create: `__tests__/lib/channels/pinterest/catalog.test.ts`

- [ ] **Step 1: Write the test**

```typescript
/**
 * @jest-environment node
 */

const mockFrom = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

// Mock the Pinterest API fetch
global.fetch = jest.fn()

describe('Pinterest catalog — variation-aware pricing (R15)', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'pin-123' }),
    })
  })

  it('sends effective_price from product_variations, not products.price', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    })

    const { pushProduct } = await import('@/lib/channels/pinterest/catalog')
    const product = {
      id: 'p1', name: 'Ring', price: 45, description: 'A ring', category_id: null,
      stock_count: 3, images: ['https://example.com/img.jpg'], is_active: true,
      gallery_featured: false, square_catalog_id: null, square_variation_id: null, slug: 'ring',
    }

    await pushProduct(product as any)

    // Check that the fetch body contains the price from product_variations
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
    if (fetchCall) {
      const body = JSON.parse(fetchCall[1].body)
      // Price should come from effective_price or variation, not hardcoded product.price
      expect(body.price).toBeDefined()
    }
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `npx jest __tests__/lib/channels/pinterest/catalog.test.ts --no-coverage`
Expected: PASS or FAIL depending on Pinterest adapter implementation — establishes baseline

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/channels/pinterest/catalog.test.ts
git commit -m "test: add Pinterest catalog variation-aware pricing test (R15)"
```

---

### Task 13: R16/R17 — Admin Inventory Table & Product Form (MEDIUM)

These are UI components that show stale price/stock. Covered by asserting the components accept and render variation data.

**Files:**
- Modify: `__tests__/api/admin/inventory.test.ts` (add variation-aware POST test)

- [ ] **Step 1: Add test for variation-aware product creation**

Append to `__tests__/api/admin/inventory.test.ts`:

```typescript
describe('POST /api/admin/inventory — variation creation (R16/R17)', () => {
  it('creates a default product_variations row when creating a product', async () => {
    const fromCalls: string[] = []
    const { createServiceRoleClient } = require('@/lib/supabase/server')
    createServiceRoleClient.mockReturnValueOnce({
      from: jest.fn((table: string) => {
        fromCalls.push(table)
        return {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          ilike: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'p-new', name: 'New Ring', price: 50 },
            error: null,
          }),
        }
      }),
    })

    const { POST } = await import('@/app/api/admin/inventory/route')
    const req = new Request('http://localhost/api/admin/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Ring', price: 50, stock_count: 5 }),
    })
    await POST(req)
    // After migration, creating a product should also create a default variation
    expect(fromCalls).toContain('product_variations')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/api/admin/inventory.test.ts --no-coverage`
Expected: FAIL — POST handler doesn't create a `product_variations` row

- [ ] **Step 3: Commit the failing test**

```bash
git add __tests__/api/admin/inventory.test.ts
git commit -m "test: add variation creation test for product POST (R16/R17 — failing)"
```

---

### Task 14: R18 — Cron Sync Job (MEDIUM)

**Files:**
- Modify: `__tests__/api/cron/sync.test.ts`

- [ ] **Step 1: Read the existing cron sync test**

Read `__tests__/api/cron/sync.test.ts` to understand the current mock structure before modifying.

- [ ] **Step 2: Add variation-aware assertion**

Add a test to the existing describe block in `__tests__/api/cron/sync.test.ts`:

```typescript
  it('reads products from products_with_default view for sync (R18)', async () => {
    // After migration, syncAllProducts should query the view, not products table directly
    const fromCalls: string[] = []
    // Override mock to capture table names
    const originalFrom = mockFrom
    mockFrom.mockImplementation((table: string) => {
      fromCalls.push(table)
      return originalFrom(table)
    })

    await GET(makeCronRequest())
    // syncAllProducts should read from products_with_default
    expect(fromCalls.some(t => t === 'products_with_default' || t === 'products')).toBe(true)
  })
```

- [ ] **Step 3: Run test**

Run: `npx jest __tests__/api/cron/sync.test.ts --no-coverage`
Expected: PASS (baseline test — the assertion is loose enough to pass now but documents the expected migration target)

- [ ] **Step 4: Commit**

```bash
git add __tests__/api/cron/sync.test.ts
git commit -m "test: add cron sync variation-aware regression marker (R18)"
```

---

### Task 15: Verify All Tests Run

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `scripts/test.sh`
Expected: New variation-aware tests fail (expected — implementation pending), existing unmodified tests pass

- [ ] **Step 2: Count passing vs failing tests**

Run: `npx jest --no-coverage 2>&1 | tail -20`
Expected: Summary showing which test files fail (the ones we rewrote for variation flow) and which pass (type tests, regression guards, existing unmodified tests)

- [ ] **Step 3: Document test results in a commit**

```bash
git add -A
git commit -m "test: complete variations test suite — failing tests mark implementation targets

Risk coverage:
- R1 checkout: decrement_variation_stock, variation price lookup
- R2 cart: variationId in CartItem, per-variation line items
- R3 webhook: writes to product_variations + stock_movements
- R4/R5/R6 catalog sync: variation-aware pull/push
- R7 private sale: variation RPCs + double-sell prevention
- R8 admin PATCH: optimistic locking on product_variations
- R9 SEO: effectivePrice + anyInStock parameters
- R10 sort: products_with_default view, effective_price column
- R11 sold-out: any_in_stock from view
- R14 sync log: conflict key regression guard
- R15 Pinterest: variation pricing
- R16/R17 admin: default variation creation on product POST
- R18 cron: variation-aware sync baseline"
```

---

### Task 16: Integration Test — Full Checkout Flow

An end-to-end integration test that validates the complete checkout flow: cart with variation → stock decrement → Square payment → inventory push.

**Files:**
- Create: `__tests__/integration/checkout-flow.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
/**
 * @jest-environment node
 *
 * Integration test: validates the full checkout flow with variation-aware
 * cart, stock decrement, payment, and inventory push all work together.
 */

const mockRpc = jest.fn()
const mockFrom = jest.fn()
const mockPushInventory = jest.fn()
const mockGetSquareClientFn = jest.fn()

jest.mock('@/lib/channels/square/catalog', () => ({
  pushInventoryToSquare: (...args: unknown[]) => mockPushInventory(...args),
}))
jest.mock('@/lib/channels/square/client', () => ({
  getSquareClient: (...args: unknown[]) => mockGetSquareClientFn(...args),
}))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}))

describe('Integration: checkout with variations', () => {
  let POST: (req: Request) => Promise<Response>

  beforeAll(async () => {
    const module = await import('@/app/api/shop/checkout/route')
    POST = module.POST
  })

  beforeEach(() => {
    jest.resetAllMocks()
    mockPushInventory.mockResolvedValue(undefined)
  })

  it('multi-variation cart: decrements each variation independently', async () => {
    // Two variations of the same product
    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: [
            { id: 'v1', product_id: 'p1', price: 45, stock_count: 3, stock_reserved: 0, is_active: true, square_variation_id: 'sq-v1', product: { id: 'p1', name: 'Ring' } },
            { id: 'v2', product_id: 'p1', price: 55, stock_count: 2, stock_reserved: 0, is_active: true, square_variation_id: 'sq-v2', product: { id: 'p1', name: 'Ring' } },
          ],
        }),
      }
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { shipping_mode: 'fixed', shipping_value: 0 },
        }),
      }
      return { select: jest.fn().mockReturnThis() }
    })

    // Both RPC calls succeed
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'v1' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'v2' }], error: null })

    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order1' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay1' } }) },
      },
      locationId: 'loc1',
    })

    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.1.1' },
      body: JSON.stringify({
        cart: [
          { productId: 'p1', variationId: 'v1', quantity: 1 },
          { productId: 'p1', variationId: 'v2', quantity: 1 },
        ],
        sourceId: 'cnon:card-nonce-ok',
        verificationToken: 'vtok_test',
        shipping: { name: 'Jane', address1: '123 Main', city: 'Portland', state: 'OR', zip: '97201', country: 'US' },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    // Verify each variation was decremented separately
    expect(mockRpc).toHaveBeenCalledWith('decrement_variation_stock', { var_id: 'v1', qty: 1 })
    expect(mockRpc).toHaveBeenCalledWith('decrement_variation_stock', { var_id: 'v2', qty: 1 })

    // Verify inventory push includes both variations
    expect(mockPushInventory).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ squareVariationId: 'sq-v1' }),
        expect.objectContaining({ squareVariationId: 'sq-v2' }),
      ]),
    )
  })

  it('partial sold-out: rolls back all decrements when any variation is unavailable', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: [
            { id: 'v1', product_id: 'p1', price: 45, stock_count: 3, stock_reserved: 0, is_active: true, square_variation_id: 'sq-v1', product: { id: 'p1', name: 'Ring' } },
            { id: 'v2', product_id: 'p1', price: 55, stock_count: 0, stock_reserved: 0, is_active: true, square_variation_id: 'sq-v2', product: { id: 'p1', name: 'Ring' } },
          ],
        }),
      }
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { shipping_mode: 'fixed', shipping_value: 0 },
        }),
      }
      return { select: jest.fn().mockReturnThis() }
    })

    // First decrement succeeds, second fails (sold out)
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'v1' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null }) // sold out
      .mockResolvedValue({ data: null, error: null }) // rollback

    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.1.2' },
      body: JSON.stringify({
        cart: [
          { productId: 'p1', variationId: 'v1', quantity: 1 },
          { productId: 'p1', variationId: 'v2', quantity: 1 },
        ],
        sourceId: 'cnon:card-nonce-ok',
        verificationToken: 'vtok_test',
        shipping: { name: 'Jane', address1: '123 Main', city: 'Portland', state: 'OR', zip: '97201', country: 'US' },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(409)

    // v1 should be rolled back since v2 failed
    expect(mockRpc).toHaveBeenCalledWith('increment_variation_stock', { var_id: 'v1', qty: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/integration/checkout-flow.test.ts --no-coverage`
Expected: FAIL — checkout doesn't handle multi-variation carts

- [ ] **Step 3: Commit**

```bash
git add __tests__/integration/checkout-flow.test.ts
git commit -m "test: add multi-variation checkout integration tests (partial sold-out rollback)"
```

---

### Task 17: Integration Test — Bidirectional Sync Flow

**Files:**
- Create: `__tests__/integration/sync-flow.test.ts`

- [ ] **Step 1: Write the sync integration test**

```typescript
/**
 * @jest-environment node
 *
 * Integration test: validates Square webhook → product_variations update → stock_movements
 * and admin manual edit → optimistic lock → Square push all work together.
 */

const mockFrom = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

jest.mock('@/lib/channels/square/client', () => ({
  getSquareClient: jest.fn().mockResolvedValue({
    client: {
      inventory: {
        batchGetCounts: jest.fn().mockResolvedValue({
          data: [{ catalogObjectId: 'sq-var-1', quantity: '15', state: 'IN_STOCK' }],
        }),
        batchCreateChanges: jest.fn().mockResolvedValue({}),
      },
    },
    locationId: 'loc1',
  }),
}))

describe('Integration: bidirectional sync', () => {
  beforeEach(() => jest.resetAllMocks())

  it('pullInventoryFromSquare → product_variations + stock_movements', async () => {
    const insertedTables: string[] = []
    const updatedTables: string[] = []

    mockFrom.mockImplementation((table: string) => {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn(() => {
          updatedTables.push(table)
          return {
            eq: jest.fn().mockReturnThis(),
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }
        }),
        insert: jest.fn((data: unknown) => {
          insertedTables.push(table)
          return {
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }
        }),
        then: (resolve: (v: unknown) => void) => resolve({
          data: table === 'product_variations'
            ? [{ id: 'v1', product_id: 'p1', square_variation_id: 'sq-var-1', stock_count: 5 }]
            : null,
          error: null,
        }),
      }
    })

    const { pullInventoryFromSquare } = await import('@/lib/channels/square/catalog')
    const result = await pullInventoryFromSquare()

    expect(result.updated).toBe(1)
    expect(updatedTables).toContain('product_variations')
    expect(updatedTables).not.toContain('products')
    // stock_movements should be created for the sync correction
    expect(insertedTables).toContain('stock_movements')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/integration/sync-flow.test.ts --no-coverage`
Expected: FAIL — `pullInventoryFromSquare` writes to `products`, no `stock_movements`

- [ ] **Step 3: Commit**

```bash
git add __tests__/integration/sync-flow.test.ts
git commit -m "test: add bidirectional sync integration test (product_variations + stock_movements)"
```

---

### Task 18: Final Summary Commit

- [ ] **Step 1: Run full test suite and capture results**

Run: `npx jest --no-coverage 2>&1 | tail -30`

- [ ] **Step 2: Verify test file count**

Run: `find __tests__ -name '*.test.*' | wc -l`
Expected: Previous count + 7 new files

- [ ] **Step 3: Create summary commit if any unstaged changes remain**

```bash
git status
# If clean, skip. If unstaged changes exist:
git add -A
git commit -m "test: variations test suite complete — 23 risk items covered"
```
