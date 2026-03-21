# Square Inventory Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Square inventory in sync with the website — push SALE changes to Square after each web checkout, and let admins pull Square's current inventory counts back into Supabase on demand.

**Architecture:** A new `lib/channels/square/inventory.ts` handles all Square Inventory API calls. The checkout route calls `pushSaleToSquare()` after stock decrement. A new admin API route + button in `InventoryManager` calls `pullInventoryFromSquare()` to overwrite `products.stock_count` from Square's counts.

**Tech Stack:** Square SDK (`square` npm package — `SquareClient.inventory`), Supabase service role client, Next.js API routes, React admin component.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/channels/square/inventory.ts` | Create | Push SALE changes to Square; pull inventory counts from Square |
| `app/api/shop/checkout/route.ts` | Modify | Call `pushSaleToSquare()` after stock decrement (fire-and-forget) |
| `app/api/admin/inventory/square-sync/route.ts` | Create | POST endpoint — calls `pullInventoryFromSquare()`, returns updated counts |
| `components/admin/InventoryManager.tsx` | Modify | Add "Sync from Square" button + last-sync feedback |
| `__tests__/lib/square-inventory.test.ts` | Create | Unit tests for push/pull logic |

---

## Task 1: Square Inventory Library

**Files:**
- Create: `lib/channels/square/inventory.ts`
- Test: `__tests__/lib/square-inventory.test.ts`

### Step 1.1 — Write failing tests

- [ ] Create `__tests__/lib/square-inventory.test.ts`:

```typescript
import { pushSaleToSquare, pullInventoryFromSquare } from '@/lib/channels/square/inventory'

// Mock getSquareClient
jest.mock('@/lib/channels/square/client', () => ({
  getSquareClient: jest.fn(),
}))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(),
}))

import { getSquareClient } from '@/lib/channels/square/client'
import { createServiceRoleClient } from '@/lib/supabase/server'

describe('pushSaleToSquare', () => {
  it('calls inventory batchCreateChanges with SALE entries for each item', async () => {
    const mockBatch = jest.fn().mockResolvedValue({})
    ;(getSquareClient as jest.Mock).mockResolvedValue({
      client: { inventory: { batchCreateChanges: mockBatch } },
      locationId: 'LOC1',
    })

    await pushSaleToSquare([
      { squareVariationId: 'VAR1', quantity: 2 },
      { squareVariationId: 'VAR2', quantity: 1 },
    ])

    expect(mockBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.arrayContaining([
          expect.objectContaining({
            type: 'ADJUSTMENT',
            adjustment: expect.objectContaining({
              catalogObjectId: 'VAR1',
              quantity: '2',
              fromState: 'IN_STOCK',
              toState: 'SOLD',
              locationId: 'LOC1',
            }),
          }),
          expect.objectContaining({
            type: 'ADJUSTMENT',
            adjustment: expect.objectContaining({
              catalogObjectId: 'VAR2',
              quantity: '1',
            }),
          }),
        ]),
      })
    )
  })

  it('skips items with no squareVariationId', async () => {
    const mockBatch = jest.fn().mockResolvedValue({})
    ;(getSquareClient as jest.Mock).mockResolvedValue({
      client: { inventory: { batchCreateChanges: mockBatch } },
      locationId: 'LOC1',
    })

    await pushSaleToSquare([{ squareVariationId: null, quantity: 1 }])
    expect(mockBatch).not.toHaveBeenCalled()
  })

  it('does not throw if Square call fails', async () => {
    ;(getSquareClient as jest.Mock).mockRejectedValue(new Error('Square down'))
    await expect(pushSaleToSquare([{ squareVariationId: 'VAR1', quantity: 1 }])).resolves.not.toThrow()
  })
})

describe('pullInventoryFromSquare', () => {
  it('returns updated counts mapped by product id', async () => {
    const mockBatchRetrieve = jest.fn().mockResolvedValue({
      counts: [
        { catalogObjectId: 'VAR1', quantity: '5', state: 'IN_STOCK' },
        { catalogObjectId: 'VAR2', quantity: '0', state: 'IN_STOCK' },
      ],
    })
    ;(getSquareClient as jest.Mock).mockResolvedValue({
      client: { inventory: { batchGetCounts: mockBatchRetrieve } },
      locationId: 'LOC1',
    })

    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        not: jest.fn().mockResolvedValue({
          data: [
            { id: 'P1', square_variation_id: 'VAR1' },
            { id: 'P2', square_variation_id: 'VAR2' },
          ],
          error: null,
        }),
      }),
    })
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
    ;(createServiceRoleClient as jest.Mock).mockReturnValue({
      from: (table: string) => table === 'products' && mockFrom() || { update: mockUpdate },
    })

    const results = await pullInventoryFromSquare()
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ productId: 'P1', newStock: 5 })
    expect(results[1]).toMatchObject({ productId: 'P2', newStock: 0 })
  })
})
```

- [ ] Run tests to confirm they fail:

```bash
npm test -- __tests__/lib/square-inventory.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/channels/square/inventory'`

### Step 1.2 — Implement `lib/channels/square/inventory.ts`

- [ ] Create `lib/channels/square/inventory.ts`:

```typescript
import { getSquareClient } from './client'
import { createServiceRoleClient } from '@/lib/supabase/server'

export interface SaleItem {
  squareVariationId: string | null
  quantity: number
}

export interface InventorySyncResult {
  productId: string
  newStock: number
  error?: string
}

/**
 * Push SALE inventory changes to Square after a web checkout.
 * Fire-and-forget — swallows errors so checkout success is not affected.
 */
export async function pushSaleToSquare(items: SaleItem[]): Promise<void> {
  const eligible = items.filter(i => i.squareVariationId)
  if (!eligible.length) return

  try {
    const { client, locationId } = await getSquareClient()
    const occurredAt = new Date().toISOString()

    await client.inventory.batchCreateChanges({
      idempotencyKey: crypto.randomUUID(),
      changes: eligible.map(item => ({
        type: 'ADJUSTMENT' as const,
        adjustment: {
          catalogObjectId: item.squareVariationId!,
          quantity: String(item.quantity),
          occurredAt,
          fromState: 'IN_STOCK' as const,
          toState: 'SOLD' as const,
          locationId,
        },
      })),
    })
  } catch (err) {
    // Fire-and-forget: log but never block checkout
    console.error('[Square inventory] pushSaleToSquare failed:', err)
  }
}

/**
 * Pull current inventory counts from Square and update products.stock_count.
 * Returns one result entry per product that was updated or failed.
 */
export async function pullInventoryFromSquare(): Promise<InventorySyncResult[]> {
  const supabase = createServiceRoleClient()

  // Fetch all products that have a Square variation ID
  const { data: products, error } = await supabase
    .from('products')
    .select('id, square_variation_id')
    .not('square_variation_id', 'is', null)

  if (error) throw new Error(`Failed to fetch products: ${error.message}`)
  if (!products?.length) return []

  const { client, locationId } = await getSquareClient()

  const variationIds = products.map(p => p.square_variation_id!)
  const response = await client.inventory.batchGetCounts({
    catalogObjectIds: variationIds,
    locationIds: [locationId],
  })

  const countMap = new Map<string, number>()
  for (const count of response.counts ?? []) {
    if (count.catalogObjectId && count.state === 'IN_STOCK') {
      countMap.set(count.catalogObjectId, Math.max(0, parseInt(count.quantity ?? '0', 10)))
    }
  }

  const results: InventorySyncResult[] = []

  for (const product of products) {
    const newStock = countMap.get(product.square_variation_id!) ?? 0
    const { error: updateError } = await supabase
      .from('products')
      .update({ stock_count: newStock })
      .eq('id', product.id)

    results.push({
      productId: product.id,
      newStock,
      ...(updateError ? { error: updateError.message } : {}),
    })
  }

  return results
}
```

- [ ] Run tests to confirm they pass:

```bash
npm test -- __tests__/lib/square-inventory.test.ts
```

Expected: PASS

- [ ] Commit:

```bash
git add lib/channels/square/inventory.ts __tests__/lib/square-inventory.test.ts
git commit -m "feat: Square inventory push/pull library"
```

---

## Task 2: Push SALE to Square on Checkout

**Files:**
- Modify: `app/api/shop/checkout/route.ts`

- [ ] Update the `select` in the stock validation step to also fetch `square_variation_id`:

```typescript
// Line 29-30 — replace:
const { data: products } = await supabase
  .from('products').select('id,name,price,stock_count').in('id', cart.map(i => i.productId))

// With:
const { data: products } = await supabase
  .from('products').select('id,name,price,stock_count,square_variation_id').in('id', cart.map(i => i.productId))
```

- [ ] Add the import at the top of the file:

```typescript
import { pushSaleToSquare } from '@/lib/channels/square/inventory'
```

- [ ] After the stock decrement loop (after `decremented.push(item)`), fire the Square push before the final return:

```typescript
  // Push sale to Square inventory (fire-and-forget — does not affect response)
  pushSaleToSquare(
    cart.map(item => ({
      squareVariationId: products.find(p => p.id === item.productId)?.square_variation_id ?? null,
      quantity: item.quantity,
    }))
  ).catch(console.error)

  return NextResponse.json({ orderId, paymentId })
```

- [ ] Run existing checkout tests to confirm nothing is broken:

```bash
npm test -- __tests__/api/shop/checkout.test.ts
```

Expected: PASS

- [ ] Commit:

```bash
git add app/api/shop/checkout/route.ts
git commit -m "feat: push SALE inventory changes to Square after web checkout"
```

---

## Task 3: Admin Pull Endpoint

**Files:**
- Create: `app/api/admin/inventory/square-sync/route.ts`

- [ ] Create the route:

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { pullInventoryFromSquare } from '@/lib/channels/square/inventory'

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  try {
    const results = await pullInventoryFromSquare()
    const updated = results.filter(r => !r.error).length
    const errors = results.filter(r => r.error).length
    return NextResponse.json({ updated, errors, results })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] Verify the route responds correctly by checking it compiles (no TS errors):

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] Commit:

```bash
git add app/api/admin/inventory/square-sync/route.ts
git commit -m "feat: admin POST /api/admin/inventory/square-sync pulls stock from Square"
```

---

## Task 4: Admin UI — Sync from Square Button

**Files:**
- Modify: `components/admin/InventoryManager.tsx`

- [ ] Read the current file to understand where to add the button (look for the toolbar/header area near the search/filter controls).

- [ ] Add state and handler near the top of the component function:

```typescript
const [squareSyncing, setSquareSyncing] = useState(false)
const [squareSyncMsg, setSquareSyncMsg] = useState('')

async function syncFromSquare() {
  setSquareSyncing(true)
  setSquareSyncMsg('')
  try {
    const res = await fetch('/api/admin/inventory/square-sync', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setSquareSyncMsg(data.error ?? 'Sync failed.')
    } else {
      setSquareSyncMsg(`Updated ${data.updated} product${data.updated !== 1 ? 's' : ''}${data.errors ? `, ${data.errors} error${data.errors !== 1 ? 's' : ''}` : ''}.`)
      onRefresh?.()  // re-fetch product list if prop exists, else reload
    }
  } catch {
    setSquareSyncMsg('Network error.')
  } finally {
    setSquareSyncing(false)
  }
}
```

- [ ] Add the button in the toolbar (near the existing action buttons):

```tsx
<button
  onClick={syncFromSquare}
  disabled={squareSyncing}
  style={{
    background: 'transparent',
    color: 'var(--color-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: squareSyncing ? 'not-allowed' : 'pointer',
    minHeight: '48px',
    opacity: squareSyncing ? 0.7 : 1,
  }}
>
  {squareSyncing ? 'Syncing…' : 'Sync Stock from Square'}
</button>
{squareSyncMsg && (
  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
    {squareSyncMsg}
  </span>
)}
```

- [ ] Verify no TypeScript errors:

```bash
npx tsc --noEmit
```

- [ ] Commit:

```bash
git add components/admin/InventoryManager.tsx
git commit -m "feat: add Sync Stock from Square button to InventoryManager"
```

---

## Testing Checklist

Before marking complete, manually verify in the browser:

- [ ] Add an item to cart, complete checkout with test card `4111 1111 1111 1111`
- [ ] In Square sandbox dashboard → Inventory → confirm the item's count decreased
- [ ] In Admin → Inventory, click "Sync Stock from Square" → confirm `stock_count` updates match Square's counts
- [ ] Make a POS sale in Square sandbox → click sync → confirm site stock decreases accordingly
