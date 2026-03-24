# Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical (C-1 through C-6) and Important (I-1 through I-17) issues from `docs/reviews/mar-23-security-review.md`.

**Architecture:** Changes are grouped by locality — shared utilities first (so downstream tasks can depend on them), then individual route fixes, then hardening batch, then middleware. No new dependencies required; all fixes use existing Node.js `crypto`, Next.js, and Supabase patterns already in the codebase.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, Square Payments, Jest

---

## Files Created or Modified

| File | Action | Addresses |
|------|--------|-----------|
| `lib/get-client-ip.ts` | Create | C-2 |
| `app/api/analytics/track/route.ts` | Modify | C-2 |
| `app/api/contact/route.ts` | Modify | C-2 |
| `app/api/gallery/image/route.ts` | Modify | C-1, C-2 |
| `app/api/newsletter/subscribe/route.ts` | Modify | C-2 |
| `app/api/newsletter/unsubscribe/route.ts` | Modify | C-2, I-10 |
| `app/api/newsletter/webhook/route.ts` | Modify | C-2, C-3 |
| `app/api/search/route.ts` | Modify | C-2 |
| `app/api/shop/categories/route.ts` | Modify | C-2 |
| `app/api/shop/checkout/route.ts` | Modify | C-2, C-4, C-5, I-8, I-13 |
| `app/api/shop/private-sale/[token]/checkout/route.ts` | Modify | C-2, C-4, I-8, I-13 |
| `app/api/shop/private-sale/[token]/route.ts` | Modify | C-2 |
| `app/api/shop/products/route.ts` | Modify | C-2 |
| `app/api/shop/products/[id]/route.ts` | Modify | C-2, I-14 |
| `app/api/shop/products/[id]/view/route.ts` | Modify | C-2 |
| `app/api/shop/shipping-config/route.ts` | Modify | C-2 |
| `app/api/webhooks/resend-inbound/route.ts` | Modify | C-2 |
| `app/api/webhooks/square/route.ts` | Modify | C-2, I-7 |
| `app/api/newsletter/webhook/route.ts` | Modify | C-3 |
| `app/api/admin/channels/square/connect/route.ts` | Modify | C-6 |
| `app/api/admin/channels/square/callback/route.ts` | Modify | C-6, I-1, I-17 |
| `app/api/admin/channels/pinterest/connect/route.ts` | Modify | C-6 |
| `app/api/admin/channels/pinterest/callback/route.ts` | Modify | C-6, I-11 |
| `lib/cors.ts` | Modify | I-4 |
| `lib/crypto.ts` | Modify | I-6 |
| `lib/auth.ts` | Modify | I-15 |
| `lib/channels/square/webhook.ts` | Modify | I-12 |
| `app/api/admin/newsletter/[id]/route.ts` | Modify | I-3 |
| `app/api/analytics/track/route.ts` | Modify | I-5 |
| `next.config.js` | Modify | I-9 |
| `middleware.ts` | Create | I-2 |
| `__tests__/lib/get-client-ip.test.ts` | Create | C-2 |
| `__tests__/api/newsletter/webhook-auth.test.ts` | Create | C-3 |
| `__tests__/api/gallery/image-ssrf.test.ts` | Create | C-1 |

---

## Task 1: Create `lib/get-client-ip.ts` and update all call sites

**Addresses:** C-2 (X-Forwarded-For spoofable — all rate limiters defeated)

On Vercel, `x-real-ip` is set by Vercel's edge infrastructure and cannot be spoofed by the client. `x-forwarded-for` leftmost entry is set by the client and is trivially spoofable. All 16 routes must use the shared utility.

**Files:**
- Create: `lib/get-client-ip.ts`
- Create: `__tests__/lib/get-client-ip.test.ts`
- Modify: all 16 route files with `x-forwarded-for` (listed in section above)

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/get-client-ip.test.ts
import { getClientIp } from '@/lib/get-client-ip'

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/', { headers })
}

describe('getClientIp', () => {
  it('prefers x-real-ip over x-forwarded-for', () => {
    const req = makeRequest({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9, 8.8.8.8' })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('uses rightmost x-forwarded-for entry when x-real-ip absent', () => {
    // Rightmost = set by infrastructure, not the client
    const req = makeRequest({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' })
    expect(getClientIp(req)).toBe('3.3.3.3')
  })

  it('falls back to unknown when no headers', () => {
    const req = makeRequest({})
    expect(getClientIp(req)).toBe('unknown')
  })

  it('trims whitespace', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.1.1.1 , 2.2.2.2 ' })
    expect(getClientIp(req)).toBe('2.2.2.2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/get-client-ip.test.ts --no-coverage
```

Expected: `Cannot find module '@/lib/get-client-ip'`

- [ ] **Step 3: Create the utility**

```typescript
// lib/get-client-ip.ts

/**
 * Extract the true client IP from a request.
 *
 * On Vercel, x-real-ip is set by the edge infrastructure and cannot be spoofed.
 * When absent (local dev, other platforms), we take the rightmost x-forwarded-for
 * entry — the one added by the nearest trusted proxy, not the client.
 *
 * NEVER take the leftmost x-forwarded-for value: it is set by the client.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip')?.trim() ??
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
    'unknown'
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/lib/get-client-ip.test.ts --no-coverage
```

Expected: 4 passing

- [ ] **Step 5: Update all route files — replace the IP extraction one-liner**

In every file listed below, replace the `x-forwarded-for` line with the shared utility. Import `getClientIp` at the top of each file.

**Pattern to find and replace in each file:**

Old (varies slightly):
```typescript
request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
// or
(request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
// or
request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
```

New (identical in all files):
```typescript
import { getClientIp } from '@/lib/get-client-ip'
// ...
const ip = getClientIp(request)
```

Files to update (16 total):
- `app/api/analytics/track/route.ts` — line 27
- `app/api/contact/route.ts` — line 25
- `app/api/gallery/image/route.ts` — line 30
- `app/api/newsletter/subscribe/route.ts` — line 25
- `app/api/newsletter/unsubscribe/route.ts` — line 7
- `app/api/newsletter/webhook/route.ts` — line 10
- `app/api/search/route.ts`
- `app/api/shop/categories/route.ts`
- `app/api/shop/checkout/route.ts` — line 22
- `app/api/shop/private-sale/[token]/checkout/route.ts` — line 19
- `app/api/shop/private-sale/[token]/route.ts`
- `app/api/shop/products/route.ts`
- `app/api/shop/products/[id]/view/route.ts`
- `app/api/shop/shipping-config/route.ts`
- `app/api/webhooks/resend-inbound/route.ts`
- `app/api/webhooks/square/route.ts` — line 8

- [ ] **Step 6: Run all tests**

```bash
bash scripts/test.sh
```

Expected: all existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add lib/get-client-ip.ts __tests__/lib/get-client-ip.test.ts \
  app/api/analytics/track/route.ts app/api/contact/route.ts \
  app/api/gallery/image/route.ts app/api/newsletter/subscribe/route.ts \
  app/api/newsletter/unsubscribe/route.ts app/api/newsletter/webhook/route.ts \
  app/api/search/route.ts app/api/shop/categories/route.ts \
  app/api/shop/checkout/route.ts "app/api/shop/private-sale/[token]/checkout/route.ts" \
  "app/api/shop/private-sale/[token]/route.ts" app/api/shop/products/route.ts \
  "app/api/shop/products/[id]/view/route.ts" app/api/shop/shipping-config/route.ts \
  app/api/webhooks/resend-inbound/route.ts app/api/webhooks/square/route.ts
git commit -m "fix(security): use x-real-ip for rate limiting — x-forwarded-for is client-spoofable"
```

---

## Task 2: Fix Resend newsletter webhook — require signature always

**Addresses:** C-3 (unauthenticated callers can forge bounce events)

The current code processes webhook events without verification when `RESEND_WEBHOOK_SECRET` is not set. A missing secret should be a misconfiguration error, not a bypass. The inbound Resend webhook already does this correctly — align newsletter webhook to the same pattern.

**Files:**
- Modify: `app/api/newsletter/webhook/route.ts`
- Create: `__tests__/api/newsletter/webhook-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/newsletter/webhook-auth.test.ts
// Tests that the newsletter webhook rejects requests when secret is unconfigured or signature is wrong

describe('newsletter webhook authentication', () => {
  const originalEnv = process.env.RESEND_WEBHOOK_SECRET

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = originalEnv
  })

  it('returns 500 when RESEND_WEBHOOK_SECRET is not set', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    const { POST } = await import('@/app/api/newsletter/webhook/route')
    const req = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('returns 401 when signature is invalid', async () => {
    process.env.RESEND_WEBHOOK_SECRET = 'test-secret'
    // Reset module cache so new env takes effect
    jest.resetModules()
    const { POST } = await import('@/app/api/newsletter/webhook/route')
    const req = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      headers: { 'svix-signature': 't=12345,v1=badsignature' },
      body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/api/newsletter/webhook-auth.test.ts --no-coverage
```

Expected: first test fails (currently returns 200 instead of 500)

- [ ] **Step 3: Edit `app/api/newsletter/webhook/route.ts`**

Replace lines 25-63 (the `if (webhookSecret) { ... }` block and the unauthenticated fallback below it) with:

```typescript
  // HMAC signature validation — required, no unauthenticated fallback
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[newsletter-webhook] RESEND_WEBHOOK_SECRET is not configured — rejecting all requests')
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 })
  }

  const svixHeader = request.headers.get('svix-signature') ?? request.headers.get('resend-signature') ?? ''
  const rawBody = await request.text()

  const parts = Object.fromEntries(svixHeader.split(',').map((p) => p.split('=', 2) as [string, string]))
  const timestamp = parts['t'] ?? ''
  const receivedSig = parts['v1'] ?? ''

  let valid = false
  if (timestamp && receivedSig) {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')
    try {
      const a = Buffer.from(receivedSig, 'utf8')
      const b = Buffer.from(expected, 'utf8')
      valid = a.length === b.length && crypto.timingSafeEqual(a, b)
    } catch {
      valid = false
    }
  }
  if (!valid) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  return handleEvent(body)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/api/newsletter/webhook-auth.test.ts --no-coverage
```

Expected: both tests pass

- [ ] **Step 5: Run all tests**

```bash
bash scripts/test.sh
```

Expected: all pass (the existing `__tests__/api/newsletter/webhook.test.ts` may need `RESEND_WEBHOOK_SECRET` set in its mock setup — check and update if needed)

- [ ] **Step 6: Commit**

```bash
git add app/api/newsletter/webhook/route.ts __tests__/api/newsletter/webhook-auth.test.ts
git commit -m "fix(security): require Resend webhook signature — remove unauthenticated fallback"
```

---

## Task 3: Fix image proxy SSRF — domain allowlist + Content-Type

**Addresses:** C-1 (image proxy SSRF — no domain allowlist)

`isValidHttpsUrl` only checks the scheme. Any HTTPS URL is accepted, including AWS instance metadata, internal endpoints, or attacker servers. Additionally, the upstream server's `Content-Type` is echoed back when watermark is disabled — an attacker-controlled server could serve `text/html` with XSS.

**Files:**
- Modify: `app/api/gallery/image/route.ts`
- Create: `__tests__/api/gallery/image-ssrf.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/gallery/image-ssrf.test.ts
// Note: This test mocks the isValidHttpsUrl check and verifies domain allowlist

describe('gallery image proxy SSRF protection', () => {
  it('rejects non-supabase URLs', async () => {
    const { GET } = await import('@/app/api/gallery/image/route')
    const req = new Request('http://localhost/api/gallery/image?url=https://169.254.169.254/latest/meta-data/')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not allowed/i)
  })

  it('rejects attacker-controlled domains', async () => {
    const { GET } = await import('@/app/api/gallery/image/route')
    const req = new Request('http://localhost/api/gallery/image?url=https://evil.com/malware.jpg')
    const res = await GET(req as any)
    expect(res.status).toBe(400)
  })

  it('accepts supabase.co subdomains', async () => {
    // This test would need fetch mocking to go further — just verifying it passes the allowlist check
    // The function will then try to fetch, which will fail in test env (acceptable)
    const { isImageUrlAllowed } = await import('@/app/api/gallery/image/route')
    expect(isImageUrlAllowed('https://abc123.supabase.co/storage/v1/object/public/gallery/img.jpg')).toBe(true)
  })

  it('rejects supabase.co lookalikes', async () => {
    const { isImageUrlAllowed } = await import('@/app/api/gallery/image/route')
    expect(isImageUrlAllowed('https://evil-supabase.co/image.jpg')).toBe(false)
    expect(isImageUrlAllowed('https://supabase.co.evil.com/image.jpg')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/api/gallery/image-ssrf.test.ts --no-coverage
```

Expected: all tests fail (no `isImageUrlAllowed` export, no domain check)

- [ ] **Step 3: Edit `app/api/gallery/image/route.ts`**

Add the domain allowlist function (exported for testing) and the allowlist check. Also fix the Content-Type passthrough in both return paths.

After the imports, add:

```typescript
// Allowlist of permitted image source hostnames.
// Only Supabase storage subdomains are permitted.
// Pattern: <project-ref>.supabase.co (any subdomain of supabase.co)
const ALLOWED_HOSTNAME_RE = /^[a-z0-9-]+\.supabase\.co$/i

export function isImageUrlAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_HOSTNAME_RE.test(hostname)
  } catch {
    return false
  }
}
```

Then in the `GET` handler, replace the current URL validation:

```typescript
// Old:
if (!url || !isValidHttpsUrl(url)) {
  return NextResponse.json({ error: 'Valid image URL required' }, { status: 400 })
}

// New:
if (!url || !isValidHttpsUrl(url) || !isImageUrlAllowed(url)) {
  return NextResponse.json({ error: 'Image URL not allowed' }, { status: 400 })
}
```

Fix the Content-Type passthrough in the no-watermark path (line ~63):

```typescript
// Old:
'Content-Type': imageRes.headers.get('content-type') || 'image/jpeg',

// New (always use a fixed image type, never trust upstream Content-Type):
'Content-Type': 'image/jpeg',
```

Fix the error fallback Content-Type too (line ~153):

```typescript
// Old:
'Content-Type': imageRes.headers.get('content-type') || 'image/jpeg',

// New:
'Content-Type': 'image/jpeg',
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/api/gallery/image-ssrf.test.ts --no-coverage
```

Expected: all 4 tests pass

- [ ] **Step 5: Run all tests**

```bash
bash scripts/test.sh
```

- [ ] **Step 6: Commit**

```bash
git add app/api/gallery/image/route.ts __tests__/api/gallery/image-ssrf.test.ts
git commit -m "fix(security): add domain allowlist to image proxy + fix Content-Type passthrough (SSRF)"
```

---

## Task 4: OAuth CSRF — add state parameter to Square and Pinterest flows

**Addresses:** C-6 (OAuth CSRF — state parameter missing from Square and Pinterest flows), I-11 (Pinterest silent success when no settings row), I-17 (Square callback debug logs)

Without a `state` parameter, an attacker can complete an OAuth flow using their own credentials and overwrite the store's channel tokens. Fix: generate a random `state` in `connect`, store in a short-lived signed cookie, verify in `callback`.

**Files:**
- Modify: `app/api/admin/channels/square/connect/route.ts`
- Modify: `app/api/admin/channels/square/callback/route.ts`
- Modify: `app/api/admin/channels/pinterest/connect/route.ts`
- Modify: `app/api/admin/channels/pinterest/callback/route.ts`

Note: No isolated test is written for this because testing OAuth flows requires mocking external redirects — manual QA of the connect flow is required after this change. The state cookie mechanism is simple enough to verify by inspection.

- [ ] **Step 1: Update `app/api/admin/channels/square/connect/route.ts`**

Add `crypto` import and state generation. The `state` is stored in a `__Host-` prefixed cookie for CSRF protection (the `__Host-` prefix requires `Secure`, `Path=/`, and no `Domain` attribute, preventing subdomain attacks).

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('square_application_id, square_environment')
    .limit(1)
    .maybeSingle()

  const appId = settings?.square_application_id ?? process.env.SQUARE_APPLICATION_ID
  const environment = settings?.square_environment ?? process.env.SQUARE_ENVIRONMENT

  if (!appId) return NextResponse.json({ error: 'Square not configured' }, { status: 500 })

  const baseUrl = environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const redirectUri = `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/api/admin/channels/square/callback`
  const scope = [
    'MERCHANT_PROFILE_READ', 'ITEMS_READ', 'ITEMS_WRITE',
    'INVENTORY_READ', 'INVENTORY_WRITE',
    'ORDERS_READ', 'ORDERS_WRITE',
    'PAYMENTS_READ', 'PAYMENTS_WRITE',
  ].join(' ')

  const state = crypto.randomUUID()

  const url = new URL(`${baseUrl}/oauth2/authorize`)
  url.searchParams.set('client_id', appId as string)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scope)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('session', 'false')
  url.searchParams.set('state', state)

  const response = NextResponse.redirect(url.toString())
  // Store state in a short-lived HttpOnly Secure cookie for CSRF verification in the callback
  response.cookies.set('__Host-square_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  })
  return response
}
```

- [ ] **Step 2: Update `app/api/admin/channels/square/callback/route.ts`**

Add state verification, remove all `console.log` calls, and replace the error detail in the redirect URL with a generic message.

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken, decryptValue } from '@/lib/crypto'
import { SquareClient, SquareEnvironment } from 'square'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')

  // Verify CSRF state
  const cookies = request.headers.get('cookie') ?? ''
  const stateCookie = cookies
    .split(';')
    .map(c => c.trim().split('=', 2))
    .find(([k]) => k === '__Host-square_oauth_state')?.[1]

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=square_csrf`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=square_denied`
    )
  }

  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('id, square_application_id, square_application_secret, square_environment')
    .limit(1)
    .maybeSingle()

  const appId = settings?.square_application_id ?? process.env.SQUARE_APPLICATION_ID
  const rawSecret = settings?.square_application_secret
  const appSecret = rawSecret ? decryptValue(rawSecret) : (process.env.SQUARE_APPLICATION_SECRET ?? '')
  const environment = settings?.square_environment ?? process.env.SQUARE_ENVIRONMENT

  const baseUrl = environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const tokenRes = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/api/admin/channels/square/callback`,
    }),
  })

  if (!tokenRes.ok) {
    const tokenErr = await tokenRes.json().catch(() => ({}))
    console.error('[square/callback] token exchange failed:', tokenRes.status, JSON.stringify(tokenErr))
    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/admin/channels?error=square_token`
    )
  }

  const tokens = await tokenRes.json()

  const client = new SquareClient({
    token: tokens.access_token,
    environment: environment === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
  })

  let locationId = ''
  try {
    const locResult = await client.locations.list()
    locationId = locResult.locations?.[0]?.id ?? ''
  } catch (e) {
    console.error('[square/callback] location fetch failed:', e)
    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/admin/channels?error=square_location`
    )
  }

  const { error: dbError } = await supabase.from('settings').update({
    square_access_token: encryptToken(tokens.access_token),
    square_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    square_location_id: locationId,
  }).eq('id', settings!.id)

  if (dbError) {
    console.error('[square/callback] db update failed:', dbError.code)
  }

  const response = NextResponse.redirect(
    `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/admin/channels?connected=square`
  )
  // Clear the state cookie
  response.cookies.set('__Host-square_oauth_state', '', { maxAge: 0, path: '/', secure: true })
  return response
}
```

- [ ] **Step 3: Update `app/api/admin/channels/pinterest/connect/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import crypto from 'crypto'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const appId = process.env.PINTEREST_APP_ID
  if (!appId) return NextResponse.json({ error: 'Pinterest not configured' }, { status: 500 })

  const state = crypto.randomUUID()
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/pinterest/callback`
  const url = new URL('https://www.pinterest.com/oauth/')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'ads:read,catalogs:read,catalogs:write')
  url.searchParams.set('state', state)

  const response = NextResponse.redirect(url.toString())
  response.cookies.set('__Host-pinterest_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
```

- [ ] **Step 4: Update `app/api/admin/channels/pinterest/callback/route.ts`**

Also fixes I-11 (silent success when no settings row).

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')

  // Verify CSRF state
  const cookies = request.headers.get('cookie') ?? ''
  const stateCookie = cookies
    .split(';')
    .map(c => c.trim().split('=', 2))
    .find(([k]) => k === '__Host-pinterest_oauth_state')?.[1]

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_csrf`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_denied`
    )
  }

  const credentials = Buffer.from(
    `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/pinterest/callback`,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[pinterest/callback] token exchange failed:', tokenRes.status)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_token`
    )
  }

  const tokens = await tokenRes.json()
  const supabase = createServiceRoleClient()
  const { data: row } = await supabase.from('settings').select('id').limit(1).maybeSingle()

  if (!row) {
    console.error('[pinterest/callback] no settings row found — tokens not stored')
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_no_settings`
    )
  }

  const { error: dbError } = await supabase.from('settings').update({
    pinterest_access_token: encryptToken(tokens.access_token),
    pinterest_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
  }).eq('id', row.id)

  if (dbError) {
    console.error('[pinterest/callback] db update failed:', dbError.code)
  }

  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?connected=pinterest`
  )
  response.cookies.set('__Host-pinterest_oauth_state', '', { maxAge: 0, path: '/', secure: true })
  return response
}
```

- [ ] **Step 5: Run all tests**

```bash
bash scripts/test.sh
```

Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add \
  app/api/admin/channels/square/connect/route.ts \
  app/api/admin/channels/square/callback/route.ts \
  app/api/admin/channels/pinterest/connect/route.ts \
  app/api/admin/channels/pinterest/callback/route.ts
git commit -m "fix(security): add OAuth CSRF state parameter to Square and Pinterest flows"
```

---

## Task 5: Checkout security hardening — 3DS enforcement, idempotency, error detail

**Addresses:** C-4 (3DS/SCA bypass), I-8 (weak idempotency keys), I-13 (Square error detail in response body)

Both checkout routes accept payment without a `verificationToken`. A direct API caller can bypass 3DS entirely. Additionally, idempotency keys use the last 12 chars of the nonce (collision risk), and Square internal `detail` strings are returned to the browser.

**Files:**
- Modify: `app/api/shop/checkout/route.ts`
- Modify: `app/api/shop/private-sale/[token]/checkout/route.ts`

Note: Task 6 restructures checkout order (decrement-before-charge), so apply Task 5 changes carefully — they will be integrated together in the checkout route. To avoid conflicts, complete Task 5 changes to private-sale checkout only, then do Task 6 for public checkout.

- [ ] **Step 1: Update `app/api/shop/private-sale/[token]/checkout/route.ts`**

Three changes:
1. **Require `verificationToken`** — return 400 if absent
2. **Use `crypto.randomUUID()` for idempotency** — replace `sourceId.slice(-12)`
3. **Remove `detail` from error responses** — only return `{ error: message }`

Add `crypto` import at the top:
```typescript
import crypto from 'crypto'
```

After `sourceId` is validated, add the verificationToken check:
```typescript
// Require 3DS buyer verification — do not process payments without it
if (!verificationToken) {
  return NextResponse.json({ error: 'Buyer verification required.' }, { status: 400 })
}
```

Generate idempotency key once for the whole checkout attempt:
```typescript
const idem = crypto.randomUUID()
```

Replace all `sourceId.slice(-12)` idempotency usages:
```typescript
// Old:
idempotencyKey: `order-${sale.id}-${sourceId.slice(-12)}`,
// ...
idempotencyKey: `pay-${sale.id}-${sourceId.slice(-12)}`,

// New:
idempotencyKey: `order-${idem}`,
// ...
idempotencyKey: `pay-${idem}`,
```

Remove `detail` from both error responses:
```typescript
// Old:
return NextResponse.json({ error: message, detail }, { status: 402 })

// New (in both places):
console.error('[private-sale checkout] Square error detail:', detail)
return NextResponse.json({ error: message }, { status: 402 })
```

- [ ] **Step 2: Run private-sale checkout tests**

```bash
npx jest __tests__/api/shop/private-sale-checkout.test.ts --no-coverage
```

Expected: all pass (tests that didn't send verificationToken will need to be updated to include it)

Update any test that sends a checkout request without `verificationToken` to include `verificationToken: 'test-token'` in the body.

- [ ] **Step 3: Run all tests**

```bash
bash scripts/test.sh
```

- [ ] **Step 4: Commit**

```bash
git add "app/api/shop/private-sale/[token]/checkout/route.ts" __tests__/api/shop/private-sale-checkout.test.ts
git commit -m "fix(security): require verificationToken in private-sale checkout + secure idempotency keys"
```

---

## Task 6: Restructure public checkout — decrement stock before charging

**Addresses:** C-5 (charge-before-decrement creates double-charge window)

Currently: SELECT → charge card → decrement. A concurrent request can pass the SELECT, charge the customer, then find stock is gone. Fix: decrement first (atomic) → if sold out return 409 immediately → charge → if charge fails, re-increment and return 402.

Also applies 3DS enforcement, idempotency UUID, and error detail removal (same as Task 5) to the public checkout.

**Files:**
- Modify: `app/api/shop/checkout/route.ts`

- [ ] **Step 1: Rewrite `app/api/shop/checkout/route.ts`**

The new file is a drop-in replacement of the same interface. The key structural change: `decrement_stock` is called before `client.payments.create`. If decrement returns no rows (sold out), we return 409 immediately without touching Square. If the Square charge fails, we re-increment all decremented stock.

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSquareClient } from '@/lib/channels/square/client'
import { pushInventoryToSquare } from '@/lib/channels/square/catalog'
import { calculateShipping } from '@/lib/shipping'
import { sanitizeText } from '@/lib/sanitize'
import type { ShippingAddress } from '@/lib/supabase/types'
import { squarePaymentError } from '@/lib/square/payment-errors'
import { getClientIp } from '@/lib/get-client-ip'
import crypto from 'crypto'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 10
}

interface LineItem { productId: string; quantity: number }

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const cart: LineItem[] = Array.isArray(body.cart) ? body.cart : []
  const sourceId: string = typeof body.sourceId === 'string' ? body.sourceId : ''
  const verificationToken: string | undefined = typeof body.verificationToken === 'string' ? body.verificationToken : undefined

  if (!cart.length) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 })

  // Require 3DS buyer verification — do not process payments without it
  if (!verificationToken) {
    return NextResponse.json({ error: 'Buyer verification required.' }, { status: 400 })
  }

  const shipping: ShippingAddress | null = body.shipping && typeof body.shipping === 'object' ? body.shipping as ShippingAddress : null
  const requiredFields: (keyof ShippingAddress)[] = ['name', 'address1', 'city', 'state', 'zip', 'country']
  if (!shipping || requiredFields.some(f => !shipping[f])) {
    return NextResponse.json({ error: 'Shipping address required' }, { status: 400 })
  }
  const cleanShipping: ShippingAddress = {
    name:     sanitizeText(shipping.name).slice(0, 100),
    address1: sanitizeText(shipping.address1).slice(0, 200),
    address2: shipping.address2 ? sanitizeText(shipping.address2).slice(0, 200) : undefined,
    city:     sanitizeText(shipping.city).slice(0, 100),
    state:    sanitizeText(shipping.state).slice(0, 100),
    zip:      sanitizeText(shipping.zip).slice(0, 20),
    country:  sanitizeText(shipping.country).slice(0, 10),
  }

  const supabase = createServiceRoleClient()

  // Step 1: Fetch product data + shipping settings (prices only — no stock check here)
  const [{ data: products }, { data: settingsRow }] = await Promise.all([
    supabase.from('products').select('id,name,price,stock_count,stock_reserved,square_variation_id').in('id', cart.map(i => i.productId)),
    supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle(),
  ])
  if (!products) return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })
  for (const item of cart) {
    if (!products.find(p => p.id === item.productId)) {
      return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 409 })
    }
  }

  const subtotal = cart.reduce((sum, item) => {
    const p = products.find(p => p.id === item.productId)!
    return sum + p.price * item.quantity
  }, 0)
  const shippingCost = calculateShipping(subtotal, settingsRow ?? { shipping_mode: 'fixed', shipping_value: 0 })
  const shippingCents = Math.round(shippingCost * 100)
  const totalCents = Math.round(subtotal * 100) + shippingCents

  // Step 2: Atomically decrement stock BEFORE charging the card.
  // This prevents the double-charge race: if two requests for the last unit both
  // pass a non-locking SELECT check, only one will succeed the atomic UPDATE.
  const decremented: LineItem[] = []
  for (const item of cart) {
    const { data: rows, error: rpcError } = await supabase.rpc('decrement_stock', { product_id: item.productId, qty: item.quantity })
    if (rpcError) {
      console.error('[checkout] decrement_stock error:', rpcError.message)
      for (const done of decremented) {
        await supabase.rpc('increment_stock', { product_id: done.productId, qty: done.quantity })
          .then(({ error }) => { if (error) console.error('[checkout] increment_stock rollback failed for', done.productId) })
      }
      return NextResponse.json({ error: 'Failed to reserve stock. Please try again.' }, { status: 500 })
    }
    if (Array.isArray(rows) && rows.length === 0) {
      const p = products.find(p => p.id === item.productId)!
      for (const done of decremented) {
        await supabase.rpc('increment_stock', { product_id: done.productId, qty: done.quantity })
          .then(({ error }) => { if (error) console.error('[checkout] increment_stock rollback failed for', done.productId) })
      }
      return NextResponse.json({ error: `${p.name} is sold out`, soldOut: item.productId }, { status: 409 })
    }
    decremented.push(item)
  }

  // Step 3: Charge card (stock is now reserved — no double-charge risk)
  // Use a server-generated UUID for idempotency (not client-supplied nonce suffix)
  const idem = crypto.randomUUID()
  let orderId = ''
  let paymentId = ''
  try {
    const { client, locationId } = await getSquareClient()

    const orderResult = await client.orders.create({
      order: {
        locationId,
        lineItems: [
          ...cart.map(item => {
            const p = products.find(p => p.id === item.productId)!
            return { name: p.name, quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round(p.price * 100)), currency: 'USD' as const } }
          }),
          ...(shippingCents > 0 ? [{ name: 'Shipping & Handling', quantity: '1', basePriceMoney: { amount: BigInt(shippingCents), currency: 'USD' as const } }] : []),
        ],
        fulfillments: [{
          type: 'SHIPMENT',
          state: 'PROPOSED',
          shipmentDetails: {
            recipient: {
              displayName: cleanShipping.name,
              address: {
                addressLine1: cleanShipping.address1,
                addressLine2: cleanShipping.address2 || undefined,
                locality: cleanShipping.city,
                administrativeDistrictLevel1: cleanShipping.state,
                postalCode: cleanShipping.zip,
                country: cleanShipping.country as 'US',
              },
            },
          },
        }],
      },
      idempotencyKey: `order-${idem}`,
    })
    orderId = orderResult.order?.id ?? ''
    if (!orderId) throw new Error('Square order created but returned no ID')

    const paymentResult = await client.payments.create({
      sourceId, orderId, locationId,
      amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
      idempotencyKey: `pay-${idem}`,
      verificationToken,
    })
    paymentId = paymentResult.payment?.id ?? ''
  } catch (err) {
    // Charge failed — re-increment all decremented stock
    for (const done of decremented) {
      await supabase.rpc('increment_stock', { product_id: done.productId, qty: done.quantity })
        .then(({ error }) => { if (error) console.error('[checkout] increment_stock rollback failed for', done.productId) })
    }
    const { message, detail } = squarePaymentError(err)
    console.error('[checkout] Square error detail:', detail)
    return NextResponse.json({ error: message }, { status: 402 })
  }

  // Step 4: Fire-and-forget push to Square inventory (non-blocking)
  const squareItems = decremented
    .map(item => {
      const p = products.find(p => p.id === item.productId)
      return p?.square_variation_id
        ? { squareVariationId: p.square_variation_id, quantity: item.quantity }
        : null
    })
    .filter((x): x is { squareVariationId: string; quantity: number } => x !== null)
  if (squareItems.length > 0) {
    pushInventoryToSquare(squareItems).catch(err =>
      console.error('Square inventory push failed (non-blocking):', err)
    )
  }

  return NextResponse.json({ orderId, paymentId })
}
```

- [ ] **Step 2: Run checkout tests**

```bash
npx jest __tests__/api/shop/checkout.test.ts --no-coverage
```

Update any test that does not pass `verificationToken` to include it. Update tests that expected `detail` in error response bodies to not expect it.

- [ ] **Step 3: Run all tests**

```bash
bash scripts/test.sh
```

- [ ] **Step 4: Commit**

```bash
git add app/api/shop/checkout/route.ts __tests__/api/shop/checkout.test.ts
git commit -m "fix(security): decrement stock before charge in public checkout — prevents double-charge race"
```

---

## Task 7: Security hardening batch

**Addresses:** I-1, I-3, I-4, I-5, I-6, I-7, I-9, I-10, I-12, I-14, I-15

One commit per sub-item to keep diffs reviewable.

### 7a — HSTS header (I-9)

**File:** `next.config.js`

In the `headers` array, add after the `Permissions-Policy` entry:

```javascript
{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
```

- [ ] **Commit:**
```bash
git add next.config.js
git commit -m "fix(security): add HSTS header (Strict-Transport-Security)"
```

### 7b — CORS credentials conditional (I-4)

**File:** `lib/cors.ts`

`Allow-Credentials: true` should only be set when an origin is actually being allowed.

```typescript
export function corsHeaders(requestOrigin?: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  }

  if (APP_URL) {
    const origin = requestOrigin ?? ''
    if (origin === APP_URL) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Access-Control-Allow-Credentials'] = 'true'
    }
  }

  return headers
}
```

Note: `DELETE` removed from `Allow-Methods` (no route uses CORS + DELETE). `Allow-Credentials` is now only set when an origin match is confirmed.

- [ ] **Run tests, then commit:**
```bash
bash scripts/test.sh
git add lib/cors.ts
git commit -m "fix(security): only send Allow-Credentials when origin is actually allowed"
```

### 7c — `decryptValue` returns empty string on failure (I-6)

**File:** `lib/crypto.ts`, lines 60-63

```typescript
  } catch {
    console.error('[crypto] decryptValue failed — returning empty string')
    return ''
  }
```

This prevents callers from receiving ciphertext strings (`enc:...`) as if they were valid API keys/emails.

- [ ] **Run tests, then commit:**
```bash
bash scripts/test.sh
git add lib/crypto.ts
git commit -m "fix(security): return empty string (not ciphertext) when decryptValue fails"
```

### 7d — `ADMIN_EMAILS` filter empty strings (I-15)

**File:** `lib/auth.ts`, line 16

```typescript
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)

  if (!adminEmails.length) {
    console.error('[auth] ADMIN_EMAILS is not configured — all admin access denied')
  }
```

- [ ] **Run tests, then commit:**
```bash
bash scripts/test.sh
git add lib/auth.ts
git commit -m "fix(security): filter empty strings from ADMIN_EMAILS + warn when unconfigured"
```

### 7e — Newsletter PUT sanitize plain-text fields (I-3)

**File:** `app/api/admin/newsletter/[id]/route.ts`

Add `sanitizeText` import (it's already imported from `@/lib/sanitize`). After the `updates` object is built, add sanitization before the existing validation block:

```typescript
  // Sanitize plain-text string fields
  const textFields = ['title', 'subject_line', 'teaser_text', 'tone', 'ai_brief'] as const
  for (const field of textFields) {
    if (typeof updates[field] === 'string') {
      updates[field] = sanitizeText(updates[field] as string)
    }
  }

  // Validate slug format
  if (typeof updates.slug === 'string' && !/^[a-z0-9-]+$/.test(updates.slug)) {
    return NextResponse.json({ error: 'slug must contain only lowercase letters, numbers, and hyphens.' }, { status: 400 })
  }
```

Place this block before the `if (updates.hero_image_url ...` validation.

- [ ] **Run tests, then commit:**
```bash
bash scripts/test.sh
git add "app/api/admin/newsletter/[id]/route.ts"
git commit -m "fix(security): sanitize plain-text fields in newsletter PUT + validate slug format"
```

### 7f — Analytics metadata size cap (I-5)

**File:** `app/api/analytics/track/route.ts`, line 56

```typescript
  // Cap metadata size and reject excessively large objects
  let metadata: Record<string, unknown> | null = null
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    const metaStr = JSON.stringify(body.metadata)
    if (metaStr.length <= 500) {
      metadata = body.metadata as Record<string, unknown>
    }
    // Silently drop metadata that exceeds the cap — don't error, just don't store it
  }
```

- [ ] **Run tests, then commit:**
```bash
bash scripts/test.sh
git add app/api/analytics/track/route.ts
git commit -m "fix(security): cap analytics metadata at 500 bytes to prevent DB abuse"
```

### 7g — Unsubscribe token format validation (I-10)

**File:** `app/api/newsletter/unsubscribe/route.ts`, after line 16

```typescript
  // Token is generated as encode(gen_random_bytes(24), 'hex') = 48-char hex string
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 400 })
  }
```

- [ ] **Run tests, then commit:**
```bash
bash scripts/test.sh
git add app/api/newsletter/unsubscribe/route.ts
git commit -m "fix(security): validate unsubscribe token format before DB query"
```

### 7h — Square webhook URL from env var (I-7)

**File:** `app/api/webhooks/square/route.ts`

Replace `request.url` with a configured env var to ensure HMAC verification uses the exact URL registered in Square's dashboard:

```typescript
  // Use the configured webhook URL for signature verification.
  // Square's HMAC is computed over notificationUrl + rawBody.
  // Using request.url risks internal/edge URL mismatch with the public URL Square signed against.
  const webhookUrl = process.env.SQUARE_WEBHOOK_URL ?? request.url
  if (!verifySquareSignature(webhookUrl, rawBody, signature, webhookKey)) {
```

Also add a warning when the env var is missing:

```typescript
  if (!process.env.SQUARE_WEBHOOK_URL) {
    console.warn('[square-webhook] SQUARE_WEBHOOK_URL not set — falling back to request.url for signature verification')
  }
```

- [ ] **Run tests, then commit:**
```bash
bash scripts/test.sh
git add app/api/webhooks/square/route.ts
git commit -m "fix(security): use SQUARE_WEBHOOK_URL env var for webhook signature verification"
```

### 7i — Inventory update range validation (I-12)

**File:** `lib/channels/square/webhook.ts`, in `handleInventoryUpdate`

```typescript
  for (const count of counts) {
    const qty = parseInt(count.quantity, 10)
    if (!Number.isFinite(qty) || qty < 0) {
      console.warn('[square-webhook] invalid inventory quantity, skipping:', count.quantity)
      continue
    }
    await supabase
      .from('products')
      .update({ stock_count: qty })
      .eq('square_variation_id', count.catalog_object_id)
  }
```

- [ ] **Run tests, then commit:**
```bash
bash scripts/test.sh
git add lib/channels/square/webhook.ts
git commit -m "fix(security): validate inventory quantity before DB update in Square webhook handler"
```

### 7k — Document `unsafe-inline` CSP trade-off (I-16)

**File:** `next.config.js`

`script-src 'unsafe-inline'` is required today because Next.js injects inline scripts for hydration, module preloading, and React server components. Removing it without a nonce infrastructure breaks the app. The proper fix is nonce-based CSP via middleware (Next.js 15 supports this), which is a multi-sprint effort outside the scope of this security sprint.

Action: add a comment to `next.config.js` documenting the trade-off so it is not silently skipped in future audits.

```javascript
// KNOWN TRADE-OFF (I-16): 'unsafe-inline' in script-src is required by Next.js
// for hydration and RSC payload scripts. This weakens XSS protection.
// Future work: migrate to nonce-based CSP via middleware.ts once all inline
// framework scripts support nonce injection (tracked in security backlog).
"script-src 'self' 'unsafe-inline' ...",
```

- [ ] **Add comment to `next.config.js`, then commit:**
```bash
git add next.config.js
git commit -m "docs(security): document unsafe-inline CSP trade-off and future nonce migration path"
```

---

### 7j — Add rate limiting to `products/[id]` endpoint (I-14)

**File:** `app/api/shop/products/[id]/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/get-client-ip'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 60
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(req)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('products').select('*').eq('id', id).eq('is_active', true).single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
```

- [ ] **Run tests, then commit:**
```bash
bash scripts/test.sh
git add "app/api/shop/products/[id]/route.ts"
git commit -m "fix(security): add rate limiting to /api/shop/products/[id] endpoint"
```

---

## Task 8: Admin route middleware defense-in-depth

**Addresses:** I-2 (no middleware-level admin route guard)

`middleware.ts` provides a network-level backstop for `/api/admin/*` routes. Even if a handler accidentally omits `requireAdminSession()`, the middleware will reject unauthenticated requests before the handler runs. This uses the Supabase SSR pattern with the anon key for cookie-based session checking in Edge Runtime.

Note: The ADMIN_EMAILS allowlist is enforced in `requireAdminSession()` inside each handler — the middleware only checks that a valid Supabase session exists (JWT verification). This is appropriate for the Edge Runtime where service role operations are impractical.

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  // Only guard admin API routes
  if (!request.nextUrl.pathname.startsWith('/api/admin/')) {
    return NextResponse.next()
  }

  // OAuth callbacks are initiated by external redirects — exclude them from the auth gate
  // (requireAdminSession inside each callback handler still applies)
  const isOAuthCallback =
    request.nextUrl.pathname.includes('/channels/square/callback') ||
    request.nextUrl.pathname.includes('/channels/pinterest/callback')

  if (isOAuthCallback) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  // Use anon key for session check — JWT verification and ADMIN_EMAILS check
  // happen inside requireAdminSession() in each handler. This is the fallback layer.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return response
}

export const config = {
  matcher: ['/api/admin/:path*'],
}
```

- [ ] **Step 2: Run all tests**

```bash
bash scripts/test.sh
```

If the existing `__tests__/middleware.test.ts` file tests middleware and now needs updating (since `middleware.ts` didn't exist before), update it to cover the new `/api/admin/*` behavior with mocked Supabase auth.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "fix(security): add middleware-level guard for /api/admin/* routes as defense-in-depth"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
bash scripts/test.sh
```

Expected: all tests pass

- [ ] **Run build to check for type errors**

```bash
bash scripts/build.sh
```

Expected: build succeeds with no type errors

- [ ] **Update the security review document**

Add a "Resolved" section to `docs/reviews/mar-23-security-review.md` noting that all Critical and Important issues from this plan are resolved, referencing the commit hashes.

- [ ] **Final commit**

```bash
git add docs/reviews/mar-23-security-review.md
git commit -m "docs: mark Critical and Important security issues as resolved"
```
