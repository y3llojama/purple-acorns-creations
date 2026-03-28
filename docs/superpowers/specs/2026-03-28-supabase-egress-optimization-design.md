# Supabase Cached Egress Optimization

**Date:** 2026-03-28
**Problem:** Supabase cached egress at 220% of free tier (10.993 / 5 GB) due to excessive image fetches from Storage.

## Root Causes

1. **Watermark proxy (`/api/gallery/image`)** uses `cache: 'no-store'` on upstream fetch and short CDN TTL (`s-maxage=300`). Every request re-fetches from Supabase.
2. **Bare `<img>` tags** in HeroCarousel, ProductCard, and ImageCarousel fetch directly from Supabase with no server-side caching.
3. **No cache-busting URLs** — aggressive caching isn't safe without a way to invalidate on image changes.

## Solution: Aggressive Caching + Cache-Busting URLs + next/image

### 1. Bump Watermark Proxy Cache Headers

**File:** `app/api/gallery/image/route.ts`

Change `Cache-Control` from:
```
public, max-age=60, s-maxage=300, stale-while-revalidate=600
```
To:
```
public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400
```

- Browser: 1 hour
- CDN edge: 1 day
- Stale-while-revalidate: 1 day

The `cache: 'no-store'` on the upstream Supabase fetch stays unchanged — it only fires when the proxy itself runs, which with 1-day CDN TTL will be rare.

### 2. Cache-Busting URLs

Add `?v=<timestamp>` and `&wm=<hash>` query params to image URLs so cache keys change when content changes.

| Image source | Cache-buster | Rationale |
|---|---|---|
| Products (proxy & direct) | `&v=<product.updated_at>` | URL can stay same if admin overwrites file |
| Gallery items | `&v=<created_at>` | Items are replaced (delete+insert), so created_at changes |
| Hero slides | None needed | Filename is `Date.now().ext` — URL always changes on re-upload |
| Watermark text | `&wm=<short-hash>` on all proxy URLs | Ensures watermark rename busts CDN cache |

**New utility:** `lib/image-url.ts`

```ts
export function watermarkSrc(imageUrl: string, watermark: string, version?: string): string
```

Builds `/api/gallery/image?url=<encoded>&wm=<hash>&v=<version>`. Used at all proxy call sites.

### 3. Convert Bare `<img>` to `next/image`

| Component | Current | Change |
|---|---|---|
| `HeroCarousel` | `<img src={slide.url}>` | `<Image fill>` with `priority` on first slide |
| `ProductCard` | `<img src={...}>` | `<Image fill>` |
| `ImageCarousel` | `<img src={...}>` | `<Image fill>` |
| `ModernStoryMosaic` | `<img src={...}>` | Keep as-is (already proxied, diminishing returns) |

`next/image` fetches server-side, converts to WebP/AVIF, and caches on disk. Subsequent requests for the same `{src, width, quality}` are served from cache with zero Supabase egress.

### 4. Bump next/image Cache TTL

**File:** `next.config.js`

Add `minimumCacheTTL: 86400` to the `images` config so the Next.js image optimization cache holds images for 1 day instead of the default 60 seconds.

## Files Changed

| File | Change |
|---|---|
| `app/api/gallery/image/route.ts` | Bump cache headers |
| `next.config.js` | Add `minimumCacheTTL: 86400` |
| `lib/image-url.ts` (new) | `watermarkSrc()` utility with `wm` hash |
| `components/modern/ModernFeaturedGrid.tsx` | Use `watermarkSrc()` |
| `components/home/GalleryScroller.tsx` | Use `watermarkSrc()` |
| `components/home/GalleryStrip.tsx` | Use `watermarkSrc()` |
| `components/shop/ProductCard.tsx` | Use `watermarkSrc()`, `<img>` to `<Image>` |
| `components/shop/ImageCarousel.tsx` | Use `watermarkSrc()`, `<img>` to `<Image>` |
| `components/modern/HeroCarousel.tsx` | `<img>` to `<Image>` |
| `components/modern/ModernStoryMosaic.tsx` | Use `watermarkSrc()` |

## Not In Scope

- No schema migrations (no `updated_at` columns needed)
- No in-memory LRU cache (unreliable on serverless)
- No pre-generated watermarks (upload complexity not worth it)
- No change to `cache: 'no-store'` on upstream fetch (only fires on CDN miss)

## Expected Impact

- CDN cache duration increases from 5 minutes to 1 day (~99% reduction in proxy-to-Supabase fetches)
- `next/image` eliminates direct browser-to-Supabase fetches for hero, product cards, product detail
- Cache-busting URLs ensure image changes reflect immediately despite aggressive TTLs
- Should comfortably bring egress under the 5 GB free tier
