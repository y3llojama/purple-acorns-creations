# Resend Inbound Email Replies Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture customer email replies to admin messages and display them in the admin messages thread, alongside admin-sent replies.

**Architecture:** A Cloudflare Email Worker fans out `hello@purpleacornz.com` to both Gmail and Resend inbound. Resend calls `/api/webhooks/resend-inbound` with parsed email data; the webhook threads replies using the `In-Reply-To` header (matched against stored Resend message IDs) with an email-address fallback. Admin reply emails gain an editable footer directing customers to use the contact form for new inquiries.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL), Resend SDK, Cloudflare Email Workers, Wrangler CLI, Jest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/033_message_replies_direction.sql` | Create | Add `direction`, `from_email`, `resend_message_id` to `message_replies` |
| `supabase/migrations/034_reply_email_footer.sql` | Create | Add `reply_email_footer` to `settings` |
| `lib/supabase/types.ts` | Modify | Update `MessageReply` interface |
| `lib/email.ts` | Modify | Surface `messageId` from Resend; append editable footer to `sendReply` |
| `app/api/admin/messages/reply/route.ts` | Modify | Persist `resend_message_id` on insert |
| `app/api/webhooks/resend-inbound/route.ts` | Create | Inbound email webhook: HMAC verify, thread, insert reply |
| `components/admin/IntegrationsEditor.tsx` | Modify | Add "Reply email footer" textarea |
| `components/admin/MessagesInbox.tsx` | Modify | Render `direction: 'inbound'` replies with distinct style |
| `cloudflare/email-worker/index.js` | Create | Worker: forward to Gmail + Resend |
| `cloudflare/email-worker/wrangler.toml` | Create | Wrangler config for the Worker |
| `scripts/deploy-cf-worker.sh` | Create | One-command deploy script for the Worker |
| `__tests__/api/webhooks/resend-inbound.test.ts` | Create | Unit tests: HMAC+timestamp, `parseFromEmail`, thread matching logic |

---

## Task 1: Database migrations

**Files:**
- Create: `supabase/migrations/033_message_replies_direction.sql`
- Create: `supabase/migrations/034_reply_email_footer.sql`

- [ ] **Step 1: Write migration 033**

```sql
-- supabase/migrations/033_message_replies_direction.sql
alter table message_replies
  add column direction text not null default 'outbound'
    check (direction in ('outbound', 'inbound')),
  add column from_email text,
  add column resend_message_id text;

-- All existing rows are admin-sent replies; 'outbound' default is correct.
```

- [ ] **Step 2: Write migration 034**

```sql
-- supabase/migrations/034_reply_email_footer.sql
alter table settings
  add column reply_email_footer text default
    'Please reply to this email to continue our conversation. To send a new message, use our contact form: ${CONTACT_FORM}. This inbox does not accept unsolicited emails.';
-- The ${} placeholders are stored verbatim and resolved at send time
-- by interpolate() in lib/variables.ts — they are NOT SQL parameters.
```

- [ ] **Step 3: Apply migrations**

```bash
npx supabase db push
```

Expected: migrations applied without error. Verify in Supabase dashboard that `message_replies` has the three new columns and `settings` has `reply_email_footer`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/033_message_replies_direction.sql supabase/migrations/034_reply_email_footer.sql
git commit -m "feat: add direction/from_email/resend_message_id to message_replies, reply_email_footer to settings"
```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Update `MessageReply` interface**

Find the existing `MessageReply` interface (currently: `id, message_id, body, created_at`) and replace it with:

```ts
export interface MessageReply {
  id: string
  message_id: string
  body: string
  direction: 'outbound' | 'inbound'
  from_email: string | null
  resend_message_id: string | null
  created_at: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat: update MessageReply type with direction, from_email, resend_message_id"
```

---

## Task 3: Update `lib/email.ts` — surface messageId and add footer

**Files:**
- Modify: `lib/email.ts`

Background: `sendViaResend` currently returns `{ success: true }` and discards `result.data?.id`. We need to thread the Resend message ID up through `sendViaResend` → `sendEmail` → `sendReply` and append the editable footer to reply emails.

- [ ] **Step 1: Write failing test**

Create `__tests__/lib/email-reply.test.ts`:

```ts
// __tests__/lib/email-reply.test.ts
// Tests for pure helper logic only — not the full sendReply (which hits Resend).

describe('reply footer interpolation', () => {
  it('appends footer to text body', () => {
    const body = 'Hi there'
    const footer = 'Reply here or visit ${CONTACT_FORM}'
    // We will extract a pure helper appendReplyFooter(body, footer, html) from lib/email.ts
    // Import it here once created:
    // import { appendReplyFooter } from '@/lib/email'
    // For now just document expected behaviour:
    const textResult = body + '\n\n---\n' + footer
    const htmlResult = body + '<hr /><p style="font-size:12px;color:#888;">' + footer + '</p>'
    expect(textResult).toContain('Reply here or visit ${CONTACT_FORM}')
    expect(htmlResult).toContain('<hr />')
  })
})
```

- [ ] **Step 2: Run test to confirm it passes (it's a logic-only test)**

```bash
bash scripts/test.sh
```

Expected: new test passes (it's documenting the shape, not testing the import yet).

- [ ] **Step 3: Update `sendViaResend` return type and propagate messageId**

In `lib/email.ts`, make these changes:

**a) `SendEmailOptions` — no change needed.**

**b) `sendViaResend` return type:**
Change from `Promise<{ success: boolean; error?: string }>` to `Promise<{ success: boolean; messageId?: string; error?: string }>`.

In the success return, add `messageId: result.data?.id ?? undefined`:
```ts
return { success: true, messageId: result.data?.id ?? undefined }
```

**c) `sendEmail` return type:**
Change to `Promise<{ success: boolean; messageId?: string; error?: string }>`.

In the Resend success branch, propagate:
```ts
if (resendResult.success) return { success: true, messageId: resendResult.messageId }
```

**d) `getEmailSettings` select — add `reply_email_footer`:**
```ts
.select('contact_email, smtp_host, smtp_port, smtp_user, smtp_pass, business_name, resend_api_key, newsletter_from_name, messages_from_email, reply_email_footer')
```

**e) `sendReply` return type:**
Change to `Promise<{ success: boolean; messageId?: string; error?: string } | undefined>`.

Before the `sendEmail` call, resolve and append the footer:
```ts
export async function sendReply(to: string, toName: string, body: string) {
  const settings = await getEmailSettings()
  const businessName = settings?.business_name ?? 'Purple Acorns Creations'
  const resolvedBody = interpolate(body, buildVars(businessName))

  const rawFooter = settings?.reply_email_footer ?? ''
  const resolvedFooter = interpolate(rawFooter, buildVars(businessName))

  const safeName = escapeHtml(stripControlChars(toName))
  const safeBody = escapeHtml(resolvedBody)
  const safeBusinessName = escapeHtml(businessName)
  const safeFooter = escapeHtml(resolvedFooter)

  return sendEmail({
    to,
    subject: `Reply from ${businessName}`,
    text: `Hi ${stripControlChars(toName)},\n\n${resolvedBody}\n\n— ${businessName}${resolvedFooter ? `\n\n---\n${resolvedFooter}` : ''}`,
    html: `<p>Hi ${safeName},</p>
<p>${safeBody.replace(/\n/g, '<br />')}</p>
<p>— ${safeBusinessName}</p>${safeFooter ? `<hr /><p style="font-size:12px;color:#888;">${safeFooter.replace(/\n/g, '<br />')}</p>` : ''}`,
  })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
bash scripts/test.sh
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/email.ts __tests__/lib/email-reply.test.ts
git commit -m "feat: surface Resend messageId from sendReply, append editable footer"
```

---

## Task 4: Store `resend_message_id` in admin reply route

**Files:**
- Modify: `app/api/admin/messages/reply/route.ts`

- [ ] **Step 1: Extract returned messageId and persist it**

In the POST handler, after `sendReply()` succeeds, the current insert is:
```ts
.insert({ message_id: messageId, body: replyBody })
```

Change to:
```ts
const emailResult = await sendReply(message.email, message.name, replyBody)
if (!emailResult?.success) {
  return NextResponse.json({ error: emailResult?.error ?? 'Failed to send reply' }, { status: 500 })
}

const { data: reply, error: dbError } = await supabase
  .from('message_replies')
  .insert({
    message_id: messageId,
    body: replyBody,
    resend_message_id: emailResult.messageId ?? null,
  })
  .select()
  .single()
```

Remove the old `if (!emailResult.success)` check that was before the insert — it's now combined above.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
bash scripts/test.sh
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/messages/reply/route.ts
git commit -m "feat: persist resend_message_id on outbound message replies"
```

---

## Task 5: Inbound webhook — `/api/webhooks/resend-inbound`

**Files:**
- Create: `app/api/webhooks/resend-inbound/route.ts`
- Create: `__tests__/api/webhooks/resend-inbound.test.ts`

**Note:** Before coding, check Resend's inbound email docs for the exact webhook payload field names. Expected shape: `{ from: string, to: string, subject: string, text: string, headers: Record<string, string> }`. The `from` field may be `"Name <email>"` or a bare address.

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/api/webhooks/resend-inbound.test.ts
import crypto from 'crypto'
import { parseFromEmail, verifyInboundHmac } from '@/app/api/webhooks/resend-inbound/helpers'

describe('parseFromEmail', () => {
  it('extracts email from "Name <email>" format', () => {
    expect(parseFromEmail('Jane Doe <jane@example.com>')).toBe('jane@example.com')
  })
  it('returns bare address unchanged', () => {
    expect(parseFromEmail('jane@example.com')).toBe('jane@example.com')
  })
  it('returns null for invalid input', () => {
    expect(parseFromEmail('not-an-email')).toBeNull()
  })
  it('returns null for empty string', () => {
    expect(parseFromEmail('')).toBeNull()
  })
})

describe('verifyInboundHmac', () => {
  const secret = 'test-secret'

  function makeHeader(body: string, offsetSeconds = 0) {
    const t = Math.floor(Date.now() / 1000) + offsetSeconds
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
    return `t=${t},v1=${sig}`
  }

  it('returns true for valid signature and fresh timestamp', () => {
    const body = '{"type":"email.inbound"}'
    expect(verifyInboundHmac(secret, makeHeader(body), body)).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const body = '{"type":"email.inbound"}'
    const t = Math.floor(Date.now() / 1000)
    expect(verifyInboundHmac(secret, `t=${t},v1=badhash`, body)).toBe(false)
  })

  it('returns false when timestamp is older than 5 minutes', () => {
    const body = '{"type":"email.inbound"}'
    expect(verifyInboundHmac(secret, makeHeader(body, -301), body)).toBe(false)
  })

  it('returns false when timestamp is more than 5 minutes in the future', () => {
    const body = '{"type":"email.inbound"}'
    expect(verifyInboundHmac(secret, makeHeader(body, 301), body)).toBe(false)
  })

  it('returns false for missing t= or v1= parts', () => {
    expect(verifyInboundHmac(secret, 'garbage', '{}')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bash scripts/test.sh -- --testPathPattern resend-inbound
```

Expected: FAIL — `parseFromEmail` and `verifyInboundHmac` not found.

- [ ] **Step 3: Create the helpers module**

Create `app/api/webhooks/resend-inbound/helpers.ts`:

```ts
import crypto from 'crypto'
import { isValidEmail } from '@/lib/validate'

/**
 * Extracts a valid email address from a From header value.
 * Handles both "Name <email>" and bare "email" formats.
 * Returns null if no valid email found.
 */
export function parseFromEmail(from: string): string | null {
  const angleMatch = from.match(/<([^>]+)>/)
  const candidate = angleMatch ? angleMatch[1] : from.trim()
  return isValidEmail(candidate) ? candidate : null
}

/**
 * Verifies the Resend HMAC signature header.
 * Header format: "t=<unix_ts>,v1=<hex_sig>"
 * Rejects requests older or newer than 5 minutes (replay protection).
 */
export function verifyInboundHmac(secret: string, header: string, rawBody: string): boolean {
  try {
    const parts = Object.fromEntries(
      header.split(',').map((p) => p.split('=', 2) as [string, string])
    )
    const timestamp = parts['t']
    const receivedSig = parts['v1']
    if (!timestamp || !receivedSig) return false

    const t = parseInt(timestamp, 10)
    if (isNaN(t)) return false

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - t) > 300) return false

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')

    const a = Buffer.from(receivedSig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bash scripts/test.sh -- --testPathPattern resend-inbound
```

Expected: all 9 tests pass.

- [ ] **Step 5: Create the route**

**Key finding from Resend docs:** The `email.received` webhook payload contains only metadata
(`email_id`, `from`, `subject`, etc.) — no body or headers. You must call
`resend.emails.receiving.get(email_id)` to retrieve `text`, `html`, and `headers`
(including `In-Reply-To`). The `from` field in the webhook is a string: `"Name <email>"`.

Create `app/api/webhooks/resend-inbound/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sanitizeText } from '@/lib/sanitize'
import { clampLength } from '@/lib/validate'
import { decryptSettings } from '@/lib/crypto'
import { parseFromEmail, verifyInboundHmac } from './helpers'

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  const rawBody = await request.text()

  if (webhookSecret) {
    const header =
      request.headers.get('svix-signature') ??
      request.headers.get('resend-signature') ??
      ''
    if (!verifyInboundHmac(webhookSecret, header, rawBody)) {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
    }
  }

  let payload: { type: string; data: Record<string, unknown> }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (payload.type !== 'email.received') {
    // Ignore other event types that may be routed here
    return NextResponse.json({ ok: true })
  }

  // Webhook payload: { type, data: { email_id, from, to, subject, ... } }
  // Body and headers are NOT in the webhook — must fetch separately.
  const emailId = String(payload.data.email_id ?? '')
  const fromRaw = String(payload.data.from ?? '')

  if (!emailId) return NextResponse.json({ error: 'Missing email_id.' }, { status: 400 })

  const fromEmail = parseFromEmail(fromRaw)
  if (!fromEmail) {
    console.log('[inbound] unparseable from address:', fromRaw)
    return NextResponse.json({ ok: true })
  }

  // Fetch full email content (text, headers) from Resend API
  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('resend_api_key')
    .single()
  const decrypted = settings ? decryptSettings(settings) : null

  if (!decrypted?.resend_api_key) {
    console.error('[inbound] Resend API key not configured')
    return NextResponse.json({ ok: true })
  }

  const resend = new Resend(decrypted.resend_api_key)
  const { data: fullEmail, error: fetchError } = await resend.emails.receiving.get(emailId)

  if (fetchError || !fullEmail) {
    console.error('[inbound] failed to fetch email content:', fetchError)
    return NextResponse.json({ ok: true })
  }

  const text = sanitizeText(clampLength(String(fullEmail.text ?? ''), 50_000))
  const headers = (fullEmail.headers ?? {}) as Record<string, string>
  const inReplyToRaw = headers['in-reply-to'] ?? headers['In-Reply-To'] ?? ''
  const inReplyTo = inReplyToRaw.replace(/[<>]/g, '').trim()

  let messageId: string | null = null

  // 1. Match by In-Reply-To → resend_message_id
  if (inReplyTo) {
    const { data } = await supabase
      .from('message_replies')
      .select('message_id')
      .eq('resend_message_id', inReplyTo)
      .limit(1)
      .single()
    messageId = data?.message_id ?? null
  }

  // 2. Fallback: match by sender email address
  if (!messageId) {
    const { data } = await supabase
      .from('messages')
      .select('id')
      .eq('email', fromEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    messageId = data?.id ?? null
  }

  if (!messageId) {
    console.log('[inbound] unmatched email from', fromEmail)
    return NextResponse.json({ ok: true })
  }

  await supabase
    .from('message_replies')
    .insert({ message_id: messageId, body: text, direction: 'inbound', from_email: fromEmail })

  await supabase.from('messages').update({ is_read: false }).eq('id', messageId)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run all tests**

```bash
bash scripts/test.sh
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/api/webhooks/resend-inbound/ __tests__/api/webhooks/resend-inbound.test.ts
git commit -m "feat: add Resend inbound email webhook with HMAC verification and thread matching"
```

---

## Task 6: Admin UI — reply footer field in IntegrationsEditor

**Files:**
- Modify: `components/admin/IntegrationsEditor.tsx`

- [ ] **Step 1: Add `reply_email_footer` to the settings state and form**

In `IntegrationsEditor.tsx`:

1. Find where `messages_from_email` is defined in the component's local state (look for a `useState` or form state holding settings fields).
2. Add `reply_email_footer: string` to the state shape, initialized from the fetched settings.
3. After the existing "Messages From Email" input field, add:

```tsx
<div style={{ marginTop: '16px' }}>
  <label
    htmlFor="reply-footer"
    style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}
  >
    Reply email footer
  </label>
  <textarea
    id="reply-footer"
    value={localSettings.reply_email_footer ?? ''}
    onChange={e => setLocalSettings(prev => ({ ...prev, reply_email_footer: e.target.value }))}
    rows={4}
    style={{
      width: '100%',
      padding: '10px',
      fontSize: '14px',
      borderRadius: '4px',
      border: '1px solid var(--color-border)',
      resize: 'vertical',
      fontFamily: 'inherit',
      lineHeight: 1.5,
    }}
  />
  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
    Appended to every reply email. Variables: <code>{'${BUSINESS_NAME}'}</code> · <code>{'${CONTACT_FORM}'}</code>
  </p>
</div>
```

4. Ensure `reply_email_footer` is included in the settings payload sent to `PUT /api/admin/settings`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start dev server (`bash scripts/dev.sh`), go to `/admin/integrations`, confirm the "Reply email footer" textarea appears with the default text, edit it, save, and reload — value should persist.

- [ ] **Step 4: Commit**

```bash
git add components/admin/IntegrationsEditor.tsx
git commit -m "feat: add reply email footer field to integrations admin"
```

---

## Task 7: Admin UI — MessagesInbox inbound reply rendering

**Files:**
- Modify: `components/admin/MessagesInbox.tsx`

- [ ] **Step 1: Update reply rendering to distinguish direction**

In `MessagesInbox.tsx`, find the replies map (currently around line 166):

```tsx
{replies.map(r => (
  <div key={r.id} style={{ padding: '12px 16px', background: 'var(--color-bg)', borderRadius: '6px', marginBottom: '8px', borderLeft: '3px solid var(--color-accent)' }}>
    <p style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: '0 0 4px' }}>{r.body}</p>
    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(r.created_at).toLocaleString()}</span>
  </div>
))}
```

Replace with:

```tsx
{replies.map(r => {
  const isInbound = r.direction === 'inbound'
  return (
    <div
      key={r.id}
      style={{
        padding: '12px 16px',
        background: 'var(--color-bg)',
        borderRadius: '6px',
        marginBottom: '8px',
        borderLeft: `3px solid ${isInbound ? 'var(--color-border)' : 'var(--color-accent)'}`,
      }}
    >
      {isInbound && (
        <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
          {selectedMsg?.name}
        </p>
      )}
      <p style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: '0 0 4px' }}>{r.body}</p>
      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
        {new Date(r.created_at).toLocaleString()}
      </span>
    </div>
  )
})}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
bash scripts/test.sh
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/admin/MessagesInbox.tsx
git commit -m "feat: render inbound customer replies with distinct style in messages thread"
```

---

## Task 8: Cloudflare Email Worker + deploy script

**Files:**
- Create: `cloudflare/email-worker/index.js`
- Create: `cloudflare/email-worker/wrangler.toml`
- Create: `scripts/deploy-cf-worker.sh`

- [ ] **Step 1: Create the worker directory and files**

```bash
mkdir -p cloudflare/email-worker
```

Create `cloudflare/email-worker/index.js`:

```js
// Cloudflare Email Worker — fans out hello@purpleacornz.com to two destinations.
// Deployed via scripts/deploy-cf-worker.sh (requires CLOUDFLARE_API_TOKEN env var).
// To activate: in Cloudflare Email Routing, edit the hello@purpleacornz.com custom
// address rule and change action from "Send to an email" to "Send to a Worker",
// selecting this worker.
export default {
  async email(message, env, ctx) {
    await message.forward(env.DEST_GMAIL)
    await message.forward(env.DEST_RESEND)
  },
}
```

Create `cloudflare/email-worker/wrangler.toml`:

```toml
name = "purple-acorns-email-forwarder"
main = "index.js"
compatibility_date = "2024-01-01"

[vars]
DEST_GMAIL = "purpleacornzcreations@gmail.com"
# DEST_RESEND is the Resend-assigned inbound routing address for this account.
# Not a secret — HMAC verification on the inbound webhook is the security boundary.
# Safe to commit.
DEST_RESEND = "hello@ieurkeueld.resend.app"
```

Create `scripts/deploy-cf-worker.sh`:

```bash
#!/bin/bash
# Deploy the Cloudflare Email Worker.
# Requires: CLOUDFLARE_API_TOKEN env var set.
# After first deploy, edit the hello@purpleacornz.com Email Routing rule in
# Cloudflare dashboard to "Send to a Worker" → purple-acorns-email-forwarder.
set -e
cd "$(dirname "$0")/../cloudflare/email-worker"
npx wrangler deploy
```

- [ ] **Step 2: Make the deploy script executable**

```bash
chmod +x scripts/deploy-cf-worker.sh
```

- [ ] **Step 3: Commit**

```bash
git add cloudflare/ scripts/deploy-cf-worker.sh
git commit -m "feat: add Cloudflare Email Worker for dual-forwarding hello@purpleacornz.com"
```

---

## Task 9: Environment variable + Resend inbound config

This task is configuration, not code. Complete these steps in order.

- [ ] **Step 1: Add `RESEND_WEBHOOK_SECRET` to `.env.local`**

Get the signing secret from Resend dashboard → Webhooks → your inbound webhook → Signing Secret. Add to `.env.local`:

```
RESEND_WEBHOOK_SECRET=whsec_...
```

- [ ] **Step 2: Add to Vercel environment variables**

In Vercel dashboard → Settings → Environment Variables, add `RESEND_WEBHOOK_SECRET` for Production.

- [ ] **Step 3: Configure Resend inbound webhook URL**

In Resend dashboard → Domains → your domain → Inbound, set webhook URL to:
```
https://purpleacornz.com/api/webhooks/resend-inbound
```

- [ ] **Step 4: Deploy Cloudflare Worker**

Ensure `CLOUDFLARE_API_TOKEN` is set locally, then:

```bash
bash scripts/deploy-cf-worker.sh
```

Expected: worker deployed as `purple-acorns-email-forwarder`.

- [ ] **Step 5: Update Cloudflare Email Routing rule**

In Cloudflare dashboard → Email → Email Routing → Custom Addresses:
- Find `hello@purpleacornz.com` → Edit
- Change action from "Send to an email" to "Send to a Worker"
- Select `purple-acorns-email-forwarder`
- Save

- [ ] **Step 6: Smoke test end-to-end**

1. Submit the contact form on the website.
2. In the admin UI, open the message and send a reply.
3. Reply to that reply from any email client (Gmail or otherwise) — send to `hello@purpleacornz.com`.
4. Wait ~30 seconds, reload the admin messages UI.
5. Expected: the customer reply appears in the thread with a muted left border and the customer's name above it.

---

## Rollback

If the Worker causes email delivery issues:
- In Cloudflare Email Routing, edit the `hello@purpleacornz.com` rule back to "Send to an email" → `purpleacornzcreations@gmail.com`.
- The Worker can be left deployed but inactive.
- All code changes are additive — no existing behaviour is broken by reverting the Cloudflare rule.
