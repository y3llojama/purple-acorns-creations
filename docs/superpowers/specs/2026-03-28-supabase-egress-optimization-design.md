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
public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600
```

- Browser: 1 hour
- CDN edge: 1 day
- Stale-while-revalidate: 1 hour (worst-case staleness: 25 hours without cache-busting; with `?v=` params, admin changes bust immediately)

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

The `wm` hash uses DJB2 (first 8 hex chars). This is a cache key, not a security control — collisions are acceptable.

### 3. Convert Bare `<img>` to `next/image`

| Component | Current | Change |
|---|---|---|
| `HeroCarousel` | `<img src={slide.url}>` | `<Image fill>` with `priority` on first slide |
| `ProductCard` | `<img src={...}>` | `<Image fill>` |
| `ImageCarousel` | `<img src={...}>` | `<Image fill>` |
| `ModernStoryMosaic` | `<img src={...}>` | Keep as-is — CSS scroll-snap + hover-transform layout conflicts with `next/image` wrapper; already proxied with new 1-day CDN TTL |

`next/image` fetches server-side, converts to WebP/AVIF, and caches on disk. Subsequent requests for the same `{src, width, quality}` are served from cache with zero Supabase egress.

### 4. Bump next/image Cache TTL

**File:** `next.config.js`

Add `minimumCacheTTL: 3600` to the `images` config so the Next.js image optimization cache holds images for 1 hour instead of the default 60 seconds. This is a global setting that applies to all `next/image` sources — 1 hour limits blast radius if future image types (e.g., user avatars) need shorter freshness.

## Files Changed

| File | Change |
|---|---|
| `app/api/gallery/image/route.ts` | Bump cache headers |
| `next.config.js` | Add `minimumCacheTTL: 3600` |
| `lib/image-url.ts` (new) | `watermarkSrc()` utility with `wm` hash |
| `components/modern/ModernFeaturedGrid.tsx` | Use `watermarkSrc()` |
| `components/home/GalleryScroller.tsx` | Use `watermarkSrc()` |
| `components/home/GalleryStrip.tsx` | Use `watermarkSrc()` |
| `components/shop/ProductCard.tsx` | Use `watermarkSrc()`, `<img>` to `<Image>` |
| `components/shop/ImageCarousel.tsx` | Use `watermarkSrc()`, `<img>` to `<Image>` |
| `components/modern/HeroCarousel.tsx` | `<img>` to `<Image>` |
| `components/modern/ModernStoryMosaic.tsx` | Use `watermarkSrc()` |

## Security Invariants Preserved

- The watermark proxy's URL allowlist (`/^[a-z0-9-]+\.supabase\.co$/i`) remains unchanged. `watermarkSrc()` is a URL builder, not a trust boundary — validation happens in the proxy route.
- All `?v=` and `&wm=` params are generated server-side from DB values, not from user input. No new input surfaces.
- All four Storage buckets (`branding`, `gallery`, `products`, `messages`) are public. No signed URLs are used. If signed URLs are ever introduced, they must bypass the 1-day CDN cache.
- Rate limiting (200 req/IP/60s) on the proxy is unchanged and becomes more effective since CDN caching reduces origin hits.

## Not In Scope

- No schema migrations (no `updated_at` columns needed)
- No in-memory LRU cache (unreliable on serverless)
- No pre-generated watermarks (upload complexity not worth it)
- No change to `cache: 'no-store'` on upstream fetch (only fires on CDN miss)

## Rollback Plan

If aggressive caching causes visible bugs (stale images after admin edits), revert the `Cache-Control` header in `app/api/gallery/image/route.ts` to the previous value:
```
public, max-age=60, s-maxage=300, stale-while-revalidate=600
```
And remove `minimumCacheTTL` from `next.config.js`. Single commit, deploy, and the CDN will begin expiring entries at the old rate.

## DMCA / Takedown Procedure

With 1-day CDN caching, deleting an image from Supabase Storage does not immediately remove it from Vercel's edge or the `next/image` disk cache. For legal takedowns:

1. Delete the image from Supabase Storage and its DB row
2. Purge the Vercel CDN cache: `vercel project rm-cache` or redeploy (clears `next/image` disk cache)
3. If immediate purge is needed, the Vercel dashboard allows cache invalidation per-path

## Expected Impact

- CDN cache duration increases from 5 minutes to 1 day (~99% reduction in proxy-to-Supabase fetches)
- `next/image` eliminates direct browser-to-Supabase fetches for hero, product cards, product detail
- Cache-busting URLs (`?v=`, `&wm=`) ensure admin-initiated image changes bust caches immediately; worst-case staleness for non-busted URLs is 25 hours
- Should comfortably bring egress under the 5 GB free tier
