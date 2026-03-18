# Admin Layout Map — Design Spec

## Goal

Add a visual site-map diagram to relevant admin pages so non-technical admins can immediately see which part of the public site a field or upload will affect.

## Problem

The admin forms contain fields (e.g. "Announcement Text", "Hero Tagline", "Logo") with no visual context showing where they appear on the live site. This causes confusion and erodes client confidence in the tool.

## Design Decisions

- **Per-section static diagrams** — one `SiteMap` component per logical form section (not per field, not a single shared sidebar). Keeps context co-located with the fields it describes without repetition.
- **Full-page miniature** — ~120×200px CSS wireframe of the whole homepage so admins see spatial context (top of page vs. mid-page vs. footer).
- **Pure CSS, zero JS** — no scroll tracking, no focus events. The highlight is determined solely by the `highlight` prop passed at render time.
- **Four polish elements:**
  1. Content placeholder lines/rectangles inside non-highlighted zones (CSS gradients)
  2. Pill label tab on the highlighted zone
  3. Context sentence below the map
  4. Subtle CSS glow on the highlighted zone

## Component

### `components/admin/SiteMap.tsx`

```ts
interface SiteMapProps {
  highlight: SiteZone
  label: string       // Short zone name, e.g. "Announcement Bar"
  description: string // One sentence, e.g. "Shown as a slim banner at the top of every page"
}

type SiteZone =
  | 'announcement'
  | 'header'
  | 'hero'
  | 'story'
  | 'our-story'   // Full /our-story page — shows a full-page text block wireframe
  | 'products'
  | 'gallery'
  | 'event'
  | 'instagram'
  | 'newsletter'
  | 'footer'
```

**Wireframe layout:** flexbox column (`display: flex; flexDirection: 'column'`). Each zone uses `flex: 0 0 X%` where X is the percentage below.

**Wireframe zones (top to bottom) with proportional heights (homepage view):**

| Zone | `flex: 0 0 X%` | Visual content hint |
|---|---|---|
| `announcement` | 4% | Single thin line |
| `header` | 8% | Logo rectangle + nav lines |
| `hero` | 22% | Large image rectangle + two text lines |
| `story` | 12% | Three text lines |
| `products` | 14% | Three small card rectangles |
| `gallery` | 10% | Row of small image squares |
| `event` | 8% | Two text lines |
| `instagram` | 10% | Grid of tiny squares |
| `newsletter` | 8% | Input rectangle + button |
| `footer` | 4% | Two thin lines |

The `our-story` zone is a special case — render a separate two-zone wireframe instead of the full homepage layout:

| Zone | `flex: 0 0 X%` | Content hint |
|---|---|---|
| header bar | 10% | Logo rectangle + nav lines (same as homepage header) |
| text body | 90% | `repeating-linear-gradient` text placeholder lines filling the full block |

**Highlighted zone styles:**
- `background`: `color-mix(in srgb, var(--color-primary) 12%, transparent)`
- `border-left`: `3px solid var(--color-primary)`
- `box-shadow`: `0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent)`

**Pill label tab:**
- Absolute-positioned relative to the wireframe container (`position: relative; overflow: visible` on the container)
- Each zone `div` must have `position: relative; overflow: visible`
- Pill sits at `top: -10px; left: 4px` on the highlighted zone div
- Styles: `background: var(--color-primary)`, white text, `11px` font, `4px` border-radius, `4px 8px` padding
- The wireframe wrapper div must NOT set `overflow: hidden` — the pill on the `announcement` zone (first in list) extends above the container boundary

**Component root:** `marginBottom: '24px'`

**Non-highlighted zone styles:**
- `background`: `#f0f0f0`
- Text placeholder lines via `repeating-linear-gradient(transparent 0px, transparent 3px, #d8d8d8 3px, #d8d8d8 4px, transparent 4px, transparent 8px)` on the zone's inner content area
- Image areas: plain `#ddd` rectangle

## Integration Points

| Admin Page | Section | `highlight` | `label` | `description` |
|---|---|---|---|---|
| BrandingEditor | Theme | *(no map — theme applies site-wide, not a single zone)* | — | — |
| BrandingEditor | Logo | `header` | Site Header | Your logo appears in the top-left corner of every page |
| BrandingEditor | Announcement Banner | `announcement` | Announcement Bar | Slim banner displayed above the header on every page |
| ContentEditor | Hero Tagline + Hero Subtext | `hero` | Hero Section | The large opening section every visitor sees first |
| ContentEditor | Story Teaser | `story` | Story Teaser | Short excerpt on the homepage that links to your full story |
| ContentEditor | Full Story | `our-story` | Our Story Page | The full story shown on the /our-story page (not the homepage) |
| ContentEditor | Privacy Policy | *(no map — standalone legal page)* | — | — |
| ContentEditor | Terms of Service | *(no map — standalone legal page)* | — | — |
| GalleryManager | After page `<h1>` | `gallery` | Gallery Strip | Horizontal scrolling photo strip in the middle of the homepage |

**Note on Theme omission:** Showing `highlight="header"` for both Theme and Logo would render two identical diagrams back-to-back, which looks like a bug. Theme applies site-wide (colors, fonts everywhere), so a single-zone highlight would be misleading. Omitting the map here is intentional — the two color swatches already make the visual impact clear.

## File Changes

### `components/admin/SiteMap.tsx` — create
Full component implementation per spec above.

### `components/admin/BrandingEditor.tsx` — modify
- Remove `<SiteMap>` from Theme section (intentionally omitted)
- Add `<SiteMap highlight="header" label="Site Header" description="Your logo appears in the top-left corner of every page" />` immediately after `<h2>Logo</h2>` in the Logo section
- Add `<SiteMap highlight="announcement" label="Announcement Bar" description="Slim banner displayed above the header on every page" />` at the top of the Announcement Banner section

### `app/admin/content/page.tsx` — modify
Replace the flat `FIELDS` array and single `.map()` with explicit grouped rendering:

```tsx
// Four explicit groups replacing the flat FIELDS array:
const HERO_FIELDS = [
  { key: 'hero_tagline', label: 'Hero Tagline', rows: 2 },
  { key: 'hero_subtext', label: 'Hero Subtext', rows: 3 },
]
const STORY_TEASER_FIELDS = [
  { key: 'story_teaser', label: 'Story Teaser', rows: 4 },
]
const FULL_STORY_FIELDS = [
  { key: 'story_full', label: 'Full Story (HTML)', rows: 12 },
]
const LEGAL_FIELDS = [
  { key: 'privacy_policy',   label: 'Privacy Policy (HTML)',    rows: 20 },
  { key: 'terms_of_service', label: 'Terms of Service (HTML)',  rows: 20 },
]
```

JSX renders each group separately with its own `<SiteMap>`:
- `HERO_FIELDS` → `<SiteMap highlight="hero" …/>`
- `STORY_TEASER_FIELDS` → `<SiteMap highlight="story" …/>`
- `FULL_STORY_FIELDS` → `<SiteMap highlight="our-story" …/>`
- `LEGAL_FIELDS` → no map

`ContentEditor` itself is not modified.

### `components/admin/GalleryManager.tsx` — modify
Add `<SiteMap highlight="gallery" label="Gallery Strip" description="Horizontal scrolling photo strip in the middle of the homepage" />` immediately after the existing `<h1>Gallery</h1>`.

## Out of Scope

- Custom theme color picker (separate spec)
- Mobile wireframe variant
- Interactive/hover highlighting
- Admin pages for Events, Integrations, Newsletter, Reports
