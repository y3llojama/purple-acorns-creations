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

Parses both hex values to HSL. Input must be a 6-digit hex string matching `/^#[0-9a-fA-F]{6}$/`. If either value fails this check, the function throws a `TypeError`. Callers handle the error and fall back to `'warm-artisan'`.

All output values are strictly one of:
- A 6-digit hex string (`#rrggbb`) — for `--color-primary`, `--color-accent`, `--color-focus`
- An `hsl(N, N%, N%)` string — for all derived variables

**No raw DB string is ever interpolated directly into the inline style.** The inline style object is built exclusively from `deriveCustomThemeVars()` output.

Derivation rules:

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

---

## Theme Application — `app/layout.tsx`

`layout.tsx` calls `getSettings()` (already present). Logic:

```ts
let themeAttr: string = settings.theme ?? 'warm-artisan'
let inlineVars: React.CSSProperties | undefined

if (settings.theme === 'custom' && settings.custom_primary && settings.custom_accent) {
  try {
    const vars = deriveCustomThemeVars(settings.custom_primary, settings.custom_accent)
    inlineVars = vars as React.CSSProperties
  } catch {
    themeAttr = 'warm-artisan'
  }
}
```

Then on `<html>`:
```tsx
<html lang="en" data-theme={themeAttr} style={inlineVars}>
```

**Fallback rule:** if `theme === 'custom'` but colors are missing or invalid, `data-theme` is set to `'warm-artisan'` (not `'custom'`). This ensures a CSS rule always fires — there is no `[data-theme="custom"]` rule in `globals.css` and none should be added.

No client-side JS involved. No flash-of-wrong-theme.

---

## API Route — `app/api/admin/settings/route.ts`

**This file must be updated.** It currently has `ALLOWED_THEMES = ['warm-artisan', 'soft-botanical']` and rejects any other theme value with a 400.

Changes required:

1. Add `'custom'` to `ALLOWED_THEMES`
2. Add hex validation for `custom_primary` and `custom_accent`: if either is present in the request body, validate against `/^#[0-9a-fA-F]{6}$/` and return 400 if invalid
3. Add `hero_image_url` to URL validation using the existing `isValidHttpsUrl` pattern — an invalid URL is silently coerced to `null` (matching the existing behavior for `logo_url` and `square_store_url`), not a 400
4. Server-side enforcement: whenever `theme` is `'warm-artisan'` or `'soft-botanical'`, the server **always** includes `custom_primary: null, custom_accent: null` in the Supabase update — regardless of what the client sends. The client also sends these as `null` for consistency, but the server is the single source of truth for this clearing logic.

---

## BrandingEditor — Theme Section

### Preset model

There are only two named themes in the DB: `'warm-artisan'` and `'soft-botanical'`. The 6 additional preset pairs in the UI are **custom colors under the hood** — selecting them saves as `{ theme: 'custom', custom_primary: '...', custom_accent: '...' }`, not as a named theme value.

The `PRESETS` constant distinguishes between the two:

```ts
type Preset =
  | { name: string; theme: 'warm-artisan' | 'soft-botanical'; primary: string; accent: string }
  | { name: string; theme: 'custom'; primary: string; accent: string }
```

### Preset pairs

8 pairs total defined as `PRESETS` constant in `BrandingEditor.tsx`:

| Name | DB theme value | Primary | Accent |
|---|---|---|---|
| Warm Artisan | `warm-artisan` | `#2d1b4e` | `#d4a853` |
| Soft Botanical | `soft-botanical` | `#3d2b4e` | `#9b7bb8` |
| Forest Dusk | `custom` | `#1a3d2b` | `#c8a86b` |
| Rose & Rust | `custom` | `#6b1a2e` | `#d4916b` |
| Midnight Ink | `custom` | `#1a2040` | `#8bb4d4` |
| Mauve Bloom | `custom` | `#3d1a2e` | `#e8a0c0` |
| Harvest Gold | `custom` | `#3d2800` | `#e8c060` |
| Slate & Sage | `custom` | `#2e3d35` | `#9fb89f` |

Note: the existing `THEMES` constant in `BrandingEditor.tsx` has incorrect swatch colors for `soft-botanical` (primary `#9b7bb8`, accent `#f0e8f5`). These do not match `globals.css`. Replace the entire `THEMES` constant with `PRESETS` using the correct values from the table above.

Clicking a preset selects it visually (active border + checkmark) but does **not** save. It also populates the custom color pickers with that preset's colors. Selecting any preset (including the two named ones) pre-fills the pickers so the admin can see the values.

### Custom pickers

Two `<input type="color">` elements. On change, the component calls `deriveCustomThemeVars()` client-side and updates `previewVars` state. The preview strip renders 6 swatches in order: `--color-bg`, `--color-surface`, `--color-primary`, `--color-accent`, `--color-text`, `--color-text-muted`. These 6 cover the most visually representative range without overwhelming. `--color-border`, `--color-secondary`, `--color-focus` are omitted from the strip (they are still derived and saved).

### Initial mount state

On mount, initialize state from `settings`:

- If `settings.theme === 'warm-artisan'` or `'soft-botanical'`: set the matching preset as active; populate color pickers with that preset's `primary`/`accent` values from `PRESETS`
- If `settings.theme === 'custom'` and `custom_primary`/`custom_accent` are set: check if those hex values match a preset in `PRESETS` — if so, mark that preset as active; if not, show no preset as active (free-form custom). Either way, initialize the color pickers with `custom_primary`/`custom_accent`.
- If `settings.theme === 'custom'` but colors are missing: fall back to showing Warm Artisan as active with its default colors

### Save handler

```ts
async function saveTheme() {
  const body = selectedPreset.theme === 'warm-artisan' || selectedPreset.theme === 'soft-botanical'
    ? { theme: selectedPreset.theme, custom_primary: null, custom_accent: null }
    : { theme: 'custom', custom_primary: pickerPrimary, custom_accent: pickerAccent }

  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) setThemeSaved(true)
}
```

`selectedPreset` is the currently active preset object (one of the 8 from `PRESETS`). `pickerPrimary` and `pickerAccent` are the current values of the two color inputs.

### Save feedback

`themeSaved` is reset to `false` whenever the user clicks a different preset or changes either color picker, so the "Saved ✓" message disappears on new interaction. It returns to `true` only after a successful save.

---

## BrandingEditor — Hero Image Section

New section added below the existing Logo section. Uses the existing `ImageUploader` component:

```tsx
<ImageUploader bucket="branding" onUpload={handleHeroUpload} label="Upload Hero Image" />
```

On upload, POSTs `{ hero_image_url: url }` to `/api/admin/settings`. Shows "Current hero image set. Upload a new one to replace it." if `settings.hero_image_url` is present.

Includes a `SiteMap` with `highlight="hero"` label `"Hero Section"` and description `"Full-width background image on the homepage hero."` — same pattern as Logo and Announcement sections.

---

## Homepage Wiring — `app/(public)/page.tsx`

`HeroSection` already accepts a `heroImageUrl` prop and falls back to a placeholder. Pass it through:

```tsx
<HeroSection
  tagline={sanitizeText(content.hero_tagline ?? '')}
  subtext={sanitizeText(content.hero_subtext ?? '')}
  heroImageUrl={settings.hero_image_url}
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

`getTheme()` in `lib/theme.ts` must be **removed**. Its return type would become `Theme` (now including `'custom'`), making it unsafe to use as a `data-theme` attribute — `'custom'` has no CSS rule. All callers use `getSettings()` directly and handle the theme logic explicitly. Confirm no call sites for `getTheme()` remain after removal.

---

## Testing

### `__tests__/lib/color.test.ts` (new)

- Valid hex input returns all 9 variables with correct types (`hsl(...)` or `#rrggbb`)
- `--color-primary` equals input primary as-is
- `--color-accent` equals input accent as-is
- `--color-focus` equals accent as-is
- `--color-bg` has higher lightness than `--color-text` (sanity check)
- Invalid primary hex (e.g. `'not-a-color'`) throws `TypeError`
- Invalid accent hex throws `TypeError`

### `__tests__/components/admin/BrandingPage.test.tsx` (update + extend)

The existing test "renders two theme option cards" will break and must be removed or replaced, since the theme UI is being replaced entirely.

`mockSettings` must be extended to include the three new nullable fields:
```ts
const mockSettings = {
  // ... existing fields ...
  custom_primary: null,
  custom_accent: null,
  hero_image_url: null,
}
```

New/updated tests:
- Renders 8 preset swatches
- Clicking a preset updates active visual state and populates the color pickers
- Changing a color picker resets `themeSaved` to false
- Save button with named preset calls API with `{ theme: 'warm-artisan', custom_primary: null, custom_accent: null }`
- Save button with custom/preset-shortcut calls API with `{ theme: 'custom', custom_primary, custom_accent }`
- On mount with `settings.theme === 'custom'` and matching preset hex values, that preset is shown as active
- Hero image section renders with SiteMap
- Hero image upload calls API with `{ hero_image_url }`

---

## Files Touched

| File | Action |
|---|---|
| `supabase/migrations/002_custom_theme_hero.sql` | Create |
| `lib/supabase/types.ts` | Update `Theme` type + `Settings` interface |
| `lib/color.ts` | Create — `deriveCustomThemeVars()` |
| `lib/theme.ts` | Update `DEFAULT_SETTINGS`, remove `getTheme()` |
| `app/layout.tsx` | Inject inline style for custom theme, try/catch |
| `app/api/admin/settings/route.ts` | Add `'custom'` to allowed themes, hex validation, hero_image_url URL validation, clear custom colors on named preset save |
| `components/admin/BrandingEditor.tsx` | Replace THEMES with PRESETS, new theme UI + hero image section |
| `app/(public)/page.tsx` | Pass `hero_image_url` to `HeroSection` |
| `__tests__/lib/color.test.ts` | Create |
| `__tests__/components/admin/BrandingPage.test.tsx` | Update + extend |

---

## Out of Scope

- Image tinting on gallery/product photos (not recommended — hurts product color accuracy)
- Markdown content editor (separate spec, follow-on feature)
- Per-image tint toggle
- Additional named DB theme values beyond `warm-artisan`, `soft-botanical`, `custom`
