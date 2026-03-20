# Newsletter + AI Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete newsletter system with AI-assisted draft composition, Resend delivery, Supabase subscriber storage, public archive pages, and open/click analytics.

**Architecture:** Site-first newsletters — full content lives at `/newsletter/[slug]`, email sends a teaser that links back. Resend handles delivery + open/click tracking via webhooks. Vercel Cron polls every 5 min for scheduled sends.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service role), Resend API, Claude/OpenAI/Groq (configured AI provider), Jest, Vercel Cron

---

## File Map

**New files:**
- `supabase/migrations/015_newsletter.sql`
- `lib/newsletter.ts` — slug generation, content validation, AI prompt builder
- `lib/resend.ts` — Resend client, HTML email template, batch send
- `app/api/newsletter/unsubscribe/route.ts`
- `app/api/newsletter/webhook/route.ts`
- `app/api/admin/newsletter/route.ts`
- `app/api/admin/newsletter/[id]/route.ts`
- `app/api/admin/newsletter/[id]/generate/route.ts`
- `app/api/admin/newsletter/[id]/send/route.ts`
- `app/api/admin/newsletter/[id]/cancel/route.ts`
- `app/api/admin/newsletter/[id]/analytics/route.ts`
- `app/api/cron/newsletter-send/route.ts`
- `app/(public)/newsletter/page.tsx`
- `app/(public)/newsletter/[slug]/page.tsx`
- `app/(public)/newsletter/unsubscribe/page.tsx`
- `app/admin/(dashboard)/newsletter/[id]/page.tsx`
- `components/admin/newsletter/NewsletterList.tsx`
- `components/admin/newsletter/NewsletterComposer.tsx`
- `components/admin/newsletter/BriefStep.tsx`
- `components/admin/newsletter/DraftStep.tsx`
- `components/admin/newsletter/EditStep.tsx`
- `components/admin/newsletter/PreviewStep.tsx`
- `components/admin/newsletter/SendStep.tsx`
- `components/admin/newsletter/GalleryPickerModal.tsx`
- `vercel.json`
- `__tests__/lib/newsletter.test.ts`
- `__tests__/api/newsletter/subscribe.test.ts`
- `__tests__/api/newsletter/webhook.test.ts`
- `__tests__/api/admin/newsletter/send.test.ts`

**Modified files:**
- `app/api/newsletter/subscribe/route.ts` — swap Mailchimp for Supabase
- `lib/supabase/types.ts` — add Newsletter, NewsletterSubscriber, NewsletterSection types + Settings fields
- `lib/theme.ts` — add new settings fields to DEFAULT_SETTINGS
- `components/admin/IntegrationsEditor.tsx` — add Newsletter config section
- `app/admin/(dashboard)/integrations/page.tsx` — pass new settings fields
- `app/admin/(dashboard)/newsletter/page.tsx` — replace placeholder with NewsletterList

---

## Phase 1: Database Foundation

### Task 1: Migration

**Files:** Create `supabase/migrations/015_newsletter.sql`

- [ ] Write the migration file:

```sql
create table newsletters (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null default '',
  subject_line text not null default '',
  teaser_text text not null default '',
  hero_image_url text,
  content jsonb not null default '[]',
  tone text not null default 'upbeat',
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sent', 'cancelled')),
  ai_brief jsonb,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_newsletters_status on newsletters(status);
create index idx_newsletters_scheduled on newsletters(scheduled_at) where status = 'scheduled';
create or replace function set_updated_at()
  returns trigger language plpgsql as $$
  begin new.updated_at = now(); return new; end; $$;
create trigger newsletters_updated_at before update on newsletters
  for each row execute function set_updated_at();
alter table newsletters enable row level security;

create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  status text not null default 'active'
    check (status in ('active', 'unsubscribed', 'bounced')),
  unsubscribe_token text unique not null default encode(gen_random_bytes(24), 'hex'),
  source text not null default 'public_signup',
  subscribed_at timestamptz default now(),
  unsubscribed_at timestamptz
);
create index idx_subscribers_status on newsletter_subscribers(status);
create index idx_subscribers_token on newsletter_subscribers(unsubscribe_token);
alter table newsletter_subscribers enable row level security;

create table newsletter_send_log (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references newsletters(id) on delete cascade,
  email text not null,
  resend_message_id text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'bounced')),
  error_message text,
  sent_at timestamptz default now(),
  opened_at timestamptz,
  clicked_at timestamptz
);
create index idx_send_log_newsletter_id on newsletter_send_log(newsletter_id);
create index idx_send_log_resend_id on newsletter_send_log(resend_message_id);
alter table newsletter_send_log enable row level security;

alter table settings add column if not exists resend_api_key text;
alter table settings add column if not exists newsletter_from_name text default 'Purple Acorns Creations';
alter table settings add column if not exists newsletter_from_email text;
alter table settings add column if not exists newsletter_admin_emails text;
alter table settings add column if not exists newsletter_scheduled_send_time time default '10:00';
alter table settings add column if not exists ai_api_key text;
```

- [ ] Apply: `npx supabase db push` — expect no errors
- [ ] Commit: `git commit -m "feat: newsletter/subscriber/send_log tables and settings columns"`

---

### Task 2: Types + lib/newsletter.ts

**Files:** Modify `lib/supabase/types.ts`, create `lib/newsletter.ts`, `__tests__/lib/newsletter.test.ts`

- [ ] Write failing tests:

```ts
// __tests__/lib/newsletter.test.ts
import { generateSlug, isValidNewsletterSection, buildAiPrompt } from '@/lib/newsletter'

describe('generateSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(generateSlug('Spring Collection', '2026-03')).toBe('2026-03-spring-collection')
  })
  it('strips punctuation', () => {
    expect(generateSlug("What's New!", '2026-03')).toBe('2026-03-whats-new')
  })
  it('collapses multiple hyphens', () => {
    expect(generateSlug('Hello   World', '2026-03')).toBe('2026-03-hello-world')
  })
})

describe('isValidNewsletterSection', () => {
  it('accepts text section', () => {
    expect(isValidNewsletterSection({ type: 'text', body: '<p>hi</p>' })).toBe(true)
  })
  it('accepts cta with https url', () => {
    expect(isValidNewsletterSection({ type: 'cta', label: 'Shop', url: 'https://example.com' })).toBe(true)
  })
  it('rejects cta with http url', () => {
    expect(isValidNewsletterSection({ type: 'cta', label: 'Shop', url: 'http://example.com' })).toBe(false)
  })
  it('rejects unknown type', () => {
    expect(isValidNewsletterSection({ type: 'script', body: 'bad' } as any)).toBe(false)
  })
})

describe('buildAiPrompt', () => {
  it('includes tone, working_on, and date', () => {
    const p = buildAiPrompt({ workingOn: 'new rings', selectedChips: ['spring'], tone: 'excited', extra: '', upcomingEvents: [], today: '2026-03-19' })
    expect(p).toContain('excited')
    expect(p).toContain('new rings')
    expect(p).toContain('2026-03-19')
  })
})
```

- [ ] Run — expect FAIL: `npx jest __tests__/lib/newsletter.test.ts --no-coverage`

- [ ] Add to `lib/supabase/types.ts`:

```ts
export type NewsletterStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled'
export type NewsletterTone = 'excited' | 'upbeat' | 'neutral' | 'reflective' | 'sombre' | 'celebratory'

export type NewsletterSection =
  | { type: 'text'; body: string }
  | { type: 'image'; image_url: string; caption?: string }
  | { type: 'cta'; label: string; url: string }

export interface Newsletter {
  id: string; slug: string; title: string; subject_line: string
  teaser_text: string; hero_image_url: string | null
  content: NewsletterSection[]; tone: NewsletterTone; status: NewsletterStatus
  ai_brief: Record<string, unknown> | null
  scheduled_at: string | null; sent_at: string | null
  created_at: string; updated_at: string
}

export interface NewsletterSubscriber {
  id: string; email: string; status: 'active' | 'unsubscribed' | 'bounced'
  unsubscribe_token: string; source: string
  subscribed_at: string; unsubscribed_at: string | null
}
```

Also add to `Settings` interface: `resend_api_key`, `newsletter_from_name`, `newsletter_from_email`, `newsletter_admin_emails`, `newsletter_scheduled_send_time`, `ai_api_key` (all `string | null`).

- [ ] Create `lib/newsletter.ts`:

```ts
import { isValidHttpsUrl } from '@/lib/validate'
import type { NewsletterSection, NewsletterTone } from '@/lib/supabase/types'

export function generateSlug(title: string, yearMonth: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${yearMonth}-${slug}`
}

export function isValidNewsletterSection(section: unknown): boolean {
  if (!section || typeof section !== 'object') return false
  const s = section as Record<string, unknown>
  if (s.type === 'text') return typeof s.body === 'string'
  if (s.type === 'image') return typeof s.image_url === 'string' && isValidHttpsUrl(s.image_url as string)
  if (s.type === 'cta') return typeof s.label === 'string' && typeof s.url === 'string' && isValidHttpsUrl(s.url as string)
  return false
}

export interface AiPromptInput {
  workingOn: string; selectedChips: string[]; tone: NewsletterTone
  extra: string; upcomingEvents: Array<{ name: string; date: string; location: string }>; today: string
}

export function buildAiPrompt(input: AiPromptInput): string {
  const events = input.upcomingEvents.length
    ? input.upcomingEvents.map(e => `- ${e.name} on ${e.date} at ${e.location}`).join('\n')
    : 'No upcoming events.'
  return `You are a friendly newsletter writer for Purple Acorns Creations, a handmade jewelry and crochet business run by a mother-daughter duo in Massachusetts. Write in a warm, personal voice. Today is ${input.today}.

Write a newsletter with tone: ${input.tone}.
What we are working on: ${input.workingOn}
Key topics: ${input.selectedChips.join(', ') || 'general update'}
Additional notes: ${input.extra || 'none'}
Upcoming events:\n${events}

Return ONLY valid JSON:
{ "title": "...", "subject_line": "...", "teaser_text": "...", "sections": [{ "type": "text", "body": "<p>...</p>" }] }`
}

export function addUtmParams(url: string, slug: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', 'newsletter')
    u.searchParams.set('utm_medium', 'email')
    u.searchParams.set('utm_campaign', slug)
    return u.toString()
  } catch { return url }
}
```

- [ ] Run — expect PASS: `npx jest __tests__/lib/newsletter.test.ts --no-coverage`
- [ ] Update `lib/theme.ts` DEFAULT_SETTINGS with the 6 new nullable fields (all null except `newsletter_from_name: 'Purple Acorns Creations'` and `newsletter_scheduled_send_time: '10:00'`)
- [ ] Commit: `git commit -m "feat: newsletter types and utility functions"`

---

## Phase 2: Subscriber Infrastructure

### Task 3: Update subscribe route

**Files:** Modify `app/api/newsletter/subscribe/route.ts`, create `__tests__/api/newsletter/subscribe.test.ts`

Note: `isValidEmail` and `isValidHttpsUrl` both already exist in `lib/validate.ts` — no new creation step needed. `lib/newsletter.ts` imports from `@/lib/validate`.

- [ ] Write failing test:

```ts
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/newsletter/subscribe/route'

function req(body: unknown) {
  return new Request('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })
}
beforeEach(() => jest.clearAllMocks())

it('400 for invalid email', async () => {
  const res = await POST(req({ email: 'notanemail' }))
  expect(res.status).toBe(400)
})

it('200 and upserts subscriber', async () => {
  const mockUpsert = jest.fn().mockResolvedValue({ error: null })
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => ({ upsert: mockUpsert }) })
  const res = await POST(req({ email: 'test@example.com' }))
  expect(res.status).toBe(200)
  expect(mockUpsert).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'test@example.com', status: 'active' }),
    expect.objectContaining({ onConflict: 'email' })
  )
})
```

- [ ] Run — expect FAIL
- [ ] Replace `app/api/newsletter/subscribe/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/validate'

const rateLimitMap = new Map<string, number>()

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const now = Date.now()
  if (now - (rateLimitMap.get(ip) ?? 0) < 60_000) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

  const body = await request.json().catch(() => ({}))
  const email = ((body as { email?: string }).email ?? '').toString().trim().toLowerCase()
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('newsletter_subscribers')
    .upsert({ email, status: 'active', source: 'public_signup' }, { onConflict: 'email', ignoreDuplicates: false })

  if (error) {
    console.error('[subscribe] DB error:', error.message)
    return NextResponse.json({ error: 'Could not subscribe. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
```

- [ ] Run — expect PASS
- [ ] Commit: `git commit -m "feat: subscribe route writes to newsletter_subscribers (replaces Mailchimp)"`

---

### Task 4: Unsubscribe flow (two-step)

**Files:** Create `app/api/newsletter/unsubscribe/route.ts`, `app/(public)/newsletter/unsubscribe/page.tsx`

- [ ] Create `app/api/newsletter/unsubscribe/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const token = ((body as { token?: string }).token ?? '').toString().trim()
  if (!token) return NextResponse.json({ error: 'Invalid token.' }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('newsletter_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .eq('status', 'active')

  if (error) return NextResponse.json({ error: 'Could not unsubscribe.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] Create `app/(public)/newsletter/unsubscribe/page.tsx` — 'use client' component:
  1. Read `?token=` from `useSearchParams()`
  2. Show "Are you sure?" with Unsubscribe button
  3. On click: POST `{ token }` to `/api/newsletter/unsubscribe`
  4. Success: "You're unsubscribed" message
  5. Error: error message with try-again option

- [ ] Commit: `git commit -m "feat: two-step unsubscribe endpoint and page"`

---

## Phase 3: Resend Integration

### Task 5: lib/resend.ts

**Files:** Create `lib/resend.ts`

- [ ] Install: `npm install resend`

- [ ] Create `lib/resend.ts` with three exports:
  - `getResendClient(apiKey: string)` — returns `new Resend(apiKey)`
  - `buildNewsletterEmail(newsletter, unsubscribeToken, siteUrl)` — returns HTML string with inline CSS only (no external sheets). Structure: header (business name), hero image (if present), title, teaser, "Read the full story" button (URL uses `addUtmParams()`), footer with unsubscribe link pointing to `/newsletter/unsubscribe?token=[token]`
  - `sendNewsletterBatch(resend, newsletter, subscribers, fromAddress, siteUrl)` — sends in batches of 50 via `Promise.all`, returns `{ sent, failed, messageIds: Record<email, resend_message_id> }`

- [ ] Commit: `git commit -m "feat: Resend client, email template, batch send utility"`

---

### Task 6: Resend webhook handler

**Files:** Create `app/api/newsletter/webhook/route.ts`, `__tests__/api/newsletter/webhook.test.ts`

- [ ] Write failing tests:

```ts
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/newsletter/webhook/route'

function req(body: unknown) {
  return new Request('http://localhost/api/newsletter/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })
}
beforeEach(() => jest.clearAllMocks())

it('400 for missing email_id', async () => {
  const res = await POST(req({ type: 'email.opened', data: {} }))
  expect(res.status).toBe(400)
})

it('200 and updates opened_at on email.opened', async () => {
  const mockEq = jest.fn().mockResolvedValue({ error: null })
  const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq })
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => ({ update: mockUpdate }) })
  const res = await POST(req({ type: 'email.opened', data: { email_id: 'msg_123' } }))
  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ opened_at: expect.any(String) }))
})
```

- [ ] Run — expect FAIL
- [ ] Create `app/api/newsletter/webhook/route.ts`:
  - Rate limit: **60-second** window per IP (matching all other public routes)
  - Validate `Resend-Signature` header using HMAC-SHA256 with `process.env.RESEND_WEBHOOK_SECRET`. Compute the expected signature over the raw request body and compare with `crypto.timingSafeEqual`. Return 401 if missing or invalid. Skip validation if `RESEND_WEBHOOK_SECRET` is not set (dev convenience only).
  - Parse body; 400 if `data.email_id` missing
  - `email.opened` → UPDATE `newsletter_send_log` SET `opened_at=now()` WHERE `resend_message_id=email_id`
  - `email.clicked` → same but `clicked_at`
  - `email.bounced` → update send log status to `'bounced'`; update subscriber status to `'bounced'` by email (`data.to`)
  - Return 200 `{ ok: true }`

- [ ] Run — expect PASS
- [ ] Commit: `git commit -m "feat: Resend webhook handler for open/click/bounce"`

---

## Phase 4: Admin API Routes

### Task 7: Newsletter list + create

**Files:** Create `app/api/admin/newsletter/route.ts`

- [ ] Create:
  - GET: `requireAdminSession()` → select `id,slug,title,status,scheduled_at,sent_at,created_at` ordered `created_at DESC`
  - POST: `requireAdminSession()` → generate slug `YYYY-MM-new-newsletter`, check uniqueness (append `-Date.now()` if collision), insert, return 201

- [ ] Commit: `git commit -m "feat: admin newsletter list and create API"`

---

### Task 8: Get/update + send + cancel

**Files:** Create `app/api/admin/newsletter/[id]/route.ts`, `[id]/send/route.ts`, `[id]/cancel/route.ts`, `__tests__/api/admin/newsletter/send.test.ts`

- [ ] Write failing tests:

```ts
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
jest.mock('@/lib/resend', () => ({ getResendClient: jest.fn(), buildNewsletterEmail: jest.fn(() => '<html/>') }))
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/admin/newsletter/[id]/send/route'

function req(body: unknown) {
  return new Request('http://localhost/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
const ctx = { params: Promise.resolve({ id: 'abc' }) }

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireAdminSession as jest.Mock).mockResolvedValue({ user: { email: 'a@b.com' }, error: null })
})

it('400 when confirmation wrong', async () => {
  const res = await POST(req({ confirmation: 'SEND' }), ctx)
  expect(res.status).toBe(400)
})

it('400 when scheduled_at missing', async () => {
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER' }), ctx)
  expect(res.status).toBe(400)
})

it('503 when resend not configured', async () => {
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({
    from: () => ({ select: () => ({ single: jest.fn().mockResolvedValue({ data: { resend_api_key: null }, error: null }) }) }),
  })
  const future = new Date(Date.now() + 86400000 * 2).toISOString()
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER', scheduled_at: future }), ctx)
  expect(res.status).toBe(503)
})
```

- [ ] Run — expect FAIL

- [ ] Create `app/api/admin/newsletter/[id]/route.ts` (GET + PUT):
  - GET: `requireAdminSession()` → select `*` by id
  - PUT: `requireAdminSession()` → allow fields: `title`, `subject_line`, `teaser_text`, `hero_image_url`, `content`, `tone`, `slug`, `ai_brief`. Validate content with `isValidNewsletterSection()`. Sanitize text sections with `sanitizeContent()`. Validate `hero_image_url` with `isValidHttpsUrl()`.

- [ ] Create `app/api/admin/newsletter/[id]/send/route.ts`:
  - Validate `confirmation === 'SEND NEWSLETTER'` (exact, server-side) → 400
  - Validate `scheduled_at` present + >= 24h from now → 400
  - Parallel fetch: settings, newsletter, active subscriber count
  - 503 if Resend not configured; 404 if newsletter not found; 400 if 0 active subscribers
  - Send admin preview emails immediately
  - Update newsletter: `status='scheduled'`, `scheduled_at`
  - Return `{ success, scheduled_at, subscriber_count }`

- [ ] Create `app/api/admin/newsletter/[id]/cancel/route.ts`:
  - `requireAdminSession()`, fetch status
  - 400 if already `'sent'`
  - Update: `status='cancelled'`, `scheduled_at=null`

- [ ] Run tests — expect PASS
- [ ] Commit: `git commit -m "feat: newsletter get/update/send/cancel admin routes"`

---

### Task 9: AI generation route

**Files:** Create `app/api/admin/newsletter/[id]/generate/route.ts`

- [ ] Create:
  - `requireAdminSession()`
  - Read body: `{ workingOn, selectedChips, tone, extra }`
  - Parallel fetch settings (`ai_provider`, `ai_api_key`) + upcoming events from `events` table (date >= today, limit 5). Note: `ai_provider` column already exists in the settings table (added in migration 001) — this task only reads it, does not add it.
  - Resolve effective API key: `process.env.AI_API_KEY ?? settings?.ai_api_key`
  - 503 if `ai_provider` or effective API key is missing
  - Call `buildAiPrompt()` with all inputs + today's date
  - Call AI via fetch — provider-specific endpoints:
    - claude: `https://api.anthropic.com/v1/messages`, model `claude-sonnet-4-6`, max_tokens 2048, header `x-api-key`
    - openai: `https://api.openai.com/v1/chat/completions`, model `gpt-4o`, header `Authorization: Bearer`
    - groq: `https://api.groq.com/openai/v1/chat/completions`, model `llama-3.3-70b-versatile`, header `Authorization: Bearer`
  - Strip markdown code fences, parse JSON, 502 if parsing fails
  - Save to newsletter: `ai_brief`, `title`, `subject_line`, `teaser_text`, `content`
  - Return `{ draft }`

- [ ] Commit: `git commit -m "feat: AI draft generation (claude/openai/groq)"`

---

### Task 10: Analytics + Cron routes

**Files:** Create `app/api/admin/newsletter/[id]/analytics/route.ts`, `app/api/cron/newsletter-send/route.ts`, `vercel.json`

- [ ] Create analytics route:
  - `requireAdminSession()`
  - Query send_log for sent/open/click counts by newsletter_id
  - Query analytics_events for page views on `/newsletter/[slug]`
  - Query analytics_events for UTM-attributed views (`metadata->>'utm_campaign' = slug`)
  - Query `newsletter_subscribers` where `unsubscribed_at` is within 7 days of newsletter's `sent_at` for the `unsubscribes` count
  - Return `{ sent_count, open_rate, click_rate, unsubscribes, page_views, attributed_traffic }`

- [ ] Create cron route `app/api/cron/newsletter-send/route.ts` — **export a `GET` handler** (Vercel Cron invokes routes via GET, not POST):
  - Validate `Authorization: Bearer $CRON_SECRET` → 401 if wrong
  - Query newsletters where `status='scheduled'` AND `scheduled_at <= now()`
  - For each: fetch active subscribers; skip if none (set status `'cancelled'`)
  - Skip emails already in send_log for this newsletter (idempotency check)
  - Call `sendNewsletterBatch()`, write send log rows
  - Only mark `status='sent'` after all batches complete (or all subscribers are accounted for in the log). If a batch throws an uncaught error mid-send, leave `status='scheduled'` so the next cron tick retries — the idempotency skip prevents double-sends.
  - Return `{ processed: N }`

- [ ] Create `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/newsletter-send", "schedule": "*/5 * * * *" }]
}
```

- [ ] Commit: `git commit -m "feat: analytics route, cron executor, vercel.json"`

---

## Phase 5: Public Pages

### Task 11: Archive + detail pages

**Files:** Create `app/(public)/newsletter/page.tsx`, `app/(public)/newsletter/[slug]/page.tsx`

- [ ] Create archive page (server component):
  - Fetch newsletters where `status='sent'`, ordered `sent_at DESC`
  - Render chronological list: date label, title, teaser, thumbnail (if hero_image_url)
  - Each item links to `/newsletter/[slug]`
  - Empty state: "No newsletters yet — check back soon!"

- [ ] Create detail page (server component):
  - Fetch by slug where `status='sent'`; `notFound()` if missing
  - `generateMetadata()` returns title + description
  - Render: date, title, teaser, hero image, content sections
  - `text` sections: sanitize with `sanitizeContent(section.body)` before rendering as HTML
  - `image` sections: img with optional caption
  - `cta` sections: anchor with `rel="noopener noreferrer" target="_blank"`
  - Footer: "← All newsletters" link + subscribe link

- [ ] Commit: `git commit -m "feat: public newsletter archive and detail pages"`

---

## Phase 6: Admin UI

### Task 12: Admin newsletter list page

**Files:** Modify `app/admin/(dashboard)/newsletter/page.tsx`, create `components/admin/newsletter/NewsletterList.tsx`

- [ ] Create `components/admin/newsletter/NewsletterList.tsx` ('use client'):
  - Props: newsletters array (id, slug, title, status, scheduled_at, sent_at, created_at)
  - "+ New Newsletter" button: POST to `/api/admin/newsletter`, redirect to `/admin/newsletter/[id]`
  - List rows: title, color-coded status badge, date line
  - Row click → navigate to `/admin/newsletter/[id]`

- [ ] Replace `app/admin/(dashboard)/newsletter/page.tsx`:
```tsx
import { createServiceRoleClient } from '@/lib/supabase/server'
import NewsletterList from '@/components/admin/newsletter/NewsletterList'
export const metadata = { title: 'Admin — Newsletter' }
export default async function NewsletterAdminPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('newsletters')
    .select('id, slug, title, status, scheduled_at, sent_at, created_at')
    .order('created_at', { ascending: false })
  return <NewsletterList newsletters={data ?? []} />
}
```

- [ ] Commit: `git commit -m "feat: admin newsletter list page"`

---

### Task 13: Compose page + wizard shell

**Files:** Create `app/admin/(dashboard)/newsletter/[id]/page.tsx`, `components/admin/newsletter/NewsletterComposer.tsx`

- [ ] Create compose server page:
  - Parallel fetch: newsletter by id, gallery items, upcoming events (next 10), settings (`select('ai_provider, ai_api_key, resend_api_key, newsletter_from_email, newsletter_scheduled_send_time')`)
  - `notFound()` if newsletter missing
  - Derive booleans: `hasAi = !!(settings?.ai_provider && (process.env.AI_API_KEY ?? settings?.ai_api_key))`, `hasResend = !!((process.env.RESEND_API_KEY ?? settings?.resend_api_key) && (process.env.NEWSLETTER_FROM_EMAIL ?? settings?.newsletter_from_email))`
  - Pass to `<NewsletterComposer hasAi={hasAi} hasResend={hasResend} ...>`

- [ ] Create `NewsletterComposer.tsx` ('use client'):
  - State: `step` (0–4), `newsletter` (updated as admin edits)
  - Step indicator: numbered circles connected by lines, active highlighted
  - Renders BriefStep / DraftStep / EditStep / PreviewStep / SendStep for current step
  - Passes `onNext`, `onBack`, `onChange(newsletter)` callbacks down

- [ ] Commit: `git commit -m "feat: compose page and wizard shell"`

---

### Task 14: BriefStep + DraftStep

**Files:** Create `components/admin/newsletter/BriefStep.tsx`, `DraftStep.tsx`

- [ ] Create `BriefStep.tsx` ('use client'):
  - Context banner: today's date + upcoming event names
  - Textarea: "What are you working on?"
  - Multi-select chips: suggestions based on current month (spring = craft fair season, Apr = Mother's Day, Nov/Dec = holiday) + upcoming event names
  - Single-select tone chips: Excited ✨ / Upbeat 😊 / Neutral 😌 / Reflective 🍂 / Sombre 🕯️ / Celebratory 🎉
  - Optional textarea: "Anything else?"
  - "Generate Draft →": POST to `/api/admin/newsletter/[id]/generate`, then GET updated newsletter, call `onDraftGenerated` + `onNext`
  - Error message on failure
  - If `!hasAi`: show notice with link to `/admin/integrations`

- [ ] Create `DraftStep.tsx` ('use client'):
  - Read-only display: subject_line, title, teaser_text, content sections summary
  - "Regenerate" button: re-POSTs to `/api/admin/newsletter/[id]/generate` with the same brief (stored in `newsletter.ai_brief`), then refreshes the newsletter state — stays on step 2
  - "Edit & Add Photos →" and "← Back" buttons

- [ ] Commit: `git commit -m "feat: BriefStep and DraftStep"`

---

### Task 15: EditStep + GalleryPickerModal

**Files:** Create `components/admin/newsletter/EditStep.tsx`, `GalleryPickerModal.tsx`

- [ ] Create `GalleryPickerModal.tsx` ('use client'):
  - Fixed overlay with backdrop (click to close)
  - 3-column grid of gallery images
  - Click image → `onSelect(url)` + `onClose()`

- [ ] Create `EditStep.tsx` ('use client'):
  - Editable fields: title, subject_line, teaser_text (auto-save via PUT on change)
  - Hero image picker: thumbnail + "Change" button opens modal
  - Section list: each section editable by type (text=textarea, image=thumbnail+picker, cta=label+url inputs)
  - Remove button per section
  - "+ text / + image / + cta" add buttons
  - "Saving…" indicator, "Preview →" + "← Back" buttons

- [ ] Commit: `git commit -m "feat: EditStep and GalleryPickerModal"`

---

### Task 16: PreviewStep + SendStep

**Files:** Create `components/admin/newsletter/PreviewStep.tsx`, `SendStep.tsx`

- [ ] Create `PreviewStep.tsx` ('use client'):
  - Two-column layout
  - Left: email teaser HTML (subject, hero, title, teaser, CTA button, unsubscribe footer) using inline styles
  - Right: site page preview (title, teaser, slug link to `/newsletter/[slug]`)
  - "Send →" + "← Back" buttons

- [ ] Create `SendStep.tsx` ('use client'):
  - Warning banner if `!hasResend` (link to settings)
  - Warning if newsletter already sent
  - `datetime-local` input: min = 24h from now; default = tomorrow at `defaultSendTime`
  - Confirmation input: label says 'Type SEND NEWSLETTER to confirm'; border turns green when matched
  - "Confirm Send" button: disabled until `confirmation === 'SEND NEWSLETTER'` AND `hasResend` AND `status !== 'sent'`; red background when enabled
  - On submit: POST to `[id]/send`; show success state with scheduled time + "Cancel scheduled send" button
  - Cancel: POST to `[id]/cancel`, show cancelled state
  - Error: show error message

- [ ] Commit: `git commit -m "feat: PreviewStep and SendStep"`

---

## Phase 7: Settings + Final Polish

### Task 17: Newsletter config in Integrations

**Files:** Modify `components/admin/IntegrationsEditor.tsx`, `app/admin/(dashboard)/integrations/page.tsx`

- [ ] Read both files first to understand existing patterns before editing.
- [ ] Add "Newsletter (Resend)" section to IntegrationsEditor: Resend API Key (password), From Name, From Email, Admin Preview Emails (hint: comma-separated), Default Send Time
- [ ] Add AI API Key field (password) alongside existing AI Provider selector
- [ ] Update integrations page to pass new settings fields to IntegrationsEditor

- [ ] Commit: `git commit -m "feat: newsletter and AI API key config in Integrations settings"`

---

### Task 18: Run all tests + smoke test

- [ ] Run full test suite: `npm test -- --no-coverage`
  - All existing tests must pass; all new tests must pass. Fix any failures before proceeding.

- [ ] Add env vars to `.env.local` (gitignored, never committed):
```
CRON_SECRET=dev-secret-change-in-prod
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] Add placeholders to `.env.example` (committed, no real values):
```
# Cron security — used by /api/cron/newsletter-send
CRON_SECRET=your-cron-secret

# Public site URL — used in newsletter email links and UTM params
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

- [ ] Copy the same entries to `.env.production` with real production values (gitignored):
```
CRON_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_SITE_URL=https://purpleacornz.com
```

  Note: `.env.production` is loaded by Next.js in production builds and by Vercel if present. Keeping it out of git (add to `.gitignore` if not already) means the values travel with your deployment config, not your repo — portable to any host.

- [ ] Manual smoke test (`npm run dev`):
  - [ ] Subscribe form writes to `newsletter_subscribers` (check Supabase dashboard)
  - [ ] `/newsletter/unsubscribe?token=x` shows confirmation; clicking unsubscribes
  - [ ] Admin → Newsletter → "+ New Newsletter" creates draft and redirects to compose
  - [ ] Brief step shows date/event context banner and chip suggestions
  - [ ] Tone chips single-select; topic chips multi-select
  - [ ] "Generate Draft" calls AI, advances to step 2 (requires AI configured in Integrations)
  - [ ] Edit step: title change auto-saves (PUT in network tab)
  - [ ] Gallery picker shows images; selecting updates section
  - [ ] Preview shows email HTML + site preview side-by-side
  - [ ] Send step: "Confirm Send" disabled until "SEND NEWSLETTER" typed exactly
  - [ ] `/newsletter` archive shows sent newsletters
  - [ ] `/newsletter/[slug]` renders full article
  - [ ] Admin → Integrations → Newsletter section shows Resend fields

- [ ] Commit:
```bash
git add .env.example
git commit -m "feat: CRON_SECRET and NEXT_PUBLIC_SITE_URL env vars documented"
```

---

## Env Var Override Pattern (apply everywhere)

**Rule:** Environment variables always take precedence over values stored in the Supabase settings table. This makes the system portable — you can configure secrets via env vars on any host without touching the DB.

**Implementation:** In every place that reads a secret from settings, apply this pattern:

```ts
// Prefer env var, fall back to DB settings value
const resendApiKey = process.env.RESEND_API_KEY ?? settings?.resend_api_key
const aiApiKey = process.env.AI_API_KEY ?? settings?.ai_api_key
const newsletterFromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? settings?.newsletter_from_email
const newsletterFromName = process.env.NEWSLETTER_FROM_NAME ?? settings?.newsletter_from_name
const newsletterAdminEmails = process.env.NEWSLETTER_ADMIN_EMAILS ?? settings?.newsletter_admin_emails
```

Apply this in: `app/api/admin/newsletter/[id]/send/route.ts`, `app/api/admin/newsletter/[id]/generate/route.ts`, `app/api/cron/newsletter-send/route.ts`.

**Full env var reference** — add all of these to `.env.example` with comments, `.env.local` with real dev values, `.env.production` with real prod values (gitignored):

```bash
# --- Required for newsletter send ---
RESEND_API_KEY=re_...
NEWSLETTER_FROM_EMAIL=hello@purpleacornz.com
NEWSLETTER_FROM_NAME=Purple Acorns Creations

# --- Optional overrides (also configurable in Admin → Integrations) ---
NEWSLETTER_ADMIN_EMAILS=admin@example.com,owner@example.com
AI_API_KEY=sk-...

# --- Infrastructure ---
CRON_SECRET=<openssl rand -hex 32>
NEXT_PUBLIC_SITE_URL=https://purpleacornz.com

# --- Webhook security (from Resend dashboard → Webhooks → Signing secret) ---
RESEND_WEBHOOK_SECRET=whsec_...
```

**Out of scope for this plan (v2):** Cross-newsletter analytics — subscriber growth chart, top topics by open rate, click-through trends. These require an additional admin reports page and are intentionally deferred.

**Resend Webhook setup** (done in Resend dashboard after deploy):
- Add endpoint: `https://your-domain.com/api/newsletter/webhook`
- Events: `email.opened`, `email.clicked`, `email.bounced`
- Copy the signing secret to `RESEND_WEBHOOK_SECRET`

**README documentation:** Add a section to `README.md` titled "Environment Variables" explaining:
- Values set as env vars override settings stored in the admin panel
- This allows zero-downtime secret rotation without touching the UI
- Minimum required for newsletter: `RESEND_API_KEY`, `NEWSLETTER_FROM_EMAIL`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`
- All other secrets can optionally live in Admin → Integrations (stored encrypted in Supabase)

**Add to Task 18 smoke test checklist:**
- [ ] Verify env var override: set `RESEND_API_KEY` in `.env.local`, leave settings table blank → send route should still work
