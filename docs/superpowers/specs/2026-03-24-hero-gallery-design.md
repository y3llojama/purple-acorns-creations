# Hero Gallery Design

**Date:** 2026-03-24
**Status:** Approved

## Overview

Replace the single static hero image on the homepage with a 1-to-n image carousel. When only one image is configured the hero looks identical to today. With multiple images it auto-cycles with crossfade or slide transitions, dot indicators, and prev/next arrow buttons. The admin manages slides through the Branding page.

---

## Data Layer

### New table: `hero_slides`

```sql
create table hero_slides (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  alt_text     text not null,
  sort_order   int  not null default 0,
  created_at   timestamptz default now()
);
```

Row-level security: service role only (bypasses RLS by default). RLS must be explicitly enabled with no permissive policies so the anon role cannot read rows.

### Settings table additions

Two new columns:

| Column | Type | Default | Values |
|---|---|---|---|
| `hero_transition` | `text` | `'crossfade'` | `'crossfade'`, `'slide'` |
| `hero_interval_ms` | `int` | `5000` | 2000–30000 (ms) |

### Deprecation

`settings.hero_image_url` remains in the schema but is no longer written or read by the hero UI. No destructive migration.

---

## API Routes

All routes require admin auth via `requireAdminSession()`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/hero-slides` | List all slides ordered by `sort_order` |
| `POST` | `/api/admin/hero-slides` | Add a slide — body: `{ url, alt_text }` |
| `DELETE` | `/api/admin/hero-slides/[id]` | Remove a slide by id |
| `PATCH` | `/api/admin/hero-slides/reorder` | Update sort_order — body: `{ ids: string[] }` (ordered array) |

Transition and interval are saved via the existing `POST /api/admin/settings` endpoint (new allowed fields: `hero_transition`, `hero_interval_ms`).

### Input validation

**POST `/api/admin/hero-slides`:**
- `url` must pass `isValidHttpsUrl()` — reject with 400 if invalid
- `alt_text` required, max 300 chars, must be sanitized with `sanitizeText()` before storing
- Return 400 if either field is missing or fails validation

**DELETE `/api/admin/hero-slides/[id]`:**
- Validate `[id]` against `UUID_RE` (existing pattern, see gallery route) — reject with 400 if not a valid UUID

**PATCH `/api/admin/hero-slides/reorder`:**
- `ids` must be a non-empty array with at most 100 elements — reject with 400 if exceeded
- Each element must match `UUID_RE` — reject with 400 on first invalid entry
- Reject with 400 if `ids` is missing or not an array

**POST `/api/admin/settings` (new fields):**
- `hero_transition` must be exactly `'crossfade'` or `'slide'` — reject with 400 otherwise
- `hero_interval_ms` must be an integer between 2000 and 30000 — parse as `parseInt`, reject with 400 if NaN or out of range
- The settings route's `update` map type (`Record<string, string | boolean | null>`) must be widened to also accept `number` to accommodate `hero_interval_ms`. Store as integer directly (do not stringify). Note: unlike `shipping_value` which calls `.toFixed(2)` to coerce to string, `hero_interval_ms` must remain a `number` in the update map.

### `revalidatePath` after mutations

All three mutating routes (POST, DELETE, PATCH reorder) must call `revalidatePath('/', 'layout')` after a successful DB write, so the public homepage serves fresh slide data immediately.

---

## Frontend — `ModernHero` Split

### `ModernHero` (server component, `components/modern/ModernHero.tsx`)

Fetches `hero_slides` (ordered by `sort_order`, select `id, url, alt_text, sort_order` — no `*`) and the two new settings columns from Supabase. Passes `slides`, `transition`, and `intervalMs` to `HeroCarousel`. Falls back to gradient placeholder if `slides` is empty.

**Props change:** `heroImageUrl` prop is removed entirely and replaced by:

```ts
interface Props {
  slides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
}
```

**Callsite update required:** `app/(public)/page.tsx` line 64–68 must be updated to remove `heroImageUrl={settings.hero_image_url}` and pass the new props. The `hero_slides` query result and `settings.hero_transition` / `settings.hero_interval_ms` are passed instead.

### `HeroCarousel` (client component, `components/modern/HeroCarousel.tsx`)

`'use client'` — owns all carousel state.

**Behavior:**
- Single slide: renders plain `<img>`, no controls shown (arrows, dots hidden)
- Multiple slides: auto-cycles via `setInterval` at `intervalMs`
- Pauses on `mouseenter`, resumes on `mouseleave`
- Prev/next arrows: always visible, positioned on left/right edges of image panel
- Dot indicators: centered at bottom of image panel, one per slide, active dot full opacity
- Dots and arrows are clickable to jump to any slide
- Wraps around (last → first, first → last)
- `prefers-reduced-motion`: if media query matches, disable auto-cycle and CSS transitions

**Accessibility:**
- Arrow buttons: `aria-label="Previous slide"` / `aria-label="Next slide"`
- Dot buttons: `aria-label="Go to slide N"`
- `aria-live="polite"` region announces slide changes to screen readers
- Images use the stored `alt_text` value (empty string `alt=""` is not acceptable — alt_text is required at upload time)

**Transitions:**
- `crossfade`: absolute-positioned slides, CSS `opacity` transition (0.6s ease)
- `slide`: CSS `transform: translateX()` transition (0.4s ease), slides laid out horizontally

---

## Admin — `BrandingEditor` Changes

### `HeroSlideList` (new client component, `components/admin/HeroSlideList.tsx`)

Replaces the current single `ImageUploader` + `handleHeroUpload` function in `BrandingEditor`. Receives initial `slides` as a prop; owns local slide state for optimistic updates.

**Layout:** Gallery grid (3 columns, 4:3 aspect ratio thumbnails). Each card shows:
- Thumbnail image
- Numbered badge (position in cycle order)
- × remove button (top-right corner of thumbnail)
- Alt text below thumbnail (truncated with ellipsis)

**"+ Add Image" card:** Opens `ImageUploader` (existing component, `bucket="branding"`). On upload success: POST to `/api/admin/hero-slides` with `{ url, alt_text }`. Optimistically append card to grid on success; show error message on failure.

**Reorder:** Up/down arrow buttons on each card — no drag-and-drop (avoids touch/drag library dependency). On reorder click: PATCH `/api/admin/hero-slides/reorder` with full `ids` array in new order.

**"Preview Carousel" button:** Opens `HeroCarouselPreviewModal`.

### `HeroCarouselPreviewModal` (client component, `components/admin/HeroCarouselPreviewModal.tsx`)

A modal overlay that renders a live `HeroCarousel` preview with the current slide list and settings values.

**Behaviour:**
- Opens when "Preview Carousel" is clicked; closes on × button, on Escape key, or on overlay click
- Must implement a focus trap: Tab cycles within the modal; focus is restored to the trigger button on close
- Pattern: follow `ConfirmDialog` implementation for focus trap and close behaviour. The parent component captures the trigger button via a `ref` and passes it to the modal as a `triggerRef` prop — matching the `ConfirmDialog` pattern.
- Renders `HeroCarousel` directly (reuses the same client component as the public page)
- Uses `intervalMs` from the current settings input (not a saved value) so the admin can preview before saving

**Props:**
```ts
interface Props {
  slides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
  onClose: () => void
}
```

**File location:** `components/admin/HeroCarouselPreviewModal.tsx`

### Settings controls (inline in `BrandingEditor`, within Hero Images section)

- **Transition** dropdown: Crossfade / Slide (maps to `'crossfade'` / `'slide'`)
- **Interval** number input: 2–30 (displayed as seconds; multiply by 1000 before POSTing as `hero_interval_ms`)
- **Save Settings** button: POSTs `{ hero_transition, hero_interval_ms }` to `/api/admin/settings`

---

## `homepage` data fetch (`app/(public)/page.tsx`)

Add `hero_slides` query to the existing `Promise.all`:

```ts
supabase
  .from('hero_slides')
  .select('id, url, alt_text, sort_order')
  .order('sort_order')
  .then(r => r.data ?? [])
```

Pass `heroSlides`, `hero_transition` (default `'crossfade'` if null), and `hero_interval_ms` (default `5000` if null) to `ModernHero`. Remove the old `heroImageUrl={settings.hero_image_url}` prop.

---

## Migration

New migration file: `supabase/migrations/039_hero_slides.sql`

> **Note for implementer:** Verify that `038_private_sales_shipping.sql` is the highest-numbered migration before creating this file. If a migration with a higher number exists, use the next available number instead of 039.

```sql
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

---

## Types

Add to `lib/supabase/types.ts`:

```ts
export interface HeroSlide {
  id: string
  url: string
  alt_text: string
  sort_order: number
}
```

> `created_at` is intentionally omitted — the hero slides query selects only `id, url, alt_text, sort_order` and `created_at` has no use on the frontend.

Add new fields to `Settings` interface:
```ts
hero_transition: string | null
hero_interval_ms: number | null
```

---

## Tests

### `HeroCarousel`
- Single slide: arrows and dots are not rendered
- Multiple slides: arrows and dots are rendered
- Auto-cycle advances to next slide after `intervalMs`
- `mouseenter` pauses auto-cycle; `mouseleave` resumes it
- Arrow click updates active slide index
- Dot click jumps to correct slide
- `prefers-reduced-motion`: auto-cycle does not start

### `GET /api/admin/hero-slides`
- Rejects unauthenticated request (401)
- Returns slides ordered by `sort_order`

### `POST /api/admin/hero-slides`
- Rejects unauthenticated request (401)
- Rejects invalid URL with 400
- Rejects missing `alt_text` with 400
- Returns created slide on success; calls `revalidatePath`

### `DELETE /api/admin/hero-slides/[id]`
- Rejects unauthenticated request (401)
- Rejects non-UUID `id` with 400
- Removes correct row and calls `revalidatePath` on success

### `POST /api/admin/settings` (hero fields)
- Rejects `hero_transition` values other than `'crossfade'` or `'slide'` with 400
- Stores `hero_interval_ms` as an integer, not a stringified number

### `PATCH /api/admin/hero-slides/reorder`
- Rejects unauthenticated request (401)
- Rejects `ids` array with more than 100 elements with 400
- Rejects array containing a non-UUID element with 400
- Updates `sort_order` correctly and calls `revalidatePath` on success

---

## Out of Scope

- Drag-to-reorder (use up/down buttons instead)
- Per-slide captions or CTAs
- Mobile swipe gestures
- Video slides
