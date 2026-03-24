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
  sort_order   int  not null,
  created_at   timestamptz default now()
);
```

Row-level security: readable by service role only (same pattern as other content tables).

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

Input validation:
- `url` must pass `isValidHttpsUrl()` (existing util)
- `alt_text` required, max 300 chars
- `hero_transition` must be `'crossfade'` or `'slide'`
- `hero_interval_ms` must be integer between 2000–30000

---

## Frontend — `ModernHero` Split

### `ModernHero` (server component, `components/modern/ModernHero.tsx`)

Fetches `hero_slides` (ordered by `sort_order`) and the two new settings columns from Supabase. Passes `slides`, `transition`, and `intervalMs` to `HeroCarousel`. Falls back to gradient placeholder if `slides` is empty.

Props change: `heroImageUrl` replaced by `slides: HeroSlide[]`, `transition: 'crossfade' | 'slide'`, `intervalMs: number`.

```ts
interface HeroSlide { id: string; url: string; alt_text: string }
```

### `HeroCarousel` (client component, `components/modern/HeroCarousel.tsx`)

`'use client'` — owns all carousel state.

**Behavior:**
- Single slide: renders plain `<img>`, no controls shown
- Multiple slides: auto-cycles via `setInterval` at `intervalMs`
- Pauses on `mouseenter`, resumes on `mouseleave`
- Prev/next arrows: always visible, positioned on left/right edges of image panel
- Dot indicators: centered at bottom of image panel, one per slide, active dot full opacity
- Dots and arrows are clickable to jump to any slide
- Wraps around (last → first, first → last)
- `prefers-reduced-motion`: if set, disables auto-cycle and transitions

**Accessibility:**
- Arrow buttons: `aria-label="Previous slide"` / `aria-label="Next slide"`
- Dot buttons: `aria-label="Go to slide N"`
- Live region (`aria-live="polite"`) announces slide changes to screen readers
- Images use the stored `alt_text` value

**Transitions:**
- `crossfade`: absolute-positioned slides, CSS `opacity` transition (0.6s ease)
- `slide`: CSS `transform: translateX()` transition (0.4s ease), slides laid out horizontally

---

## Admin — `BrandingEditor` Changes

### `HeroSlideList` (new client component, `components/admin/HeroSlideList.tsx`)

Replaces the current single `ImageUploader` + `handleHeroUpload` in `BrandingEditor`.

**Layout:** Gallery grid (3 columns, 4:3 aspect ratio thumbnails). Each card shows:
- Thumbnail image
- Numbered badge (position)
- × remove button (top-right corner)
- Alt text below thumbnail

**"+ Add Image" card:** Opens `ImageUploader` (existing component, `bucket="branding"`). On upload success: POST to `/api/admin/hero-slides`, optimistically adds card to grid.

**Reorder:** Up/down arrow buttons on each card (no drag-and-drop — keeps implementation simple, avoids touch/drag library dependency). On reorder: PATCH `/api/admin/hero-slides/reorder` with new `ids` array.

**"Preview Carousel" button:** Opens a modal (`HeroCarouselPreviewModal`) that renders `HeroCarousel` with the current slide list and settings. Uses placeholder colored divs if images haven't loaded yet.

### Settings controls (inline in `BrandingEditor`)

Below the slide grid, within the Hero Images section:
- **Transition** dropdown: Crossfade / Slide
- **Interval** number input: 2–30 seconds (displayed as seconds, stored as ms)
- **Save Settings** button: POSTs to `/api/admin/settings`

---

## `homepage` data fetch (`app/(public)/page.tsx`)

Add `hero_slides` query to the existing `Promise.all`:

```ts
supabase.from('hero_slides').select('*').order('sort_order').then(r => r.data ?? [])
```

Pass `heroSlides`, `hero_transition`, and `hero_interval_ms` from `settings` to `ModernHero`.

---

## Migration

New migration file: `supabase/migrations/039_hero_slides.sql`

```sql
create table hero_slides (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  alt_text     text not null,
  sort_order   int  not null default 0,
  created_at   timestamptz default now()
);

alter table settings
  add column hero_transition  text default 'crossfade',
  add column hero_interval_ms int  default 5000;
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
  created_at: string
}
```

Add new fields to `Settings` interface: `hero_transition: string | null`, `hero_interval_ms: number | null`.

---

## Tests

- `HeroCarousel`: single slide hides controls; multiple slides show controls; pause on hover stops interval; arrow/dot clicks update active slide; `prefers-reduced-motion` disables auto-cycle
- `/api/admin/hero-slides` POST: rejects invalid URL; rejects missing alt_text; rejects unauthenticated
- `/api/admin/hero-slides/[id]` DELETE: removes correct row; rejects unauthenticated
- `/api/admin/hero-slides/reorder` PATCH: updates sort_order; rejects unauthenticated

---

## Out of Scope

- Drag-to-reorder (use up/down buttons instead)
- Per-slide captions or CTAs
- Mobile swipe gestures
- Video slides
