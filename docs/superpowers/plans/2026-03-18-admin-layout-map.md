# Admin Layout Map Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-section miniature site-map wireframe to Branding, Content, and Gallery admin pages so non-technical admins can immediately see where each field appears on the live site.

**Architecture:** A single pure-CSS `SiteMap` component renders a ~120×200px flexbox wireframe of the homepage with one highlighted zone. It accepts `highlight`, `label`, and `description` props and is dropped inline above relevant form sections. No JS, no state, no new API routes.

**Tech Stack:** React (TSX), inline styles only, CSS custom properties (`var(--color-primary)`, `color-mix()`), Jest + Testing Library.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `components/admin/SiteMap.tsx` | **Create** | Renders the wireframe with highlighted zone, pill label, description |
| `__tests__/components/admin/SiteMap.test.tsx` | **Create** | Tests for SiteMap rendering and zone variants |
| `components/admin/BrandingEditor.tsx` | **Modify** | Import + render SiteMap in Logo and Announcement sections |
| `app/admin/content/page.tsx` | **Modify** | Split FIELDS into 4 groups, render SiteMap per group |
| `components/admin/GalleryManager.tsx` | **Modify** | Import + render SiteMap after h1 |
| `__tests__/components/admin/BrandingPage.test.tsx` | **Modify** | Mock SiteMap, assert it renders in correct sections |
| `__tests__/components/admin/ContentAdminPage.test.tsx` | **Create** | Tests for the server page grouping + SiteMap rendering (separate from ContentEditor tests) |
| `__tests__/components/admin/GalleryPage.test.tsx` | **Modify** | Mock SiteMap, assert it renders above the upload section |

---

## Task 1: Create SiteMap component + tests

**Files:**
- Create: `components/admin/SiteMap.tsx`
- Create: `__tests__/components/admin/SiteMap.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/admin/SiteMap.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import SiteMap from '@/components/admin/SiteMap'

describe('SiteMap', () => {
  it('renders the wireframe container', () => {
    render(<SiteMap highlight="hero" label="Hero Section" description="The large opening section." />)
    expect(screen.getByTestId('sitemap-wireframe')).toBeInTheDocument()
  })

  it('renders the pill label on the highlighted zone', () => {
    const { container } = render(<SiteMap highlight="hero" label="Hero Section" description="desc" />)
    // Pill is aria-hidden; query directly from DOM
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('Hero Section')
  })

  it('renders the description text below the wireframe', () => {
    render(<SiteMap highlight="announcement" label="Announcement Bar" description="Shown at the top of every page." />)
    expect(screen.getByText('Shown at the top of every page.')).toBeInTheDocument()
  })

  it('renders homepage zones for standard highlights', () => {
    render(<SiteMap highlight="gallery" label="Gallery Strip" description="desc" />)
    expect(screen.getByTestId('sitemap-zone-gallery')).toBeInTheDocument()
    expect(screen.getByTestId('sitemap-zone-hero')).toBeInTheDocument()
    expect(screen.getByTestId('sitemap-zone-footer')).toBeInTheDocument()
  })

  it('renders the our-story variant with only two zones', () => {
    render(<SiteMap highlight="our-story" label="Our Story Page" description="desc" />)
    expect(screen.getByTestId('sitemap-zone-our-story')).toBeInTheDocument()
    expect(screen.getByTestId('sitemap-zone-header')).toBeInTheDocument()
    expect(screen.queryByTestId('sitemap-zone-hero')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./scripts/test.sh __tests__/components/admin/SiteMap.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/admin/SiteMap'`

- [ ] **Step 3: Create `components/admin/SiteMap.tsx`**

```tsx
type SiteZone =
  | 'announcement' | 'header' | 'hero' | 'story' | 'our-story'
  | 'products' | 'gallery' | 'event' | 'instagram' | 'newsletter' | 'footer'

type Hint = 'bar' | 'text' | 'image' | 'cards' | 'grid' | 'input'

interface ZoneDef { zone: SiteZone; flex: number; hint: Hint }

export interface SiteMapProps {
  highlight: SiteZone
  label: string
  description: string
}

const HOMEPAGE_ZONES: ZoneDef[] = [
  { zone: 'announcement', flex: 4,  hint: 'bar'   },
  { zone: 'header',       flex: 8,  hint: 'bar'   },
  { zone: 'hero',         flex: 22, hint: 'image' },
  { zone: 'story',        flex: 12, hint: 'text'  },
  { zone: 'products',     flex: 14, hint: 'cards' },
  { zone: 'gallery',      flex: 10, hint: 'grid'  },
  { zone: 'event',        flex: 8,  hint: 'text'  },
  { zone: 'instagram',    flex: 10, hint: 'grid'  },
  { zone: 'newsletter',   flex: 8,  hint: 'input' },
  { zone: 'footer',       flex: 4,  hint: 'bar'   },
]

const OUR_STORY_ZONES: ZoneDef[] = [
  { zone: 'header',    flex: 10, hint: 'bar'  },
  { zone: 'our-story', flex: 90, hint: 'text' },
]

function ZoneHint({ hint }: { hint: Hint }) {
  switch (hint) {
    case 'text':
      return (
        <div style={{
          width: '80%', margin: '4px auto',
          background: 'repeating-linear-gradient(transparent 0px, transparent 3px, #ccc 3px, #ccc 4px, transparent 4px, transparent 8px)',
          minHeight: '12px', flex: 1,
        }} />
      )
    case 'image':
      return <div style={{ width: '60%', height: '60%', margin: 'auto', background: '#d0d0d0', borderRadius: '2px' }} />
    case 'cards':
      return (
        <div style={{ display: 'flex', gap: '3px', padding: '4px', width: '100%', alignItems: 'center' }}>
          {[0, 1, 2].map(i => <div key={i} style={{ flex: 1, height: '16px', background: '#d0d0d0', borderRadius: '2px' }} />)}
        </div>
      )
    case 'grid':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', padding: '4px', width: '100%' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1', background: '#d0d0d0', borderRadius: '1px' }} />
          ))}
        </div>
      )
    case 'input':
      return (
        <div style={{ padding: '4px', display: 'flex', gap: '3px', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1, height: '8px', background: '#d0d0d0', borderRadius: '2px' }} />
          <div style={{ width: '20px', height: '8px', background: '#b0b0b0', borderRadius: '2px' }} />
        </div>
      )
    default: // 'bar'
      return <div style={{ width: '70%', height: '4px', margin: '4px auto', background: '#d0d0d0', borderRadius: '2px' }} />
  }
}

export default function SiteMap({ highlight, label, description }: SiteMapProps) {
  const zones = highlight === 'our-story' ? OUR_STORY_ZONES : HOMEPAGE_ZONES

  return (
    <div style={{ marginBottom: '24px' }}>
      <div
        data-testid="sitemap-wireframe"
        style={{
          width: '120px',
          height: '200px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          background: '#fafafa',
          // Must not set overflow:hidden — pill label on announcement zone extends above container
        }}
      >
        {zones.map(({ zone, flex, hint }) => {
          const isHighlighted = zone === highlight
          return (
            <div
              key={zone}
              data-testid={`sitemap-zone-${zone}`}
              style={{
                flex: `0 0 ${flex}%`,
                position: 'relative',
                overflow: 'visible',
                background: isHighlighted
                  ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
                  : '#f0f0f0',
                borderLeft: isHighlighted ? '3px solid var(--color-primary)' : '3px solid transparent',
                boxShadow: isHighlighted
                  ? '0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent)'
                  : 'none',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isHighlighted ? (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '4px',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: '11px',
                    fontFamily: 'sans-serif',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    zIndex: 1,
                  }}
                >
                  {label}
                </div>
              ) : (
                <ZoneHint hint={hint} />
              )}
            </div>
          )
        })}
      </div>
      <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-muted)', maxWidth: '280px', lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
./scripts/test.sh __tests__/components/admin/SiteMap.test.tsx
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/admin/SiteMap.tsx __tests__/components/admin/SiteMap.test.tsx
git commit -m "feat: add SiteMap wireframe component for admin layout hints"
```

---

## Task 2: Integrate SiteMap into BrandingEditor

**Files:**
- Modify: `components/admin/BrandingEditor.tsx:90-97` (Logo section) and `:99-132` (Announcement section)
- Modify: `__tests__/components/admin/BrandingPage.test.tsx`

- [ ] **Step 1: Update the BrandingEditor test to assert SiteMap renders**

First read `__tests__/components/admin/BrandingPage.test.tsx` to understand its current structure and count existing tests before adding anything.

Add a mock for `SiteMap` and two new assertions. The existing mock block for `ImageUploader` is at the top — add the SiteMap mock immediately after it:

```tsx
jest.mock('@/components/admin/SiteMap', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <div data-testid={`sitemap-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</div>,
}))
```

Then add two new tests inside the existing `describe('BrandingEditor', ...)` block:

```tsx
it('renders the site map for the Logo section', () => {
  render(<BrandingEditor settings={mockSettings as Settings} />)
  expect(screen.getByTestId('sitemap-site-header')).toBeInTheDocument()
})

it('renders the site map for the Announcement Banner section', () => {
  render(<BrandingEditor settings={mockSettings as Settings} />)
  expect(screen.getByTestId('sitemap-announcement-bar')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to confirm the new tests fail**

```bash
./scripts/test.sh __tests__/components/admin/BrandingPage.test.tsx
```

Expected: 2 new tests FAIL — `Unable to find an element by: [data-testid="sitemap-site-header"]`

- [ ] **Step 3: Add SiteMap to BrandingEditor**

Open `components/admin/BrandingEditor.tsx`. Make these two changes:

**a) Add import** at the top (after the existing imports):
```tsx
import SiteMap from './SiteMap'
```

**b) Add SiteMap to the Logo section** — immediately after `<h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Logo</h2>`:
```tsx
<SiteMap
  highlight="header"
  label="Site Header"
  description="Your logo appears in the top-left corner of every page."
/>
```

**c) Add SiteMap to the Announcement Banner section** — immediately after `<h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Announcement Banner</h2>`:
```tsx
<SiteMap
  highlight="announcement"
  label="Announcement Bar"
  description="Slim banner displayed above the header on every page."
/>
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
./scripts/test.sh __tests__/components/admin/BrandingPage.test.tsx
```

Expected: all existing tests + 2 new tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/admin/BrandingEditor.tsx __tests__/components/admin/BrandingPage.test.tsx
git commit -m "feat: add layout map hints to Branding admin (logo + announcement)"
```

---

## Task 3: Integrate SiteMap into Content admin page

**Files:**
- Modify: `app/admin/content/page.tsx`
- Create: `__tests__/components/admin/ContentAdminPage.test.tsx` (new file — do NOT modify the existing `ContentPage.test.tsx` which tests `ContentEditor`)

- [ ] **Step 1: Write the new test file**

The existing `__tests__/components/admin/ContentPage.test.tsx` tests `ContentEditor` (a client component) — do not touch it. Create a new file for the server page:

`__tests__/components/admin/ContentAdminPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import ContentAdminPage from '@/app/admin/content/page'

jest.mock('@/lib/content', () => ({
  getAllContent: jest.fn().mockResolvedValue({
    hero_tagline: '', hero_subtext: '', story_teaser: '',
    story_full: '', privacy_policy: '', terms_of_service: '',
  }),
}))

jest.mock('@/components/admin/ContentEditor', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <div>{label}</div>,
}))

jest.mock('@/components/admin/SiteMap', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => (
    <div data-testid={`sitemap-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</div>
  ),
}))

describe('ContentAdminPage', () => {
  it('renders the hero section site map', async () => {
    render(await ContentAdminPage())
    expect(screen.getByTestId('sitemap-hero-section')).toBeInTheDocument()
  })

  it('renders the story teaser site map', async () => {
    render(await ContentAdminPage())
    expect(screen.getByTestId('sitemap-story-teaser')).toBeInTheDocument()
  })

  it('renders the our story page site map', async () => {
    render(await ContentAdminPage())
    expect(screen.getByTestId('sitemap-our-story-page')).toBeInTheDocument()
  })

  it('does not render a site map for legal fields', async () => {
    render(await ContentAdminPage())
    expect(screen.queryByTestId('sitemap-privacy-policy')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./scripts/test.sh __tests__/components/admin/ContentAdminPage.test.tsx
```

Expected: 4 tests FAIL — `Cannot find module '@/app/admin/content/page'` or missing SiteMap renders

- [ ] **Step 3: Rewrite `app/admin/content/page.tsx`**

Replace the entire file with:

```tsx
import { getAllContent } from '@/lib/content'
import ContentEditor from '@/components/admin/ContentEditor'
import SiteMap from '@/components/admin/SiteMap'

export const metadata = { title: 'Admin — Content' }

const HERO_FIELDS = [
  { key: 'hero_tagline', label: 'Hero Tagline', rows: 2 },
  { key: 'hero_subtext', label: 'Hero Subtext', rows: 3 },
] as const

const STORY_TEASER_FIELDS = [
  { key: 'story_teaser', label: 'Story Teaser', rows: 4 },
] as const

const FULL_STORY_FIELDS = [
  { key: 'story_full', label: 'Full Story (HTML)', rows: 12 },
] as const

const LEGAL_FIELDS = [
  { key: 'privacy_policy',   label: 'Privacy Policy (HTML)',   rows: 20 },
  { key: 'terms_of_service', label: 'Terms of Service (HTML)', rows: 20 },
] as const

export default async function ContentAdminPage() {
  const content = await getAllContent()
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Content</h1>

      <SiteMap highlight="hero" label="Hero Section" description="The large opening section every visitor sees first on the homepage." />
      {HERO_FIELDS.map(({ key, label, rows }) => (
        <ContentEditor key={key} contentKey={key} label={label} initialValue={content[key] ?? ''} rows={rows} />
      ))}

      <SiteMap highlight="story" label="Story Teaser" description="Short excerpt on the homepage that links to your full story." />
      {STORY_TEASER_FIELDS.map(({ key, label, rows }) => (
        <ContentEditor key={key} contentKey={key} label={label} initialValue={content[key] ?? ''} rows={rows} />
      ))}

      <SiteMap highlight="our-story" label="Our Story Page" description="The full story shown on the /our-story page, not the homepage." />
      {FULL_STORY_FIELDS.map(({ key, label, rows }) => (
        <ContentEditor key={key} contentKey={key} label={label} initialValue={content[key] ?? ''} rows={rows} />
      ))}

      {LEGAL_FIELDS.map(({ key, label, rows }) => (
        <ContentEditor key={key} contentKey={key} label={label} initialValue={content[key] ?? ''} rows={rows} />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
./scripts/test.sh __tests__/components/admin/ContentAdminPage.test.tsx
```

Expected: 4 tests PASS

- [ ] **Step 5: Confirm existing ContentEditor tests still pass**

```bash
./scripts/test.sh __tests__/components/admin/ContentPage.test.tsx
```

Expected: 3 tests PASS (unchanged)

- [ ] **Step 6: Commit**

```bash
git add app/admin/content/page.tsx __tests__/components/admin/ContentAdminPage.test.tsx
git commit -m "feat: add layout map hints to Content admin (hero, story, our-story)"
```

---

## Task 4: Integrate SiteMap into GalleryManager

**Files:**
- Modify: `components/admin/GalleryManager.tsx:42` (after h1)
- Modify: `__tests__/components/admin/GalleryPage.test.tsx`

First read `__tests__/components/admin/GalleryPage.test.tsx` to understand the existing test structure before making changes.

- [ ] **Step 1: Update GalleryPage tests**

Open `__tests__/components/admin/GalleryPage.test.tsx`. Add a SiteMap mock (after existing mocks):

```tsx
jest.mock('@/components/admin/SiteMap', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <div data-testid={`sitemap-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</div>,
}))
```

Add one new test:

```tsx
it('renders the gallery strip site map', () => {
  render(<GalleryManager initialItems={[]} />)
  expect(screen.getByTestId('sitemap-gallery-strip')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to confirm the new test fails**

```bash
./scripts/test.sh __tests__/components/admin/GalleryPage.test.tsx
```

Expected: 1 new test FAIL

- [ ] **Step 3: Add SiteMap to GalleryManager**

Open `components/admin/GalleryManager.tsx`. Make two changes:

**a) Add import** at the top (after existing imports):
```tsx
import SiteMap from './SiteMap'
```

**b) Add SiteMap immediately after the `<h1>` tag** (line 42). The `<h1>` currently reads:
```tsx
<h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '24px' }}>Gallery</h1>
```

Insert directly after it:
```tsx
<SiteMap
  highlight="gallery"
  label="Gallery Strip"
  description="Horizontal scrolling photo strip in the middle of the homepage."
/>
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
./scripts/test.sh __tests__/components/admin/GalleryPage.test.tsx
```

Expected: all tests PASS

- [ ] **Step 5: Run the full test suite to confirm nothing is broken**

```bash
./scripts/test.sh
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add components/admin/GalleryManager.tsx __tests__/components/admin/GalleryPage.test.tsx
git commit -m "feat: add layout map hint to Gallery admin"
```
