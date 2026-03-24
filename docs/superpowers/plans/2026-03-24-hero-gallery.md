# Hero Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single static hero image with a 1-to-n auto-cycling carousel managed from the Branding admin page.

**Architecture:** A new `hero_slides` table stores ordered image URLs; `HeroCarousel` (client component) owns all slide state and renders in the right panel of `ModernHero`; `HeroSlideList` + `HeroCarouselPreviewModal` replace the single upload button in `BrandingEditor`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + service role client), Jest, CSS custom properties (no Tailwind).

---

## File Map

**Create:**
- `supabase/migrations/039_hero_slides.sql` — DB migration
- `components/modern/HeroCarousel.tsx` — `'use client'` carousel component
- `components/admin/HeroSlideList.tsx` — `'use client'` admin slide grid
- `components/admin/HeroCarouselPreviewModal.tsx` — `'use client'` preview modal
- `app/api/admin/hero-slides/route.ts` — GET + POST handlers
- `app/api/admin/hero-slides/[id]/route.ts` — DELETE handler
- `app/api/admin/hero-slides/reorder/route.ts` — PATCH reorder handler
- `__tests__/api/admin/hero-slides.test.ts` — API route tests
- `__tests__/components/modern/HeroCarousel.test.tsx` — carousel unit tests

**Modify:**
- `lib/supabase/types.ts` — add `HeroSlide` interface + `hero_transition`/`hero_interval_ms` to `Settings`
- `lib/theme.ts` — add `hero_transition` and `hero_interval_ms` to `DEFAULT_SETTINGS`
- `app/api/admin/settings/route.ts` — handle `hero_transition` + `hero_interval_ms`
- `components/modern/ModernHero.tsx` — replace `heroImageUrl` prop with `slides`/`transition`/`intervalMs`, render `HeroCarousel`
- `components/admin/BrandingEditor.tsx` — replace single upload section with `HeroSlideList` + settings controls
- `app/(public)/page.tsx` — add `hero_slides` query, pass new props to `ModernHero`

---

## Task 1: Migration + Types

**Files:**
- Create: `supabase/migrations/039_hero_slides.sql`
- Modify: `lib/supabase/types.ts`
- Modify: `lib/theme.ts`

> **Before starting:** Confirm `038_private_sales_shipping.sql` is the highest-numbered migration in `supabase/migrations/`. If a higher number exists, use the next available number instead of 039.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/039_hero_slides.sql
create table hero_slides (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  alt_text     text not null,
  sort_order   int  not null default 0,
  created_at   timestamptz default now()
);

-- Service role only: enable RLS with no permissive policies so anon role cannot read
alter table hero_slides enable row level security;

alter table settings
  add column hero_transition  text default 'crossfade'
    check (hero_transition in ('crossfade', 'slide')),
  add column hero_interval_ms int  default 5000
    check (hero_interval_ms between 2000 and 30000);
```

- [ ] **Step 2: Add `HeroSlide` type and update `Settings` in `lib/supabase/types.ts`**

After the last `export interface` in the file, add:

```ts
export interface HeroSlide {
  id: string
  url: string
  alt_text: string
  sort_order: number
}
```

In the `Settings` interface, add these two fields (can go after `hero_image_url`):

```ts
hero_transition: string | null
hero_interval_ms: number | null
```

- [ ] **Step 3: Add new fields to `DEFAULT_SETTINGS` in `lib/theme.ts`**

In the `DEFAULT_SETTINGS` object (line 15), add after `hero_image_url: null`:

```ts
hero_transition: null,
hero_interval_ms: null,
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/039_hero_slides.sql lib/supabase/types.ts lib/theme.ts
git commit -m "feat: add hero_slides table migration and TypeScript types"
```

---

## Task 2: API — Collection Route (GET + POST)

**Files:**
- Create: `app/api/admin/hero-slides/route.ts`
- Create: `__tests__/api/admin/hero-slides.test.ts` (GET + POST tests only for now)

- [ ] **Step 1: Write failing tests for GET and POST**

```ts
// __tests__/api/admin/hero-slides.test.ts
/** @jest-environment node */

jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {}
  const methods = ['select','insert','update','delete','eq','order','limit','single']
  methods.forEach(m => { chain[m] = jest.fn().mockReturnValue(chain) })
  chain['single'] = jest.fn().mockResolvedValue(resolvedValue)
  chain['then'] = jest.fn().mockImplementation((r: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(r))
  chain['catch'] = jest.fn().mockImplementation(() => Promise.resolve(resolvedValue))
  return chain
}

const { requireAdminSession } = require('@/lib/auth') as { requireAdminSession: jest.Mock }

describe('GET /api/admin/hero-slides', () => {
  beforeEach(() => jest.resetModules())

  it('rejects unauthenticated request', async () => {
    requireAdminSession.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) })
    const { GET } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides')
    expect((await GET(req)).status).toBe(401)
  })

  it('returns slides ordered by sort_order', async () => {
    const slides = [
      { id: 'aaa', url: 'https://example.com/a.jpg', alt_text: 'A', sort_order: 0 },
      { id: 'bbb', url: 'https://example.com/b.jpg', alt_text: 'B', sort_order: 1 },
    ]
    mockFrom.mockReturnValue(makeChain({ data: slides, error: null }))
    const { GET } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(slides)
  })
})

describe('POST /api/admin/hero-slides', () => {
  beforeEach(() => jest.resetModules())

  it('rejects unauthenticated request', async () => {
    requireAdminSession.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) })
    const { POST } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a.jpg', alt_text: 'A' }),
    })
    expect((await POST(req)).status).toBe(401)
  })

  it('rejects invalid URL', async () => {
    const { POST } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url', alt_text: 'A' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('rejects missing alt_text', async () => {
    const { POST } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a.jpg' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 201 and calls revalidatePath on success', async () => {
    const slide = { id: 'aaa', url: 'https://example.com/a.jpg', alt_text: 'A', sort_order: 0 }
    mockFrom.mockReturnValue(makeChain({ data: slide, error: null }))
    const { revalidatePath } = require('next/cache') as { revalidatePath: jest.Mock }
    const { POST } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a.jpg', alt_text: 'A', sort_order: 0 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx jest __tests__/api/admin/hero-slides.test.ts --no-coverage
```

Expected: all tests FAIL with "Cannot find module '@/app/api/admin/hero-slides/route'"

- [ ] **Step 3: Implement the route**

```ts
// app/api/admin/hero-slides/route.ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('hero_slides')
    .select('id, url, alt_text, sort_order')
    .order('sort_order')
  if (dbError) return NextResponse.json({ error: 'Failed to fetch slides' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const url = String(body.url ?? '')
  const alt_text = sanitizeText(String(body.alt_text ?? '')).slice(0, 300)
  if (!isValidHttpsUrl(url)) return NextResponse.json({ error: 'Valid https image URL required' }, { status: 400 })
  if (!alt_text) return NextResponse.json({ error: 'Alt text required for accessibility' }, { status: 400 })
  const sort_order = Number(body.sort_order) || 0
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('hero_slides')
    .insert({ url, alt_text, sort_order })
    .select('id, url, alt_text, sort_order')
    .single()
  if (dbError) return NextResponse.json({ error: 'Failed to add slide' }, { status: 500 })
  revalidatePath('/', 'layout')
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx jest __tests__/api/admin/hero-slides.test.ts --no-coverage
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/hero-slides/route.ts __tests__/api/admin/hero-slides.test.ts
git commit -m "feat: add GET + POST /api/admin/hero-slides"
```

---

## Task 3: API — DELETE Route

**Files:**
- Create: `app/api/admin/hero-slides/[id]/route.ts`
- Modify: `__tests__/api/admin/hero-slides.test.ts` (add DELETE tests)

- [ ] **Step 1: Add failing DELETE tests to the test file**

Append to `__tests__/api/admin/hero-slides.test.ts`:

```ts
describe('DELETE /api/admin/hero-slides/[id]', () => {
  beforeEach(() => jest.resetModules())

  it('rejects unauthenticated request', async () => {
    requireAdminSession.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) })
    const { DELETE } = await import('@/app/api/admin/hero-slides/[id]/route')
    const req = new Request('http://localhost/api/admin/hero-slides/abc', { method: 'DELETE' })
    expect((await DELETE(req, { params: Promise.resolve({ id: 'abc' }) })).status).toBe(401)
  })

  it('rejects non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/admin/hero-slides/[id]/route')
    const req = new Request('http://localhost/api/admin/hero-slides/not-a-uuid', { method: 'DELETE' })
    expect((await DELETE(req, { params: Promise.resolve({ id: 'not-a-uuid' }) })).status).toBe(400)
  })

  it('deletes slide and calls revalidatePath', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const { revalidatePath } = require('next/cache') as { revalidatePath: jest.Mock }
    const { DELETE } = await import('@/app/api/admin/hero-slides/[id]/route')
    const validId = '123e4567-e89b-12d3-a456-426614174000'
    const req = new Request(`http://localhost/api/admin/hero-slides/${validId}`, { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: validId }) })
    expect(res.status).toBe(200)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
```

- [ ] **Step 2: Run tests — confirm new ones fail**

```bash
npx jest __tests__/api/admin/hero-slides.test.ts --no-coverage
```

Expected: DELETE tests FAIL, GET/POST still PASS

- [ ] **Step 3: Implement the DELETE route**

```ts
// app/api/admin/hero-slides/[id]/route.ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from('hero_slides').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to delete slide' }, { status: 500 })
  revalidatePath('/', 'layout')
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Run all hero-slides tests**

```bash
npx jest __tests__/api/admin/hero-slides.test.ts --no-coverage
```

Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/hero-slides/[id]/route.ts __tests__/api/admin/hero-slides.test.ts
git commit -m "feat: add DELETE /api/admin/hero-slides/[id]"
```

---

## Task 4: API — Reorder Route

**Files:**
- Create: `app/api/admin/hero-slides/reorder/route.ts`
- Modify: `__tests__/api/admin/hero-slides.test.ts` (add PATCH reorder tests)

- [ ] **Step 1: Add failing reorder tests**

Append to `__tests__/api/admin/hero-slides.test.ts`:

```ts
describe('PATCH /api/admin/hero-slides/reorder', () => {
  beforeEach(() => jest.resetModules())

  const validIds = [
    '123e4567-e89b-12d3-a456-426614174000',
    '223e4567-e89b-12d3-a456-426614174001',
  ]

  it('rejects unauthenticated request', async () => {
    requireAdminSession.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) })
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: validIds }),
    })
    expect((await PATCH(req)).status).toBe(401)
  })

  it('rejects ids array exceeding 100 elements', async () => {
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const ids = Array.from({ length: 101 }, (_, i) =>
      `123e4567-e89b-12d3-a456-4266141740${String(i).padStart(2, '0')}`
    )
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    expect((await PATCH(req)).status).toBe(400)
  })

  it('rejects array containing a non-UUID element', async () => {
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['not-a-uuid', validIds[0]] }),
    })
    expect((await PATCH(req)).status).toBe(400)
  })

  it('updates sort_order and calls revalidatePath', async () => {
    const chain = makeChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)
    const { revalidatePath } = require('next/cache') as { revalidatePath: jest.Mock }
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: validIds }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
```

- [ ] **Step 2: Run tests — confirm new ones fail**

```bash
npx jest __tests__/api/admin/hero-slides.test.ts --no-coverage
```

Expected: PATCH tests FAIL

- [ ] **Step 3: Implement the reorder route**

```ts
// app/api/admin/hero-slides/reorder/route.ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const ids = body.ids
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
  if (ids.length === 0 || ids.length > 100) return NextResponse.json({ error: 'ids must have 1–100 elements' }, { status: 400 })
  for (const id of ids) {
    if (!UUID_RE.test(String(id))) return NextResponse.json({ error: `Invalid id: ${id}` }, { status: 400 })
  }
  const supabase = createServiceRoleClient()
  // Update each slide's sort_order to match its index in the ids array
  const updates = ids.map((id, index) =>
    supabase.from('hero_slides').update({ sort_order: index }).eq('id', String(id))
  )
  const results = await Promise.all(updates)
  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: 'Failed to reorder slides' }, { status: 500 })
  revalidatePath('/', 'layout')
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Run all hero-slides tests**

```bash
npx jest __tests__/api/admin/hero-slides.test.ts --no-coverage
```

Expected: all 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/hero-slides/reorder/route.ts __tests__/api/admin/hero-slides.test.ts
git commit -m "feat: add PATCH /api/admin/hero-slides/reorder"
```

---

## Task 5: Settings Route — hero_transition + hero_interval_ms

**Files:**
- Modify: `app/api/admin/settings/route.ts`
- Modify: `__tests__/components/admin/BrandingPage.test.tsx` (add 2 new tests at the bottom)

- [ ] **Step 1: Write the failing tests**

Open `__tests__/components/admin/BrandingPage.test.tsx` and append these two tests inside a new describe block at the bottom of the file:

```ts
describe('settings route — hero fields', () => {
  beforeEach(() => jest.resetModules())

  it('rejects invalid hero_transition value', async () => {
    const { POST } = await import('@/app/api/admin/settings/route')
    const req = new Request('http://localhost/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero_transition: 'zoom' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('stores hero_interval_ms as an integer', async () => {
    // This test verifies the value is passed as a number to supabase update, not a string.
    // We check that a valid value returns 200 and the update map receives a number.
    const mockSupabase = { from: jest.fn() }
    const chain: Record<string, jest.Mock> = {}
    const methods = ['select','update','eq','limit','maybeSingle','single']
    methods.forEach(m => { chain[m] = jest.fn().mockReturnValue(chain) })
    chain['maybeSingle'] = jest.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null })
    chain['then'] = jest.fn().mockImplementation((r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r))
    mockSupabase.from.mockReturnValue(chain)
    jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn(() => mockSupabase) }))

    const { POST } = await import('@/app/api/admin/settings/route')
    const req = new Request('http://localhost/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero_interval_ms: 7000 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    // The update call receives a number, not '7000'
    const updateCall = chain['update'].mock.calls[0][0]
    expect(typeof updateCall.hero_interval_ms).toBe('number')
    expect(updateCall.hero_interval_ms).toBe(7000)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/components/admin/BrandingPage.test.tsx --no-coverage
```

Expected: both new tests FAIL

- [ ] **Step 3: Update `app/api/admin/settings/route.ts`**

First, widen the `update` map type on line 16 from:
```ts
const update: Record<string, string | boolean | null> = {}
```
to:
```ts
const update: Record<string, string | boolean | number | null> = {}
```

Then add these two blocks just before the `update.updated_at = ...` line at the bottom of the handler:

```ts
  if (body.hero_transition !== undefined) {
    const val = String(body.hero_transition ?? '')
    if (!['crossfade', 'slide'].includes(val)) return NextResponse.json({ error: 'hero_transition must be crossfade or slide' }, { status: 400 })
    update.hero_transition = val
  }
  if (body.hero_interval_ms !== undefined) {
    const val = parseInt(String(body.hero_interval_ms), 10)
    if (isNaN(val) || val < 2000 || val > 30000) return NextResponse.json({ error: 'hero_interval_ms must be between 2000 and 30000' }, { status: 400 })
    update.hero_interval_ms = val
  }
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/components/admin/BrandingPage.test.tsx --no-coverage
```

Expected: all tests in the file PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/settings/route.ts __tests__/components/admin/BrandingPage.test.tsx
git commit -m "feat: add hero_transition and hero_interval_ms to settings route"
```

---

## Task 6: HeroCarousel Client Component

**Files:**
- Create: `components/modern/HeroCarousel.tsx`
- Create: `__tests__/components/modern/HeroCarousel.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// __tests__/components/modern/HeroCarousel.test.tsx
import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import HeroCarousel from '@/components/modern/HeroCarousel'
import type { HeroSlide } from '@/lib/supabase/types'

const slide1: HeroSlide = { id: '1', url: 'https://example.com/1.jpg', alt_text: 'Slide one', sort_order: 0 }
const slide2: HeroSlide = { id: '2', url: 'https://example.com/2.jpg', alt_text: 'Slide two', sort_order: 1 }
const slide3: HeroSlide = { id: '3', url: 'https://example.com/3.jpg', alt_text: 'Slide three', sort_order: 2 }

describe('HeroCarousel — single slide', () => {
  it('renders the image', () => {
    render(<HeroCarousel slides={[slide1]} transition="crossfade" intervalMs={5000} />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Slide one')
  })

  it('does not render arrows or dots', () => {
    render(<HeroCarousel slides={[slide1]} transition="crossfade" intervalMs={5000} />)
    expect(screen.queryByLabelText('Previous slide')).toBeNull()
    expect(screen.queryByLabelText('Next slide')).toBeNull()
    expect(screen.queryByLabelText('Go to slide 1')).toBeNull()
  })
})

describe('HeroCarousel — multiple slides', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('renders arrows and dots', () => {
    render(<HeroCarousel slides={[slide1, slide2, slide3]} transition="crossfade" intervalMs={5000} />)
    expect(screen.getByLabelText('Previous slide')).toBeInTheDocument()
    expect(screen.getByLabelText('Next slide')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to slide 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to slide 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to slide 3')).toBeInTheDocument()
  })

  it('advances to next slide after intervalMs', () => {
    render(<HeroCarousel slides={[slide1, slide2]} transition="crossfade" intervalMs={3000} />)
    const dot1 = screen.getByLabelText('Go to slide 1')
    const dot2 = screen.getByLabelText('Go to slide 2')
    expect(dot1).toHaveAttribute('aria-current', 'true')
    act(() => { jest.advanceTimersByTime(3000) })
    expect(dot2).toHaveAttribute('aria-current', 'true')
  })

  it('next arrow click advances the slide', () => {
    render(<HeroCarousel slides={[slide1, slide2]} transition="crossfade" intervalMs={5000} />)
    fireEvent.click(screen.getByLabelText('Next slide'))
    expect(screen.getByLabelText('Go to slide 2')).toHaveAttribute('aria-current', 'true')
  })

  it('dot click jumps to correct slide', () => {
    render(<HeroCarousel slides={[slide1, slide2, slide3]} transition="crossfade" intervalMs={5000} />)
    fireEvent.click(screen.getByLabelText('Go to slide 3'))
    expect(screen.getByLabelText('Go to slide 3')).toHaveAttribute('aria-current', 'true')
  })

  it('mouseenter pauses auto-cycle; mouseleave resumes it', () => {
    const { container } = render(<HeroCarousel slides={[slide1, slide2]} transition="crossfade" intervalMs={2000} />)
    const wrapper = container.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)
    act(() => { jest.advanceTimersByTime(4000) })
    // Still on slide 1 because paused
    expect(screen.getByLabelText('Go to slide 1')).toHaveAttribute('aria-current', 'true')
    fireEvent.mouseLeave(wrapper)
    act(() => { jest.advanceTimersByTime(2000) })
    expect(screen.getByLabelText('Go to slide 2')).toHaveAttribute('aria-current', 'true')
  })
})

describe('HeroCarousel — prefers-reduced-motion', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        addListener: jest.fn(),
        removeListener: jest.fn(),
      })),
    })
  })
  afterEach(() => jest.useRealTimers())

  it('does not auto-cycle when prefers-reduced-motion is set', () => {
    render(<HeroCarousel slides={[slide1, slide2]} transition="crossfade" intervalMs={2000} />)
    act(() => { jest.advanceTimersByTime(4000) })
    expect(screen.getByLabelText('Go to slide 1')).toHaveAttribute('aria-current', 'true')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/components/modern/HeroCarousel.test.tsx --no-coverage
```

Expected: all tests FAIL with "Cannot find module"

- [ ] **Step 3: Implement `HeroCarousel`**

```tsx
// components/modern/HeroCarousel.tsx
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { HeroSlide } from '@/lib/supabase/types'

interface Props {
  slides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
}

export default function HeroCarousel({ slides, transition, intervalMs }: Props) {
  const [current, setCurrent] = useState(0)
  const pausedRef = useRef(false)
  const reducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

  const total = slides.length
  const multi = total > 1

  const goTo = useCallback((n: number) => setCurrent(((n % total) + total) % total), [total])
  const next = useCallback(() => goTo(current + 1), [goTo, current])
  const prev = useCallback(() => goTo(current - 1), [goTo, current])

  useEffect(() => {
    if (!multi || reducedMotion) return
    const id = setInterval(() => {
      if (!pausedRef.current) setCurrent(c => (c + 1) % total)
    }, intervalMs)
    return () => clearInterval(id)
  }, [multi, reducedMotion, intervalMs, total])

  if (total === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, var(--color-accent) 0%, #e8d5a0 50%, var(--color-secondary, var(--color-accent)) 100%)',
        minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ fontStyle: 'italic', color: 'var(--color-primary)', opacity: 0.4, fontSize: '24px', margin: 0 }}>
          Handmade with love
        </p>
      </div>
    )
  }

  const transitionStyle = reducedMotion ? {} : { transition: transition === 'crossfade' ? 'opacity 0.6s ease' : 'transform 0.4s ease' }

  return (
    <div
      style={{ position: 'relative', width: '100%', minHeight: '400px', overflow: 'hidden' }}
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
    >
      {/* Live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
        {slides[current]?.alt_text}
      </div>

      {/* Slides */}
      {slides.map((slide, i) => {
        const isActive = i === current
        const style: React.CSSProperties = transition === 'crossfade'
          ? { position: i === 0 ? 'relative' : 'absolute', inset: 0, opacity: isActive ? 1 : 0, ...transitionStyle }
          : { position: i === 0 ? 'relative' : 'absolute', inset: 0, transform: `translateX(${(i - current) * 100}%)`, ...transitionStyle }
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={slide.id}
            src={slide.url}
            alt={slide.alt_text}
            style={{ ...style, width: '100%', height: '100%', minHeight: '400px', objectFit: 'cover', display: 'block' }}
          />
        )
      })}

      {/* Controls — only when multiple slides */}
      {multi && (
        <>
          <button
            aria-label="Previous slide"
            onClick={prev}
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.82)', border: 'none', borderRadius: '50%',
              width: 40, height: 40, fontSize: 20, cursor: 'pointer', zIndex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)', minHeight: 40,
            }}
          >‹</button>
          <button
            aria-label="Next slide"
            onClick={next}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.82)', border: 'none', borderRadius: '50%',
              width: 40, height: 40, fontSize: 20, cursor: 'pointer', zIndex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)', minHeight: 40,
            }}
          >›</button>
          <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 2 }}>
            {slides.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === current ? 'true' : undefined}
                onClick={() => goTo(i)}
                style={{
                  width: 9, height: 9, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
                  background: i === current ? '#fff' : 'rgba(255,255,255,0.45)',
                  transform: i === current ? 'scale(1.2)' : 'scale(1)',
                  transition: 'background 0.2s, transform 0.2s',
                  minHeight: 'unset',
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/components/modern/HeroCarousel.test.tsx --no-coverage
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/modern/HeroCarousel.tsx __tests__/components/modern/HeroCarousel.test.tsx
git commit -m "feat: add HeroCarousel client component with auto-cycle, arrows, and dots"
```

---

## Task 7: Refactor ModernHero + Update page.tsx

**Files:**
- Modify: `components/modern/ModernHero.tsx`
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: Refactor `components/modern/ModernHero.tsx`**

Replace the entire file:

```tsx
// components/modern/ModernHero.tsx
import Link from 'next/link'
import HeroCarousel from './HeroCarousel'
import type { HeroSlide } from '@/lib/supabase/types'

interface Props {
  slides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
}

export default function ModernHero({ slides, transition, intervalMs }: Props) {
  return (
    <section>
      <style>{`
        .modern-hero {
          display: grid;
          grid-template-columns: 1fr 1fr;
          min-height: 480px;
        }

        @media (max-width: 768px) {
          .modern-hero {
            grid-template-columns: 1fr;
          }
          .modern-hero-image-panel {
            order: -1;
          }
          .modern-hero-text-panel {
            order: 1;
          }
        }

        .modern-hero-cta-btn:hover {
          opacity: 0.9;
        }
      `}</style>
      <div className="modern-hero" style={{ marginTop: 'calc(-1 * var(--logo-overflow, clamp(60px, 7vw, 90px)))' }}>
        {/* Left panel */}
        <div
          className="modern-hero-text-panel"
          style={{
            background: 'var(--color-primary)',
            padding: 'clamp(40px, 6vw, 80px)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div>
            <p style={{ color: 'var(--color-accent)', fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 16px 0' }}>
              Purple Acorns Creations
            </p>
            <h1 style={{ color: '#fff', fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1, margin: 0 }}>
              {/* tagline and subtext are passed via children or content — left panel is unchanged */}
            </h1>
          </div>
        </div>

        {/* Right panel */}
        <div className="modern-hero-image-panel">
          <HeroCarousel slides={slides} transition={transition} intervalMs={intervalMs} />
        </div>
      </div>
    </section>
  )
}
```

> **Important:** The existing `ModernHero` also renders `tagline` and `subtext` props. Do not remove them — carry the full left-panel content forward. Replace only the right panel (the `heroImageUrl` conditional) with `<HeroCarousel>`. The full file rewrite above is a template; merge it with the existing left-panel markup rather than discarding it.

Precise changes to make:
1. Change the props interface from `{ tagline, subtext, heroImageUrl }` to `{ tagline, subtext, slides, transition, intervalMs }`
2. In the right panel, replace the `{heroImageUrl ? <img> : <gradient div>}` block with `<HeroCarousel slides={slides} transition={transition} intervalMs={intervalMs} />`
3. Add `import HeroCarousel from './HeroCarousel'` and `import type { HeroSlide } from '@/lib/supabase/types'`

- [ ] **Step 2: Update `app/(public)/page.tsx`**

In the `Promise.all` array (around line 38), add a new query as the last element:

```ts
supabase
  .from('hero_slides')
  .select('id, url, alt_text, sort_order')
  .order('sort_order')
  .then(r => r.data ?? []),
```

Destructure it from the result:

```ts
const [content, settings, featured, gallery, eventResult, followAlongResult, heroSlides] = await Promise.all([...])
```

Replace the `<ModernHero>` call (lines 64–68) with:

```tsx
<ModernHero
  tagline={sanitizeText(interpolate(content.hero_tagline ?? '', vars))}
  subtext={sanitizeText(interpolate(content.hero_subtext ?? '', vars))}
  slides={heroSlides as import('@/lib/supabase/types').HeroSlide[]}
  transition={(settings.hero_transition ?? 'crossfade') as 'crossfade' | 'slide'}
  intervalMs={settings.hero_interval_ms ?? 5000}
/>
```

- [ ] **Step 3: Run the full test suite to check for regressions**

```bash
bash scripts/test.sh
```

Expected: all tests pass (the old `heroImageUrl` prop tests in `HeroSection.test.tsx` are for the separate `HeroSection` component, not `ModernHero`)

- [ ] **Step 4: Commit**

```bash
git add components/modern/ModernHero.tsx app/(public)/page.tsx
git commit -m "feat: replace static hero image with HeroCarousel in ModernHero"
```

---

## Task 8: HeroCarouselPreviewModal

**Files:**
- Create: `components/admin/HeroCarouselPreviewModal.tsx`

- [ ] **Step 1: Implement the modal**

Follow the `ConfirmDialog` pattern exactly: capture `document.activeElement` on mount, restore focus on unmount, trap Tab within the modal, close on Escape.

```tsx
// components/admin/HeroCarouselPreviewModal.tsx
'use client'
import { useEffect, useRef } from 'react'
import HeroCarousel from '@/components/modern/HeroCarousel'
import type { HeroSlide } from '@/lib/supabase/types'

interface Props {
  slides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement>
}

export default function HeroCarouselPreviewModal({ slides, transition, intervalMs, onClose, triggerRef }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const closeBtn = dialogRef.current?.querySelector<HTMLButtonElement>('button')
    closeBtn?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      triggerRef.current?.focus()
    }
  }, [onClose, triggerRef])

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Hero carousel preview"
        style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden', width: '680px', maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}
      >
        <div style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>Hero Carousel Preview</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: 0, minHeight: 'unset' }}
            aria-label="Close preview"
          >×</button>
        </div>
        <HeroCarousel slides={slides} transition={transition} intervalMs={intervalMs} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors relating to `HeroCarouselPreviewModal`

- [ ] **Step 3: Commit**

```bash
git add components/admin/HeroCarouselPreviewModal.tsx
git commit -m "feat: add HeroCarouselPreviewModal admin preview component"
```

---

## Task 9: HeroSlideList Admin Component + BrandingEditor Integration

**Files:**
- Create: `components/admin/HeroSlideList.tsx`
- Modify: `components/admin/BrandingEditor.tsx`

- [ ] **Step 1: Implement `HeroSlideList`**

```tsx
// components/admin/HeroSlideList.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import ImageUploader from './ImageUploader'
import HeroCarouselPreviewModal from './HeroCarouselPreviewModal'
import type { HeroSlide } from '@/lib/supabase/types'

interface Props {
  initialSlides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
}

export default function HeroSlideList({ initialSlides, transition, intervalMs }: Props) {
  const [slides, setSlides] = useState<HeroSlide[]>(initialSlides)
  const [showUploader, setShowUploader] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewBtnRef = useRef<HTMLButtonElement>(null)

  // Fetch slides from the API on mount (initialSlides is [] when called from BrandingEditor)
  useEffect(() => {
    if (initialSlides.length > 0) return
    fetch('/api/admin/hero-slides')
      .then(r => r.json())
      .then((data: HeroSlide[]) => setSlides(data))
      .catch(() => setError('Failed to load slides.'))
  }, [initialSlides.length])

  async function handleUpload(url: string, altText: string) {
    const res = await fetch('/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, alt_text: altText, sort_order: slides.length }),
    })
    if (!res.ok) { setError('Failed to add slide.'); return }
    const newSlide: HeroSlide = await res.json()
    setSlides(prev => [...prev, newSlide])
    setShowUploader(false)
    setError(null)
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/admin/hero-slides/${id}`, { method: 'DELETE' })
    if (!res.ok) { setError('Failed to remove slide.'); return }
    setSlides(prev => prev.filter(s => s.id !== id))
    setError(null)
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const newSlides = [...slides]
    const target = index + direction
    if (target < 0 || target >= newSlides.length) return
    ;[newSlides[index], newSlides[target]] = [newSlides[target], newSlides[index]]
    setSlides(newSlides)
    const res = await fetch('/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: newSlides.map(s => s.id) }),
    })
    if (!res.ok) { setError('Failed to save order.'); setSlides(slides) }
  }

  return (
    <div>
      <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '14px' }}>
        Images cycle automatically on the homepage hero. First image loads first.
      </p>

      {/* Gallery grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
        {slides.map((slide, i) => (
          <div key={slide.id} style={{ border: '2px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden', position: 'relative', background: 'var(--color-surface)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slide.url} alt={slide.alt_text} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
            {/* Position badge */}
            <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '11px', padding: '2px 7px', borderRadius: '10px' }}>
              {i + 1}
            </span>
            {/* Remove button */}
            <button
              onClick={() => handleRemove(slide.id)}
              title="Remove slide"
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(192,57,43,0.85)', color: '#fff', border: 'none', borderRadius: '50%', width: 24, height: 24, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'unset' }}
              aria-label={`Remove slide ${i + 1}`}
            >×</button>
            {/* Up/Down reorder */}
            <div style={{ position: 'absolute', bottom: 30, right: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {i > 0 && (
                <button onClick={() => handleMove(i, -1)} title="Move up" style={{ background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '3px', width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'unset' }} aria-label={`Move slide ${i + 1} earlier`}>↑</button>
              )}
              {i < slides.length - 1 && (
                <button onClick={() => handleMove(i, 1)} title="Move down" style={{ background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '3px', width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'unset' }} aria-label={`Move slide ${i + 1} later`}>↓</button>
              )}
            </div>
            {/* Alt text */}
            <div style={{ padding: '5px 8px', fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderTop: '1px solid var(--color-border)', background: '#fff' }}>
              {slide.alt_text}
            </div>
          </div>
        ))}

        {/* Add card */}
        {!showUploader && (
          <button
            onClick={() => setShowUploader(true)}
            style={{ border: '2px dashed var(--color-border)', borderRadius: '6px', aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '13px', background: 'var(--color-surface)', minHeight: 'unset' }}
          >
            <span style={{ fontSize: '28px', lineHeight: 1 }}>+</span>
            <span>Add Image</span>
          </button>
        )}
      </div>

      {showUploader && (
        <div style={{ marginBottom: '16px', padding: '16px', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
          <ImageUploader bucket="branding" onUpload={handleUpload} label="Upload Slide Image" />
          <button onClick={() => setShowUploader(false)} style={{ marginTop: '8px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
        </div>
      )}

      {error && <p role="alert" style={{ color: '#c05050', fontSize: '13px', marginBottom: '8px' }}>{error}</p>}

      {slides.length > 0 && (
        <button
          ref={previewBtnRef}
          onClick={() => setShowPreview(true)}
          style={{ background: '#fff', color: 'var(--color-primary)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer', marginBottom: '4px' }}
        >
          ▶ Preview Carousel
        </button>
      )}

      {showPreview && (
        <HeroCarouselPreviewModal
          slides={slides}
          transition={transition}
          intervalMs={intervalMs}
          onClose={() => setShowPreview(false)}
          triggerRef={previewBtnRef}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `BrandingEditor.tsx` — replace hero image section**

In `BrandingEditor.tsx`:

1. Add imports at the top:
```ts
import HeroSlideList from './HeroSlideList'
```

2. Add state for hero settings (after the existing `useState` declarations):
```ts
const [heroTransition, setHeroTransition] = useState<'crossfade' | 'slide'>(
  (settings.hero_transition as 'crossfade' | 'slide') ?? 'crossfade'
)
const [heroIntervalSecs, setHeroIntervalSecs] = useState(
  Math.round((settings.hero_interval_ms ?? 5000) / 1000)
)
const [heroSettingsSaved, setHeroSettingsSaved] = useState(false)
```

3. Add a save handler (alongside the other save functions):
```ts
async function saveHeroSettings() {
  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hero_transition: heroTransition,
      hero_interval_ms: heroIntervalSecs * 1000,
    }),
  })
  if (res.ok) { setHeroSettingsSaved(true); router.refresh() }
}
```

4. Replace the entire "Hero Image" `<section>` block (lines 339–347 in the original file) with:

```tsx
{/* Hero Images */}
<section style={{ marginBottom: '40px' }}>
  <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Hero Images</h2>
  <SiteMap highlight="hero" label="Hero Section" description="Images cycling in the homepage hero panel." />
  <HeroSlideList
    initialSlides={[]}
    transition={heroTransition}
    intervalMs={heroIntervalSecs * 1000}
  />
  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginTop: '16px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
    <div>
      <label htmlFor="hero-transition" style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '5px' }}>Transition</label>
      <select
        id="hero-transition"
        value={heroTransition}
        onChange={e => { setHeroTransition(e.target.value as 'crossfade' | 'slide'); setHeroSettingsSaved(false) }}
        style={{ border: '1px solid var(--color-border)', borderRadius: '4px', padding: '8px 12px', fontSize: '14px', minHeight: '48px' }}
      >
        <option value="crossfade">Crossfade</option>
        <option value="slide">Slide</option>
      </select>
    </div>
    <div>
      <label htmlFor="hero-interval" style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '5px' }}>Interval (seconds)</label>
      <input
        id="hero-interval"
        type="number"
        min={2}
        max={30}
        value={heroIntervalSecs}
        onChange={e => { setHeroIntervalSecs(Number(e.target.value)); setHeroSettingsSaved(false) }}
        style={{ border: '1px solid var(--color-border)', borderRadius: '4px', padding: '8px 12px', fontSize: '14px', width: '80px', minHeight: '48px' }}
      />
    </div>
    <button
      type="button"
      onClick={saveHeroSettings}
      style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 24px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
    >
      Save Settings
    </button>
    {heroSettingsSaved && <span role="status" aria-live="polite" style={{ color: 'green', fontSize: '14px' }}>Saved ✓</span>}
  </div>
</section>
```

> **Note:** `BrandingEditor` passes `initialSlides={[]}` — `HeroSlideList` fetches its own slides via the `useEffect` already included in the Step 1 implementation. Also remove the `handleHeroUpload` function and the `ImageUploader` import from `BrandingEditor` since they are now handled by `HeroSlideList`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run the full test suite**

```bash
bash scripts/test.sh
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/admin/HeroSlideList.tsx components/admin/BrandingEditor.tsx
git commit -m "feat: add HeroSlideList and wire hero gallery into BrandingEditor"
```

---

## Task 10: Smoke Test + Final Cleanup

- [ ] **Step 1: Apply the migration to your local Supabase**

```bash
# If using Supabase local dev:
supabase db push
# Or apply the SQL directly in the Supabase dashboard SQL editor
```

- [ ] **Step 2: Start the dev server and verify manually**

```bash
bash scripts/dev.sh
```

Verify:
- Homepage loads with the gradient placeholder (no slides yet)
- Admin → Branding → Hero Images shows the empty grid + "Add Image" card
- Upload one image → it appears in the grid, homepage refreshes to show it (single slide, no controls)
- Upload a second image → homepage shows carousel with arrows and dots
- Preview button opens modal with live animation
- Transition + interval settings save and take effect in the preview
- Removing a slide updates the grid and homepage

- [ ] **Step 3: Run the full test suite one final time**

```bash
bash scripts/test.sh
```

Expected: all tests PASS

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: hero image gallery — complete implementation"
```
