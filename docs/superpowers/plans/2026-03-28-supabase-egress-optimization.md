# Supabase Egress Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Supabase Storage cached egress from 220% to well under the 5 GB free tier by adding aggressive caching, cache-busting URLs, and converting bare `<img>` tags to `next/image`.

**Architecture:** Three-layer approach: (1) bump CDN and browser cache TTLs on the watermark proxy and next/image optimizer, (2) add a `watermarkSrc()` utility that builds cache-busted proxy URLs with `?v=<timestamp>&wm=<hash>`, (3) convert bare `<img>` to `<Image>` in HeroCarousel, ProductCard, and ImageCarousel so Next.js caches/optimizes server-side.

**Tech Stack:** Next.js 15 App Router, next/image, TypeScript

---

### Task 1: Create `watermarkSrc()` Utility + Tests

**Files:**
- Create: `lib/image-url.ts`
- Create: `__tests__/lib/image-url.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/image-url.test.ts`:

```ts
import { watermarkSrc, djb2Hash } from '@/lib/image-url'

describe('djb2Hash', () => {
  it('returns an 8-char hex string', () => {
    const hash = djb2Hash('Purple Acorns Creations')
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('returns different hashes for different inputs', () => {
    expect(djb2Hash('foo')).not.toBe(djb2Hash('bar'))
  })

  it('returns the same hash for the same input', () => {
    expect(djb2Hash('test')).toBe(djb2Hash('test'))
  })
})

describe('watermarkSrc', () => {
  it('builds proxy URL with encoded image URL and wm hash', () => {
    const url = watermarkSrc('https://abc.supabase.co/storage/v1/object/public/products/img.jpg', 'My Brand')
    expect(url).toContain('/api/gallery/image?')
    expect(url).toContain('url=https%3A%2F%2Fabc.supabase.co')
    expect(url).toContain('wm=')
    expect(url).not.toContain('v=')
  })

  it('includes version param when provided', () => {
    const url = watermarkSrc('https://abc.supabase.co/storage/v1/object/public/products/img.jpg', 'My Brand', '2026-03-28T12:00:00Z')
    expect(url).toContain('v=2026-03-28T12')
  })

  it('omits version param when undefined', () => {
    const url = watermarkSrc('https://abc.supabase.co/storage/v1/object/public/products/img.jpg', 'My Brand')
    expect(url).not.toContain('&v=')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/image-url.test.ts`
Expected: FAIL — cannot find module `@/lib/image-url`

- [ ] **Step 3: Write the implementation**

Create `lib/image-url.ts`:

```ts
/**
 * DJB2 hash — returns first 8 hex chars.
 * Used as a cache key component, not a security control.
 */
export function djb2Hash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Build a watermark proxy URL with cache-busting params.
 *
 * @param imageUrl  - the original image URL (e.g. Supabase Storage public URL)
 * @param watermark - the watermark text (used to derive &wm= cache key)
 * @param version   - optional timestamp for &v= cache-busting (e.g. product.updated_at)
 */
export function watermarkSrc(imageUrl: string, watermark: string, version?: string): string {
  const params = new URLSearchParams({ url: imageUrl, wm: djb2Hash(watermark) })
  if (version) params.set('v', version)
  return `/api/gallery/image?${params.toString()}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/image-url.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/image-url.ts __tests__/lib/image-url.test.ts
git commit -m "feat: add watermarkSrc utility with DJB2 cache-busting hash"
```

---

### Task 2: Bump Watermark Proxy Cache Headers

**Files:**
- Modify: `app/api/gallery/image/route.ts:78-79,158-159,167-168`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/gallery/image-cache-headers.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/theme', () => ({
  getSettings: jest.fn().mockResolvedValue({ gallery_watermark: null, business_name: 'Test' })
}))

jest.mock('@/lib/get-client-ip', () => ({
  getClientIp: jest.fn().mockReturnValue('127.0.0.1')
}))

// Mock fetch to return a tiny valid image
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(PIXEL.buffer),
  }) as unknown as typeof fetch
})

afterAll(() => { jest.restoreAllMocks() })

describe('watermark proxy cache headers', () => {
  it('returns aggressive cache headers on success', async () => {
    const { GET } = await import('@/app/api/gallery/image/route')
    const req = new NextRequest('http://localhost/api/gallery/image?url=https://abc.supabase.co/storage/v1/object/public/products/test.jpg')
    const res = await GET(req)
    const cc = res.headers.get('Cache-Control')
    expect(cc).toBe('public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/api/gallery/image-cache-headers.test.ts`
Expected: FAIL — cache header mismatch (current is `max-age=60, s-maxage=300, stale-while-revalidate=600`)

- [ ] **Step 3: Update cache headers in the proxy route**

In `app/api/gallery/image/route.ts`, change all three `Cache-Control` header values:

Line 79 (no-watermark success path) — change:
```ts
'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
```
to:
```ts
'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
```

Line 159 (watermarked success path) — change:
```ts
'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
```
to:
```ts
'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
```

Line 168 (error fallback path) — change:
```ts
'Cache-Control': 'public, max-age=60',
```
to:
```ts
'Cache-Control': 'public, max-age=60, s-maxage=300',
```

Note: the error fallback keeps a short TTL so stale error responses don't persist.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/api/gallery/image-cache-headers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/gallery/image/route.ts __tests__/api/gallery/image-cache-headers.test.ts
git commit -m "perf: bump watermark proxy cache TTLs (1h browser, 1d CDN)"
```

---

### Task 3: Bump `minimumCacheTTL` in `next.config.js`

**Files:**
- Modify: `next.config.js:45-56`

- [ ] **Step 1: Add `minimumCacheTTL: 3600` to the images config**

In `next.config.js`, change the `images` block from:

```js
  images: {
    localPatterns: [
      { pathname: '/gallery/**' },
      { pathname: '/craft/**' },
      { pathname: '/api/gallery/image' },
    ],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'items-images-sandbox.s3.amazonaws.com' },
      { protocol: 'https', hostname: 'items-images.s3.amazonaws.com' },
    ],
  },
```

to:

```js
  images: {
    minimumCacheTTL: 3600,
    localPatterns: [
      { pathname: '/gallery/**' },
      { pathname: '/craft/**' },
      { pathname: '/api/gallery/image' },
    ],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'items-images-sandbox.s3.amazonaws.com' },
      { protocol: 'https', hostname: 'items-images.s3.amazonaws.com' },
    ],
  },
```

- [ ] **Step 2: Verify the config is valid**

Run: `npx next info`
Expected: no config errors

- [ ] **Step 3: Commit**

```bash
git add next.config.js
git commit -m "perf: set next/image minimumCacheTTL to 1 hour"
```

---

### Task 4: Wire `watermarkSrc()` Into ModernFeaturedGrid

**Files:**
- Modify: `components/modern/ModernFeaturedGrid.tsx:1,138`
- Modify: `app/(public)/page.tsx:72,76`

The `ModernFeaturedGrid` currently receives items as `{ id, image_url, title, description }`. We need to add `updated_at` so it can be passed to `watermarkSrc()` for cache-busting.

- [ ] **Step 1: Add `updated_at` to the Item interface and import `watermarkSrc`**

In `components/modern/ModernFeaturedGrid.tsx`, add the import:

```ts
import { watermarkSrc } from '@/lib/image-url'
```

And add `updated_at` to the `Item` interface:

```ts
interface Item {
  id: string
  image_url: string | null
  title: string | null
  description: string | null
  updated_at?: string
}
```

- [ ] **Step 2: Replace inline proxy URL construction with `watermarkSrc()`**

In `components/modern/ModernFeaturedGrid.tsx` line 138, change:

```tsx
src={watermark && item.image_url ? `/api/gallery/image?url=${encodeURIComponent(item.image_url)}` : (item.image_url ?? '')}
```

to:

```tsx
src={watermark && item.image_url ? watermarkSrc(item.image_url, watermark, item.updated_at) : (item.image_url ?? '')}
```

- [ ] **Step 3: Pass `updated_at` through from the home page**

In `app/(public)/page.tsx` line 72, change the map:

```ts
.map(p => ({ id: p.id, image_url: p.images[0], title: p.name, description: null }))
```

to:

```ts
.map(p => ({ id: p.id, image_url: p.images[0], title: p.name, description: null, updated_at: p.updated_at }))
```

- [ ] **Step 4: Verify the build compiles**

Run: `npx next build 2>&1 | head -20`
Expected: no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add components/modern/ModernFeaturedGrid.tsx app/\(public\)/page.tsx
git commit -m "perf: use watermarkSrc in ModernFeaturedGrid with cache-busting"
```

---

### Task 5: Wire `watermarkSrc()` Into GalleryScroller

**Files:**
- Modify: `components/home/GalleryScroller.tsx:1-2,63`

- [ ] **Step 1: Add import**

In `components/home/GalleryScroller.tsx`, add the import after the existing imports:

```ts
import { watermarkSrc } from '@/lib/image-url'
```

- [ ] **Step 2: Replace inline proxy URL construction**

On line 63, change:

```tsx
src={watermark ? `/api/gallery/image?url=${encodeURIComponent(product.images[0])}` : product.images[0]}
```

to:

```tsx
src={watermark ? watermarkSrc(product.images[0], watermark, product.updated_at) : product.images[0]}
```

`product` is a full `Product` object here, so `updated_at` is already available.

- [ ] **Step 3: Commit**

```bash
git add components/home/GalleryScroller.tsx
git commit -m "perf: use watermarkSrc in GalleryScroller with cache-busting"
```

---

### Task 6: Wire `watermarkSrc()` Into GalleryStrip

**Files:**
- Modify: `components/home/GalleryStrip.tsx:1-3,23-24`

- [ ] **Step 1: Add import**

In `components/home/GalleryStrip.tsx`, add the import:

```ts
import { watermarkSrc } from '@/lib/image-url'
```

- [ ] **Step 2: Replace inline proxy URL construction**

On lines 23-24, change:

```tsx
const src = watermark
  ? `/api/gallery/image?url=${encodeURIComponent(item.url)}`
  : item.url
```

to:

```tsx
const src = watermark
  ? watermarkSrc(item.url, watermark, item.created_at)
  : item.url
```

`item` is a `GalleryItem` which has `created_at`.

- [ ] **Step 3: Commit**

```bash
git add components/home/GalleryStrip.tsx
git commit -m "perf: use watermarkSrc in GalleryStrip with cache-busting"
```

---

### Task 7: Wire `watermarkSrc()` Into ModernStoryMosaic + Pass Timestamps

**Files:**
- Modify: `components/modern/ModernStoryMosaic.tsx:1,6-9,91-92`
- Modify: `app/(public)/page.tsx:84-86,90-92`

The `ModernStoryMosaic` receives `photos` as `{ url, alt_text, square_url }`. We need to add `created_at` and wire up `watermarkSrc`.

- [ ] **Step 1: Add import and update interface**

In `components/modern/ModernStoryMosaic.tsx`, add the import at the top:

```ts
import { watermarkSrc } from '@/lib/image-url'
```

Update the `GalleryImage` interface to include `created_at`:

```ts
interface GalleryImage {
  url: string
  alt_text: string | null
  square_url?: string | null
  created_at?: string
}
```

- [ ] **Step 2: Replace inline proxy URL construction**

On lines 91-92, change:

```tsx
const imgSrc = watermark && img.url.startsWith('https')
  ? `/api/gallery/image?url=${encodeURIComponent(img.url)}`
  : img.url
```

to:

```tsx
const imgSrc = watermark && img.url.startsWith('https')
  ? watermarkSrc(img.url, watermark, img.created_at)
  : img.url
```

- [ ] **Step 3: Pass `created_at` from the home page**

In `app/(public)/page.tsx`, update the gallery mapping (lines 84-86) from:

```ts
? gallery.map(g => ({
    url: g.url.startsWith('http') ? g.url : `${siteBase}${g.url}`,
    alt_text: g.alt_text,
    square_url: g.square_url ?? null,
  }))
```

to:

```ts
? gallery.map(g => ({
    url: g.url.startsWith('http') ? g.url : `${siteBase}${g.url}`,
    alt_text: g.alt_text,
    square_url: g.square_url ?? null,
    created_at: g.created_at,
  }))
```

And the product fallback mapping (lines 90-92) from:

```ts
.map(p => ({ url: p.images[0], alt_text: p.name, square_url: null }))
```

to:

```ts
.map(p => ({ url: p.images[0], alt_text: p.name, square_url: null, created_at: p.updated_at }))
```

- [ ] **Step 4: Commit**

```bash
git add components/modern/ModernStoryMosaic.tsx app/\(public\)/page.tsx
git commit -m "perf: use watermarkSrc in ModernStoryMosaic with cache-busting"
```

---

### Task 8: Convert ProductCard `<img>` to `<Image>` + Wire `watermarkSrc()`

**Files:**
- Modify: `components/shop/ProductCard.tsx:1-3,26-29`

- [ ] **Step 1: Add imports**

In `components/shop/ProductCard.tsx`, add at the top:

```ts
import Image from 'next/image'
import { watermarkSrc } from '@/lib/image-url'
```

- [ ] **Step 2: Replace the bare `<img>` with `<Image>`**

On lines 25-29, change:

```tsx
{firstImage ? (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={watermark ? `/api/gallery/image?url=${encodeURIComponent(firstImage)}` : firstImage}
    alt={product.name}
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
  />
```

to:

```tsx
{firstImage ? (
  <Image
    src={watermark ? watermarkSrc(firstImage, watermark, product.updated_at) : firstImage}
    alt={product.name}
    fill
    sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, 25vw"
    style={{ objectFit: 'cover' }}
  />
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | grep -i productcard || echo "No errors"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add components/shop/ProductCard.tsx
git commit -m "perf: convert ProductCard to next/image with watermarkSrc cache-busting"
```

---

### Task 9: Convert ImageCarousel `<img>` to `<Image>` + Wire `watermarkSrc()`

**Files:**
- Modify: `components/shop/ImageCarousel.tsx:1-2,67-71`

- [ ] **Step 1: Add imports**

In `components/shop/ImageCarousel.tsx`, add at the top:

```ts
import Image from 'next/image'
import { watermarkSrc } from '@/lib/image-url'
```

- [ ] **Step 2: Replace the bare `<img>` with `<Image>`**

On lines 67-71, change:

```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src={watermark ? `/api/gallery/image?url=${encodeURIComponent(images[current])}` : images[current]}
  alt={`${alt} — image ${current + 1} of ${images.length}`}
  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
/>
```

to:

```tsx
<Image
  src={watermark ? watermarkSrc(images[current], watermark) : images[current]}
  alt={`${alt} — image ${current + 1} of ${images.length}`}
  fill
  sizes="(max-width: 768px) 100vw, 50vw"
  style={{ objectFit: 'cover' }}
/>
```

Note: `ImageCarousel` receives `images: string[]` — no `updated_at` is available per-image. The product-level `updated_at` could be passed as a prop, but this component doesn't have access to it. Since the proxy URL changes when the Supabase URL changes (new upload = new Storage path), the `wm` param alone is sufficient here.

- [ ] **Step 3: Commit**

```bash
git add components/shop/ImageCarousel.tsx
git commit -m "perf: convert ImageCarousel to next/image with watermarkSrc"
```

---

### Task 10: Convert HeroCarousel `<img>` to `<Image>`

**Files:**
- Modify: `components/modern/HeroCarousel.tsx:1-2,72-78`

Hero slides don't go through the watermark proxy and don't need cache-busting (URL changes on every re-upload). We just need to switch from bare `<img>` to `next/image` so the Next.js image optimizer caches them.

- [ ] **Step 1: Add import**

In `components/modern/HeroCarousel.tsx`, add the import:

```ts
import Image from 'next/image'
```

- [ ] **Step 2: Replace the bare `<img>` with `<Image>`**

On lines 72-78, change:

```tsx
// eslint-disable-next-line @next/next/no-img-element
<img
  key={slide.id}
  src={slide.url}
  alt={slide.alt_text}
  style={{ ...style, width: '100%', height: '100%', minHeight: '400px', objectFit: 'cover', display: 'block' }}
/>
```

to:

```tsx
<div
  key={slide.id}
  style={{ ...style, width: '100%', height: '100%', minHeight: '400px' }}
>
  <Image
    src={slide.url}
    alt={slide.alt_text}
    fill
    sizes="100vw"
    priority={i === 0}
    style={{ objectFit: 'cover' }}
  />
</div>
```

The `<Image fill>` requires a positioned parent. The existing `style` variable already contains `position: 'relative'` or `position: 'absolute'` with `inset: 0`, so the wrapping `<div>` inherits the slide positioning. `priority` on the first slide disables lazy loading so it loads immediately above the fold.

- [ ] **Step 3: Verify the build compiles**

Run: `npx next build 2>&1 | head -30`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add components/modern/HeroCarousel.tsx
git commit -m "perf: convert HeroCarousel to next/image with priority loading"
```

---

### Task 11: Full Build + Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new tests from Tasks 1 and 2

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: build succeeds with no errors

- [ ] **Step 3: Start the dev server and visually verify**

Run: `npm run dev`

Check these pages:
- Home page (`/`) — hero slides, featured grid, gallery scroller, story mosaic all load images
- Shop page (`/shop`) — product cards show images
- A product detail page (`/shop/<any-id>`) — image carousel works

Verify in browser DevTools Network tab:
- Image requests go through `/_next/image` (for components using `<Image>`)
- Watermark proxy responses include `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600`
- Proxy URLs include `?url=...&wm=...` params

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address smoke test issues"
```
