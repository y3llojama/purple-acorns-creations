# Category Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded product/gallery categories with a dynamic, database-driven system manageable from the admin UI, with bidirectional Square sync.

**Architecture:** A new `categories` table becomes the source of truth. Products and gallery items reference categories by FK. Six API routes cover CRUD + reorder. A new `CategoryManager` component lives in a second tab inside the existing Inventory page.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service role client), Square SDK v44, Jest (node environment), CSS custom properties (no Tailwind).

**Spec:** `docs/superpowers/specs/2026-03-20-category-management-design.md`

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `supabase/migrations/020_dynamic_categories.sql` | Create categories table, seed 6 rows, migrate products + gallery, drop old columns |
| `app/api/admin/categories/route.ts` | GET (list all + product_count) and POST (create) |
| `app/api/admin/categories/[id]/route.ts` | GET (single), PATCH (update), DELETE (block-if-used) |
| `app/api/admin/categories/reorder/route.ts` | PATCH (bulk sort_order update) |
| `components/admin/CategoryManager.tsx` | Category list + inline edit form + drag reorder |
| `__tests__/api/admin/categories.test.ts` | API route unit tests |

### Modified files
| File | Change |
|---|---|
| `lib/supabase/types.ts` | Add `Category` interface; update `Product`, `GalleryItem` to use `category_id` |
| `lib/channels/square/catalog.ts` | Add `pushCategory()`, `deleteSquareCategory()`; update `pushProduct()` to join categories; remove `ensureSquareCategories()` |
| `lib/channels/index.ts` | Add `syncCategory()` export |
| `app/api/admin/inventory/route.ts` | Remove `VALID_CATEGORIES`; accept `category_id` UUID |
| `app/api/admin/inventory/[id]/route.ts` | Same — replace `category` text field with `category_id` |
| `components/admin/ProductForm.tsx` | Accept `categories` prop; render dynamic `<select>`; submit `category_id` |
| `components/admin/InventoryManager.tsx` | Add Products/Categories tabs; pass `categories` to `ProductForm`; remove `squareCategoryIds` prop |
| `app/admin/(dashboard)/inventory/page.tsx` | Fetch categories; remove `square_category_ids` select; pass `categories` down |

### Deleted files
| File | Reason |
|---|---|
| `app/api/admin/inventory/sync-categories/route.ts` | Replaced by per-category sync in new CRUD routes |

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/020_dynamic_categories.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 020_dynamic_categories.sql
-- Creates categories table, seeds 6 rows, migrates products & gallery,
-- drops legacy category text columns and settings.square_category_ids.

-- 1. Create categories table
create table if not exists categories (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique,
  parent_id        uuid references categories(id) null,
  sort_order       integer not null default 9999,
  category_type    text not null default 'REGULAR_CATEGORY'
                     check (category_type in ('REGULAR_CATEGORY', 'MENU_CATEGORY')),
  online_visibility boolean not null default true,
  seo_title        text,
  seo_description  text,
  seo_permalink    text,
  square_category_id text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 2. Seed the 6 existing categories (slugs match current products.category values)
insert into categories (name, slug, sort_order) values
  ('Rings',     'rings',     0),
  ('Necklaces', 'necklaces', 1),
  ('Earrings',  'earrings',  2),
  ('Bracelets', 'bracelets', 3),
  ('Crochet',   'crochet',   4),
  ('Other',     'other',     5)
on conflict (slug) do nothing;

-- 3. Add category_id FK to products
alter table products
  add column if not exists category_id uuid references categories(id);

-- 4. Backfill products (join on slug = existing lowercase text value)
update products
  set category_id = c.id
  from categories c
  where c.slug = products.category;

-- 5. Drop products.category CHECK constraint and column
alter table products drop column if exists category;

-- 6. Add category_id FK to gallery
alter table gallery
  add column if not exists category_id uuid references categories(id);

-- 7. Backfill gallery
update gallery
  set category_id = c.id
  from categories c
  where c.slug = gallery.category;

-- 8. Drop gallery.category column
alter table gallery drop column if exists category;

-- 9. Drop square_category_ids from settings (replaced by categories.square_category_id)
alter table settings drop column if exists square_category_ids;
```

- [ ] **Step 2: Run this migration in Supabase SQL Editor**

  Copy the file contents into Supabase dashboard → SQL Editor → Run.
  Verify: `select * from categories order by sort_order;` returns 6 rows.
  Verify: `select category_id from products limit 5;` shows UUIDs (not nulls) for existing products.

  **After running:** confirm the FK relationship allows embedded counts. Run:
  ```sql
  select c.name, count(p.id) as product_count
  from categories c left join products p on p.category_id = c.id
  group by c.id, c.name order by c.sort_order;
  ```
  Counts should match your actual product distribution. PostgREST auto-detects named FKs — if the embedded count `.select('*, product_count:products(count)')` returns wrong totals in testing, fall back to this raw query in the route instead.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/020_dynamic_categories.sql
git commit -m "feat: migration 020 — dynamic categories table replacing hardcoded lists"
```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Replace `ProductCategory` and `Category` type aliases; add `Category` interface; update `Product` and `GalleryItem`**

In `lib/supabase/types.ts`:

Remove this line:
```ts
export type Category = 'rings' | 'necklaces' | 'earrings' | 'bracelets' | 'crochet' | 'other'
```

Replace with:
```ts
export interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
  sort_order: number
  category_type: 'REGULAR_CATEGORY' | 'MENU_CATEGORY'
  online_visibility: boolean
  seo_title: string | null
  seo_description: string | null
  seo_permalink: string | null
  square_category_id: string | null
  created_at: string
  updated_at: string
  // Populated by GET /api/admin/categories list query:
  product_count?: number
  children?: Category[]
}
```

Remove this line:
```ts
export type ProductCategory = 'rings' | 'necklaces' | 'earrings' | 'bracelets' | 'crochet' | 'other'
```

In the `Product` interface, replace:
```ts
  category: ProductCategory
```
with:
```ts
  category_id: string | null
```

In the `GalleryItem` interface, replace:
```ts
  category: Category | null
```
with:
```ts
  category_id: string | null
```

Also remove `square_category_ids` from `Settings` interface if present (it was added by migration 019 but may not be in types yet — check and remove if found).

- [ ] **Step 2: Fix any TypeScript errors from the type change**

Run:
```bash
npx tsc --noEmit 2>&1 | head -40
```

The main errors will be in `ProductForm.tsx` (uses `ProductCategory`) and `InventoryManager.tsx` (uses `CATEGORIES` array). These will be fixed in Tasks 5 and 6. Note them but don't fix now — address in order.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat: replace hardcoded Category/ProductCategory types with Category interface"
```

---

## Task 3: Square sync — add category functions, update pushProduct

**Files:**
- Modify: `lib/channels/square/catalog.ts`
- Modify: `lib/channels/index.ts`
- Delete: `app/api/admin/inventory/sync-categories/route.ts`

- [ ] **Step 1: Write failing tests for `pushCategory`**

Create `__tests__/api/admin/categories.test.ts` — just the Square sync section for now:

```ts
/**
 * @jest-environment node
 */

// Mock Square client
const mockDelete = jest.fn().mockResolvedValue({})
const mockUpsert = jest.fn().mockResolvedValue({
  catalogObject: { id: 'SQ_CAT_123' },
})
const mockObjDelete = jest.fn().mockResolvedValue({})

jest.mock('@/lib/channels/square/client', () => ({
  getSquareClient: jest.fn().mockResolvedValue({
    locationId: 'LOC1',
    client: {
      catalog: {
        object: {
          upsert: mockUpsert,
          delete: mockObjDelete,
        },
        batchUpsert: jest.fn(),
      },
    },
  }),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { square_sync_enabled: true, square_category_id: null },
        error: null,
      }),
    })),
  })),
}))

describe('pushCategory', () => {
  beforeEach(() => jest.clearAllMocks())

  it('upserts a new category to Square and returns success', async () => {
    const { pushCategory } = await import('@/lib/channels/square/catalog')
    const result = await pushCategory({
      id: 'cat-1',
      name: 'Rings',
      slug: 'rings',
      parent_id: null,
      sort_order: 0,
      category_type: 'REGULAR_CATEGORY',
      online_visibility: true,
      seo_title: null,
      seo_description: null,
      seo_permalink: null,
      square_category_id: null,
      created_at: '',
      updated_at: '',
    })
    expect(result.success).toBe(true)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        object: expect.objectContaining({ type: 'CATEGORY', id: '#CAT-cat-1' }),
      })
    )
  })

  it('deletes existing Square object before recreating', async () => {
    const { pushCategory } = await import('@/lib/channels/square/catalog')
    await pushCategory({
      id: 'cat-1', name: 'Rings', slug: 'rings', parent_id: null,
      sort_order: 0, category_type: 'REGULAR_CATEGORY', online_visibility: true,
      seo_title: null, seo_description: null, seo_permalink: null,
      square_category_id: 'OLD_SQ_ID', created_at: '', updated_at: '',
    })
    expect(mockObjDelete).toHaveBeenCalledWith({ objectId: 'OLD_SQ_ID' })
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (pushCategory not exported yet)**

```bash
scripts/test.sh __tests__/api/admin/categories.test.ts 2>&1 | tail -20
```

Expected: `SyntaxError` or `pushCategory is not a function`

- [ ] **Step 3: Implement `pushCategory` and `deleteSquareCategory` in `catalog.ts`**

Replace the entire `lib/channels/square/catalog.ts`:

```ts
import { getSquareClient } from './client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Product, SyncResult } from '@/lib/channels/types'
import type { Category } from '@/lib/supabase/types'

// ─── Category sync ────────────────────────────────────────────────────────────

export interface CategorySyncResult {
  categoryId: string
  channel: 'square'
  success: boolean
  error?: string
}

export async function pushCategory(category: Category): Promise<CategorySyncResult> {
  try {
    const { client } = await getSquareClient()

    // Delete existing Square object first (avoids VERSION_MISMATCH)
    if (category.square_category_id) {
      await client.catalog.object
        .delete({ objectId: category.square_category_id })
        .catch((err: unknown) => {
          // 404 = already gone — safe to continue
          if (!String(err).includes('404')) throw err
        })
    }

    // Resolve parent's Square ID if this is a sub-category
    let parentSquareCategoryId: string | undefined
    if (category.parent_id) {
      const supabase = createServiceRoleClient()
      const { data } = await supabase
        .from('categories')
        .select('square_category_id')
        .eq('id', category.parent_id)
        .single()
      parentSquareCategoryId = data?.square_category_id ?? undefined
    }

    const hasSeo = category.seo_title || category.seo_description || category.seo_permalink

    const result = await client.catalog.object.upsert({
      idempotencyKey: `category-${category.id}-${Date.now()}`,
      object: {
        type: 'CATEGORY',
        id: `#CAT-${category.id}`,
        categoryData: {
          name: category.name,
          categoryType: category.category_type as 'REGULAR_CATEGORY' | 'MENU_CATEGORY',
          onlineVisibility: category.online_visibility,
          parentCategory: parentSquareCategoryId ? { id: parentSquareCategoryId } : undefined,
          ecomSeoData: hasSeo ? {
            pageTitle: category.seo_title ?? undefined,
            pageDescription: category.seo_description ?? undefined,
            permalink: category.seo_permalink ?? undefined,
          } : undefined,
        },
      },
    })

    const squareCategoryId = result.catalogObject?.id
    if (!squareCategoryId) throw new Error('Square upsert returned no catalog object ID')

    const supabase = createServiceRoleClient()
    await supabase
      .from('categories')
      .update({ square_category_id: squareCategoryId, updated_at: new Date().toISOString() })
      .eq('id', category.id)

    return { categoryId: category.id, channel: 'square', success: true }
  } catch (err) {
    return { categoryId: category.id, channel: 'square', success: false, error: String(err) }
  }
}

export async function deleteSquareCategory(squareCategoryId: string): Promise<void> {
  try {
    const { client } = await getSquareClient()
    await client.catalog.object.delete({ objectId: squareCategoryId })
  } catch (err) {
    // 404 = already deleted — safe to ignore
    if (!String(err).includes('404')) {
      console.error('Square category delete failed:', err)
    }
  }
}

// ─── Product sync ─────────────────────────────────────────────────────────────

export async function pushProduct(product: Product): Promise<SyncResult> {
  try {
    const { client, locationId } = await getSquareClient()
    const idempotencyKey = `product-${product.id}-${Date.now()}`

    // Look up the category's Square ID via the FK
    let squareCategoryId: string | undefined
    if (product.category_id) {
      const supabase = createServiceRoleClient()
      const { data } = await supabase
        .from('categories')
        .select('square_category_id')
        .eq('id', product.category_id)
        .single()
      if (data?.square_category_id) {
        squareCategoryId = data.square_category_id
      }
      // If category exists but has no square_category_id, sync proceeds without category link
    }

    // Delete-then-recreate to avoid VERSION_MISMATCH
    if (product.square_catalog_id) {
      await client.catalog.object.delete({ objectId: product.square_catalog_id }).catch(() => {})
    }

    const result = await client.catalog.object.upsert({
      idempotencyKey,
      object: {
        type: 'ITEM',
        id: `#NEW-${product.id}`,
        itemData: {
          name: product.name,
          description: product.description ?? undefined,
          categories: squareCategoryId ? [{ id: squareCategoryId }] : undefined,
          variations: [{
            type: 'ITEM_VARIATION',
            id: `#VAR-${product.id}`,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variationId = (result.catalogObject as any)?.itemData?.variations?.[0]?.id
    if (!catalogObjectId) throw new Error('Square upsert returned no catalog object ID')

    const supabase = createServiceRoleClient()
    await supabase
      .from('products')
      .update({ square_catalog_id: catalogObjectId, square_variation_id: variationId ?? null })
      .eq('id', product.id)

    if (variationId) {
      await client.inventory.batchCreateChanges({
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

- [ ] **Step 4: Add `syncCategory` to `lib/channels/index.ts`**

Add after the existing `syncProduct` function:

```ts
export async function syncCategory(category: import('@/lib/supabase/types').Category): Promise<void> {
  const config = await getChannelConfig()
  if (!config.squareEnabled) return
  try {
    const { pushCategory } = await import('./square/catalog')
    const result = await pushCategory(category)
    // Note: do NOT pass category.id to logSyncResults — channel_sync_log.product_id is a FK
    // to products. Log sync errors to console only for categories.
    if (!result.success) {
      console.error('syncCategory Square error:', result.error)
    }
  } catch (err) {
    console.error('syncCategory error:', err)
  }
}
```

- [ ] **Step 5: Delete the sync-categories route**

```bash
rm app/api/admin/inventory/sync-categories/route.ts
rmdir app/api/admin/inventory/sync-categories 2>/dev/null || true
```

- [ ] **Step 6: Run Square sync tests — expect PASS**

```bash
scripts/test.sh __tests__/api/admin/categories.test.ts 2>&1 | tail -20
```

Expected: `pushCategory … PASS`

- [ ] **Step 7: Commit**

```bash
git add lib/channels/square/catalog.ts lib/channels/index.ts
git rm app/api/admin/inventory/sync-categories/route.ts
git commit -m "feat: add pushCategory/deleteSquareCategory, update pushProduct to use category_id FK"
```

---

## Task 4: Categories API routes

**Files:**
- Create: `app/api/admin/categories/route.ts`
- Create: `app/api/admin/categories/[id]/route.ts`
- Create: `app/api/admin/categories/reorder/route.ts`
- Modify: `__tests__/api/admin/categories.test.ts`

**Background:** These routes follow the exact same pattern as the inventory routes — `requireAdminSession()` first, `createServiceRoleClient()`, return `NextResponse.json()`. Study `app/api/admin/inventory/route.ts` and `app/api/admin/inventory/[id]/route.ts` before writing.

Helper — put this slug utility inline in `route.ts` (no separate file needed, YAGNI):
```ts
function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
```

- [ ] **Step 1: Write failing API tests**

Append to `__tests__/api/admin/categories.test.ts`:

```ts
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))
jest.mock('@/lib/channels', () => ({ syncCategory: jest.fn().mockResolvedValue(undefined) }))

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
}))

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {}
  const methods = ['select','insert','update','delete','upsert','eq','neq','is','order','limit','single','gte','lte']
  methods.forEach(m => { chain[m] = jest.fn().mockReturnValue(chain) })
  chain['single'] = jest.fn().mockResolvedValue(resolvedValue)
  chain['select'] = jest.fn().mockReturnValue({ ...chain, then: (r: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(r) })
  return chain
}

describe('POST /api/admin/categories', () => {
  beforeEach(() => jest.resetModules())

  it('rejects missing name', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const { POST } = await import('@/app/api/admin/categories/route')
    const req = new Request('http://localhost/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('rejects invalid category_type', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const { POST } = await import('@/app/api/admin/categories/route')
    const req = new Request('http://localhost/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', category_type: 'INVALID' }),
    })
    expect((await POST(req)).status).toBe(400)
  })
})

describe('DELETE /api/admin/categories/[id]', () => {
  beforeEach(() => jest.resetModules())

  it('blocks delete when products are assigned', async () => {
    // Mock: product count = 2
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products') return makeChain({ count: 2, data: [{ name: 'Ring A' }, { name: 'Ring B' }], error: null })
      if (table === 'gallery') return makeChain({ count: 0, data: [], error: null })
      return makeChain({ data: null, error: null })
    })
    const { DELETE } = await import('@/app/api/admin/categories/[id]/route')
    const req = new Request('http://localhost/api/admin/categories/cat-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'cat-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.productCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
scripts/test.sh __tests__/api/admin/categories.test.ts 2>&1 | tail -10
```

- [ ] **Step 3: Create `app/api/admin/categories/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'
import { syncCategory } from '@/lib/channels'

const VALID_CATEGORY_TYPES = ['REGULAR_CATEGORY', 'MENU_CATEGORY'] as const

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  // Fetch all categories with product count in one query
  const { data, error: dbError } = await supabase
    .from('categories')
    .select(`
      *,
      product_count:products(count)
    `)
    .order('sort_order', { ascending: true })

  if (dbError) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })

  // Normalize Supabase aggregate count format and nest children
  const rows = (data ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    product_count: Array.isArray(c.product_count) ? (c.product_count[0] as { count: number })?.count ?? 0 : 0,
  }))

  const topLevel = rows.filter((c: Record<string, unknown>) => !c.parent_id).map((parent: Record<string, unknown>) => ({
    ...parent,
    children: rows.filter((c: Record<string, unknown>) => c.parent_id === parent.id),
  }))

  return NextResponse.json(topLevel)
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const name = sanitizeText(String(body.name ?? '').trim())
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const categoryType = body.category_type ?? 'REGULAR_CATEGORY'
  if (!VALID_CATEGORY_TYPES.includes(categoryType)) {
    return NextResponse.json({ error: `category_type must be one of: ${VALID_CATEGORY_TYPES.join(', ')}` }, { status: 400 })
  }

  const slug = toSlug(name)
  const supabase = createServiceRoleClient()

  // Check slug collision
  const { data: existing } = await supabase.from('categories').select('id').eq('slug', slug).single()
  if (existing) return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 })

  // Validate parent (must be top-level — no grandchildren)
  const parentId: string | null = body.parent_id ?? null
  if (parentId) {
    const { data: parent } = await supabase.from('categories').select('parent_id').eq('id', parentId).single()
    if (!parent) return NextResponse.json({ error: 'parent_id not found' }, { status: 400 })
    if (parent.parent_id) return NextResponse.json({ error: 'parent must be a top-level category (no grandchildren)' }, { status: 400 })
  }

  // Compute sort_order: max among siblings + 1
  const { data: siblings } = await supabase
    .from('categories')
    .select('sort_order')
    .is('parent_id', parentId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const sortOrder = siblings?.[0] ? (siblings[0] as { sort_order: number }).sort_order + 1 : 0

  const { data, error: dbError } = await supabase
    .from('categories')
    .insert({
      name,
      slug,
      parent_id: parentId,
      sort_order: sortOrder,
      category_type: categoryType,
      online_visibility: body.online_visibility !== false,
      seo_title: body.seo_title ? sanitizeText(String(body.seo_title)) : null,
      seo_description: body.seo_description ? sanitizeText(String(body.seo_description)) : null,
      seo_permalink: body.seo_permalink ? toSlug(String(body.seo_permalink)) : null,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })

  // Fire-and-forget Square sync
  syncCategory(data).catch(console.error)

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/admin/categories/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'
import { syncCategory } from '@/lib/channels'
import { deleteSquareCategory } from '@/lib/channels/square/catalog'

const VALID_CATEGORY_TYPES = ['REGULAR_CATEGORY', 'MENU_CATEGORY'] as const

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('categories').select('*').eq('id', id).single()
  if (dbError || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const supabase = createServiceRoleClient()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.name !== undefined) {
    const name = sanitizeText(String(body.name).trim())
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    update.name = name
    const slug = toSlug(name)
    // Check slug collision (exclude self)
    const { data: existing } = await supabase.from('categories').select('id').eq('slug', slug).neq('id', id).single()
    if (existing) return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 })
    update.slug = slug
  }

  if (body.parent_id !== undefined) {
    const parentId: string | null = body.parent_id ?? null
    if (parentId) {
      const { data: parent } = await supabase.from('categories').select('parent_id').eq('id', parentId).single()
      if (!parent) return NextResponse.json({ error: 'parent_id not found' }, { status: 400 })
      if (parent.parent_id) return NextResponse.json({ error: 'parent must be a top-level category' }, { status: 400 })
    }
    update.parent_id = parentId
  }

  if (body.sort_order !== undefined) update.sort_order = Number(body.sort_order)
  if (body.category_type !== undefined) {
    if (!VALID_CATEGORY_TYPES.includes(body.category_type)) {
      return NextResponse.json({ error: 'invalid category_type' }, { status: 400 })
    }
    update.category_type = body.category_type
  }
  if (body.online_visibility !== undefined) update.online_visibility = Boolean(body.online_visibility)
  if (body.seo_title !== undefined) update.seo_title = body.seo_title ? sanitizeText(String(body.seo_title)) : null
  if (body.seo_description !== undefined) update.seo_description = body.seo_description ? sanitizeText(String(body.seo_description)) : null
  if (body.seo_permalink !== undefined) update.seo_permalink = body.seo_permalink ? toSlug(String(body.seo_permalink)) : null

  const { data, error: dbError } = await supabase
    .from('categories')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (dbError || !data) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })

  syncCategory(data).catch(console.error)
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()

  // Block delete if products or gallery items reference this category
  const [{ count: productCount, data: productRows }, { count: galleryCount }] = await Promise.all([
    supabase.from('products').select('name', { count: 'exact' }).eq('category_id', id).limit(5),
    supabase.from('gallery').select('id', { count: 'exact' }).eq('category_id', id).limit(1),
  ])

  const total = (productCount ?? 0) + (galleryCount ?? 0)
  if (total > 0) {
    const productNames = (productRows ?? []).map((p: { name: string }) => p.name)
    return NextResponse.json(
      { error: 'Cannot delete category with assigned items', productCount: productCount ?? 0, productNames, galleryCount: galleryCount ?? 0 },
      { status: 400 }
    )
  }

  // Fetch square_category_id before deleting
  const { data: cat } = await supabase.from('categories').select('square_category_id').eq('id', id).single()

  const { error: dbError } = await supabase.from('categories').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })

  // Await Square delete — log failure but don't fail the response
  if (cat?.square_category_id) {
    try {
      await deleteSquareCategory(cat.square_category_id)
    } catch (err) {
      console.error('Square category delete failed after DB delete:', err)
    }
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Create `app/api/admin/categories/reorder/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const items: unknown[] = Array.isArray(body.items) ? body.items : []

  if (items.length > 100) return NextResponse.json({ error: 'Too many items' }, { status: 400 })

  for (const item of items) {
    if (typeof item !== 'object' || item === null) return NextResponse.json({ error: 'Invalid item' }, { status: 400 })
    const { id, sort_order } = item as Record<string, unknown>
    if (typeof id !== 'string' || !UUID_RE.test(id)) return NextResponse.json({ error: `Invalid UUID: ${id}` }, { status: 400 })
    if (typeof sort_order !== 'number' || !Number.isInteger(sort_order) || sort_order < 0 || sort_order > 9999) {
      return NextResponse.json({ error: `sort_order out of range for ${id}` }, { status: 400 })
    }
  }

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  // Bulk update in parallel (small arrays, no transaction needed at this scale)
  await Promise.all(
    (items as Array<{ id: string; sort_order: number }>).map(({ id, sort_order }) =>
      supabase.from('categories').update({ sort_order, updated_at: now }).eq('id', id)
    )
  )

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
scripts/test.sh __tests__/api/admin/categories.test.ts 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/categories/ __tests__/api/admin/categories.test.ts
git commit -m "feat: add categories CRUD API routes (GET, POST, PATCH, DELETE, reorder)"
```

---

## Task 5: Update inventory API routes

**Files:**
- Modify: `app/api/admin/inventory/route.ts`
- Modify: `app/api/admin/inventory/[id]/route.ts`

These files still reference `VALID_CATEGORIES` and the `category` text column. Replace with `category_id` UUID.

- [ ] **Step 1: Update `app/api/admin/inventory/route.ts`**

Remove the `VALID_CATEGORIES` constant and `ValidCategory` type. In the `GET` handler, remove the category filter guard (any UUID is valid). In the `POST` handler, replace `category` with `category_id`:

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText, sanitizeContent } from '@/lib/sanitize'
import { syncProduct } from '@/lib/channels'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { searchParams } = new URL(request.url)
  const categoryId = searchParams.get('category_id')
  const search = searchParams.get('search')
  const supabase = createServiceRoleClient()
  let query = supabase.from('products').select('*').order('created_at', { ascending: false })
  if (categoryId) query = query.eq('category_id', categoryId)
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
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (isNaN(price) || price < 0) return NextResponse.json({ error: 'valid price required' }, { status: 400 })
  const images = Array.isArray(body.images) ? body.images.slice(0, 10).map(String) : []
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('products').insert({
    name, description, price, images,
    category_id: body.category_id ?? null,
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

- [ ] **Step 2: Update `app/api/admin/inventory/[id]/route.ts`**

Remove `VALID_CATEGORIES`. In `PATCH`, replace the `category` field update with `category_id`:

Find and replace this block:
```ts
  if (body.category !== undefined) {
    if (!VALID_CATEGORIES.includes(body.category as ValidCategory)) return NextResponse.json({ error: 'invalid category' }, { status: 400 })
    update.category = body.category
  }
```
with:
```ts
  if (body.category_id !== undefined) update.category_id = body.category_id ?? null
```

Also remove the `VALID_CATEGORIES` constant and `ValidCategory` type from the top of the file.

- [ ] **Step 3: Update existing inventory tests**

In `__tests__/api/admin/inventory.test.ts`, update the mock product to include `category_id` instead of `category`, and update the `'rejects invalid category'` test to match the new API:

```ts
// Update mock product in the mock:
{ id: 'p1', name: 'Test Ring', price: 45, category_id: 'cat-uuid-1', stock_count: 3, images: [], is_active: true, gallery_featured: false }

// Replace 'rejects invalid category' test:
it('accepts product without category_id', async () => {
  const { POST } = await import('@/app/api/admin/inventory/route')
  const req = new Request('http://localhost/api/admin/inventory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ring', price: 45 }),
  })
  expect((await POST(req)).status).toBe(201)
})
```

- [ ] **Step 4: Run tests**

```bash
scripts/test.sh __tests__/api/admin/inventory.test.ts 2>&1 | tail -10
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/inventory/route.ts "app/api/admin/inventory/[id]/route.ts" __tests__/api/admin/inventory.test.ts
git commit -m "feat: inventory API accepts category_id UUID instead of hardcoded category string"
```

---

## Task 6: Update `ProductForm` to use dynamic categories

**Files:**
- Modify: `components/admin/ProductForm.tsx`

`ProductForm` currently has a hardcoded `CATEGORIES` array and uses `product.category`. It needs to accept a `categories` prop and submit `category_id`.

- [ ] **Step 1: Update `ProductForm.tsx`**

Change the Props interface:
```ts
import type { Product, Category } from '@/lib/supabase/types'

interface Props {
  product?: Product
  categories: Category[]   // all categories (flat list including children)
  onSave: () => void
  onCancel: () => void
}
```

Remove the `CATEGORIES` constant and the `ProductCategory` import.

Change state initialisation:
```ts
const [categoryId, setCategoryId] = useState<string>(product?.category_id ?? '')
```

Replace the category `<select>` with a grouped dynamic one:
```tsx
<label style={labelStyle}>Category</label>
<select
  value={categoryId}
  onChange={e => setCategoryId(e.target.value)}
  style={inputStyle}
>
  <option value="">— Uncategorized —</option>
  {/* Top-level categories */}
  {categories.filter(c => !c.parent_id).map(parent => (
    <optgroup key={parent.id} label={parent.name}>
      <option value={parent.id}>{parent.name}</option>
      {categories.filter(c => c.parent_id === parent.id).map(child => (
        <option key={child.id} value={child.id}>  {child.name}</option>
      ))}
    </optgroup>
  ))}
</select>
```

In the form submit, change `category: category` to `category_id: categoryId || null`.

- [ ] **Step 2: Commit**

```bash
git add components/admin/ProductForm.tsx
git commit -m "feat: ProductForm uses dynamic categories prop and submits category_id"
```

---

## Task 7: `CategoryManager` component

**Files:**
- Create: `components/admin/CategoryManager.tsx`

This is the new Categories tab UI. It handles list, inline edit form, drag reorder, and delete error display. Study `InventoryManager.tsx` for style patterns (CSS custom properties, button styles, etc.).

- [ ] **Step 1: Create `components/admin/CategoryManager.tsx`**

```tsx
'use client'
import { useState, useRef } from 'react'
import type { Category } from '@/lib/supabase/types'

interface Props {
  initialCategories: Category[]
  squareSyncEnabled: boolean
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '14px', borderRadius: '4px',
  border: '1px solid var(--color-border)', marginBottom: '8px',
  background: 'var(--color-bg)', color: 'inherit', boxSizing: 'border-box',
}
const btnStyle: React.CSSProperties = {
  background: 'var(--color-primary)', color: 'var(--color-accent)',
  padding: '8px 16px', fontSize: '14px', border: 'none',
  borderRadius: '4px', cursor: 'pointer', minHeight: '48px',
}
const btnSmallStyle: React.CSSProperties = {
  padding: '4px 10px', fontSize: '13px', border: 'none',
  borderRadius: '4px', cursor: 'pointer', minHeight: '44px', minWidth: '44px',
}

type FlatCategory = Category & { children?: Category[] }
type EditState = { mode: 'new' } | { mode: 'edit'; category: Category }

export default function CategoryManager({ initialCategories, squareSyncEnabled }: Props) {
  const [categories, setCategories] = useState<FlatCategory[]>(initialCategories)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const dragItem = useRef<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formParentId, setFormParentId] = useState('')
  const [formSortOrder, setFormSortOrder] = useState('')
  const [formType, setFormType] = useState<'REGULAR_CATEGORY' | 'MENU_CATEGORY'>('REGULAR_CATEGORY')
  const [formVisible, setFormVisible] = useState(true)
  const [formSeoTitle, setFormSeoTitle] = useState('')
  const [formSeoDesc, setFormSeoDesc] = useState('')
  const [formSeoPermalink, setFormSeoPermalink] = useState('')

  async function reload() {
    const res = await fetch('/api/admin/categories')
    if (res.ok) setCategories(await res.json())
  }

  function openNew() {
    setEditState({ mode: 'new' })
    setFormName(''); setFormParentId(''); setFormSortOrder(''); setFormType('REGULAR_CATEGORY')
    setFormVisible(true); setFormSeoTitle(''); setFormSeoDesc(''); setFormSeoPermalink('')
    setSaveError('')
  }

  function openEdit(cat: Category) {
    setEditState({ mode: 'edit', category: cat })
    setFormName(cat.name); setFormParentId(cat.parent_id ?? '')
    setFormSortOrder(String(cat.sort_order)); setFormType(cat.category_type)
    setFormVisible(cat.online_visibility); setFormSeoTitle(cat.seo_title ?? '')
    setFormSeoDesc(cat.seo_description ?? ''); setFormSeoPermalink(cat.seo_permalink ?? '')
    setSaveError('')
  }

  function closeEdit() { setEditState(null); setSaveError('') }

  async function handleSave() {
    if (!formName.trim()) { setSaveError('Name is required.'); return }
    setSaving(true); setSaveError('')
    const payload = {
      name: formName.trim(),
      parent_id: formParentId || null,
      sort_order: formSortOrder ? Number(formSortOrder) : undefined,
      category_type: formType,
      online_visibility: formVisible,
      seo_title: formSeoTitle || null,
      seo_description: formSeoDesc || null,
      seo_permalink: formSeoPermalink || null,
    }
    try {
      const isNew = editState?.mode === 'new'
      const url = isNew ? '/api/admin/categories' : `/api/admin/categories/${(editState as { mode: 'edit'; category: Category }).category.id}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error ?? 'Save failed.')
      } else {
        closeEdit()
        await reload()
      }
    } catch {
      setSaveError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(cat: Category) {
    setDeleteErrors(prev => ({ ...prev, [cat.id]: '' }))
    const res = await fetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' })
    if (res.ok) {
      await reload()
    } else {
      const data = await res.json().catch(() => ({}))
      const parts: string[] = []
      if (data.productCount > 0) parts.push(`${data.productCount} product${data.productCount !== 1 ? 's' : ''}`)
      if (data.galleryCount > 0) parts.push(`${data.galleryCount} gallery item${data.galleryCount !== 1 ? 's' : ''}`)
      setDeleteErrors(prev => ({ ...prev, [cat.id]: `Cannot delete — blocked by ${parts.join(' and ')}. Reassign them first.` }))
    }
  }

  // Drag-to-reorder (top-level only within top-level, children within their parent)
  function onDragStart(id: string) { dragItem.current = id }
  async function onDrop(targetId: string) {
    if (!dragItem.current || dragItem.current === targetId) return
    const flat = categories.flatMap(c => [c, ...(c.children ?? [])])
    const dragCat = flat.find(c => c.id === dragItem.current)
    const targetCat = flat.find(c => c.id === targetId)
    if (!dragCat || !targetCat || dragCat.parent_id !== targetCat.parent_id) return

    // Swap sort_order values
    const items = [
      { id: dragCat.id, sort_order: targetCat.sort_order },
      { id: targetCat.id, sort_order: dragCat.sort_order },
    ]
    await fetch('/api/admin/categories/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    await reload()
    dragItem.current = null
  }

  const topLevel = categories.filter(c => !c.parent_id)

  function renderRow(cat: Category, isChild = false) {
    const synced = !!cat.square_category_id
    return (
      <div key={cat.id}>
        <div
          draggable
          onDragStart={() => onDragStart(cat.id)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => onDrop(cat.id)}
          style={{
            padding: isChild ? '7px 12px 7px 28px' : '9px 12px',
            background: isChild ? 'var(--color-bg)' : 'var(--color-surface)',
            borderTop: isChild ? '1px solid var(--color-border)' : undefined,
            display: 'flex', alignItems: 'center', gap: '8px',
          }}
        >
          <span style={{ color: 'var(--color-text-muted)', cursor: 'grab', fontSize: '14px' }}>⠿</span>
          <span style={{ flex: 1, fontWeight: isChild ? 400 : 600 }}>{cat.name}</span>
          {'product_count' in cat && (
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', background: 'var(--color-surface)', padding: '2px 7px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
              {(cat as Category & { product_count?: number }).product_count ?? 0} products
            </span>
          )}
          {squareSyncEnabled && (
            <span style={{ fontSize: '12px', padding: '2px 7px', borderRadius: '10px', background: synced ? 'var(--color-success-bg)' : 'var(--color-surface)', color: synced ? 'var(--color-success-text)' : 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              {synced ? '● Square' : '○ Not synced'}
            </span>
          )}
          <button style={{ ...btnSmallStyle, background: 'var(--color-primary)', color: 'var(--color-accent)' }} onClick={() => openEdit(cat)}>Edit</button>
          <button style={{ ...btnSmallStyle, background: 'var(--color-error)', color: 'var(--color-error-text)' }} onClick={() => handleDelete(cat)}>Delete</button>
        </div>
        {deleteErrors[cat.id] && (
          <div style={{ padding: '6px 12px 6px 28px', fontSize: '13px', color: 'var(--color-error)', background: 'var(--color-danger-bg)' }}>
            {deleteErrors[cat.id]}
          </div>
        )}
      </div>
    )
  }

  // Use CSS to handle mobile vs desktop layout — avoids SSR window access.
  // On desktop: the form is a fixed-width inline panel in the flex row.
  // On mobile: position:fixed makes it cover the screen (escapes the flex row).
  function renderFormFields() {
    return (
      <>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>Name *</label>
        <input style={inputStyle} value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Rings" />

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>Parent category</label>
        <select style={inputStyle} value={formParentId} onChange={e => setFormParentId(e.target.value)}>
          <option value="">— None (top-level) —</option>
          {topLevel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>Sort order</label>
        <input style={inputStyle} type="number" value={formSortOrder} onChange={e => setFormSortOrder(e.target.value)} placeholder="Auto" />

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>Category type</label>
        <select style={inputStyle} value={formType} onChange={e => setFormType(e.target.value as 'REGULAR_CATEGORY' | 'MENU_CATEGORY')}>
          <option value="REGULAR_CATEGORY">Regular</option>
          <option value="MENU_CATEGORY">Menu</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={formVisible} onChange={e => setFormVisible(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          Visible on Square Online
        </label>

        <details style={{ marginBottom: '12px' }}>
          <summary style={{ fontSize: '13px', color: 'var(--color-primary)', cursor: 'pointer', marginBottom: '6px' }}>SEO fields</summary>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '3px' }}>Title</label>
          <input style={{ ...inputStyle, fontSize: '13px' }} value={formSeoTitle} onChange={e => setFormSeoTitle(e.target.value)} placeholder="SEO title" />
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '3px' }}>Description</label>
          <textarea style={{ ...inputStyle, fontSize: '13px', height: '60px', resize: 'vertical' }} value={formSeoDesc} onChange={e => setFormSeoDesc(e.target.value)} placeholder="SEO description" />
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '3px' }}>Permalink slug</label>
          <input style={{ ...inputStyle, fontSize: '13px' }} value={formSeoPermalink} onChange={e => setFormSeoPermalink(e.target.value)} placeholder="rings" />
        </details>
      </>
    )
  }

  const formTitle = editState?.mode === 'new' ? 'Add Category' : 'Edit Category'
  const form = editState ? (
    <div className="cat-form">
      {/* Mobile-only sticky top bar (Back + title + Save) */}
      <div className="cat-form-mobile-header">
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', minHeight: '44px' }} onClick={closeEdit}>← Back</button>
        <span style={{ fontWeight: 600 }}>{formTitle}</span>
        <button style={btnStyle} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      {/* Form body */}
      <div className="cat-form-body">
        {/* Desktop-only title */}
        <div className="cat-form-desktop-title">{formTitle}</div>
        {renderFormFields()}
        {saveError && <p style={{ color: 'var(--color-error)', fontSize: '13px', marginBottom: '8px' }}>{saveError}</p>}
        {/* Desktop-only Save/Cancel buttons */}
        <div className="cat-form-desktop-actions">
          <button style={{ ...btnStyle, flex: 1 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button style={{ flex: 1, padding: '8px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg)', cursor: 'pointer', minHeight: '48px' }} onClick={closeEdit}>Cancel</button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontWeight: 600 }}>{categories.length} categories</span>
        <button style={btnStyle} onClick={openNew}>+ Add Category</button>
      </div>

      {/* flex row: list + inline form panel (form becomes position:fixed on mobile via CSS) */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {topLevel.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', padding: '24px', textAlign: 'center' }}>No categories yet. Add one above.</p>
          )}
          {topLevel.map(parent => (
            <div key={parent.id} style={{ border: '1px solid var(--color-border)', borderRadius: '6px', marginBottom: '8px', overflow: 'hidden' }}>
              {renderRow(parent)}
              {(parent.children ?? []).map(child => renderRow(child, true))}
            </div>
          ))}
        </div>
        {form}
      </div>

      <style>{`
        .cat-form {
          width: 260px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-surface);
          flex-shrink: 0;
        }
        .cat-form-mobile-header { display: none; }
        .cat-form-body { padding: 16px; }
        .cat-form-desktop-title { font-weight: 600; margin-bottom: 12px; }
        .cat-form-desktop-actions { display: flex; gap: 8px; }
        @media (max-width: 639px) {
          .cat-form {
            position: fixed;
            inset: 0;
            width: auto;
            border: none;
            border-radius: 0;
            z-index: 200;
            overflow-y: auto;
            background: var(--color-bg);
          }
          .cat-form-mobile-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-bottom: 1px solid var(--color-border);
            position: sticky;
            top: 0;
            background: var(--color-bg);
            z-index: 1;
          }
          .cat-form-desktop-title { display: none; }
          .cat-form-desktop-actions { display: none; }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/CategoryManager.tsx
git commit -m "feat: add CategoryManager component with list, inline edit form, and drag reorder"
```

---

## Task 8: Wire up InventoryManager tabs and InventoryPage

**Files:**
- Modify: `components/admin/InventoryManager.tsx`
- Modify: `app/admin/(dashboard)/inventory/page.tsx`

- [ ] **Step 1: Update `InventoryManager.tsx` — add tabs, remove squareCategoryIds prop, accept categories**

Add props:
```ts
interface Props {
  initialProducts: Product[]
  categories: Category[]       // NEW — passed to ProductForm and CategoryManager
  squareSyncEnabled: boolean   // already exists
  initialTab?: 'products' | 'categories'  // NEW — from URL ?tab= param
  // squareCategoryIds removed
}
```

Remove `squareCategoryIds` and `categoryIds`/`syncingCategories`/`categorySyncMsg` state.

Add `activeTab` state initialised from the prop:
```ts
const [activeTab, setActiveTab] = useState<'products' | 'categories'>(initialTab ?? 'products')
```

Add tab bar at the top of the returned JSX (before the Square category sync panel, which is also removed):
```tsx
{/* Tab bar */}
<div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid var(--color-border)' }}>
  {(['products', 'categories'] as const).map(tab => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      style={{
        padding: '8px 20px', fontSize: '15px', fontWeight: activeTab === tab ? 600 : 400,
        background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize',
        borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
        marginBottom: '-2px', color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)',
        minHeight: '48px',
      }}
    >
      {tab}
    </button>
  ))}
</div>
```

Wrap existing product list content in `{activeTab === 'products' && ( … )}`. Add the Categories tab:
```tsx
{activeTab === 'categories' && (
  <CategoryManager initialCategories={categories} squareSyncEnabled={squareSyncEnabled} />
)}
```

Pass `categories` to `ProductForm`:
```tsx
<ProductForm
  product={editingProduct}
  categories={categories}
  onSave={handleFormSave}
  onCancel={handleFormCancel}
/>
```

- [ ] **Step 2: Update `app/admin/(dashboard)/inventory/page.tsx`**

The page reads `?tab=` from the URL so the Categories tab is deep-linkable (spec requirement).

Replace with:
```ts
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import InventoryManager from '@/components/admin/InventoryManager'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Inventory' }

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')
  const { tab } = await searchParams
  const initialTab = tab === 'categories' ? 'categories' : 'products'
  const supabase = createServiceRoleClient()
  const [{ data: products }, { data: settings }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*').order('created_at', { ascending: false }),
    supabase.from('settings').select('square_sync_enabled').single(),
    supabase.from('categories').select(`*, product_count:products(count)`).order('sort_order', { ascending: true }),
  ])

  // Normalize product_count and nest children
  const flatCats = (categories ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    product_count: Array.isArray(c.product_count) ? (c.product_count[0] as { count: number })?.count ?? 0 : 0,
  }))
  const nestedCats = flatCats
    .filter((c: Record<string, unknown>) => !c.parent_id)
    .map((parent: Record<string, unknown>) => ({
      ...parent,
      children: flatCats.filter((c: Record<string, unknown>) => c.parent_id === parent.id),
    }))

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Inventory</h1>
      <InventoryManager
        initialProducts={products ?? []}
        categories={nestedCats as import('@/lib/supabase/types').Category[]}
        squareSyncEnabled={settings?.square_sync_enabled ?? false}
        initialTab={initialTab}
      />
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any remaining type errors (likely around `Category` import in `InventoryManager`).

- [ ] **Step 4: Run all tests**

```bash
scripts/test.sh 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add components/admin/InventoryManager.tsx "app/admin/(dashboard)/inventory/page.tsx"
git commit -m "feat: inventory page gains Products/Categories tabs; ProductForm uses dynamic categories"
```

---

## Task 9: Final cleanup and smoke test

- [ ] **Step 1: Remove dead imports**

Check for any remaining references to `ProductCategory` or `CATEGORIES`:
```bash
grep -rn "ProductCategory\|VALID_CATEGORIES\|CATEGORIES\b\|ensureSquareCategories\|sync-categories\|square_category_ids" \
  app/ components/ lib/ --include="*.ts" --include="*.tsx" | grep -v ".next"
```

Fix any found.

- [ ] **Step 2: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 3: Run full test suite**

```bash
scripts/test.sh 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 4: Manual smoke test**

1. Open Admin → Inventory → Categories tab
2. Add a new top-level category "Handmade" — verify it appears in the list
3. Add a sub-category "Wreaths" under "Handmade" — verify indented appearance
4. Edit "Wreaths" — change name, save — verify Square sync badge turns green (if Square connected)
5. Try to delete a category with products — verify inline block error
6. Delete "Wreaths" (0 products) — verify it disappears and Square sync runs
7. Open a product → Edit — verify category dropdown shows dynamic list
8. Drag "Rings" to reorder — verify sort order persists after page reload

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: dynamic category management — CRUD, Square sync, inventory integration"
git push origin main
```
