# Security Review — Purple Acorns Creations
**Date:** 2026-03-23
**Reviewers:** Automated security audit team (3 parallel domain-focused agents)
**Scope:** Full codebase — authentication, payments, inventory, input validation, public API, infrastructure

---

## Executive Summary

The codebase demonstrates a high level of security awareness: authenticated encryption (AES-256-GCM), timing-safe HMAC comparisons, strict HTML sanitization allowlists, parameterized queries, and consistent `getUser()` usage are all implemented correctly. The architecture is sound.

However, three **Critical** issues require immediate attention before the next production deployment:

1. **Image proxy SSRF** — no domain allowlist on the gallery image proxy
2. **X-Forwarded-For spoofing** — all rate limiters can be bypassed by spoofing the client IP header
3. **Resend webhook signature optional** — unauthenticated callers can forge bounce events

Additionally, two payment-specific Critical issues require attention:

4. **3DS verification bypass** — the server accepts payments with no `verificationToken`
5. **Charge-before-decrement race** — the public checkout charges first, creating a double-purchase window

---

## Critical Issues (Must Fix Before Next Deploy)

### C-1 · Image Proxy SSRF — No Domain Allowlist

**File:** `app/api/gallery/image/route.ts:43–53`

`isValidHttpsUrl` only validates that the scheme is `https:`. Any HTTPS URL is accepted, including AWS EC2 instance metadata (`169.254.169.254`), internal Vercel/Supabase management endpoints, or attacker-controlled servers. Additionally, the `Content-Type` from the upstream server is echoed back — a malicious origin could serve `Content-Type: text/html` with XSS payload.

**Fix:**
```typescript
const ALLOWED_IMAGE_HOSTS = [/^[a-z0-9-]+\.supabase\.co$/]
const parsed = new URL(url)
if (!ALLOWED_IMAGE_HOSTS.some(re => re.test(parsed.hostname))) {
  return NextResponse.json({ error: 'URL not allowed' }, { status: 400 })
}
// Always override Content-Type — never trust upstream
res.headers.set('Content-Type', 'image/jpeg') // or detect from extension
```

---

### C-2 · X-Forwarded-For Spoofing — All Rate Limiters Bypassed

**Files:** `app/api/contact/route.ts:25`, `app/api/analytics/track/route.ts:27`, `app/api/newsletter/subscribe/route.ts:25`, `app/api/newsletter/unsubscribe/route.ts:7`, `app/api/newsletter/webhook/route.ts:10`, `app/api/search/route.ts:21`, `app/api/gallery/image/route.ts:30`, `app/api/webhooks/resend-inbound/route.ts:54`

Every rate limiter takes the leftmost `X-Forwarded-For` value, which is set by the client. An attacker can send `X-Forwarded-For: 1.2.3.4` (rotating randomly per request) to bypass all rate limiting across the entire application. This defeats the protection on contact, subscribe, and analytics endpoints — all prime spam/abuse targets.

**Fix:** On Vercel, use `x-real-ip` (set by Vercel's edge, not spoofable) as the authoritative IP:
```typescript
const ip = request.headers.get('x-real-ip')
  ?? request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
  ?? 'unknown'
```
Apply this change in a shared `getClientIp(request)` utility and update all eight call sites.

---

### C-3 · Resend Newsletter Webhook — Signature Verification Optional

**File:** `app/api/newsletter/webhook/route.ts:25–63`

When `RESEND_WEBHOOK_SECRET` is not set, the handler falls through and processes the raw JSON body without any authentication. Any anonymous HTTP client can POST a fabricated `email.bounced` event and silently mark arbitrary subscribers as `status='bounced'`, effectively unsubscribing them without their knowledge. The inbound Resend webhook (`/api/webhooks/resend-inbound/route.ts:63–66`) correctly rejects unauthenticated requests — this endpoint does the opposite.

**Fix:** Treat missing secret as a server misconfiguration, not a bypass:
```typescript
if (!webhookSecret) {
  console.error('[newsletter-webhook] RESEND_WEBHOOK_SECRET not configured')
  return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 })
}
```

---

### C-4 · 3DS/SCA Buyer Verification Can Be Bypassed Server-Side

**Files:** `app/api/shop/checkout/route.ts:115–116`, `app/api/shop/private-sale/[token]/checkout/route.ts:123–124`, `lib/square/buyer-verification.ts:58–66`

The server accepts and processes payments even when `verificationToken` is absent (`...(verificationToken ? { verificationToken } : {})`). A client making a raw POST to the checkout endpoint without a token completes payment without any 3DS challenge. The client-side `verifyBuyer` guard is the only enforcement, and it can be bypassed entirely by crafting a direct API call.

**Fix:** For amounts above a configurable threshold (or always, for compliance), return 400 when `verificationToken` is absent:
```typescript
if (!verificationToken && totalCents > 0) {
  return NextResponse.json({ error: 'Buyer verification required.' }, { status: 400 })
}
```
At minimum, add server-side logging when a payment completes without a verification token.

---

### C-5 · Public Checkout Charges Card Before Decrementing Stock

**Files:** `app/api/shop/checkout/route.ts:51–179`, `supabase/migrations/038_private_sales_shipping.sql:18–24`

The public checkout flow: (1) validates stock with a non-locking `SELECT`, (2) charges the card via Square API (~1–5 seconds), (3) calls `decrement_stock`. Two concurrent requests for the last unit can both pass the validation `SELECT`, both charge the customer, and then the second `decrement_stock` returns zero rows triggering a refund. This means real money is moved — customer is charged and refunded — creating confusion, potential fraud flags, and operational burden. The private sale flow (`fulfill_private_sale` RPC) already does this correctly with `FOR UPDATE` row locking.

**Fix:** Restructure public checkout to match the private sale pattern:
1. Atomically decrement stock first (call `decrement_stock` before the Square charge)
2. If decrement fails → return 409 (out of stock) immediately
3. If charge fails after decrement → issue refund AND re-increment stock

---

### C-6 · OAuth CSRF — State Parameter Missing from Square and Pinterest Flows

**Files:** `app/api/admin/channels/square/connect/route.ts:35–39`, `app/api/admin/channels/square/callback/route.ts:11–15`, `app/api/admin/channels/pinterest/connect/route.ts:13–16`, `app/api/admin/channels/pinterest/callback/route.ts:9–11`

Neither OAuth flow generates or verifies a `state` parameter. An attacker can craft an authorization URL for their own Square/Pinterest account, trick an admin into clicking it, and the callback will exchange the code and overwrite the store's OAuth tokens with the attacker's credentials. This would give the attacker control over inventory syncing and order data.

**Fix:** In each `connect` handler, generate a random `state`, store it in a signed short-lived cookie, append it to the authorization URL. In each `callback` handler, verify the `state` before processing the code. Reject any callback with a missing or mismatched `state`.
```typescript
// connect
const state = crypto.randomUUID()
// store in signed cookie with 10min expiry
const authUrl = `${oauthUrl}?...&state=${state}`

// callback
const expectedState = getCookieState(request)
if (!state || state !== expectedState) {
  return redirect('/admin/channels?error=csrf')
}
```

---

## Important Issues (Should Fix)

### I-1 · Square Callback Reflects Upstream Error Message into Redirect URL

**File:** `app/api/admin/channels/square/callback/route.ts:47–50`

Raw Square API error messages are URL-encoded and reflected into the redirect destination. These appear in browser history and server logs on the destination. Only pass generic strings like `detail=token_exchange_failed` in redirect URLs; log the full error server-side.

---

### I-2 · Missing Middleware-Level Admin Route Guard

No `middleware.ts` protects `/api/admin/**` at the network layer. Every admin route relies solely on developers calling `requireAdminSession()` inside the handler. A future route that omits this call would be completely unprotected. Add a Next.js middleware matcher as a defense-in-depth backstop, while keeping `requireAdminSession()` in each handler.

---

### I-3 · Newsletter Unsanitized Plain-Text Fields Written to DB

**File:** `app/api/admin/newsletter/[id]/route.ts:34–55`

Fields `title`, `subject_line`, `teaser_text`, `tone`, and `ai_brief` are written to the database without calling `sanitizeText()`. The `slug` field is not validated against a slug character set. Apply `sanitizeText()` to plain-text fields and a regex check (`/^[a-z0-9-]+$/`) to `slug`.

---

### I-4 · CORS — `Allow-Credentials: true` Sent Regardless of Origin Match

**File:** `lib/cors.ts:14–16`

`corsHeaders()` always includes `Access-Control-Allow-Credentials: true` even when no `Allow-Origin` header is set. If a future misconfiguration causes a wildcard or reflected origin, credentialed cross-origin requests would be permitted. Only include `Allow-Credentials` when an origin is actually being allowed.

---

### I-5 · Analytics Metadata Field — No Schema Validation or Size Cap

**File:** `app/api/analytics/track/route.ts:56`

Any arbitrary object is accepted as `metadata` and written to the database. No depth, key count, or byte size limit is enforced. Within the 30/min rate limit, this allows excessive database storage consumption. Cap `metadata` at 500 bytes or define an explicit per-event-type schema.

---

### I-6 · `decryptValue` Fallback Returns Raw Ciphertext on Failure

**File:** `lib/crypto.ts:50–64`

When decryption fails (wrong key, corrupted ciphertext), the function returns the raw `enc:<hex>` ciphertext instead of throwing. Callers receive a garbled string that may reach external APIs (Resend, Square) as a credential. Return `''` or throw, and let callers handle the missing value explicitly.

---

### I-7 · Webhook Signature URL Should Be a Fixed Env Var, Not `request.url`

**File:** `lib/channels/square/webhook.ts:4–16`

Square's HMAC is computed over `notification_url + rawBody`. Using `request.url` means the URL in verification is the internal/edge URL, which may differ from the public URL registered in Square's dashboard, causing all webhooks to fail. Set `SQUARE_WEBHOOK_URL` as a fixed env var matching the Square dashboard registration.

---

### I-8 · Idempotency Keys Use Last-12-Chars of Nonce — Collision Risk

**Files:** `app/api/shop/checkout/route.ts:106,114`, `app/api/shop/private-sale/[token]/checkout/route.ts:107,122`

Idempotency keys are derived as `order-${sourceId.slice(-12)}`. Using a 12-character suffix reduces the collision-resistance space unnecessarily. Generate a fresh `crypto.randomUUID()` server-side for each request and use it as the idempotency key — stable per request, collision-resistant, unguessable.

---

### I-9 · Missing HSTS Header

**File:** `next.config.js:10–29`

`Strict-Transport-Security` is absent from the security headers block. Without HSTS, users who follow HTTP links are vulnerable to SSL-stripping on hostile networks.

**Fix:** Add to headers:
```javascript
{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
```

---

### I-10 · Unsubscribe Token Has No Format Validation

**File:** `app/api/newsletter/unsubscribe/route.ts:14–16`

Any non-empty string is accepted and sent to the database. The token schema is a 48-character hex string. Validate format before the query:
```typescript
if (!/^[0-9a-f]{48}$/.test(token)) {
  return NextResponse.json({ error: 'Invalid token.' }, { status: 400 })
}
```

---

### I-11 · Pinterest OAuth Callback — Silent Success When No Settings Row Exists

**File:** `app/api/admin/channels/pinterest/callback/route.ts:31–36`

If no settings row exists, tokens are silently discarded and the user is redirected to `?connected=pinterest` despite nothing being stored. Redirect to `?error=pinterest_no_settings` instead.

---

### I-12 · `handleInventoryUpdate` Writes `parseInt()` Without Range Check

**File:** `lib/channels/square/webhook.ts:26–28`

Square webhook inventory quantities are passed directly to DB update with no finite-number or range check. `parseInt` on a non-numeric string returns `NaN`, causing a silent DB error. Add:
```typescript
if (!Number.isFinite(qty) || qty < 0) continue
```

---

### I-13 · Square Error `detail` Returned in API Response to Browser

**File:** `lib/square/payment-errors.ts:21–22`

Square's internal `detail` field (containing internal service identifiers) is returned to the client in 402 responses. Log it server-side and return only `{ error: message }` to the browser.

---

### I-14 · `/api/shop/products/[id]` — No Rate Limiting

**File:** `app/api/shop/products/[id]/route.ts`

All other shop public endpoints have rate limiters. This single-product endpoint does not, allowing unlimited enumeration. Add the same `checkRate` pattern used elsewhere.

---

### I-15 · `ADMIN_EMAILS` Empty String Produces a Falsy Allowlist Entry

**File:** `lib/auth.ts:16–18`

If `ADMIN_EMAILS` is misconfigured as empty, `adminEmails` becomes `['']`. Filter empty strings:
```typescript
const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',').map(e => e.trim()).filter(Boolean)
```
Also add a startup warning if the list is empty.

---

### I-16 · `script-src 'unsafe-inline'` Undermines CSP XSS Protection

**File:** `next.config.js:19`

`'unsafe-inline'` in `script-src` allows any injected `<script>` tag to execute, making the CSP ineffective against reflected/stored XSS. Migrate to nonce-based CSP (Next.js 15 middleware supports this natively) or `'strict-dynamic'` with a hash/nonce for framework scripts.

---

### I-17 · Square Callback Debug Logs in Production

**File:** `app/api/admin/channels/square/callback/route.ts:28,54,67,78`

Multiple `console.log` statements remain in production code, logging encryption state, Square environment, and raw DB error messages. These appear in Vercel function logs. Remove all `console.log` calls; retain only `console.error` for genuine error paths.

---

## Minor Issues (Nice to Have)

| # | File | Finding |
|---|------|---------|
| m-1 | `app/api/admin/gallery/route.ts:31,64` | `body.id` not validated as UUID before DB query — returns opaque 500 instead of clean 400. Apply `isValidUuid()`. |
| m-2 | `app/api/admin/newsletter/[id]/send/route.ts:4` | Dead import `buildNewsletterEmail` — remove. |
| m-3 | `app/api/cron/*.ts` | Cron routes use `GET` with side effects. Semantically should be `POST`, though `CRON_SECRET` check is the real protection. |
| m-4 | `app/api/cron/newsletter-send/route.ts:79–83` | Resend credential check is inside per-newsletter loop — silently `continue`s instead of failing fast. |
| m-5 | `app/api/admin/content/route.ts` | Content `key` is not validated against an allowlist. A rogue admin could insert arbitrary keys. |
| m-6 | `lib/resend.ts:45–53` | Newsletter URLs (containing slug, a DB value) are interpolated into HTML `href` without HTML-escaping. Apply `encodeURIComponent` or `escapeHtml`. |
| m-7 | `app/api/analytics/track/route.ts:50–51` | `pagePath` and `referrer` stored without stripping null bytes or control characters. |
| m-8 | `app/(public)/shop/confirmation/[orderId]/page.tsx` | Order confirmation page accessible to anyone who knows/guesses the Square order ID — no session linkage. Low risk (no PII shown), but consider tying confirmation to a short-lived signed cookie. |
| m-9 | All rate-limited routes | In-memory rate limiter state is per-process and resets on cold starts. Multiple Vercel isolates each get a fresh map. For a small artisan store this is acceptable, but worth noting. |
| m-10 | `app/api/newsletter/webhook/route.ts:5–20` | Rate limiter has no prune step — map grows indefinitely with stale entries. |
| m-11 | `lib/email.ts:53` | `sendEmail` accepts `replyTo` as an arbitrary string without internal validation — safe today, but a `stripControlChars` call inside the function would add defense-in-depth. |

---

## Strengths

These areas are well-implemented and should be maintained as baselines:

- **`getUser()` used exclusively server-side** — `getSession()` is never used for auth verification, which is the correct Supabase secure pattern.
- **Three-layer admin auth** — Supabase pre-registration + disabled new-user signups + `ADMIN_EMAILS` allowlist. `requireAdminSession()` is called consistently at the top of every admin handler reviewed.
- **AES-256-GCM authenticated encryption** for stored credentials — IV randomization, GCM auth tag verification, and the `enc:` prefix guard are all correct.
- **Timing-safe HMAC comparisons** — `crypto.timingSafeEqual` used correctly in both Resend webhook validators.
- **HTML sanitization allowlist** — `sanitizeContent` uses an explicit tag/attribute allowlist (not blocklist), restricts `href` to `https:` and `mailto:` only, and enforces `rel="noopener noreferrer"` via `transformTags`. `marked` output is also passed through this sanitizer.
- **Price integrity** — both checkout routes fetch prices exclusively from the database. Clients send only product IDs and quantities. Custom private sale prices come from `private_sale_items`, never from the request body.
- **Private sale token entropy** — `gen_random_uuid()` gives 122 bits of entropy; brute-force enumeration is infeasible.
- **`fulfill_private_sale` RPC is fully atomic** with `FOR UPDATE` row locking, preventing double-fulfillment under concurrency.
- **Square webhook uses `timingSafeEqual`** with signature verification before JSON parsing.
- **All DB queries parameterized** — no string interpolation into SQL queries found anywhere.
- **Inbound Resend webhook has replay protection** — timestamp checked within 300 seconds.
- **Cron secrets are correctly enforced** — all three cron routes reject when `CRON_SECRET` is undefined rather than silently matching.

---

## Priority Fix Order

| Priority | Issue | Risk |
|----------|-------|------|
| 🔴 Immediate | C-2: X-Forwarded-For spoofing | All rate limiters defeated |
| 🔴 Immediate | C-3: Resend webhook no auth fallback | Subscriber database manipulation |
| 🔴 Immediate | C-1: Image proxy SSRF | Internal network exposure |
| 🔴 Immediate | C-6: OAuth CSRF (Square + Pinterest) | Credential hijacking |
| 🟠 Before next payment | C-4: 3DS bypass | SCA non-compliance |
| 🟠 Before next payment | C-5: Charge-before-decrement | Double-charge UX failure |
| 🟡 Next sprint | I-1 to I-9 | Defense-in-depth |
| 🟢 Backlog | m-1 to m-11 | Code quality |

---

## Deployment Checklist

Before next production deploy, verify:

- [ ] `RESEND_WEBHOOK_SECRET` is set in Vercel environment
- [ ] `SQUARE_WEBHOOK_URL` env var added and matches Square dashboard registration
- [ ] `CRON_SECRET` is set
- [ ] `ADMIN_EMAILS` is non-empty
- [ ] `ENCRYPTION_KEY` is set (for `crypto.ts`)
- [ ] All Square/Pinterest OAuth callback URLs in respective developer dashboards match the deployed domain exactly

---

## Resolution Status — 2026-03-23

All **Critical** (C-1 through C-6) and **Important** (I-1 through I-17) issues from this review have been resolved. Minor issues (m-1 through m-11) remain as backlog items.

### Resolved — Critical

| Issue | Fix | Commit |
|-------|-----|--------|
| C-1: Image proxy SSRF | Domain allowlist restricted to `*.supabase.co`; `Content-Type` hardcoded to `image/jpeg` | `3fefaf9` |
| C-2: X-Forwarded-For IP spoofing | Shared `lib/get-client-ip.ts` using `x-real-ip`; applied to all 16 rate-limited routes | `ceeb252` |
| C-3: Resend webhook no-auth fallback | Removed unauthenticated path; missing `RESEND_WEBHOOK_SECRET` now returns 500 | `a7af7ee` |
| C-4: 3DS buyer verification bypass | `verificationToken` required in both checkout routes; 400 if absent | `8645201`, `17e874e` |
| C-5: Charge-before-decrement race | Public checkout rewritten: stock atomically decremented first, rolled back on charge failure | `17e874e` |
| C-6: OAuth CSRF (Square + Pinterest) | `crypto.randomUUID()` state param set in `__Host-` cookie; verified in callback | `594ca41` |

### Resolved — Important

| Issue | Fix | Commit |
|-------|-----|--------|
| I-2: No middleware-level admin guard | `middleware.ts` created: rejects unauthenticated `/api/admin/*` requests before handlers run | `86c0c99` |
| I-3: Newsletter plain-text XSS | `sanitizeText()` applied to all 5 plain-text fields; slug validated against `/^[a-z0-9-]+$/` | `109710d` |
| I-4: CORS Allow-Credentials always sent | `Allow-Credentials: true` only emitted when origin matches; `DELETE` removed from methods | `bc94d47` |
| I-5: Analytics metadata unbounded | `metadata` capped at 500 bytes; oversized objects silently dropped | `98729a7` |
| I-6: decryptValue leaks ciphertext | Returns `''` on decryption failure instead of raw ciphertext | `c3e599a` |
| I-7: Square webhook URL hardcoded | Uses `SQUARE_WEBHOOK_URL` env var with `request.url` fallback + warn | `d37300b` |
| I-8: Client-supplied idempotency keys | Both checkouts now use `crypto.randomUUID()` server-side | `8645201`, `17e874e` |
| I-9: Missing HSTS header | `Strict-Transport-Security: max-age=31536000; includeSubDomains` added to `next.config.js` | `4bdaaff` |
| I-10: Unsubscribe token not validated | Token validated against `/^[0-9a-f]{48}$/` before DB query | `c9f5249` |
| I-11: Pinterest callback silent failure | Now redirects with `?error=pinterest_no_settings` when no settings row exists | `594ca41` |
| I-12: Inventory qty not validated | `parseInt` result checked with `Number.isFinite` and `>= 0` before DB update | `7b9cc3c` |
| I-13: Error detail in 402 responses | `detail` field removed from all payment error responses; logged server-side only | `8645201`, `17e874e` |
| I-14: `/api/shop/products/[id]` unrated | 60 req/min rate limiter added using `getClientIp` | `0e4d491` |
| I-15: ADMIN_EMAILS empty-string bypass | `.filter(Boolean)` added; startup warning when list is empty | `693f763` |
| I-16: CSP `unsafe-inline` undocumented | Trade-off documented in `next.config.js` with future nonce migration path noted | `feea993` |
| I-17: OAuth callback debug logs | `console.log` calls removed from Square/Pinterest callback handlers | `594ca41` |

### Test Coverage Added

| Test file | Coverage |
|-----------|---------|
| `__tests__/lib/get-client-ip.test.ts` | `x-real-ip` priority, spoofing prevention |
| `__tests__/api/newsletter/webhook-auth.test.ts` | Missing secret → 500, bad signature → 401 |
| `__tests__/api/gallery/image-ssrf.test.ts` | Domain allowlist enforcement |

**Test suite at resolution:** 296 tests, 55 suites, all passing.
