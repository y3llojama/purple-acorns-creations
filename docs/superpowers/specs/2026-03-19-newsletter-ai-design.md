# Newsletter + AI Integration — Design Spec

**Date:** 2026-03-19
**Status:** Approved (v2 — post spec review)

---

## Overview

A full newsletter system for Purple Acorns Creations: AI-assisted draft composition, rich editing with gallery photos, scheduled sends via Resend, and analytics tracking opens/clicks/page views.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Email delivery | Resend | Better deliverability than Gmail SMTP for bulk; affordable at small-business scale |
| Subscriber storage | Supabase (`newsletter_subscribers`) | Full data ownership, GDPR-friendly, queryable with existing data |
| Newsletter content | Site-first (full content = public page) | Email is teaser → links back to `/newsletter/[slug]` |
| Email tracking | Resend built-in + UTM params | Resend handles open/click tracking; UTMs correlate newsletter traffic in existing analytics |
| AI context | Date + upcoming events from `events` table; AI reasons from there | No external weather/news API dependencies |
| AI provider | Uses `ai_provider` setting (claude/openai/groq); API key in `ai_api_key` settings column | Consistent with existing settings schema |
| AI tone input | Chip selector in Brief step | Fast, consistent with existing tag pattern |
| Newsletter page layout | Clean article style | Focus on reading, no distraction |
| Archive layout | Chronological list with teaser | Easier to scan than card grid |
| Scheduled send mechanism | Vercel Cron (`/api/cron/newsletter-send`) at 5-min intervals | Polls for newsletters where `status='scheduled'` and `scheduled_at <= now()` |
| Unsubscribe flow | Two-step: GET shows confirmation page → POST executes unsubscribe | Prevents link scanners/prefetch from silently unsubscribing users |

---

## Architecture

### Public Routes
- `POST /api/newsletter/subscribe` — updated to write to `newsletter_subscribers` (replaces Mailchimp)
- `GET /api/newsletter/unsubscribe?token=[token]` — shows confirmation page only (no DB write)
- `POST /api/newsletter/unsubscribe` — body `{ token }` — executes unsubscribe, renders success page
- `POST /api/newsletter/webhook` — Resend webhook handler (open/click/bounce events → `newsletter_send_log`)
- `GET /newsletter` — archive listing page
- `GET /newsletter/[slug]` — individual newsletter page

### Admin Routes
- `GET/POST /api/admin/newsletter` — list newsletters, create new draft (auto-generates slug from title + date)
- `GET/PUT /api/admin/newsletter/[id]` — get/update draft
- `POST /api/admin/newsletter/[id]/generate` — AI draft generation
- `POST /api/admin/newsletter/[id]/send` — trigger send (requires `confirmation: "SEND NEWSLETTER"`, case-sensitive, validated server-side); returns 400 if Resend not configured or subscriber list empty
- `POST /api/admin/newsletter/[id]/cancel` — sets `status='cancelled'`, clears `scheduled_at`; no-op if already sent
- `GET /api/admin/newsletter/[id]/analytics` — per-newsletter stats

### Cron Route
- `GET /api/cron/newsletter-send` — secured with `CRON_SECRET` header; finds all `status='scheduled'` newsletters where `scheduled_at <= now()`, sends to active subscribers, marks `status='sent'`

### Admin Pages
- `/admin/newsletter` — list (drafts, scheduled, sent, cancelled) + "New Newsletter" button
- `/admin/newsletter/[id]` — 5-step compose workflow (see below)

---

## Admin Compose Workflow (5 steps)

### Step 1 — AI Brief
- Textarea: "What are you working on right now?"
- Tag chips (multi-select, pre-populated by server): AI-suggested topics based on current date + upcoming events from `events` table
- Tag chips (single-select): Tone — Excited / Upbeat / Neutral / Reflective / Sombre / Celebratory
- Textarea: "Anything else to include?" (optional)
- "Generate Draft →" button → calls `/api/admin/newsletter/[id]/generate`

### Step 2 — AI Draft
- Server calls configured AI provider (Claude/OpenAI/Groq) with a structured prompt including: date, upcoming events, working-on text, selected topic chips, tone, optional extra
- AI returns JSON: `{ title, subject_line, teaser_text, sections: NewsletterSection[] }`
- Full response (no streaming in v1); loading spinner while generating
- "Regenerate" option re-runs with same brief

### Step 3 — Edit & Photos
- Inline editing of title, subject line, teaser
- Rich section editor: reorder (drag or up/down arrows), add, delete sections
- Image picker modal: browse Supabase gallery, attach to sections
- Hero image picker

### Step 4 — Preview
- Split view: left = email teaser, right = full site page
- Email teaser: subject line, teaser text, hero image, "Read the full story →" CTA
- Site preview: full article layout

### Step 5 — Send
- Displays active subscriber count; blocks send if count = 0 (shows setup prompt)
- Blocks send if Resend not configured (shows settings link)
- Scheduled send date/time picker (must be ≥ 24h from now; defaults to next occurrence of `newsletter_scheduled_send_time`)
- Confirmation input: user must type `SEND NEWSLETTER` exactly (case-sensitive, validated server-side)
- "Confirm Send" button disabled until typed correctly
- On confirm: admin email(s) sent immediately via Resend; newsletter `status` set to `'scheduled'`; `scheduled_at` saved
- Cancel Send button visible while `status='scheduled'`

---

## Data Model

### New Table: `newsletters`
```sql
create table newsletters (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null default '',
  subject_line text not null default '',
  teaser_text text not null default '',
  hero_image_url text,
  content jsonb not null default '[]',  -- NewsletterSection[]
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
create index idx_newsletters_scheduled_at on newsletters(scheduled_at) where status = 'scheduled';

-- updated_at trigger
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger newsletters_updated_at before update on newsletters
  for each row execute function set_updated_at();
```

### Content Section Type (TypeScript)
```ts
type NewsletterSection =
  | { type: 'text';  body: string }                              // sanitized HTML
  | { type: 'image'; image_url: string; caption?: string }       // caption is plain text
  | { type: 'cta';   label: string; url: string }                // button link
```
- `body` in text sections is sanitized HTML — run through `sanitizeContent()` before saving and before rendering
- `image_url` in image sections must pass `isValidHttpsUrl()` before saving
- `url` in cta sections must pass `isValidHttpsUrl()` before saving

### New Table: `newsletter_subscribers`
```sql
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

create index idx_newsletter_subscribers_status on newsletter_subscribers(status);
create index idx_newsletter_subscribers_token on newsletter_subscribers(unsubscribe_token);
```

### New Table: `newsletter_send_log`
```sql
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
```

### Settings Additions (new columns)
```sql
alter table settings add column resend_api_key text;
alter table settings add column newsletter_from_name text default 'Purple Acorns Creations';
alter table settings add column newsletter_from_email text;
alter table settings add column newsletter_admin_emails text;       -- comma-separated
alter table settings add column newsletter_scheduled_send_time time default '10:00';
alter table settings add column ai_api_key text;                    -- for configured ai_provider
```

---

## Slug Generation
- Auto-generated on draft creation: `YYYY-MM-[slugified-title]` (e.g. `2026-03-spring-collection`)
- `slugify(title)`: lowercase, replace spaces/punctuation with `-`, strip non-alphanumeric, collapse hyphens
- On collision: append `-2`, `-3`, etc.
- Admin can edit slug until newsletter is sent; after sent it is immutable

---

## Email Format

- HTML email with inline styles (email-safe CSS, no external stylesheets)
- Content: subject line, teaser text, hero image, "Read the full story →" button
- All links append UTM params: `?utm_source=newsletter&utm_campaign=[slug]&utm_medium=email`
- Footer: unsubscribe link (`/newsletter/unsubscribe?token=[token]` → two-step flow)
- Resend's open/click tracking enabled on all sends

---

## Scheduled Send Mechanism (Vercel Cron)

`vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/newsletter-send", "schedule": "*/5 * * * *" }]
}
```

`/api/cron/newsletter-send`:
1. Validate `Authorization: Bearer $CRON_SECRET` header
2. Query `newsletters` where `status='scheduled'` AND `scheduled_at <= now()`
3. For each: fetch `newsletter_subscribers` where `status='active'`; if empty, mark `status='cancelled'` + log warning
4. Send via Resend in batches of 50; write one row to `newsletter_send_log` per email
5. Mark newsletter `status='sent'`, `sent_at=now()`
6. If any batch fails mid-flight, partial sends are logged; newsletter status stays `'scheduled'` for retry on next cron tick (idempotent: skip emails already in `newsletter_send_log` for this newsletter)

---

## AI Integration

Provider resolved at runtime from `settings.ai_provider` + `settings.ai_api_key`.

**Prompt structure (system):**
```
You are a friendly newsletter writer for Purple Acorns Creations, a handmade jewelry and crochet business run by a mother-daughter duo in Massachusetts. Write in a warm, personal voice. Today is [date].
```

**Prompt structure (user):**
```
Write a newsletter with tone: [tone].
What we're working on: [working_on]
Key topics: [selected_chips joined by comma]
Additional notes: [extra]
Upcoming events: [events list from DB]

Return JSON only:
{
  "title": "...",
  "subject_line": "...",
  "teaser_text": "...",
  "sections": [
    { "type": "text", "body": "<p>...</p>" },
    { "type": "cta", "label": "Shop now", "url": "https://..." }
  ]
}
```

**Guard:** if `ai_provider` or `ai_api_key` is not configured, return 503 with a message linking to settings.

---

## Analytics

### Per-newsletter stats (`GET /api/admin/newsletter/[id]/analytics`)
- `sent_count` — rows in `newsletter_send_log` where `status='sent'`
- `open_rate` — `opened_at IS NOT NULL` / `sent_count`
- `click_rate` — `clicked_at IS NOT NULL` / `sent_count`
- `unsubscribes` — `newsletter_subscribers` where `unsubscribed_at` is within 7 days of `sent_at`
- `page_views` — `analytics_events` where `page_path = '/newsletter/[slug]'`
- `attributed_traffic` — `analytics_events` where `metadata->>'utm_campaign' = [slug]`

### Cross-newsletter insights (admin reports page)
- Most-read newsletters by page views + opens
- Click-through rate trends over time
- Subscriber growth chart (subscribed_at over time)
- Top topics: `ai_brief->'selected_chips'` ranked by open rate

---

## Resend Webhook Events
Endpoint: `POST /api/newsletter/webhook`
- Validate `Resend-Signature` header (HMAC-SHA256 with `RESEND_WEBHOOK_SECRET` env var)
- Rate limited (60s window per IP, same pattern as other public routes)
- Handle:
  - `email.opened` → `UPDATE newsletter_send_log SET opened_at=now() WHERE resend_message_id=?`
  - `email.clicked` → `UPDATE newsletter_send_log SET clicked_at=now() WHERE resend_message_id=?`
  - `email.bounced` → update `newsletter_send_log` status to `'bounced'`; update `newsletter_subscribers` status to `'bounced'`

---

## Settings Page Integration
The existing Integrations admin page gains a "Newsletter" section:
- Resend API key
- From name / from email
- Admin preview emails (comma-separated)
- Default scheduled send time
- AI provider (already exists) + AI API key

---

## Security
- `requireAdminSession()` on all `/api/admin/newsletter/*` routes
- Cron route secured with `Authorization: Bearer $CRON_SECRET` (env var, set in Vercel)
- Unsubscribe token is 48-char hex random — not guessable; two-step flow prevents scanner-triggered unsubscribes
- Resend webhook validated via HMAC signature + rate limited
- `confirmation` field validated server-side: exact string `"SEND NEWSLETTER"` (case-sensitive)
- `resend_api_key` and `ai_api_key` stored in `settings` table — no public SELECT on settings (service role only)
- Sanitize newsletter `content` sections with `sanitizeContent()` on save and on public render
- Validate all URLs with `isValidHttpsUrl()` before saving CTA/image URLs
- Rate limiting on `/api/newsletter/subscribe` (already in place)
