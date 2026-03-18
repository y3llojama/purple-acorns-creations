# Custom Theme Color Picker + Hero Image Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an 8-preset + free-picker color theme selector and admin hero image upload to the Branding admin page, with server-side CSS variable derivation and no flash-of-wrong-theme.

**Architecture:** A new pure utility `lib/color.ts` derives all 9 CSS custom properties from two hex values; `app/layout.tsx` injects them as an inline style on `<html>` for custom themes; `BrandingEditor.tsx` renders the preset grid and color pickers client-side with an explicit Save button. Hero image follows the same ImageUploader + settings POST pattern already used for the logo.

**Tech Stack:** React (TSX), Next.js 15 App Router, Supabase PostgreSQL, inline CSS custom properties, Jest + Testing Library.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/002_custom_theme_hero.sql` | Create | Adds `custom_primary`, `custom_accent`, `hero_image_url` columns; expands theme constraint |
| `lib/supabase/types.ts` | Modify | Expands `Theme` union; adds 3 fields to `Settings` interface |
| `lib/theme.ts` | Modify | Removes unsafe `getTheme()`; adds 3 null fields to `DEFAULT_SETTINGS` |
| `lib/color.ts` | Create | `deriveCustomThemeVars(primary, accent): ThemeVars` — pure hex-to-HSL derivation |
| `__tests__/lib/color.test.ts` | Create | Unit tests for all 9 derived variables + error cases |
| `app/api/admin/settings/route.ts` | Modify | Adds `'custom'` to allowed themes; hex validation; `hero_image_url` URL validation; server-side clear of custom colors on named preset save |
| `app/layout.tsx` | Modify | Injects inline CSS vars on `<html>` for custom theme; try/catch fallback |
| `components/admin/BrandingEditor.tsx` | Modify | Replaces THEMES with PRESETS; adds preset grid, color pickers, preview strip, Save button; adds Hero Image section |
| `app/(public)/page.tsx` | Modify | Passes `settings.hero_image_url` to `<HeroSection>` |
| `__tests__/components/admin/BrandingPage.test.tsx` | Modify | Removes broken test; extends mockSettings; adds 8 new tests |

---

## Task 1: Migration + types + theme cleanup

**Files:**
- Create: `supabase/migrations/002_custom_theme_hero.sql`
- Modify: `lib/supabase/types.ts`
- Modify: `lib/theme.ts`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/002_custom_theme_hero.sql`:

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

- [ ] **Step 2: Update the Theme type and Settings interface**

In `lib/supabase/types.ts`, the current file reads:

```ts
export type Theme = 'warm-artisan' | 'soft-botanical'
```

And `Settings` has fields ending with `behold_widget_id: string | null` and `updated_at: string`.

Make two changes:

**a)** Expand the `Theme` type:
```ts
export type Theme = 'warm-artisan' | 'soft-botanical' | 'custom'
```

**b)** Add three fields to the `Settings` interface (after `behold_widget_id`, before `updated_at`):
```ts
  custom_primary: string | null
  custom_accent: string | null
  hero_image_url: string | null
```

- [ ] **Step 3: Update DEFAULT_SETTINGS and remove getTheme() in lib/theme.ts**

In `lib/theme.ts`:

**a)** In `DEFAULT_SETTINGS`, add three fields (after `behold_widget_id: null`):
```ts
  custom_primary: null,
  custom_accent: null,
  hero_image_url: null,
```

**b)** Delete the entire `getTheme()` function (lines 26–29). It returned `Theme` which now includes `'custom'`, making it unsafe to use as a `data-theme` attribute. `layout.tsx` already uses `getSettings()` directly.

- [ ] **Step 4: Run the full test suite to confirm nothing broke**

```bash
./scripts/test.sh
```

Expected: all tests pass (no call sites for `getTheme()` exist in the tested code).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/002_custom_theme_hero.sql lib/supabase/types.ts lib/theme.ts
git commit -m "feat: add custom_primary, custom_accent, hero_image_url to settings schema and types"
```

---

## Task 2: lib/color.ts — color derivation utility (TDD)

**Files:**
- Create: `__tests__/lib/color.test.ts`
- Create: `lib/color.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/color.test.ts`:

```ts
import { deriveCustomThemeVars, ThemeVars } from '@/lib/color'

const HSL_RE = /^hsl\(\d+, \d+%, \d+%\)$/
const PRIMARY = '#2d1b4e'
const ACCENT  = '#d4a853'

describe('deriveCustomThemeVars', () => {
  it('returns all 9 CSS variable keys', () => {
    const vars = deriveCustomThemeVars(PRIMARY, ACCENT)
    expect(Object.keys(vars)).toHaveLength(9)
  })

  it('--color-primary equals primary input', () => {
    expect(deriveCustomThemeVars(PRIMARY, ACCENT)['--color-primary']).toBe(PRIMARY)
  })

  it('--color-accent equals accent input', () => {
    expect(deriveCustomThemeVars(PRIMARY, ACCENT)['--color-accent']).toBe(ACCENT)
  })

  it('--color-focus equals accent input', () => {
    expect(deriveCustomThemeVars(PRIMARY, ACCENT)['--color-focus']).toBe(ACCENT)
  })

  it('derived variables are hsl() strings', () => {
    const vars = deriveCustomThemeVars(PRIMARY, ACCENT)
    const derived: Array<keyof ThemeVars> = [
      '--color-bg', '--color-surface', '--color-text',
      '--color-text-muted', '--color-border', '--color-secondary',
    ]
    for (const key of derived) {
      expect(vars[key]).toMatch(HSL_RE)
    }
  })

  it('--color-bg lightness is higher than --color-text lightness', () => {
    const vars = deriveCustomThemeVars(PRIMARY, ACCENT)
    const bgL   = parseInt(vars['--color-bg'].match(/(\d+)%\)$/)![1])
    const textL = parseInt(vars['--color-text'].match(/(\d+)%\)$/)![1])
    expect(bgL).toBeGreaterThan(textL)
  })

  it('throws TypeError for invalid primary hex', () => {
    expect(() => deriveCustomThemeVars('not-a-color', ACCENT)).toThrow(TypeError)
  })

  it('throws TypeError for invalid accent hex', () => {
    expect(() => deriveCustomThemeVars(PRIMARY, 'bad')).toThrow(TypeError)
  })

  it('throws TypeError for 3-digit shorthand hex', () => {
    expect(() => deriveCustomThemeVars('#fff', ACCENT)).toThrow(TypeError)
  })

  it('accepts uppercase hex', () => {
    expect(() => deriveCustomThemeVars('#2D1B4E', '#D4A853')).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./scripts/test.sh __tests__/lib/color.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/color'`

- [ ] **Step 3: Create lib/color.ts**

Create `lib/color.ts`:

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

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function deriveCustomThemeVars(primary: string, accent: string): ThemeVars {
  if (!HEX_RE.test(primary)) throw new TypeError(`Invalid primary hex: ${primary}`)
  if (!HEX_RE.test(accent))  throw new TypeError(`Invalid accent hex: ${accent}`)

  const [ph] = hexToHsl(primary)
  const [ah] = hexToHsl(accent)

  return {
    '--color-primary':    primary,
    '--color-accent':     accent,
    '--color-bg':         hsl(ph, 20, 85),
    '--color-surface':    hsl(ph, 15, 92),
    '--color-text':       hsl(ph, 40, 10),
    '--color-text-muted': hsl(ph, 25, 40),
    '--color-border':     hsl(ph, 22, 78),
    '--color-secondary':  hsl(ah, 35, 55),
    '--color-focus':      accent,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
./scripts/test.sh __tests__/lib/color.test.ts
```

Expected: 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/color.ts __tests__/lib/color.test.ts
git commit -m "feat: add deriveCustomThemeVars color utility"
```

---

## Task 3: Update the settings API route

**Files:**
- Modify: `app/api/admin/settings/route.ts`

This task has no new test file — the changes are covered by the BrandingEditor integration tests in Task 5.

- [ ] **Step 1: Update the API route**

Open `app/api/admin/settings/route.ts`. Make four targeted changes:

**a) Expand ALLOWED_THEMES (line 7):**
```ts
const ALLOWED_THEMES = ['warm-artisan', 'soft-botanical', 'custom'] as const
type Theme = typeof ALLOWED_THEMES[number]
```

**b) After the theme block (after line 19 `update.theme = String(body.theme)`), add hex validation and server-side clearing:**
```ts
  if (body.theme !== undefined) {
    if (!ALLOWED_THEMES.includes(String(body.theme) as Theme)) return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
    update.theme = String(body.theme)
    // Server enforces clearing custom colors whenever a named preset is saved
    if (body.theme === 'warm-artisan' || body.theme === 'soft-botanical') {
      update.custom_primary = null
      update.custom_accent  = null
    }
  }

  // Hex color fields — validate format, return 400 if invalid
  for (const field of ['custom_primary', 'custom_accent'] as const) {
    if (body[field] !== undefined) {
      if (body[field] === null) {
        update[field] = null
      } else {
        const val = String(body[field])
        if (!/^#[0-9a-fA-F]{6}$/.test(val)) return NextResponse.json({ error: `Invalid hex color for ${field}` }, { status: 400 })
        update[field] = val
      }
    }
  }
```

**c) Add `hero_image_url` to the URL fields array (line 21):**
```ts
  for (const field of ['logo_url', 'square_store_url', 'announcement_link_url', 'hero_image_url'] as const) {
```

The full updated theme block should look like this (replace lines 16–19):

```ts
  if (body.theme !== undefined) {
    if (!ALLOWED_THEMES.includes(String(body.theme) as Theme)) return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
    update.theme = String(body.theme)
    if (body.theme === 'warm-artisan' || body.theme === 'soft-botanical') {
      update.custom_primary = null
      update.custom_accent  = null
    }
  }
  // Hex color fields — validate format, return 400 if invalid
  for (const field of ['custom_primary', 'custom_accent'] as const) {
    if (body[field] !== undefined) {
      if (body[field] === null) {
        update[field] = null
      } else {
        const val = String(body[field])
        if (!/^#[0-9a-fA-F]{6}$/.test(val)) return NextResponse.json({ error: `Invalid hex color for ${field}` }, { status: 400 })
        update[field] = val
      }
    }
  }
  // URL fields — only store validated https URLs (invalid coerced to null)
  for (const field of ['logo_url', 'square_store_url', 'announcement_link_url', 'hero_image_url'] as const) {
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

```bash
./scripts/test.sh
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/settings/route.ts
git commit -m "feat: add custom theme + hero_image_url support to settings API route"
```

---

## Task 4: layout.tsx — inject custom theme vars

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update layout.tsx**

Open `app/layout.tsx`. The current file imports `getSettings` from `@/lib/theme` and uses `settings.theme ?? 'warm-artisan'` as the `data-theme` attribute.

Add the import for `deriveCustomThemeVars`:
```ts
import { deriveCustomThemeVars } from '@/lib/color'
import type { ThemeVars } from '@/lib/color'
```

Replace the current theme logic in `RootLayout`:

```ts
// Current (replace this):
const theme = settings.theme ?? 'warm-artisan'

// New:
let themeAttr: string = settings.theme ?? 'warm-artisan'
let inlineVars: ThemeVars | undefined

if (settings.theme === 'custom' && settings.custom_primary && settings.custom_accent) {
  try {
    inlineVars = deriveCustomThemeVars(settings.custom_primary, settings.custom_accent)
    // themeAttr stays 'custom' — inline style is the sole source of CSS vars
  } catch {
    themeAttr = 'warm-artisan'
  }
}
```

Update the `<html>` element:
```tsx
// Current:
<html lang="en" data-theme={theme}>

// New:
<html lang="en" data-theme={themeAttr} style={inlineVars as React.CSSProperties}>
```

- [ ] **Step 2: Run the full test suite**

```bash
./scripts/test.sh
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: inject custom theme CSS vars via inline style in layout"
```

---

## Task 5: BrandingEditor rewrite + hero image section (TDD)

**Files:**
- Modify: `__tests__/components/admin/BrandingPage.test.tsx`
- Modify: `components/admin/BrandingEditor.tsx`

- [ ] **Step 1: Update the test file**

Replace the entire contents of `__tests__/components/admin/BrandingPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BrandingEditor from '@/components/admin/BrandingEditor'
import type { Settings } from '@/lib/supabase/types'

jest.mock('@/components/admin/ImageUploader', () => ({
  __esModule: true,
  default: ({ onUpload, label }: { onUpload: (url: string, alt: string) => void; label: string }) => (
    <button data-testid="image-uploader" onClick={() => onUpload('https://example.com/img.jpg', '')}>
      {label}
    </button>
  ),
}))

jest.mock('@/components/admin/SiteMap', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => (
    <div data-testid={`sitemap-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</div>
  ),
}))

jest.mock('@/lib/color', () => ({
  deriveCustomThemeVars: jest.fn(() => ({
    '--color-primary':    '#2d1b4e',
    '--color-accent':     '#d4a853',
    '--color-bg':         'hsl(270, 20%, 85%)',
    '--color-surface':    'hsl(270, 15%, 92%)',
    '--color-text':       'hsl(270, 40%, 10%)',
    '--color-text-muted': 'hsl(270, 25%, 40%)',
    '--color-border':     'hsl(270, 22%, 78%)',
    '--color-secondary':  'hsl(40, 35%, 55%)',
    '--color-focus':      '#d4a853',
  })),
}))

const mockSettings: Partial<Settings> = {
  theme: 'warm-artisan',
  custom_primary: null,
  custom_accent: null,
  hero_image_url: null,
  announcement_enabled: false,
  announcement_text: null,
  announcement_link_url: null,
  announcement_link_label: null,
  logo_url: null,
}

describe('BrandingEditor', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true })
  })
  afterEach(() => jest.resetAllMocks())

  // — Theme section —

  it('renders 8 preset swatches', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByText('Warm Artisan')).toBeInTheDocument()
    expect(screen.getByText('Soft Botanical')).toBeInTheDocument()
    expect(screen.getByText('Forest Dusk')).toBeInTheDocument()
    expect(screen.getByText('Rose & Rust')).toBeInTheDocument()
    expect(screen.getByText('Midnight Ink')).toBeInTheDocument()
    expect(screen.getByText('Mauve Bloom')).toBeInTheDocument()
    expect(screen.getByText('Harvest Gold')).toBeInTheDocument()
    expect(screen.getByText('Slate & Sage')).toBeInTheDocument()
  })

  it('warm artisan is active on mount when theme is warm-artisan', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByRole('button', { name: /warm artisan/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /soft botanical/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking a different preset marks it active, populates pickers, and resets saved status', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    // First save so themeSaved is true
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /soft botanical/i }))
    expect(screen.getByRole('button', { name: /soft botanical/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/primary/i)).toHaveValue('#3d2b4e')
    expect(screen.getByLabelText(/accent/i)).toHaveValue('#9b7bb8')
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()
  })

  it('changing a color picker resets saved status', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText(/primary/i), { target: { value: '#ff0000' } })
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()
  })

  it('save button with named preset posts correct payload', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ theme: 'warm-artisan', custom_primary: null, custom_accent: null }),
      })
    ))
  })

  it('save button with custom preset posts theme=custom with hex values', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    fireEvent.click(screen.getByRole('button', { name: /forest dusk/i }))
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ theme: 'custom', custom_primary: '#1a3d2b', custom_accent: '#c8a86b' }),
      })
    ))
  })

  it('on mount with custom theme matching a preset, that preset is shown as active', () => {
    const customSettings = {
      ...mockSettings,
      theme: 'custom' as const,
      custom_primary: '#1a3d2b',
      custom_accent: '#c8a86b',
    }
    render(<BrandingEditor settings={customSettings as Settings} />)
    expect(screen.getByRole('button', { name: /forest dusk/i })).toHaveAttribute('aria-pressed', 'true')
  })

  // — Logo section —

  it('renders the site map for the Logo section', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByTestId('sitemap-site-header')).toBeInTheDocument()
  })

  // — Hero Image section —

  it('renders the Hero Image section with SiteMap', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByTestId('sitemap-hero-section')).toBeInTheDocument()
  })

  it('hero image upload posts hero_image_url to settings', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    fireEvent.click(screen.getByText('Upload Hero Image'))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ hero_image_url: 'https://example.com/img.jpg' }),
      })
    ))
  })

  // — Announcement section —

  it('announcement toggle is a checkbox with label', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByRole('checkbox', { name: /show announcement/i })).toBeInTheDocument()
  })

  it('renders the site map for the Announcement Banner section', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByTestId('sitemap-announcement-bar')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm the new/changed tests fail**

```bash
./scripts/test.sh __tests__/components/admin/BrandingPage.test.tsx
```

Expected: multiple FAILs — new preset/hero tests don't pass yet.

- [ ] **Step 3: Rewrite BrandingEditor.tsx**

Replace the entire contents of `components/admin/BrandingEditor.tsx`:

```tsx
'use client'
import { useState } from 'react'
import ImageUploader from './ImageUploader'
import SiteMap from './SiteMap'
import { deriveCustomThemeVars } from '@/lib/color'
import type { ThemeVars } from '@/lib/color'
import type { Settings } from '@/lib/supabase/types'

interface Props { settings: Settings }

type NamedTheme = 'warm-artisan' | 'soft-botanical'
type Preset =
  | { name: string; theme: NamedTheme; primary: string; accent: string }
  | { name: string; theme: 'custom'; primary: string; accent: string }

const PRESETS: Preset[] = [
  { name: 'Warm Artisan',   theme: 'warm-artisan',   primary: '#2d1b4e', accent: '#d4a853' },
  { name: 'Soft Botanical', theme: 'soft-botanical',  primary: '#3d2b4e', accent: '#9b7bb8' },
  { name: 'Forest Dusk',    theme: 'custom',          primary: '#1a3d2b', accent: '#c8a86b' },
  { name: 'Rose & Rust',    theme: 'custom',          primary: '#6b1a2e', accent: '#d4916b' },
  { name: 'Midnight Ink',   theme: 'custom',          primary: '#1a2040', accent: '#8bb4d4' },
  { name: 'Mauve Bloom',    theme: 'custom',          primary: '#3d1a2e', accent: '#e8a0c0' },
  { name: 'Harvest Gold',   theme: 'custom',          primary: '#3d2800', accent: '#e8c060' },
  { name: 'Slate & Sage',   theme: 'custom',          primary: '#2e3d35', accent: '#9fb89f' },
]

const PREVIEW_STRIP_VARS: Array<keyof ThemeVars> = [
  '--color-bg', '--color-surface', '--color-primary', '--color-accent', '--color-text', '--color-text-muted',
]

function initPreset(settings: Settings): Preset {
  if (settings.theme === 'warm-artisan' || settings.theme === 'soft-botanical') {
    return PRESETS.find(p => p.theme === settings.theme)!
  }
  if (settings.theme === 'custom' && settings.custom_primary && settings.custom_accent) {
    const match = PRESETS.find(p => p.primary === settings.custom_primary && p.accent === settings.custom_accent)
    if (match) return match
    return { name: 'Custom', theme: 'custom', primary: settings.custom_primary, accent: settings.custom_accent }
  }
  return PRESETS[0]
}

function safeDerive(primary: string, accent: string): ThemeVars | null {
  try { return deriveCustomThemeVars(primary, accent) } catch { return null }
}

export default function BrandingEditor({ settings }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<Preset>(() => initPreset(settings))
  const [pickerPrimary, setPickerPrimary]   = useState(selectedPreset.primary)
  const [pickerAccent, setPickerAccent]     = useState(selectedPreset.accent)
  const [previewVars, setPreviewVars]       = useState<ThemeVars | null>(() => safeDerive(selectedPreset.primary, selectedPreset.accent))
  const [themeSaved, setThemeSaved]         = useState(false)

  const [announcementEnabled, setAnnouncementEnabled]       = useState(settings.announcement_enabled)
  const [announcementText, setAnnouncementText]             = useState(settings.announcement_text ?? '')
  const [announcementLinkUrl, setAnnouncementLinkUrl]       = useState(settings.announcement_link_url ?? '')
  const [announcementLinkLabel, setAnnouncementLinkLabel]   = useState(settings.announcement_link_label ?? '')
  const [announcementSaved, setAnnouncementSaved]           = useState(false)

  function handlePresetClick(preset: Preset) {
    setSelectedPreset(preset)
    setPickerPrimary(preset.primary)
    setPickerAccent(preset.accent)
    setPreviewVars(safeDerive(preset.primary, preset.accent))
    setThemeSaved(false)
  }

  function handlePickerChange(primary: string, accent: string) {
    setPickerPrimary(primary)
    setPickerAccent(accent)
    const match = PRESETS.find(p => p.primary === primary && p.accent === accent)
    setSelectedPreset(match ?? { name: 'Custom', theme: 'custom', primary, accent })
    setPreviewVars(safeDerive(primary, accent))
    setThemeSaved(false)
  }

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

  async function saveAnnouncement(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        announcement_enabled: announcementEnabled,
        announcement_text: announcementText,
        announcement_link_url: announcementLinkUrl,
        announcement_link_label: announcementLinkLabel,
      }),
    })
    if (res.ok) setAnnouncementSaved(true)
  }

  async function handleLogoUpload(url: string, _altText: string) {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo_url: url }),
    })
  }

  async function handleHeroUpload(url: string, _altText: string) {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero_image_url: url }),
    })
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Branding</h1>

      {/* Theme */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '6px' }}>Theme</h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
          Choose a preset or set your own colors. The site updates for all visitors after saving.
        </p>

        {/* Preset grid */}
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)' }}>Presets</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 80px)', gap: '10px', marginBottom: '24px' }}>
          {PRESETS.map(preset => {
            const isActive = selectedPreset.name === preset.name
            return (
              <button
                key={preset.name}
                onClick={() => handlePresetClick(preset)}
                aria-pressed={isActive}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  cursor: 'pointer', textAlign: 'center',
                }}
              >
                <div style={{
                  border: `3px solid ${isActive ? preset.primary : '#ddd'}`,
                  borderRadius: '8px', overflow: 'hidden', marginBottom: '4px',
                }}>
                  <div style={{ height: '28px', background: preset.primary }} />
                  <div style={{ height: '28px', background: preset.accent }} />
                </div>
                <span style={{ fontSize: '10px', color: isActive ? preset.primary : '#888', fontWeight: isActive ? 700 : 400 }}>
                  {preset.name}{isActive ? ' ✓' : ''}
                </span>
              </button>
            )
          })}
        </div>

        {/* Custom pickers */}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', marginBottom: '16px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '14px' }}>
            Custom Colors
          </span>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="picker-primary" style={{ fontSize: '13px', fontWeight: 500 }}>Primary</label>
              <input
                id="picker-primary"
                type="color"
                value={pickerPrimary}
                onChange={e => handlePickerChange(e.target.value, pickerAccent)}
                aria-label="Primary color"
                style={{ width: '44px', height: '44px', border: '2px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="picker-accent" style={{ fontSize: '13px', fontWeight: 500 }}>Accent</label>
              <input
                id="picker-accent"
                type="color"
                value={pickerAccent}
                onChange={e => handlePickerChange(pickerPrimary, e.target.value)}
                aria-label="Accent color"
                style={{ width: '44px', height: '44px', border: '2px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
              />
            </div>

            {/* Preview strip */}
            {previewVars && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Preview</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {PREVIEW_STRIP_VARS.map(key => (
                    <div
                      key={key}
                      title={key}
                      style={{ width: '24px', height: '44px', borderRadius: '3px', background: previewVars[key], border: '1px solid #ddd' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '10px' }}>
            Tip: Primary is used for headings and borders. Accent is used for highlights and buttons.
          </p>
        </div>

        <button
          onClick={saveTheme}
          style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 24px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
        >
          Save Theme
        </button>
        {themeSaved && <span role="status" aria-live="polite" style={{ marginLeft: '12px', color: 'green' }}>Saved ✓</span>}
      </section>

      {/* Logo */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Logo</h2>
        <SiteMap highlight="header" label="Site Header" description="Your logo appears in the top-left corner of every page." />
        {settings.logo_url && (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Current logo set. Upload a new one to replace it.</p>
        )}
        <ImageUploader bucket="branding" onUpload={handleLogoUpload} label="Upload Logo" />
      </section>

      {/* Hero Image */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Hero Image</h2>
        <SiteMap highlight="hero" label="Hero Section" description="Full-width background image on the homepage hero." />
        {settings.hero_image_url && (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Current hero image set. Upload a new one to replace it.</p>
        )}
        <ImageUploader bucket="branding" onUpload={handleHeroUpload} label="Upload Hero Image" />
      </section>

      {/* Announcement banner */}
      <section>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Announcement Banner</h2>
        <SiteMap highlight="announcement" label="Announcement Bar" description="Slim banner displayed above the header on every page." />
        <form onSubmit={saveAnnouncement}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '16px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={announcementEnabled}
              onChange={e => setAnnouncementEnabled(e.target.checked)}
              aria-label="Show announcement banner"
              style={{ width: '20px', height: '20px' }}
            />
            Show announcement banner
          </label>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="ann-text" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Announcement Text (max 300 chars)</label>
            <input id="ann-text" value={announcementText} onChange={e => setAnnouncementText(e.target.value)} maxLength={300} style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label htmlFor="ann-link-url" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Link URL (optional)</label>
              <input id="ann-link-url" value={announcementLinkUrl} onChange={e => setAnnouncementLinkUrl(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label htmlFor="ann-link-label" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Link Label (optional)</label>
              <input id="ann-link-label" value={announcementLinkLabel} onChange={e => setAnnouncementLinkLabel(e.target.value)} placeholder="Learn more" style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
          </div>
          <button type="submit" style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 24px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>
            Save Announcement
          </button>
          {announcementSaved && <span role="status" aria-live="polite" style={{ marginLeft: '12px', color: 'green' }}>Saved ✓</span>}
        </form>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
./scripts/test.sh __tests__/components/admin/BrandingPage.test.tsx
```

Expected: all tests PASS

- [ ] **Step 5: Run the full test suite**

```bash
./scripts/test.sh
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add components/admin/BrandingEditor.tsx __tests__/components/admin/BrandingPage.test.tsx
git commit -m "feat: add custom theme preset grid, color pickers, and hero image upload to BrandingEditor"
```

---

## Task 6: Homepage wiring + final verification

**Files:**
- Modify: `app/(public)/page.tsx`

- [ ] **Step 1: Pass hero_image_url to HeroSection**

Open `app/(public)/page.tsx`. The current `<HeroSection>` call on line 32 is:

```tsx
<HeroSection tagline={sanitizeText(content.hero_tagline ?? '')} subtext={sanitizeText(content.hero_subtext ?? '')} />
```

Replace with:

```tsx
<HeroSection
  tagline={sanitizeText(content.hero_tagline ?? '')}
  subtext={sanitizeText(content.hero_subtext ?? '')}
  heroImageUrl={settings.hero_image_url}
/>
```

`settings` is already in scope from `getSettings()` called earlier in the same function.

- [ ] **Step 2: Run the full test suite one final time**

```bash
./scripts/test.sh
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/page.tsx
git commit -m "feat: wire hero_image_url from settings into HeroSection on homepage"
```
