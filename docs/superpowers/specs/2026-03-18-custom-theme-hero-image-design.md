# Custom Theme Color Picker + Hero Image Admin — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Two related features added to the Branding admin page:

1. **Custom theme color picker** — admin picks a primary + accent color pair (from curated presets or free color pickers). The system derives all remaining CSS variables server-side and injects them as inline styles on `<html>`.
2. **Hero image upload** — admin uploads a hero background image via the same ImageUploader pattern used for the logo. Replaces the hardcoded placeholder in `HeroSection`.

---

## Database Migration

**File:** `supabase/migrations/002_custom_theme_hero.sql`

Add three columns to `settings`:

```sql
alter table settings
  add column custom_primary text,
  add column custom_accent  text,
  add column hero_image_url text;

-- Expand theme constraint to include 'custom'
alter table settings
  drop constraint settings_theme_check,
  add constraint settings_theme_check
    check (theme in ('warm-artisan', 'soft-botanical', 'custom'));
```

---

## Color Derivation — `lib/color.ts`

A shared utility imported by both the server (`lib/theme.ts`) and the client (`BrandingEditor.tsx`).

```ts
export interface ThemeVars {
  '--color-primary':    string
  '--color-accent':     string
  '--color-bg':         string
  '--color-surface':    string
  '--color-text':       string
  '--color-text-muted': string
  '--color-border':     string
  '--color-secondary':  string
  '--color-focus':      string
}
```

`deriveCustomThemeVars(primary: string, accent: string): ThemeVars`

Parses both hex values to HSL. Derivation rules:

| Variable | Rule |
|---|---|
| `--color-primary` | primary as-is |
| `--color-accent` | accent as-is |
| `--color-bg` | primary hue, 85% L, 20% S |
| `--color-surface` | primary hue, 92% L, 15% S |
| `--color-text` | primary hue, 10% L, 40% S |
| `--color-text-muted` | primary hue, 40% L, 25% S |
| `--color-border` | primary hue, 78% L, 22% S |
| `--color-secondary` | accent hue, 55% L, 35% S |
| `--color-focus` | accent as-is |

If either hex value is invalid, the function throws — callers handle the error and fall back to `'warm-artisan'`.

---

## Theme Application — `app/layout.tsx`

`layout.tsx` calls `getSettings()` (already present). Logic:

- If `theme !== 'custom'`: set `data-theme={theme}` on `<html>` as today. No change.
- If `theme === 'custom'` and both `custom_primary` and `custom_accent` are set: set `data-theme="custom"` AND an inline `style` attribute on `<html>` with all 9 CSS variables from `deriveCustomThemeVars()`.
- If `theme === 'custom'` but colors are missing: fall back to `data-theme="warm-artisan"`.

No client-side JS is involved. No flash-of-wrong-theme. The inline style overrides any `[data-theme="custom"]` CSS rules (none exist — the inline style is the sole source of truth for custom themes).

---

## BrandingEditor — Theme Section

### Preset pairs

Defined as a `PRESETS` constant in `BrandingEditor.tsx`. 8 pairs total:

| Name | Primary | Accent |
|---|---|---|
| Warm Artisan | `#2d1b4e` | `#d4a853` |
| Soft Botanical | `#3d2b4e` | `#9b7bb8` |
| Forest Dusk | `#1a3d2b` | `#c8a86b` |
| Rose & Rust | `#6b1a2e` | `#d4916b` |
| Midnight Ink | `#1a2040` | `#8bb4d4` |
| Mauve Bloom | `#3d1a2e` | `#e8a0c0` |
| Harvest Gold | `#3d2800` | `#e8c060` |
| Slate & Sage | `#2e3d35` | `#9fb89f` |

Clicking a preset selects it visually (active border + checkmark) but does **not** save. The existing `theme` state controls which is active. Selecting a preset clears the custom picker state.

### Custom pickers

Two `<input type="color">` elements. On change, the component calls `deriveCustomThemeVars()` client-side and updates a `previewVars` state — rendered as 6 colored swatches in a preview strip. Changing either picker automatically sets the selection to `'custom'` mode.

### Save button

One "Save Theme" button per the theme section. On click, POSTs to `/api/admin/settings`:

- Preset selected: `{ theme: 'warm-artisan' }` (or whichever preset value)
- Custom selected: `{ theme: 'custom', custom_primary: '#...', custom_accent: '#...' }`

Existing `themeSaved` confirmation message remains.

### API route

`/api/admin/settings` already accepts arbitrary settings keys via POST. No changes needed to the API route — it passes through `custom_primary`, `custom_accent`, and the expanded `theme` value to Supabase.

---

## BrandingEditor — Hero Image Section

New section added below the existing Logo section. Uses the existing `ImageUploader` component:

```tsx
<ImageUploader bucket="branding" onUpload={handleHeroUpload} label="Upload Hero Image" />
```

On upload, POSTs `{ hero_image_url: url }` to `/api/admin/settings`. Shows "Current hero image set" note if `settings.hero_image_url` is present.

Includes a `SiteMap` with `highlight="hero"` following the same pattern as Logo and Announcement sections.

---

## Homepage Wiring — `app/(public)/page.tsx`

`HeroSection` already accepts a `heroImageUrl` prop and falls back to a placeholder. The homepage just needs to pass it through:

```tsx
<HeroSection
  tagline={sanitizeText(content.hero_tagline ?? '')}
  subtext={sanitizeText(content.hero_subtext ?? '')}
  heroImageUrl={settings.hero_image_url}   // ← add this
/>
```

`settings` is already fetched on the homepage. No additional query.

---

## Types — `lib/supabase/types.ts`

```ts
export type Theme = 'warm-artisan' | 'soft-botanical' | 'custom'

export interface Settings {
  // ... existing fields ...
  custom_primary:  string | null   // add
  custom_accent:   string | null   // add
  hero_image_url:  string | null   // add
}
```

`DEFAULT_SETTINGS` in `lib/theme.ts` gets `custom_primary: null`, `custom_accent: null`, `hero_image_url: null`.

---

## Testing

### `__tests__/lib/color.test.ts` (new)

- `deriveCustomThemeVars` with valid hex input returns correct HSL-derived values for all 9 variables
- Invalid primary hex throws
- Invalid accent hex throws

### `__tests__/components/admin/BrandingPage.test.tsx` (extend)

- Clicking a preset updates the active visual state
- Custom color inputs update the preview strip
- Save button with preset selected calls API with correct `{ theme }` payload
- Save button with custom selected calls API with `{ theme: 'custom', custom_primary, custom_accent }`
- Hero image section renders
- Hero image upload calls API with `{ hero_image_url }`

---

## Files Touched

| File | Action |
|---|---|
| `supabase/migrations/002_custom_theme_hero.sql` | Create |
| `lib/supabase/types.ts` | Update `Theme` type + `Settings` interface |
| `lib/color.ts` | Create — `deriveCustomThemeVars()` |
| `lib/theme.ts` | Update `DEFAULT_SETTINGS` |
| `app/layout.tsx` | Inject inline style for custom theme |
| `components/admin/BrandingEditor.tsx` | New theme UI + hero image section |
| `app/(public)/page.tsx` | Pass `hero_image_url` to `HeroSection` |
| `__tests__/lib/color.test.ts` | Create |
| `__tests__/components/admin/BrandingPage.test.tsx` | Extend |

---

## Out of Scope

- Image tinting on gallery/product photos (not recommended — hurts product color accuracy)
- Markdown content editor (separate spec, follow-on feature)
- Per-image tint toggle
