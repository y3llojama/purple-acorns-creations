# Favorites & Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace localStorage-based saved items with a database-backed favorites system that supports shareable lists (snapshot copies and live editable lists).

**Architecture:** New Supabase tables (`saved_lists`, `saved_list_items`) store favorites tied to an anonymous UUID token in localStorage. API routes handle CRUD + sharing. The existing `useSavedItems` hook is refactored to be API-backed with optimistic UI. A shared list page (`/shop/saved/[slug]`) renders both snapshots and live editable lists.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL, TypeScript, Lucide React icons, Jest

**Spec:** `docs/superpowers/specs/2026-03-27-favorites-sharing-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/044_saved_lists.sql` | Create `saved_lists` and `saved_list_items` tables |
| `lib/saved-lists-rate-limit.ts` | Shared rate limiting utility for saved-lists endpoints |
| `lib/slug.ts` | Slug generation for shared lists |
| `app/api/shop/saved-lists/route.ts` | POST: create list |
| `app/api/shop/saved-lists/me/route.ts` | POST: fetch own list |
| `app/api/shop/saved-lists/items/route.ts` | POST: add item |
| `app/api/shop/saved-lists/items/remove/route.ts` | POST: remove item |
| `app/api/shop/saved-lists/share/route.ts` | POST: generate share link |
| `app/api/shop/saved-lists/stop-sharing/route.ts` | POST: revoke sharing |
| `app/api/shop/saved-lists/[slug]/route.ts` | GET: view shared list |
| `app/api/shop/saved-lists/[slug]/add-to-mine/route.ts` | POST: add item from shared list to own list |
| `app/(public)/shop/saved/[slug]/page.tsx` | Shared list page |
| `components/shop/ShareButton.tsx` | Link2 icon copy-to-clipboard button |
| `components/shop/Toast.tsx` | Toast notification component |
| `components/shop/ToastContext.tsx` | Toast provider context |
| `__tests__/lib/slug.test.ts` | Tests for slug generation |
| `__tests__/api/saved-lists.test.ts` | Tests for saved-lists API routes |

### Modified Files
| File | Changes |
|------|---------|
| `lib/saved-items.ts` | Full rewrite: API-backed with localStorage token + migration logic |
| `lib/validate.ts` | Add `isValidSlug()` |
| `components/shop/HeartButton.tsx` | Use refactored `useSavedItems` hook |
| `components/shop/ProductCard.tsx` | Add ShareButton (Link2 icon) |
| `components/shop/ProductDetail.tsx` | Add ShareButton (Link2 icon) |
| `app/(public)/shop/saved/page.tsx` | Refactor to API-backed, add share buttons |
| `app/(public)/shop/layout.tsx` or root layout | Wrap with ToastProvider |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/044_saved_lists.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Saved lists (favorites) with anonymous token-based ownership and sharing.

CREATE TABLE saved_lists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  edit_token    UUID UNIQUE,
  slug          TEXT UNIQUE,
  is_snapshot   BOOLEAN NOT NULL DEFAULT false,
  source_list_id UUID REFERENCES saved_lists(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Constraint: slugs must be lowercase alphanumeric + hyphens, max 60 chars
ALTER TABLE saved_lists ADD CONSTRAINT slug_format
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9-]{1,60}$');

CREATE INDEX idx_saved_lists_last_accessed ON saved_lists (last_accessed_at);

CREATE TABLE saved_list_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID NOT NULL REFERENCES saved_lists(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, product_id)
);

CREATE INDEX idx_saved_list_items_list ON saved_list_items (list_id);
```

- [ ] **Step 2: Verify migration file numbering**

Run: `ls supabase/migrations/ | tail -5`
Expected: `044_saved_lists.sql` is the latest file

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/044_saved_lists.sql
git commit -m "feat: add saved_lists and saved_list_items tables for favorites sharing"
```

---

## Task 2: Validation & Slug Utilities

**Files:**
- Modify: `lib/validate.ts`
- Create: `lib/slug.ts`
- Create: `__tests__/lib/slug.test.ts`

- [ ] **Step 1: Add `isValidSlug` to validate.ts**

Add at the end of `lib/validate.ts`:

```typescript
/** Validate slug format: lowercase alphanumeric + hyphens, 1-60 chars */
export function isValidSlug(str: string): boolean {
  return /^[a-z0-9-]{1,60}$/.test(str)
}
```

- [ ] **Step 2: Write failing tests for slug generation**

Create `__tests__/lib/slug.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { generateSlug } from '@/lib/slug'

describe('generateSlug', () => {
  it('generates slug from category names', () => {
    const slug = generateSlug(['Rings', 'Necklaces', 'Earrings'])
    expect(slug).toMatch(/^rings-necklaces-earrings-[a-z0-9]{8}$/)
  })

  it('limits to 3 descriptors', () => {
    const slug = generateSlug(['Rings', 'Necklaces', 'Earrings', 'Bracelets'])
    expect(slug).toMatch(/^rings-necklaces-earrings-[a-z0-9]{8}$/)
  })

  it('falls back to "favorites" when no descriptors', () => {
    const slug = generateSlug([])
    expect(slug).toMatch(/^favorites-[a-z0-9]{8}$/)
  })

  it('strips non-alphanumeric characters', () => {
    const slug = generateSlug(["Mom's Picks", 'Best & Brightest'])
    expect(slug).toMatch(/^moms-picks-best-brightest-[a-z0-9]{8}$/)
  })

  it('truncates long descriptors to fit 60 char max', () => {
    const slug = generateSlug(['Very Long Category Name That Keeps Going', 'Another Long One Here Too'])
    expect(slug.length).toBeLessThanOrEqual(60)
  })

  it('does not generate reserved slugs', () => {
    // Monkey-patch Math.random to force collision with reserved word - not needed
    // Just verify the output doesn't match reserved words
    const slug = generateSlug(['share'])
    // The descriptor is "share" but the suffix makes it not match the reserved route
    expect(slug).toMatch(/^share-[a-z0-9]{8}$/)
  })

  it('generates unique slugs on repeated calls', () => {
    const slugs = new Set(Array.from({ length: 20 }, () => generateSlug(['Rings'])))
    expect(slugs.size).toBe(20)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest __tests__/lib/slug.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '@/lib/slug'`

- [ ] **Step 4: Implement slug generation**

Create `lib/slug.ts`:

```typescript
import crypto from 'crypto'

const RESERVED_SLUGS = new Set(['share', 'me', 'items', 'stop-sharing'])

function randomSuffix(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

function kebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function generateSlug(descriptors: string[]): string {
  const cleaned = descriptors
    .slice(0, 3)
    .map(kebab)
    .filter(Boolean)

  const prefix = cleaned.length > 0 ? cleaned.join('-') : 'favorites'
  const suffixLen = 8
  const maxPrefixLen = 60 - suffixLen - 1 // 1 for the hyphen before suffix
  const truncatedPrefix = prefix.slice(0, maxPrefixLen).replace(/-$/, '')

  let slug = `${truncatedPrefix}-${randomSuffix(suffixLen)}`

  // Avoid reserved slugs (extremely unlikely but handle it)
  if (RESERVED_SLUGS.has(slug)) {
    slug = `${truncatedPrefix}-${randomSuffix(suffixLen)}`
  }

  return slug
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/lib/slug.test.ts --no-coverage`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/validate.ts lib/slug.ts __tests__/lib/slug.test.ts
git commit -m "feat: add slug generation utility and isValidSlug validator"
```

---

## Task 3: Rate Limiting Utility

**Files:**
- Create: `lib/saved-lists-rate-limit.ts`

- [ ] **Step 1: Create shared rate limiter**

Create `lib/saved-lists-rate-limit.ts`:

```typescript
import { getClientIp } from '@/lib/get-client-ip'

interface RateEntry {
  count: number
  reset: number
}

interface RateBucket {
  map: Map<string, RateEntry>
  lastPrune: number
}

const buckets: Record<string, RateBucket> = {}

function getBucket(name: string): RateBucket {
  if (!buckets[name]) {
    buckets[name] = { map: new Map(), lastPrune: Date.now() }
  }
  return buckets[name]
}

function prune(bucket: RateBucket, windowMs: number): void {
  const now = Date.now()
  if (now - bucket.lastPrune < 5 * 60_000) return
  bucket.lastPrune = now
  for (const [ip, entry] of bucket.map) {
    if (now > entry.reset) bucket.map.delete(ip)
  }
}

/**
 * Check rate limit for a given bucket name.
 * Returns true if the request is allowed, false if rate-limited.
 */
export function checkRate(
  request: Request,
  bucketName: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const ip = getClientIp(request)
  const bucket = getBucket(bucketName)
  prune(bucket, windowMs)

  const now = Date.now()
  const entry = bucket.map.get(ip) ?? { count: 0, reset: now + windowMs }

  if (now > entry.reset) {
    entry.count = 0
    entry.reset = now + windowMs
  }

  entry.count++
  bucket.map.set(ip, entry)
  return entry.count <= maxRequests
}

/** Rate-limit response helper */
export function rateLimitResponse() {
  return Response.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429 }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/saved-lists-rate-limit.ts
git commit -m "feat: shared rate limiting utility for saved-lists endpoints"
```

---

## Task 4: API — Create List

**Files:**
- Create: `app/api/shop/saved-lists/route.ts`
- Create: `__tests__/api/saved-lists.test.ts`

- [ ] **Step 1: Write failing test**

Create `__tests__/api/saved-lists.test.ts`:

```typescript
/**
 * @jest-environment node
 */

// Mock Supabase before any imports
const mockInsert = jest.fn()
const mockSelect = jest.fn()
const mockFrom = jest.fn(() => ({
  insert: mockInsert,
  select: mockSelect,
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: mockFrom,
  })),
}))

jest.mock('@/lib/get-client-ip', () => ({
  getClientIp: jest.fn(() => '127.0.0.1'),
}))

describe('POST /api/shop/saved-lists', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates a new list and returns token', async () => {
    const mockRow = {
      id: '11111111-1111-1111-1111-111111111111',
      token: '22222222-2222-2222-2222-222222222222',
    }
    mockInsert.mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: mockRow, error: null }),
      }),
    })

    const { POST } = await import('@/app/api/shop/saved-lists/route')
    const req = new Request('http://localhost/api/shop/saved-lists', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.token).toBe(mockRow.token)
    expect(body.id).toBe(mockRow.id)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/api/saved-lists.test.ts --no-coverage`
Expected: FAIL — `Cannot find module '@/app/api/shop/saved-lists/route'`

- [ ] **Step 3: Implement the route**

Create `app/api/shop/saved-lists/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-create', 5, 3_600_000)) return rateLimitResponse()

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('saved_lists')
    .insert({})
    .select('id, token')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, token: data.token })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/api/saved-lists.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/shop/saved-lists/route.ts __tests__/api/saved-lists.test.ts
git commit -m "feat: POST /api/shop/saved-lists — create favorites list"
```

---

## Task 5: API — Fetch Own List

**Files:**
- Create: `app/api/shop/saved-lists/me/route.ts`

- [ ] **Step 1: Write failing test**

Add to `__tests__/api/saved-lists.test.ts`:

```typescript
describe('POST /api/shop/saved-lists/me', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  it('returns 400 for invalid token', async () => {
    const { POST } = await import('@/app/api/shop/saved-lists/me/route')
    const req = new Request('http://localhost/api/shop/saved-lists/me', {
      method: 'POST',
      body: JSON.stringify({ token: 'not-a-uuid' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when list not found', async () => {
    mockFrom.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    })

    const { POST } = await import('@/app/api/shop/saved-lists/me/route')
    const req = new Request('http://localhost/api/shop/saved-lists/me', {
      method: 'POST',
      body: JSON.stringify({ token: '22222222-2222-2222-2222-222222222222' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/api/saved-lists.test.ts --no-coverage --testNamePattern="saved-lists/me"`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement the route**

Create `app/api/shop/saved-lists/me/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

function availability(stockCount: number, stockReserved: number): string {
  const available = stockCount - (stockReserved ?? 0)
  if (available <= 0) return 'sold_out'
  if (available <= 5) return 'low_stock'
  return 'in_stock'
}

export async function POST(request: Request) {
  if (!checkRate(request, 'list-me', 60, 60_000)) return rateLimitResponse()

  let body: { token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token } = body
  if (!token || !isValidUuid(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Fetch the list
  const { data: list, error: listError } = await supabase
    .from('saved_lists')
    .select('id, slug, updated_at')
    .eq('token', token)
    .single()

  if (listError || !list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  // Fetch items joined with products
  const { data: items, error: itemsError } = await supabase
    .from('saved_list_items')
    .select(`
      product_id,
      added_at,
      products:product_id (name, price, images, stock_count, stock_reserved, is_active)
    `)
    .eq('list_id', list.id)
    .order('added_at', { ascending: false })

  if (itemsError) {
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }

  const activeItems = (items ?? [])
    .filter((item: any) => item.products?.is_active)
    .map((item: any) => ({
      product_id: item.product_id,
      name: item.products.name,
      price: item.products.price,
      images: item.products.images,
      availability: availability(item.products.stock_count, item.products.stock_reserved),
      added_at: item.added_at,
    }))

  return NextResponse.json({
    id: list.id,
    slug: list.slug,
    updated_at: list.updated_at,
    items: activeItems,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/api/saved-lists.test.ts --no-coverage --testNamePattern="saved-lists/me"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/shop/saved-lists/me/route.ts __tests__/api/saved-lists.test.ts
git commit -m "feat: POST /api/shop/saved-lists/me — fetch own favorites list"
```

---

## Task 6: API — Add Item & Remove Item

**Files:**
- Create: `app/api/shop/saved-lists/items/route.ts`
- Create: `app/api/shop/saved-lists/items/remove/route.ts`

- [ ] **Step 1: Write failing tests for add item**

Add to `__tests__/api/saved-lists.test.ts`:

```typescript
describe('POST /api/shop/saved-lists/items', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  it('returns 400 for invalid product_id', async () => {
    const { POST } = await import('@/app/api/shop/saved-lists/items/route')
    const req = new Request('http://localhost/api/shop/saved-lists/items', {
      method: 'POST',
      body: JSON.stringify({ token: '22222222-2222-2222-2222-222222222222', product_id: 'bad' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/api/saved-lists.test.ts --no-coverage --testNamePattern="saved-lists/items"`
Expected: FAIL

- [ ] **Step 3: Implement add item route**

Create `app/api/shop/saved-lists/items/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-items', 30, 60_000)) return rateLimitResponse()

  let body: { token?: string; product_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, product_id } = body
  if (!token || !isValidUuid(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  if (!product_id || !isValidUuid(product_id)) {
    return NextResponse.json({ error: 'Invalid product_id' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Validate product exists and is active
  const { data: product } = await supabase
    .from('products')
    .select('id, is_active')
    .eq('id', product_id)
    .single()

  if (!product || !product.is_active) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Find or lazily create list
  let { data: list } = await supabase
    .from('saved_lists')
    .select('id, is_snapshot')
    .eq('token', token)
    .single()

  if (!list) {
    // Lazy creation — check list-create rate limit
    if (!checkRate(request, 'list-create', 5, 3_600_000)) return rateLimitResponse()

    const { data: newList, error: createError } = await supabase
      .from('saved_lists')
      .insert({ token })
      .select('id, is_snapshot')
      .single()

    if (createError || !newList) {
      return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
    }
    list = newList
  }

  // Reject writes to snapshots
  if (list.is_snapshot) {
    return NextResponse.json({ error: 'Cannot modify a snapshot list' }, { status: 403 })
  }

  // Check item count cap
  const { count } = await supabase
    .from('saved_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', list.id)

  if ((count ?? 0) >= 200) {
    return NextResponse.json({ error: 'List is full (max 200 items)' }, { status: 422 })
  }

  // Upsert item
  const { error: insertError } = await supabase
    .from('saved_list_items')
    .upsert(
      { list_id: list.id, product_id },
      { onConflict: 'list_id,product_id', ignoreDuplicates: true }
    )

  if (insertError) {
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 })
  }

  // Update timestamps
  await supabase
    .from('saved_lists')
    .update({ updated_at: new Date().toISOString(), last_accessed_at: new Date().toISOString() })
    .eq('id', list.id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Implement remove item route**

Create `app/api/shop/saved-lists/items/remove/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-items-remove', 30, 60_000)) return rateLimitResponse()

  let body: { token?: string; product_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, product_id } = body
  if (!token || !isValidUuid(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  if (!product_id || !isValidUuid(product_id)) {
    return NextResponse.json({ error: 'Invalid product_id' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Find list by token (owner) or edit_token (collaborator)
  let { data: list } = await supabase
    .from('saved_lists')
    .select('id, is_snapshot')
    .eq('token', token)
    .single()

  if (!list) {
    // Try edit_token
    const { data: editList } = await supabase
      .from('saved_lists')
      .select('id, is_snapshot')
      .eq('edit_token', token)
      .single()
    list = editList
  }

  if (!list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  if (list.is_snapshot) {
    return NextResponse.json({ error: 'Cannot modify a snapshot list' }, { status: 403 })
  }

  const { error } = await supabase
    .from('saved_list_items')
    .delete()
    .eq('list_id', list.id)
    .eq('product_id', product_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 })
  }

  // Update timestamps
  await supabase
    .from('saved_lists')
    .update({ updated_at: new Date().toISOString(), last_accessed_at: new Date().toISOString() })
    .eq('id', list.id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest __tests__/api/saved-lists.test.ts --no-coverage`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/shop/saved-lists/items/route.ts app/api/shop/saved-lists/items/remove/route.ts __tests__/api/saved-lists.test.ts
git commit -m "feat: add and remove items from favorites list"
```

---

## Task 7: API — Share & Stop Sharing

**Files:**
- Create: `app/api/shop/saved-lists/share/route.ts`
- Create: `app/api/shop/saved-lists/stop-sharing/route.ts`

- [ ] **Step 1: Implement share route**

Create `app/api/shop/saved-lists/share/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'
import { generateSlug } from '@/lib/slug'
import crypto from 'crypto'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-share', 10, 60_000)) return rateLimitResponse()

  let body: { token?: string; mode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, mode } = body
  if (!token || !isValidUuid(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  if (mode !== 'copy' && mode !== 'live') {
    return NextResponse.json({ error: 'mode must be "copy" or "live"' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Fetch the owner's list
  const { data: list, error: listError } = await supabase
    .from('saved_lists')
    .select('id, slug, edit_token')
    .eq('token', token)
    .single()

  if (listError || !list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  // Fetch items with category names for slug generation
  const { data: items } = await supabase
    .from('saved_list_items')
    .select(`
      product_id,
      products:product_id (name, category_id, categories:category_id (name))
    `)
    .eq('list_id', list.id)

  const categoryNames = (items ?? [])
    .map((i: any) => i.products?.categories?.name)
    .filter(Boolean)
  const uniqueCategories = [...new Set(categoryNames)] as string[]
  const descriptors = uniqueCategories.length > 0
    ? uniqueCategories
    : (items ?? []).map((i: any) => i.products?.name).filter(Boolean).slice(0, 3)

  if (mode === 'copy') {
    // Create snapshot
    const slug = generateSlug(descriptors)

    // Check slug collision
    const { data: existing } = await supabase
      .from('saved_lists')
      .select('id')
      .eq('slug', slug)
      .single()

    const finalSlug = existing ? generateSlug(descriptors) : slug

    const { data: snapshot, error: snapError } = await supabase
      .from('saved_lists')
      .insert({
        slug: finalSlug,
        is_snapshot: true,
        source_list_id: list.id,
      })
      .select('id, slug')
      .single()

    if (snapError || !snapshot) {
      return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 })
    }

    // Copy items
    if (items && items.length > 0) {
      const itemRows = items.map((i: any) => ({
        list_id: snapshot.id,
        product_id: i.product_id,
      }))
      await supabase.from('saved_list_items').insert(itemRows)
    }

    const baseUrl = request.headers.get('origin') || ''
    return NextResponse.json({
      slug: snapshot.slug,
      url: `${baseUrl}/shop/saved/${snapshot.slug}`,
    })
  }

  // mode === 'live'
  if (list.slug) {
    const baseUrl = request.headers.get('origin') || ''
    return NextResponse.json({
      slug: list.slug,
      url: `${baseUrl}/shop/saved/${list.slug}#edit=${list.edit_token}`,
    })
  }

  // Generate slug and edit_token
  const slug = generateSlug(descriptors)
  const editToken = crypto.randomUUID()

  // Check slug collision
  const { data: existing } = await supabase
    .from('saved_lists')
    .select('id')
    .eq('slug', slug)
    .single()

  const finalSlug = existing ? generateSlug(descriptors) : slug

  const { error: updateError } = await supabase
    .from('saved_lists')
    .update({ slug: finalSlug, edit_token: editToken })
    .eq('id', list.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to share list' }, { status: 500 })
  }

  const baseUrl = request.headers.get('origin') || ''
  return NextResponse.json({
    slug: finalSlug,
    url: `${baseUrl}/shop/saved/${finalSlug}#edit=${editToken}`,
  })
}
```

- [ ] **Step 2: Implement stop-sharing route**

Create `app/api/shop/saved-lists/stop-sharing/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-stop-sharing', 5, 60_000)) return rateLimitResponse()

  let body: { token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token } = body
  if (!token || !isValidUuid(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('saved_lists')
    .update({ slug: null, edit_token: null })
    .eq('token', token)

  if (error) {
    return NextResponse.json({ error: 'Failed to stop sharing' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/shop/saved-lists/share/route.ts app/api/shop/saved-lists/stop-sharing/route.ts
git commit -m "feat: share and stop-sharing endpoints for favorites lists"
```

---

## Task 8: API — View Shared List & Add to Mine

**Files:**
- Create: `app/api/shop/saved-lists/[slug]/route.ts`
- Create: `app/api/shop/saved-lists/[slug]/add-to-mine/route.ts`

- [ ] **Step 1: Implement shared list view**

Create `app/api/shop/saved-lists/[slug]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidSlug } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'
import { getClientIp } from '@/lib/get-client-ip'

// Separate rate limiter for 404s to slow enumeration
const notFoundMap = new Map<string, { count: number; reset: number }>()

function check404Rate(request: Request): boolean {
  const ip = getClientIp(request)
  const now = Date.now()
  const entry = notFoundMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++
  notFoundMap.set(ip, entry)
  return entry.count <= 10
}

function availability(stockCount: number, stockReserved: number): string {
  const available = stockCount - (stockReserved ?? 0)
  if (available <= 0) return 'sold_out'
  if (available <= 5) return 'low_stock'
  return 'in_stock'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!checkRate(request, 'list-slug-view', 30, 60_000)) return rateLimitResponse()

  const { slug } = await params
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { data: list, error } = await supabase
    .from('saved_lists')
    .select('id, is_snapshot, updated_at')
    .eq('slug', slug)
    .single()

  if (error || !list) {
    if (!check404Rate(request)) return rateLimitResponse()
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  const { data: items } = await supabase
    .from('saved_list_items')
    .select(`
      product_id,
      added_at,
      products:product_id (name, price, images, stock_count, stock_reserved, is_active)
    `)
    .eq('list_id', list.id)
    .order('added_at', { ascending: false })

  const activeItems = (items ?? [])
    .filter((item: any) => item.products?.is_active)
    .map((item: any) => ({
      product_id: item.product_id,
      name: item.products.name,
      price: item.products.price,
      images: item.products.images,
      availability: availability(item.products.stock_count, item.products.stock_reserved),
      added_at: item.added_at,
    }))

  return NextResponse.json({
    id: list.id,
    is_snapshot: list.is_snapshot,
    is_live: !list.is_snapshot,
    updated_at: list.updated_at,
    items: activeItems,
  })
}
```

- [ ] **Step 2: Implement add-to-mine**

Create `app/api/shop/saved-lists/[slug]/add-to-mine/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid, isValidSlug } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!checkRate(request, 'list-add-to-mine', 20, 60_000)) return rateLimitResponse()

  const { slug } = await params
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  let body: { my_token?: string; product_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { my_token, product_id } = body
  if (!my_token || !isValidUuid(my_token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  if (!product_id || !isValidUuid(product_id)) {
    return NextResponse.json({ error: 'Invalid product_id' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Verify the shared list contains this product
  const { data: sharedList } = await supabase
    .from('saved_lists')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!sharedList) {
    return NextResponse.json({ error: 'Shared list not found' }, { status: 404 })
  }

  const { data: sharedItem } = await supabase
    .from('saved_list_items')
    .select('id')
    .eq('list_id', sharedList.id)
    .eq('product_id', product_id)
    .single()

  if (!sharedItem) {
    return NextResponse.json({ error: 'Product not in shared list' }, { status: 404 })
  }

  // Verify product is active
  const { data: product } = await supabase
    .from('products')
    .select('id, is_active')
    .eq('id', product_id)
    .single()

  if (!product || !product.is_active) {
    return NextResponse.json({ error: 'Product not available' }, { status: 404 })
  }

  // Find or lazily create the visitor's own list
  let { data: myList } = await supabase
    .from('saved_lists')
    .select('id')
    .eq('token', my_token)
    .single()

  if (!myList) {
    if (!checkRate(request, 'list-create', 5, 3_600_000)) return rateLimitResponse()

    const { data: newList, error: createError } = await supabase
      .from('saved_lists')
      .insert({ token: my_token })
      .select('id')
      .single()

    if (createError || !newList) {
      return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
    }
    myList = newList
  }

  // Check item count cap
  const { count } = await supabase
    .from('saved_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', myList.id)

  if ((count ?? 0) >= 200) {
    return NextResponse.json({ error: 'Your list is full (max 200 items)' }, { status: 422 })
  }

  // Upsert
  await supabase
    .from('saved_list_items')
    .upsert(
      { list_id: myList.id, product_id },
      { onConflict: 'list_id,product_id', ignoreDuplicates: true }
    )

  // Update timestamps on the visitor's list
  await supabase
    .from('saved_lists')
    .update({ updated_at: new Date().toISOString(), last_accessed_at: new Date().toISOString() })
    .eq('id', myList.id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/shop/saved-lists/[slug]/route.ts app/api/shop/saved-lists/[slug]/add-to-mine/route.ts
git commit -m "feat: view shared list and add-to-mine endpoints"
```

---

## Task 9: Toast Component & Context

**Files:**
- Create: `components/shop/ToastContext.tsx`
- Create: `components/shop/Toast.tsx`

- [ ] **Step 1: Create ToastContext**

Create `components/shop/ToastContext.tsx`:

```typescript
'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface ToastState {
  message: string
  id: number
}

interface ToastContextValue {
  toast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([])

  const toast = useCallback((message: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { message, id }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          role="status"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'none',
          }}
        >
          {toasts.map(t => (
            <div
              key={t.id}
              style={{
                background: 'var(--color-text)',
                color: 'var(--color-surface)',
                padding: '10px 20px',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: "'Jost', sans-serif",
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                whiteSpace: 'nowrap',
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
```

- [ ] **Step 2: Add ToastProvider to shop layout**

Read `app/(public)/shop/layout.tsx` first, then wrap its children with `<ToastProvider>`. If the layout already wraps children in a `CartProvider`, nest the `ToastProvider` inside it:

```typescript
import { ToastProvider } from '@/components/shop/ToastContext'

// Inside the layout's return, wrap children:
<ToastProvider>{children}</ToastProvider>
```

- [ ] **Step 3: Commit**

```bash
git add components/shop/ToastContext.tsx app/\(public\)/shop/layout.tsx
git commit -m "feat: toast notification component and context"
```

---

## Task 10: ShareButton Component

**Files:**
- Create: `components/shop/ShareButton.tsx`

- [ ] **Step 1: Create ShareButton**

Create `components/shop/ShareButton.tsx`:

```typescript
'use client'

import { Link2 } from 'lucide-react'
import { useToast } from '@/components/shop/ToastContext'

interface Props {
  url: string
  label?: string
}

export default function ShareButton({ url, label = 'Copy link' }: Props) {
  const { toast } = useToast()

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied!')
    } catch {
      toast('Failed to copy link')
    }
  }

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      title={label}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '8px',
        minHeight: '48px',
        minWidth: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
      }}
    >
      <Link2 size={18} />
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/shop/ShareButton.tsx
git commit -m "feat: ShareButton component with Link2 icon and clipboard copy"
```

---

## Task 11: Refactor `useSavedItems` Hook

**Files:**
- Modify: `lib/saved-items.ts`

- [ ] **Step 1: Rewrite the hook**

Replace the entire contents of `lib/saved-items.ts`:

```typescript
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface SavedItem {
  product_id: string
  name: string
  price: number
  images: string[]
  availability: 'in_stock' | 'low_stock' | 'sold_out'
  added_at: string
}

const TOKEN_KEY = 'pa-list-token'
const OLD_KEY = 'pa-saved-items'
const MIGRATION_FLAG = 'pa-migration-in-progress'
const SYNC_EVENT = 'pa-saved-items-changed'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function setToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token) } catch {}
}

async function createList(): Promise<string | null> {
  const res = await fetch('/api/shop/saved-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  if (!res.ok) return null
  const { token } = await res.json()
  setToken(token)
  return token
}

async function fetchList(token: string): Promise<{ items: SavedItem[]; slug: string | null; updatedAt: string | null }> {
  const res = await fetch('/api/shop/saved-lists/me', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) return { items: [], slug: null, updatedAt: null }
  const data = await res.json()
  return { items: data.items ?? [], slug: data.slug, updatedAt: data.updated_at }
}

async function migrateOldData(): Promise<void> {
  if (typeof window === 'undefined') return

  const migrationInProgress = localStorage.getItem(MIGRATION_FLAG)
  if (migrationInProgress) {
    // Previous migration didn't complete — clear and start fresh
    localStorage.removeItem(OLD_KEY)
    localStorage.removeItem(MIGRATION_FLAG)
    return
  }

  const oldRaw = localStorage.getItem(OLD_KEY)
  if (!oldRaw) return

  let oldItems: Array<{ id: string; title: string | null; image_url: string | null }>
  try { oldItems = JSON.parse(oldRaw) } catch { localStorage.removeItem(OLD_KEY); return }
  if (!oldItems.length) { localStorage.removeItem(OLD_KEY); return }

  localStorage.setItem(MIGRATION_FLAG, 'true')

  const token = await createList()
  if (!token) { localStorage.removeItem(MIGRATION_FLAG); return }

  for (const item of oldItems) {
    await fetch('/api/shop/saved-lists/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, product_id: item.id }),
    })
  }

  localStorage.removeItem(OLD_KEY)
  localStorage.removeItem(MIGRATION_FLAG)
}

export function useSavedItems() {
  const [items, setItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      await migrateOldData()

      let token = getToken()
      if (token) {
        const { items: fetched } = await fetchList(token)
        if (!cancelled) {
          tokenRef.current = token
          setItems(fetched)
          setLoading(false)
        }
      } else {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    const onSync = async () => {
      const token = getToken()
      if (token) {
        const { items: fetched } = await fetchList(token)
        setItems(fetched)
      }
    }
    window.addEventListener(SYNC_EVENT, onSync)
    return () => { cancelled = true; window.removeEventListener(SYNC_EVENT, onSync) }
  }, [])

  const toggle = useCallback(async (productId: string, meta: { name: string; price: number; images: string[] }) => {
    const isCurrentlySaved = items.some(i => i.product_id === productId)

    // Optimistic update
    if (isCurrentlySaved) {
      setItems(prev => prev.filter(i => i.product_id !== productId))
    } else {
      setItems(prev => [...prev, {
        product_id: productId,
        name: meta.name,
        price: meta.price,
        images: meta.images,
        availability: 'in_stock',
        added_at: new Date().toISOString(),
      }])
    }

    let token = tokenRef.current || getToken()

    if (!token) {
      token = await createList()
      if (!token) {
        // Revert optimistic update
        if (isCurrentlySaved) {
          setItems(prev => [...prev, { product_id: productId, name: meta.name, price: meta.price, images: meta.images, availability: 'in_stock', added_at: new Date().toISOString() }])
        } else {
          setItems(prev => prev.filter(i => i.product_id !== productId))
        }
        return
      }
      tokenRef.current = token
    }

    const endpoint = isCurrentlySaved
      ? '/api/shop/saved-lists/items/remove'
      : '/api/shop/saved-lists/items'

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, product_id: productId }),
    })

    if (!res.ok) {
      // Revert optimistic update
      if (isCurrentlySaved) {
        setItems(prev => [...prev, { product_id: productId, name: meta.name, price: meta.price, images: meta.images, availability: 'in_stock', added_at: new Date().toISOString() }])
      } else {
        setItems(prev => prev.filter(i => i.product_id !== productId))
      }
    }

    // Notify other tabs/components
    window.dispatchEvent(new CustomEvent(SYNC_EVENT))
  }, [items])

  const isSaved = useCallback((id: string) => items.some(i => i.product_id === id), [items])

  return { items, toggle, isSaved, count: items.length, loading }
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | head -30` (or `npx tsc --noEmit`)
Expected: No type errors related to saved-items

- [ ] **Step 3: Commit**

```bash
git add lib/saved-items.ts
git commit -m "refactor: useSavedItems hook to API-backed with localStorage token"
```

---

## Task 12: Update HeartButton

**Files:**
- Modify: `components/shop/HeartButton.tsx`

- [ ] **Step 1: Update HeartButton to use new hook API**

Replace the entire contents of `components/shop/HeartButton.tsx`:

```typescript
'use client'

import { Heart } from 'lucide-react'
import { useSavedItems } from '@/lib/saved-items'

interface Props {
  productId: string
  name: string
  price: number
  images: string[]
}

export default function HeartButton({ productId, name, price, images }: Props) {
  const { toggle, isSaved } = useSavedItems()
  const saved = isSaved(productId)

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    toggle(productId, { name, price, images })
  }

  return (
    <button
      onClick={handleClick}
      aria-label={saved ? `Remove ${name} from saved items` : `Save ${name}`}
      aria-pressed={saved}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '8px',
        minHeight: '48px',
        minWidth: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: saved ? 'var(--color-error)' : 'var(--color-text-muted)',
      }}
    >
      <Heart
        size={20}
        fill={saved ? 'var(--color-error)' : 'none'}
        stroke={saved ? 'var(--color-error)' : 'currentColor'}
      />
    </button>
  )
}
```

- [ ] **Step 2: Update ProductCard to pass new props to HeartButton**

In `components/shop/ProductCard.tsx`, update the HeartButton usage. Change:

```typescript
<HeartButton itemId={product.id} itemTitle={product.name} imageUrl={firstImage} />
```

To:

```typescript
<HeartButton productId={product.id} name={product.name} price={product.price} images={product.images ?? []} />
```

Also add the ShareButton import and usage. Add after the HeartButton in the actions div:

```typescript
import ShareButton from './ShareButton'

// In the actions div, after HeartButton:
<ShareButton url={`${typeof window !== 'undefined' ? window.location.origin : ''}/shop/${product.id}`} label="Copy product link" />
```

- [ ] **Step 3: Update ProductDetail to pass new props to HeartButton**

In `components/shop/ProductDetail.tsx`, find the HeartButton usage and update similarly:

```typescript
<HeartButton productId={product.id} name={product.name} price={product.price} images={product.images ?? []} />
```

Also add ShareButton next to the heart:

```typescript
<ShareButton url={`${typeof window !== 'undefined' ? window.location.origin : ''}/shop/${product.id}`} label="Copy product link" />
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add components/shop/HeartButton.tsx components/shop/ProductCard.tsx components/shop/ProductDetail.tsx
git commit -m "refactor: update HeartButton and product components for API-backed favorites"
```

---

## Task 13: Refactor Saved Items Page

**Files:**
- Modify: `app/(public)/shop/saved/page.tsx`

- [ ] **Step 1: Rewrite the saved items page**

Replace the entire contents of `app/(public)/shop/saved/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Heart, Link2 } from 'lucide-react'
import { useSavedItems } from '@/lib/saved-items'
import { useToast } from '@/components/shop/ToastContext'

export default function SavedItemsPage() {
  const { items, toggle, loading } = useSavedItems()
  const { toast } = useToast()
  const [sharing, setSharing] = useState(false)

  async function handleShare(mode: 'copy' | 'live') {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pa-list-token') : null
    if (!token) return

    setSharing(true)
    try {
      const res = await fetch('/api/shop/saved-lists/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, mode }),
      })
      if (!res.ok) { toast('Failed to generate share link'); return }
      const { url } = await res.json()
      await navigator.clipboard.writeText(url)
      toast(mode === 'copy' ? 'Snapshot link copied!' : 'Live list link copied!')
    } catch {
      toast('Failed to share')
    } finally {
      setSharing(false)
    }
  }

  async function handleStopSharing() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pa-list-token') : null
    if (!token) return
    const res = await fetch('/api/shop/saved-lists/stop-sharing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (res.ok) toast('Sharing stopped')
    else toast('Failed to stop sharing')
  }

  function copyProductLink(productId: string) {
    const url = `${window.location.origin}/shop/${productId}`
    navigator.clipboard.writeText(url).then(() => toast('Link copied!'))
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading your saved items...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)' }}>
      <style>{`
        .saved-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-top: 40px;
        }
        @media (max-width: 900px) { .saved-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .saved-grid { grid-template-columns: repeat(2, 1fr); } }

        .saved-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }

        .saved-card-action {
          position: absolute;
          top: 10px;
          background: rgba(255,255,255,0.92);
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease;
          z-index: 2;
          padding: 0;
          backdrop-filter: blur(4px);
        }
        .saved-card-action:hover { transform: scale(1.1); }

        .saved-empty {
          text-align: center;
          padding: 80px 0;
        }

        .share-btn {
          padding: 8px 16px;
          font-size: 12px;
          font-family: 'Jost', sans-serif;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          background: var(--color-surface);
          color: var(--color-text);
          cursor: pointer;
          min-height: 48px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .share-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
        .share-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <div>
        <p style={{ color: 'var(--color-accent)', fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 8px 0' }}>
          Your Picks
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
          Saved Items
          {items.length > 0 && (
            <span style={{ fontSize: '16px', fontFamily: "'Jost', sans-serif", fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '12px' }}>
              {items.length} {items.length === 1 ? 'piece' : 'pieces'}
            </span>
          )}
        </h1>
      </div>

      {/* Share actions */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button className="share-btn" onClick={() => handleShare('copy')} disabled={sharing}>
            <Link2 size={14} /> Share a Copy
          </button>
          <button className="share-btn" onClick={() => handleShare('live')} disabled={sharing}>
            <Link2 size={14} /> Share Live List
          </button>
          <button className="share-btn" onClick={handleStopSharing}>
            Stop Sharing
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="saved-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="1.4" aria-hidden="true" style={{ display: 'block', margin: '0 auto 20px' }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '18px', margin: '0 0 24px 0' }}>
            You haven&apos;t saved any pieces yet.
          </p>
          <Link
            href="/shop"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: 'var(--color-primary)',
              color: '#fff',
              fontFamily: "'Jost', sans-serif",
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              borderRadius: '2px',
            }}
          >
            Browse the Collection
          </Link>
        </div>
      ) : (
        <>
          <div className="saved-grid">
            {items.map(item => (
              <div key={item.product_id} className="saved-card">
                <Link href={`/shop/${item.product_id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
                    {item.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.images[0]}
                        alt={item.name ?? ''}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--color-border) 0%, var(--color-surface) 100%)' }} />
                    )}
                    {item.availability === 'sold_out' && (
                      <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'var(--color-text-muted)', color: 'var(--color-surface)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                        Sold out
                      </div>
                    )}
                  </div>
                </Link>

                {/* Action buttons */}
                <button
                  className="saved-card-action"
                  style={{ right: '10px' }}
                  aria-label={`Remove ${item.name} from saved items`}
                  onClick={() => toggle(item.product_id, { name: item.name, price: item.price, images: item.images })}
                >
                  <Heart size={16} fill="var(--color-primary, #7b5ea7)" stroke="var(--color-primary, #7b5ea7)" />
                </button>
                <button
                  className="saved-card-action"
                  style={{ right: '52px' }}
                  aria-label={`Copy link for ${item.name}`}
                  onClick={() => copyProductLink(item.product_id)}
                >
                  <Link2 size={14} stroke="var(--color-text-muted)" />
                </button>

                {/* Title & Price */}
                <div style={{ padding: '12px 14px' }}>
                  {item.name && (
                    <p style={{ fontSize: '13px', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, margin: 0, color: 'var(--color-text)' }}>
                      {item.name}
                    </p>
                  )}
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                    ${item.price.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '48px', textAlign: 'center' }}>
            <Link
              href="/shop"
              style={{
                color: 'var(--color-accent)',
                fontSize: '13px',
                textDecoration: 'none',
                letterSpacing: '0.06em',
              }}
            >
              Continue browsing →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/shop/saved/page.tsx
git commit -m "refactor: saved items page with API-backed favorites and share actions"
```

---

## Task 14: Shared List Page

**Files:**
- Create: `app/(public)/shop/saved/[slug]/page.tsx`

- [ ] **Step 1: Create the shared list page**

Create `app/(public)/shop/saved/[slug]/page.tsx`:

```typescript
'use client'

import { useState, useEffect, useRef, use } from 'react'
import Link from 'next/link'
import { Heart, HeartPlus, HeartHandshake, Link2 } from 'lucide-react'
import { useToast } from '@/components/shop/ToastContext'

interface SharedItem {
  product_id: string
  name: string
  price: number
  images: string[]
  availability: string
  added_at: string
}

interface SharedListData {
  id: string
  is_snapshot: boolean
  is_live: boolean
  updated_at: string
  items: SharedItem[]
}

export default function SharedListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { toast } = useToast()
  const [data, setData] = useState<SharedListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set())
  const [showHandshake, setShowHandshake] = useState(false)
  const lastUpdatedRef = useRef<string | null>(null)

  // Get edit_token from URL fragment for live lists
  const [editToken, setEditToken] = useState<string | null>(null)
  useEffect(() => {
    const hash = window.location.hash
    const match = hash.match(/edit=([a-f0-9-]+)/i)
    if (match) setEditToken(match[1])
  }, [])

  // Fetch shared list
  useEffect(() => {
    async function fetchList() {
      const res = await fetch(`/api/shop/saved-lists/${slug}`)
      if (!res.ok) {
        setError(res.status === 404 ? 'This shared list was not found.' : 'Failed to load list.')
        setLoading(false)
        return
      }
      const listData: SharedListData = await res.json()
      setData(listData)
      lastUpdatedRef.current = listData.updated_at
      setLoading(false)
    }
    fetchList()
  }, [slug])

  // Poll for live list updates every 30s
  useEffect(() => {
    if (!data?.is_live) return

    const interval = setInterval(async () => {
      if (document.hidden) return
      const res = await fetch(`/api/shop/saved-lists/${slug}`)
      if (!res.ok) return
      const listData: SharedListData = await res.json()

      if (lastUpdatedRef.current && listData.updated_at !== lastUpdatedRef.current) {
        setShowHandshake(true)
        setTimeout(() => setShowHandshake(false), 5000)
      }

      lastUpdatedRef.current = listData.updated_at
      setData(listData)
    }, 30_000)

    return () => clearInterval(interval)
  }, [data?.is_live, slug])

  async function addToMine(productId: string) {
    let myToken = localStorage.getItem('pa-list-token')
    if (!myToken) {
      const res = await fetch('/api/shop/saved-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!res.ok) { toast('Failed to create your list'); return }
      const { token } = await res.json()
      localStorage.setItem('pa-list-token', token)
      myToken = token
    }

    const res = await fetch(`/api/shop/saved-lists/${slug}/add-to-mine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ my_token: myToken, product_id: productId }),
    })

    if (res.ok) {
      setAddedItems(prev => new Set(prev).add(productId))
      toast('Added to your favorites')
      window.dispatchEvent(new CustomEvent('pa-saved-items-changed'))
    } else {
      const err = await res.json().catch(() => ({}))
      toast(err.error || 'Failed to add')
    }
  }

  async function toggleLiveItem(productId: string) {
    if (!editToken) return
    const isInList = data?.items.some(i => i.product_id === productId)

    const endpoint = isInList
      ? '/api/shop/saved-lists/items/remove'
      : '/api/shop/saved-lists/items'

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: editToken, product_id: productId }),
    })

    if (res.ok) {
      // Re-fetch to sync
      const listRes = await fetch(`/api/shop/saved-lists/${slug}`)
      if (listRes.ok) {
        const listData = await listRes.json()
        setData(listData)
        lastUpdatedRef.current = listData.updated_at
      }
    }
  }

  function copyProductLink(productId: string) {
    const url = `${window.location.origin}/shop/${productId}`
    navigator.clipboard.writeText(url).then(() => toast('Link copied!'))
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading shared list...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '18px' }}>{error || 'List not found'}</p>
        <Link href="/shop" style={{ color: 'var(--color-accent)', fontSize: '13px', textDecoration: 'none', letterSpacing: '0.06em' }}>
          Browse the Collection →
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)' }}>
      <style>{`
        .shared-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-top: 40px;
        }
        @media (max-width: 900px) { .shared-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .shared-grid { grid-template-columns: repeat(2, 1fr); } }

        .shared-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }

        .shared-card-action {
          position: absolute;
          top: 10px;
          background: rgba(255,255,255,0.92);
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease;
          z-index: 2;
          padding: 0;
          backdrop-filter: blur(4px);
        }
        .shared-card-action:hover { transform: scale(1.1); }
      `}</style>

      {/* Banner */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '12px 16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {showHandshake && <HeartHandshake size={18} stroke="var(--color-accent)" />}
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {data.is_snapshot
            ? 'Shared favorites list'
            : data.is_live && editToken
              ? 'Shared live list — anyone with this link can add or remove items. Share carefully.'
              : 'Shared favorites list'
          }
        </p>
      </div>

      {/* Header */}
      <div>
        <p style={{ color: 'var(--color-accent)', fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 8px 0' }}>
          Shared Collection
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
          Favorites
          <span style={{ fontSize: '16px', fontFamily: "'Jost', sans-serif", fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '12px' }}>
            {data.items.length} {data.items.length === 1 ? 'piece' : 'pieces'}
          </span>
        </h1>
      </div>

      {data.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '18px' }}>This list is empty.</p>
        </div>
      ) : (
        <div className="shared-grid">
          {data.items.map(item => (
            <div key={item.product_id} className="shared-card">
              <Link href={`/shop/${item.product_id}`} style={{ textDecoration: 'none' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
                  {item.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.images[0]}
                      alt={item.name ?? ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--color-border) 0%, var(--color-surface) 100%)' }} />
                  )}
                  {item.availability === 'sold_out' && (
                    <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'var(--color-text-muted)', color: 'var(--color-surface)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                      Sold out
                    </div>
                  )}
                </div>
              </Link>

              {/* Action buttons */}
              {data.is_live && editToken ? (
                // Live list — full Heart toggle
                <button
                  className="shared-card-action"
                  style={{ right: '10px' }}
                  aria-label={`Toggle ${item.name} in shared list`}
                  onClick={() => toggleLiveItem(item.product_id)}
                >
                  <Heart size={16} fill="var(--color-primary)" stroke="var(--color-primary)" />
                </button>
              ) : (
                // Snapshot or live without edit token — HeartPlus to add to mine
                <button
                  className="shared-card-action"
                  style={{ right: '10px' }}
                  aria-label={addedItems.has(item.product_id) ? `${item.name} added to your favorites` : `Add ${item.name} to my favorites`}
                  onClick={() => addToMine(item.product_id)}
                  disabled={addedItems.has(item.product_id)}
                >
                  <HeartPlus
                    size={16}
                    stroke={addedItems.has(item.product_id) ? 'var(--color-primary)' : 'var(--color-text-muted)'}
                    fill={addedItems.has(item.product_id) ? 'var(--color-primary)' : 'none'}
                  />
                </button>
              )}

              <button
                className="shared-card-action"
                style={{ right: '52px' }}
                aria-label={`Copy link for ${item.name}`}
                onClick={() => copyProductLink(item.product_id)}
              >
                <Link2 size={14} stroke="var(--color-text-muted)" />
              </button>

              {/* Title & Price */}
              <div style={{ padding: '12px 14px' }}>
                {item.name && (
                  <p style={{ fontSize: '13px', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, margin: 0, color: 'var(--color-text)' }}>
                    {item.name}
                  </p>
                )}
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                  ${item.price.toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '48px', textAlign: 'center' }}>
        <Link
          href="/shop"
          style={{ color: 'var(--color-accent)', fontSize: '13px', textDecoration: 'none', letterSpacing: '0.06em' }}
        >
          Browse the Collection →
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(public\)/shop/saved/\[slug\]/page.tsx
git commit -m "feat: shared list page with snapshot/live modes and HeartPlus/HeartHandshake icons"
```

---

## Task 15: Integration Test & Verify

- [ ] **Step 1: Run all existing tests to check for regressions**

Run: `npx jest --no-coverage 2>&1 | tail -20`
Expected: All existing tests pass (new tests may need mock adjustments)

- [ ] **Step 2: Run the slug tests**

Run: `npx jest __tests__/lib/slug.test.ts --no-coverage`
Expected: All PASS

- [ ] **Step 3: Run the dev server and manually verify**

Run: `npm run dev`

Manual checks:
1. Visit `/shop` — heart buttons on product cards still work
2. Click a heart — check browser devtools Network tab for API calls
3. Visit `/shop/saved` — see saved items loaded from API
4. Click "Share a Copy" — verify URL copied to clipboard
5. Open the copied URL in incognito — verify shared list page shows items
6. On shared list, click HeartPlus — verify item added to own list

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for favorites sharing feature"
```

---

## Summary

| Task | What it builds |
|------|---------------|
| 1 | Database tables for saved_lists and saved_list_items |
| 2 | Slug generation + validation utilities |
| 3 | Shared rate limiting utility |
| 4 | API: create list |
| 5 | API: fetch own list |
| 6 | API: add/remove items |
| 7 | API: share + stop sharing |
| 8 | API: view shared list + add to mine |
| 9 | Toast notification component |
| 10 | ShareButton (Link2 clipboard copy) |
| 11 | Refactored useSavedItems hook (API-backed) |
| 12 | Updated HeartButton + product components |
| 13 | Refactored saved items page with share actions |
| 14 | Shared list page (snapshot + live modes) |
| 15 | Integration test and verification |
