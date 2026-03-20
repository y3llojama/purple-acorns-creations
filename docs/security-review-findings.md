# Security Review Findings — Purple Acorns Creations

**Date:** 2026-03-20
**Scope:** Full codebase — API routes, middleware, DB migrations, auth patterns, sanitization, rate limiting, input validation

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 2 | Pending |
| High | 5 | Pending |
| Medium | 3 | Pending |
| Low | 2 | Pending / informational |

---

## Critical

### CRIT-1 — `ALLOWED_THEMES` missing `'modern'`

- **File:** `app/api/admin/settings/route.ts:8`
- **Issue:** Migration `014_add_modern_theme.sql` added `'modern'` to the DB check constraint and set it as the row default. The API allowlist is still `['warm-artisan', 'soft-botanical', 'custom']`. Any admin attempt to save `theme: 'modern'` returns HTTP 400 "Invalid theme" — locking the admin out of the current DB default.
- **Fix:**
  1. Add `'modern'` to `ALLOWED_THEMES` on line 8.
  2. Extend the named-preset custom-color-clear condition (~line 20) to include `|| body.theme === 'modern'`.
  3. Extend the `savingNamedPreset` variable (~line 27) to include `|| body.theme === 'modern'`.

---

### CRIT-2 — Storage bucket write policies allow any authenticated user to write

- **File:** `supabase/migrations/011_storage_buckets.sql:24-52`
- **Issue:** All 6 write policies (INSERT/UPDATE/DELETE for `branding` and `gallery`) use `to authenticated` with no admin-email restriction. Any authenticated Supabase account can upload, modify, or delete images.
- **Mitigating factor:** New-user signups are disabled — but this is a defence-in-depth gap.
- **Fix:** New migration `015_restrict_storage_write_to_admin.sql` — drop and recreate write policies restricted to admin emails via an `is_admin_user()` check.

---

## High

### HIGH-1 — No rate limiting on `/api/gallery/image` (public image proxy)

- **File:** `app/api/gallery/image/route.ts` — no rate limiter present
- **Issue:** Endpoint fetches any validated HTTPS URL server-side, runs `sharp` (CPU-heavy), and returns the result. Trivially abusable for bandwidth exhaustion or server-side proxy amplification.
- **CLAUDE.md rule:** "Apply in-memory rate limiting (60s window per IP) to all public API routes"
- **Fix:** Add in-memory rate limiter (30 req/IP/60s) with a 5-minute prune cycle, matching the pattern in `app/api/contact/route.ts`.

---

### HIGH-2 — Newsletter `subscribe` rate limiter never prunes (memory leak)

- **File:** `app/api/newsletter/subscribe/route.ts:5-13`
- **Issue:** `rateLimitMap` grows indefinitely — every unique IP adds a permanent entry. No prune cycle exists.
- **Fix:** Add `PRUNE_INTERVAL`, `lastPrune`, and `pruneRateLimitMap()` matching the `contact/route.ts` pattern.

---

### HIGH-3 — Newsletter `unsubscribe` rate limiter never prunes (memory leak)

- **File:** `app/api/newsletter/unsubscribe/route.ts:4-13`
- **Issue:** Same pattern as HIGH-2.
- **Fix:** Same fix as HIGH-2.

---

### HIGH-4 — Newsletter `webhook` rate limiter never prunes (memory leak)

- **File:** `app/api/newsletter/webhook/route.ts:5-20`
- **Issue:** Uses a `{ count, windowStart }` windowed counter but entries are never deleted.
- **Fix:** Add `pruneRateLimitMap()` that deletes entries where the window has expired, called with a 5-minute guard.

---

### HIGH-5 — Admin content route stores unsanitized HTML

- **File:** `app/api/admin/content/route.ts:12`
- **Issue:** The `value` field is stored raw with a "sanitized on render" comment. CLAUDE.md: "Never skip sanitize-html — even for trusted DB content rendered as HTML." If any downstream consumer misses the sanitization step, content fields like `story_full` and `privacy_policy` become a stored XSS vector.
- **Fix:** Call `sanitizeContent(value)` before storing, consistent with `app/api/admin/newsletter/[id]/route.ts:52`.

---

## Medium

### MED-1 — No domain allowlist on image proxy URL

- **File:** `app/api/gallery/image/route.ts:10-22`
- **Issue:** `isValidHttpsUrl` only validates the scheme. Any HTTPS URL is accepted, enabling SSRF against internal services.
- **Fix:** Restrict accepted URLs to the configured Supabase storage host (derived from `NEXT_PUBLIC_SUPABASE_URL`).

---

### MED-2 — IDs not validated as UUIDs in events and follow-along routes

- **Files:**
  - `app/api/admin/events/route.ts` (PUT ~line 56, DELETE ~line 66)
  - `app/api/admin/follow-along/route.ts` (~lines 61, 70-71, 82-83, 95-96)
- **Issue:** `id` passed directly to `.eq('id', String(body.id))` without UUID validation. `messages/route.ts` uses `isValidUuid()` — this pattern is not consistently applied.
- **Fix:** Add `isValidUuid(id)` checks consistent with the messages route.

---

### MED-3 — Cron secret absence silently breaks newsletter delivery

- **File:** `app/api/cron/newsletter-send/route.ts:8-11`
- **Issue:** If `CRON_SECRET` is not set, the guard logic rejects all callers (safe), but delivery silently fails with no operator-visible error.
- **Fix:** Add a `console.warn` when `CRON_SECRET` is undefined.

---

## Low

### LOW-1 — Webhook signature validation skipped when secret is unset

- **File:** `app/api/newsletter/webhook/route.ts:60-63`
- **Issue:** When `RESEND_WEBHOOK_SECRET` is unset, the entire HMAC check is bypassed and any unauthenticated POST can trigger email status updates.
- **Fix:** Log a warning when the secret is absent; consider rejecting in non-dev environments.

---

### LOW-2 — Credentials stored unencrypted in `settings` table

- **Fields:** `mailchimp_api_key`, `smtp_pass`, `smtp_user`
- **Assessment:** Access is server-side only via service role client. Supabase encrypts at rest. No action required at this scale.

---

## Verified Secure

- All auth routes use `getUser()` not `getSession()` ✓
- All 17 admin API routes call `requireAdminSession()` before any DB access ✓
- CORS handled correctly in `lib/cors.ts` — no invalid header values ✓
- All public routes except `/api/gallery/image` have rate limiting ✓
- All external URLs validated with `isValidHttpsUrl()` before use ✓
- All DB access uses Supabase SDK (parameterized — no SQL injection) ✓
- RLS enabled on all tables ✓
- No hardcoded secrets — all credentials from env vars or settings table ✓
- Webhook HMAC uses `crypto.timingSafeEqual` (constant-time) ✓
- AI-generated newsletter sections sanitized with `sanitizeContent()` before DB write ✓
- `settings` table has no public SELECT RLS policy ✓
- `contact/route.ts`, `analytics/track/route.ts`, `search/route.ts` have correct prune cycles ✓

---

## Next Review Checklist

When changes are made and this doc is re-reviewed, verify:

- [ ] `ALLOWED_THEMES` stays in sync with DB theme check constraint in migrations
- [ ] Every new public API route has rate limiting with a prune cycle
- [ ] New HTML content is sanitized on **write** (not just on render)
- [ ] Any new external URL usage goes through `isValidHttpsUrl()` before use
- [ ] New storage buckets get write policies scoped to admin emails (not just `to authenticated`)
- [ ] New `Map`-based rate limiters include `PRUNE_INTERVAL`, `lastPrune`, and a `pruneRateLimitMap()` call
- [ ] New admin routes receiving IDs validate them with `isValidUuid()` before querying
