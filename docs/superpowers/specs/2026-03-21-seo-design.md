# SEO Design — Organic Search + Social Previews

**Date:** 2026-03-21
**Scope:** Metadata fixes, structured data (JSON-LD), Google Business Profile association
**Goals:** Rank for product/craft searches (organic); rich previews when shared on Instagram, Pinterest, iMessage, WhatsApp, Slack (social)

---

## Background

Purple Acornz Creations is an online handcrafted jewelry shop (crochet, sterling silver, brass, artisan pieces) with pop-up craft fair appearances. The site is built on Next.js 15 App Router with Supabase. A Google Business Profile has been created. Instagram: @purpleacornz (https://www.instagram.com/purpleacornz/).

**Current SEO state:**
- Global metadata in `app/layout.tsx` (title template, description, static OG image)
- `robots.ts` blocks `/admin`
- Static sitemap with 5 pages (no product URLs)
- Per-product `generateMetadata` on `/shop/[id]` (title + description only)
- Static metadata on `/shop` and `/our-story`
- No structured data anywhere
- No social card meta tags
- No newsletter slug metadata

---

## Section 1: Metadata Fixes

### 1a. Dynamic Sitemap

**File:** `app/sitemap.ts`

Upgrade from static to async. Query Supabase for all active products (`is_active = true`) and append a `/shop/[id]` entry for each, using `updated_at` as `lastModified`. Fall back to the existing static 5-page list if the query fails.

```
Static pages (unchanged):
  / — weekly, priority 1.0
  /shop — weekly, priority 0.9
  /our-story — monthly, priority 0.7
  /contact — yearly, priority 0.6
  /newsletter — yearly, priority 0.5

Dynamic product pages (new):
  /shop/[id] — weekly, priority 0.8, lastModified = product.updated_at
```

### 1b. Social Card Meta

**Files:** `app/layout.tsx`, `app/(public)/shop/[id]/page.tsx`

Add a `twitter` key to metadata objects. Despite the name, `twitter:card` is read by Pinterest, iMessage, WhatsApp, Slack, and other platforms for link previews. No Twitter account needed.

Root layout default:
```ts
twitter: {
  card: 'summary_large_image',
}
```

Product page override (in `generateMetadata`):
```ts
twitter: {
  card: 'summary_large_image',
  title: product.name,
  description: product.description ?? undefined,
  images: [product.images[0]],
}
```

### 1c. Product OG Enrichment

**File:** `app/(public)/shop/[id]/page.tsx` — `generateMetadata`

Extend the existing metadata return to include OpenGraph image and price-enriched description.

**Important:** The current `generateMetadata` query selects only `name, description`. Expand it to `select('name,description,images,price')` — do not rely on the separate page-render query, which is not shared with `generateMetadata`.

`price` is a non-nullable `number` field on all products — always format it as `$XX` and prepend to the description.

```ts
// generateMetadata query: .select('name,description,images,price')
openGraph: {
  title: data.name,
  description: `$${data.price} — ${data.description ?? ''}`.trim(),
  images: data.images[0] ? [{ url: data.images[0], alt: data.name }] : undefined,
  type: 'website',
}
```

### 1d. Newsletter Slug Metadata

**File:** `app/(public)/newsletter/[slug]/page.tsx`

Add `generateMetadata` that queries the newsletter by slug and returns:
- `title`: newsletter subject (`data.subject`)
- `description`: `data.teaser_text` — this is the purpose-built preview field already on the `newsletters` table; do not strip the body
- `openGraph.images`: fall back to the global OG image (`/og-image.jpg`)

---

## Section 2: Structured Data (JSON-LD)

All JSON-LD is rendered as an inline script tag in server components. Googlebot receives it in the initial HTML response.

**Security note:** The script tag uses `dangerouslySetInnerHTML` with `JSON.stringify()` of a controlled server-side object. No user input is injected; the content is pure JSON (not HTML). This is the standard Next.js App Router pattern for structured data and is not an XSS risk. This follows the same reasoning already established in `app/(public)/our-story/page.tsx`.

### 2a. Helper Module

**New file:** `lib/seo.ts`

Typed builder functions:

```ts
buildProductSchema(product: Product, url: string): object
buildOrganizationSchema(businessName: string): object
buildBreadcrumbSchema(items: { name: string; url: string }[]): object
```

Rules:
- Omit any field whose value is `null`, `undefined`, or empty string — do not emit null values in schema (invalid per schema.org)
- `buildProductSchema` maps `is_active` to `ItemAvailability`: `InStock` or `OutOfStock`
- Currency hardcoded to `USD`

### 2b. Product Schema — `/shop/[id]`

Fields sourced from the product DB row (already fetched for the page render):

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "[product.name]",
  "description": "[product.description]",
  "image": ["[product.images[0]]"],
  "offers": {
    "@type": "Offer",
    "price": "[product.price]",
    "priceCurrency": "USD",
    "availability": "https://schema.org/[InStock if product.is_active, else OutOfStock]",
    "url": "https://www.purpleacornz.com/shop/[id]"
  }
}
```

Note: `availability` must be set dynamically from `product.is_active` per the `buildProductSchema` rule in Section 2a — not hardcoded to `InStock`.

### 2c. Organization Schema — Homepage

Associates the website with the Google Business Profile and Instagram. `businessName` sourced from `settings.business_name` (already fetched by the page).

> **ACTION REQUIRED before shipping:** The GBP URL must be retrieved from the Google Business Profile dashboard and hardcoded in `lib/seo.ts` (or stored as `NEXT_PUBLIC_GBP_URL` env var). It cannot be derived from the codebase. Leaving it as a placeholder will silently emit an invalid `sameAs` value that Googlebot will index.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "[settings.business_name]",
  "url": "https://www.purpleacornz.com",
  "logo": "https://www.purpleacornz.com/og-image.jpg",
  "sameAs": [
    "https://www.instagram.com/purpleacornz/",
    "ACTION REQUIRED: replace with actual GBP URL from dashboard"
  ]
}
```

### 2d. BreadcrumbList Schema

**Files:** `app/(public)/shop/page.tsx`, `app/(public)/shop/[id]/page.tsx`

Shop listing page breadcrumb: `Home → Shop`

Product page breadcrumb: `Home → Shop → [product name]`

---

## Section 3: Implementation Notes

### File Changes Summary

| File | Change |
|---|---|
| `app/sitemap.ts` | Make async, add dynamic product URLs from Supabase |
| `app/layout.tsx` | Add `twitter.card` to global metadata |
| `app/(public)/shop/[id]/page.tsx` | Enrich OG, add Twitter meta, add Product + Breadcrumb JSON-LD |
| `app/(public)/shop/page.tsx` | Add Breadcrumb JSON-LD |
| `app/(public)/page.tsx` | Add Organization JSON-LD |
| `app/(public)/newsletter/[slug]/page.tsx` | Add `generateMetadata` |
| `lib/seo.ts` | New — schema builder helpers |

### Error Handling

- Sitemap DB failure: catch and return static pages only
- Product schema: skip `image`, `price`, `description` fields if null/empty rather than emitting invalid schema
- Newsletter metadata: if slug not found, return minimal `{ title: 'Newsletter' }`

### No New Dependencies

Everything uses Next.js built-ins and the existing Supabase service role client. No third-party SEO libraries.

---

## Out of Scope

- Dynamic OG image generation (deferred — Option C)
- Local Business schema (no permanent address)
- Google Search Console verification tag (manual step, not code)
- Canonical URL tags (Next.js `metadataBase` handles this)
