# Purple Acorns Creations — Website Design Spec

**Date:** 2026-03-17
**Status:** Approved for implementation

---

## 1. Project Overview

A full website for **Purple Acorns Creations** (@purpleacornz), a handmade craft studio founded by a mother-daughter duo. They create and sell crochet jewelry, sterling silver, brass, and alloy rings, necklaces, earrings, and bracelets. They feature primarily at local arts and crafts fairs in the Brooklyn/NYC area.

### Goals
- Establish a professional online presence that reflects the brand's eclectic, artisan character
- Enable customers to discover the story, browse pieces, and purchase via Square
- Provide a simple, friendly admin panel for both founders to manage content with no technical knowledge required
- WCAG 2.1 AA+ accessibility, mobile-first responsive design, usable by ages 9–90+

### Inspiration
- [zuvan.us](https://zuvan.us) — warm neutrals, luxurious spacing, jewelry-forward
- [momonewyork.com](https://momonewyork.com) — minimalist luxury, story-driven, serif/sans pairing

---

## 2. Tech Stack

| Layer | Technology | Tier |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | — |
| Backend / database | Supabase (PostgreSQL) | Free |
| File storage | Supabase Storage | Free (1GB) |
| Authentication | Supabase Auth + Google OAuth | Free |
| Deployment | Vercel | Free (Hobby) |
| E-commerce | Square Online (embed/link) | Free + transaction fees |
| Styling | CSS Modules + CSS custom properties | — |
| Domain | TBD | ~$12–15/year |

**Estimated monthly cost:** ~$1/month (domain only). Square charges 2.9% + $0.30 per online transaction, no monthly fee.

---

## 3. Architecture

### Two Zones

**Public site** — accessible to all visitors, no login required.
**Admin panel** (`/admin/*`) — protected behind Google OAuth. Only two authorized accounts.

### Page Structure (Hybrid)

The homepage is a rich single-page scroll showcasing the full brand. Two dedicated pages handle deeper content. All other sections live on the homepage.

#### Public Pages

| Route | Purpose |
|---|---|
| `/` | Homepage — full brand scroll (7 sections, see below) |
| `/shop` | Dedicated shop page — Square Online full embed |
| `/our-story` | Long-form mother-daughter narrative with photos |
| `/privacy` | Privacy Policy — ships with pre-written standard content, editable via admin |
| `/terms` | Terms of Service — ships with pre-written standard content, editable via admin |

#### Homepage Sections (top to bottom)

0. **Announcement Banner** *(optional, admin-toggled)* — Slim dismissible strip above the nav. Plain text + optional link (e.g. "We'll be at Brooklyn Night Market May 3 → Get Directions"). Hidden when no announcement is active.
1. **Hero** — Full viewport. Dramatic product photo, tagline, two CTAs: "Shop Now" (→ `/shop`) and "Our Story" (→ `/our-story`)
2. **Our Story teaser** — Photo + 2–3 sentence excerpt, "Read Our Full Story →" link
3. **Featured Pieces** — 3–4 products (curated manually in admin), each with name, price, photo. "View All →" links to `/shop`
4. **Gallery Strip** — 5–8 photos, horizontally scrollable on mobile
5. **Next Event** — Single upcoming event: the one with the nearest future date, queried as `SELECT * FROM events WHERE date >= today ORDER BY date ASC LIMIT 1`. Shows name, date, location (auto-linked to Google Maps), optional link button.
6. **Instagram Feed** — Latest 6 posts grid, "Follow @purpleacornz →" link
7. **Newsletter Signup** — Single email field, "Join our list" CTA. Plain copy: "Be the first to know about new pieces and upcoming fairs." Powered by Mailchimp (free up to 500 contacts). Includes "By subscribing you agree to our Privacy Policy" link.
8. **Footer** — Custom order inquiry form, all social links (Instagram, Facebook, TikTok, Pinterest, X — whichever are active), Square store link, email, links to Privacy Policy and Terms of Service

#### Admin Pages

| Route | Purpose |
|---|---|
| `/admin` | Dashboard — quick-action tiles, announcement status, link to Reports |
| `/admin/content` | Edit homepage hero text, story teaser, featured pieces, Privacy Policy, Terms of Service — all with AI "✨ Generate" buttons |
| `/admin/events` | Add / edit / delete events — with AI "✨ Generate description" |
| `/admin/gallery` | Upload, tag, reorder, delete photos |
| `/admin/branding` | Theme toggle, logo upload, announcement banner on/off + text, social links |
| `/admin/integrations` | Square store URL, Mailchimp key, Behold widget ID, social platform URLs, AI provider settings |
| `/admin/newsletter` | Compose and send newsletter using pre-built templates + AI fill |
| `/admin/reports` | AI-narrated summary of site analytics, newsletter stats, recent activity, and upcoming events |

---

## 4. Authentication

- **Method:** Google OAuth via Supabase Auth ("Sign in with Google" — no username/password)
- **Authorized accounts (allowlist):**
  - `purpleacornzcreations@gmail.com`
  - `write2spica@gmail.com`
- **Security implementation (three layers):**
  1. Supabase Auth: new user signups disabled — only pre-registered users can authenticate
  2. Pre-register both emails in Supabase dashboard (Auth → Users → Invite)
  3. Next.js middleware: checks `session.user.email` against `ADMIN_EMAILS` env var on every `/admin/*` request. Non-matching users are signed out and redirected.
- **Public site:** No login, no user accounts, no cookies beyond session

---

## 5. Design System

### Dual Themes (admin-switchable)

The active theme is stored in Supabase (a single `settings` table row). Next.js reads it server-side and sets `data-theme` on `<html>`. No rebuild required — change applies instantly.

#### Theme A — Warm Artisan

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#f5ede0` | Page background |
| `--color-surface` | `#fff8f0` | Card / section backgrounds |
| `--color-primary` | `#2d1b4e` | Navigation, headings, hero bg |
| `--color-accent` | `#d4a853` | CTAs, highlights, borders |
| `--color-secondary` | `#c9956b` | Warm copper accents |
| `--color-text` | `#1a0f2e` | Body text |
| `--color-text-muted` | `#6b5b7b` | Secondary text |

#### Theme B — Soft Botanical

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#f8f4f0` | Page background |
| `--color-surface` | `#f0e8f5` | Card / section backgrounds |
| `--color-primary` | `#3d2b4e` | Navigation, headings |
| `--color-accent` | `#9b7bb8` | CTAs, highlights |
| `--color-secondary` | `#9fb89f` | Sage green accents |
| `--color-text` | `#2a1f3a` | Body text |
| `--color-text-muted` | `#6b7b6b` | Secondary text |

### Typography

- **Display / headings:** Cormorant Garamond (serif, elegant, editorial)
- **Body / UI:** DM Sans (geometric, readable, modern)
- **Base font size:** 18px minimum (accessibility for older users)
- **Scale:** 18 / 22 / 28 / 36 / 48 / 64px

### Accessibility Requirements (WCAG 2.1 AA+)

- Contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text (both themes verified)
- Semantic HTML: `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`, `aria-label` throughout
- Skip-to-content link at top of every page
- Visible focus rings on all interactive elements (never `outline: none` without replacement)
- All images require alt text — admin gallery uploader prompts for it on every upload
- `prefers-reduced-motion` media query respected — all CSS animations wrapped
- All form inputs have associated `<label>` elements
- Error messages use `aria-live="polite"` regions
- Touch targets minimum 48×48px

### Responsive Breakpoints

- Mobile: < 768px (primary design target)
- Tablet: 768–1024px
- Desktop: > 1024px

---

## 6. Data Models

### `settings` table
```
id                    uuid (primary key)
theme                 text ('warm-artisan' | 'soft-botanical')
logo_url              text (nullable)
square_store_url      text (nullable)
contact_email         text (nullable)
mailchimp_api_key     text (nullable)
mailchimp_audience_id text (nullable)
ai_provider           text (nullable: 'claude' | 'openai' | 'groq')
announcement_enabled  boolean (default false)
announcement_text     text (nullable)
announcement_link_url text (nullable)
announcement_link_label text (nullable)
social_instagram      text (nullable, default: 'purpleacornz')
social_facebook       text (nullable)
social_tiktok         text (nullable)
social_pinterest      text (nullable)
social_x              text (nullable)
behold_widget_id      text (nullable — Behold.so Instagram embed widget ID)
updated_at            timestamptz
```

### `events` table
```
id          uuid (primary key)
name        text (required)
date        date (required)
time        text (nullable)
location    text (required)
description text (nullable)
link_url    text (nullable)
link_label  text (nullable, e.g. "Event Website", "More Info")
created_at  timestamptz
```

### `gallery` table
```
id          uuid (primary key)
url         text (Supabase Storage URL)
alt_text    text (required — accessibility)
category    text (nullable: 'rings' | 'necklaces' | 'earrings' | 'bracelets' | 'crochet' | 'other')
sort_order  integer (for drag-to-reorder)
created_at  timestamptz
```

### `featured_products` table
```
id          uuid (primary key)
name        text (required)
price       numeric (required)
description text (nullable — AI-generatable, shown as caption under product on homepage)
image_url   text (required)
square_url  text (nullable — links to Square product)
sort_order  integer
is_active   boolean (default true)
```

### `content` table
```
key         text (primary key)
value       text
updated_at  timestamptz
```

**Content keys:**
| Key | Description | AI-generatable |
|---|---|---|
| `hero_tagline` | Hero section headline | ✅ |
| `hero_subtext` | Hero section subheadline | ✅ |
| `story_teaser` | 2–3 sentence homepage excerpt | ✅ |
| `story_full` | Full Our Story page body (rich text / markdown) | ✅ |
| `privacy_policy` | Full privacy policy text (markdown) | ✅ |
| `terms_of_service` | Full terms of service text (markdown) | ✅ |

---

## 7. Admin Panel UX Principles

- **Large touch targets** everywhere (≥ 48px), especially for older users
- **Plain-language labels** — "Upload Photo" not "Manage Assets"; "Add Event" not "Create Entry"
- **Emoji icons** in sidebar navigation for quick visual scanning
- **Confirmation dialogs** before any destructive action (delete event, delete photo)
- **Inline save feedback** — "Saved ✓" appears next to save buttons, not just a toast
- **No icon-only buttons** — every button has a visible text label
- **Alt text required** — gallery uploader will not complete upload without alt text entry

---

## 8. Integrations

### Square Online
- Admin sets the Square Online store URL in `/admin/integrations`
- `/shop` page renders a full-width `<iframe>` pointing to that URL
- Featured products on the homepage are managed manually in admin (not auto-synced from Square in v1)

### Instagram
- Admin sets the Instagram handle in `/admin/integrations`
- Instagram feed section on homepage uses **Behold.so** (free tier) embed widget to display the latest 6 posts. Free tier includes up to 40 posts displayed, refreshes every 24 hours, no Behold branding on the feed itself.
- Fallback: if the embed script fails to load (ad blocker, network issue), a static "Follow us @purpleacornz on Instagram →" link is shown in its place.

### Social Links
- Admin manages URLs for Instagram, Facebook, TikTok, Pinterest, and X in `/admin/integrations`
- Only platforms with a URL configured are shown in the footer — empty fields are hidden
- All social links open in a new tab with `rel="noopener noreferrer"`

### Newsletter (Mailchimp)
- Admin adds Mailchimp API key and Audience ID in `/admin/integrations`
- Newsletter signup form on the homepage submits to a Next.js API route (`/api/newsletter/subscribe`) which calls the Mailchimp API server-side (API key never exposed to browser)
- Subscriber receives a standard Mailchimp double opt-in confirmation email
- If Mailchimp is not configured, the newsletter section is hidden on the public site
- Mailchimp free tier: up to 500 contacts, 1,000 emails/month

### Newsletter Templates

Three pre-built HTML email templates ship with the codebase, stored as React components that render to HTML strings for Mailchimp. Accessible from `/admin/newsletter`. Each template can be populated manually or auto-filled using the AI integration (which pulls live site context: upcoming events, new gallery additions, featured products).

**Compose flow:**
1. Admin visits `/admin/newsletter`
2. Selects a template
3. Clicks "✨ AI Fill" — AI reads live site data and pre-populates all fields
4. Admin reviews, edits, adjusts
5. Previews rendered email in a side panel
6. Enters subject line (with optional AI suggestion)
7. Clicks "Send via Mailchimp" → API route sends to the full subscriber list

**Template 1 — Event Announcement**
- Purpose: Promote an upcoming arts & crafts fair
- Sections: Header with logo, hero image slot, event name + date + location + directions link, short personal note from the team, CTA button ("Come find us!"), footer with social links + unsubscribe
- AI fills: Event details from nearest upcoming event, personal note copy

**Template 2 — New Collection / New Pieces**
- Purpose: Announce new items added to the shop
- Sections: Header with logo, "✨ New in the shop" headline, 2–3 product cards (image, name, price, "Shop Now" link), short message from the team, CTA ("Browse All Pieces"), gallery strip of recent photos, footer
- AI fills: Product descriptions, headline copy, team message; pulls from recently active featured products and gallery

**Template 3 — Monthly Update**
- Purpose: Combined monthly newsletter — events + new pieces + behind-the-scenes note
- Sections: Header with logo, personal greeting, upcoming events list (up to 2), featured piece highlight (1 product card), gallery strip (3 photos), "Follow us on Instagram" block, footer
- AI fills: All copy sections using full site context — events, products, recent gallery additions
- Tone prompt instructs AI to write in warm, personal, mother-daughter voice

All templates are:
- Mobile-responsive (single-column, 600px max-width)
- WCAG AA contrast compliant
- Plain-text fallback auto-generated alongside HTML version
- Brand-themed to match the active site theme (Warm Artisan or Soft Botanical color tokens)

### Reports & Summary Dashboard (`/admin/reports`)

A unified, plain-language summary page for both founders — no need to log into Vercel, Mailchimp, or Square separately. Refreshes on page load; data is fetched server-side at request time (no caching beyond 5 minutes).

**Data sources pulled together:**

| Section | Source | What's shown |
|---|---|---|
| Site Traffic | Vercel Analytics API | Visitors this week/month, top 3 pages, device split (mobile vs desktop) |
| Newsletter | Mailchimp API | Total subscribers, growth this month, last campaign open rate + send date |
| Recent Activity | Supabase (`updated_at` fields) | Last 5 content/gallery/event changes with timestamps and editor |
| Upcoming Events | Supabase `events` table | Next 3 events with dates and locations |
| Square Sales | — | Not available in v1 (Square checkout is an external embed). Link to Square Dashboard provided. Future: Square API integration. |

**AI Narrative Digest:**
At the top of the page, a "✨ Weekly Digest" card shows an AI-generated plain-English summary, e.g.:

> *"This week 340 people visited your site — up from 280 last week! Your gallery page was the most popular. You gained 12 new newsletter subscribers (now 186 total). Your last email had a 42% open rate. Don't forget — you have two upcoming fairs: Brooklyn Night Market on May 3 and the Riverside Fair on May 10."*

- Generated on demand via the "Refresh Digest" button (to avoid unnecessary AI calls on every page load)
- Uses the same `/api/ai/generate` route with all aggregated report data passed as context
- Written in warm, conversational tone appropriate for the brand
- Saves the last generated digest + timestamp so the page shows something useful even before the first refresh

**Layout:** Three columns on desktop, single column on mobile. Each section is a card with a clear heading, key metric in large text, and supporting detail below. Designed for fast scanning — no charts or graphs in v1, just numbers and text.

**Admin sidebar:** `/admin/reports` is added to the sidebar nav as "📊 Reports".

### Legal Pages

Two legal pages ship with pre-written, standard boilerplate content appropriate for a small US-based handmade goods e-commerce business. Content is stored in the `content` table (keys: `privacy_policy`, `terms_of_service`) so admin can edit via `/admin/content` without touching code. The AI "✨ Generate" button is available on both fields to help refresh or customize language.

**`/privacy` — Privacy Policy (default content covers):**
- What data is collected (email via newsletter signup, name/message via contact form)
- How it is used (sending newsletters, responding to inquiries)
- Third-party services and their own policies: Mailchimp (email), Square (payments/checkout), Vercel Analytics (anonymous page view data), Behold.so (Instagram embed), Google OAuth (admin login only)
- Data retention: contact form submissions not stored beyond the email delivery; newsletter emails stored in Mailchimp until unsubscribed
- User rights: unsubscribe link in every email, contact email to request data deletion
- No cookies set by the site itself; Vercel Analytics is cookieless; third-party embeds (Square, Behold) may set their own cookies
- Effective date and "last updated" date (auto-populated from content table `updated_at`)
- Contact email for privacy inquiries

**`/terms` — Terms of Service (default content covers):**
- Products are handmade; slight variations are part of the craft and not defects
- Purchases and returns handled via Square — links to Square's policies
- Custom orders: non-refundable once work has begun (admin can adjust this)
- Intellectual property: all photos and designs belong to Purple Acorns Creations
- Contact information for disputes
- Governing law: New York State
- Effective date

**Footer notice:** A slim one-line notice in the footer: "© 2026 Purple Acorns Creations · Privacy Policy · Terms of Service". Year auto-updates via JavaScript.

**Contact form compliance:** The contact form includes: "By submitting this form you agree to our Privacy Policy. We'll only use your information to respond to your inquiry."

### Announcement Banner
- Admin toggles on/off and edits text + optional link from `/admin/branding`
- Stored in `settings` table — no rebuild required, change is live immediately
- Displayed as a slim strip above the nav on every page when enabled
- Dismissible by visitor (dismissed state stored in `sessionStorage` — reappears on new session)
- Accessible: uses `role="banner"` with `aria-label="Announcement"`, dismiss button has visible label

### AI Content Generation
Admin users can generate draft content directly within the admin panel using their choice of AI provider. This is an assistive tool — all generated content is editable before saving, never auto-published.

**Supported providers (configured in `/admin/integrations`):**
- **Claude** (Anthropic) — `claude-haiku-4-5` for speed and cost efficiency. Requires `ANTHROPIC_API_KEY` env var.
- **OpenAI** (ChatGPT) — `gpt-4o-mini`. Requires `OPENAI_API_KEY` env var.
- **Groq** — `llama-3.3-70b-versatile` (optional, fastest, free tier available). Requires `GROQ_API_KEY` env var.

Admin selects their preferred provider in `/admin/integrations`. If no provider is configured, AI buttons are hidden — the admin panel works fully without AI.

**"✨ Generate" appears on these fields:**

| Field | Context sent to AI |
|---|---|
| Hero tagline | Brand name, product types, tone prompt |
| Hero subtext | Brand name, tagline, brief description |
| Story teaser | Full story text (if exists), prompt to summarize in 2–3 sentences |
| Full story | Brand facts (mother-daughter, products, fairs), tone prompt |
| Event description | Event name, date, location |
| Product description | Product name, price, category, materials |
| Announcement text | Event/occasion details if provided |
| Newsletter subject line | Occasion/topic from admin (transient — not persisted, used only during newsletter compose flow) |

**UX flow:** Admin clicks "✨ Generate" → small modal opens with an optional custom prompt field pre-filled with sensible defaults → "Generate" button → streamed response appears in the modal → "Use this" inserts into the field → admin edits and saves normally.

**Context-aware generation:** The API route automatically enriches every prompt with live site data pulled from Supabase before sending to the AI:
- Upcoming events (next 3) — dates, locations, names
- Featured products — names, prices, categories
- Recently uploaded gallery items (last 5) — categories and tags
- Current active announcement (if any)

This means the AI can proactively suggest relevant content — e.g., when generating a newsletter subject line, it knows there's a fair next Saturday and two new crochet pieces were just added to the gallery.

**API route:** `POST /api/ai/generate` — server-side only, accepts `{ field, userPrompt, provider }`. Fetches live site context from Supabase via service role key, builds enriched prompt, streams response back. Switches between Anthropic/OpenAI/Groq SDK based on configured `provider`. API keys never reach the browser.

---

## 9. Analytics

### Vercel Analytics + Speed Insights (recommended, free)

Built into the Vercel dashboard they'll already use for deployment. No cookie consent banner required (privacy-friendly, GDPR-compliant, no personal data collected).

**Tracks:**
- Page views and unique visitors
- Top pages (which pages/designs get the most traffic)
- Traffic sources (how visitors found the site)
- Device breakdown (mobile vs desktop)
- Geographic data
- Core Web Vitals (site performance)

**Implementation:** Add `@vercel/analytics` and `@vercel/speed-insights` packages — two lines of code in the root layout. Metrics appear in the Vercel dashboard within minutes of deployment.

**Admin exposure:** A read-only analytics summary card on the `/admin` dashboard will surface the top 3 most-viewed pages and total visitors this month — so the founders don't need to log into Vercel separately.

If more detailed analytics are needed in future (funnel tracking, conversion events, UTM campaigns), Google Analytics 4 can be added as a drop-in script — but Vercel Analytics covers the stated needs without any privacy complexity.

---

## 10. Out of Scope (v1)

- Customer accounts / wishlists on the public site
- Social login on the public site
- Automatic product sync from Square API (products managed manually in admin)
- Multi-language support
- Blog / editorial section
- Reviews or comments

---

## 11. Environment Variables

```bash
# Supabase — public (safe to expose in browser)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase — server-only (admin writes, AI context fetching, newsletter subscription)
SUPABASE_SERVICE_ROLE_KEY=

# Admin auth allowlist (server-only middleware check)
ADMIN_EMAILS=purpleacornzcreations@gmail.com,write2spica@gmail.com

# AI providers — server-only (at least one required for AI features; all optional)
ANTHROPIC_API_KEY=       # Claude (claude-haiku-4-5)
OPENAI_API_KEY=          # OpenAI (gpt-4o-mini)
GROQ_API_KEY=            # Groq (llama-3.3-70b-versatile) — optional, free tier

# Newsletter
# Mailchimp API key and audience ID stored in settings table (entered via admin UI)
# No additional env var needed — retrieved server-side from Supabase

# Google OAuth (configured in Supabase dashboard — no env vars needed here)
```

---

## 12. Deployment

1. Push to GitHub → Vercel auto-deploys on every merge to `main`
2. Supabase project created (free tier), database migrations run via Supabase CLI
3. Environment variables set in Vercel dashboard
4. Custom domain pointed to Vercel (DNS update, ~15 min propagation)
5. Two admin users pre-created in Supabase Auth dashboard
6. Square Online store URL and Instagram handle entered via `/admin/integrations`
7. **Behold.so onboarding (manual, one-time):** Create a free Behold account at behold.so, connect the @purpleacornz Instagram account, copy the embed widget code. Paste the widget ID into `/admin/integrations`. The Behold widget ID is stored in the `settings` table as `behold_widget_id`. If not set, the Instagram section gracefully falls back to a static follow link.
