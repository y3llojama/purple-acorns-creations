# Resend Inbound Email Replies — Design Spec

**Date:** 2026-03-23
**Status:** Approved for implementation

## Problem

When a customer submits the contact form, the admin can reply from the admin UI.
The customer receives the reply and hits Reply in their email client — but that
reply currently goes nowhere visible in the admin UI. The admin only sees it if
they check Gmail directly. There is no thread continuity in the messages inbox.

## Goal

Capture customer email replies and surface them in the admin messages thread,
alongside admin-sent replies, so the full conversation is visible in one place.

---

## Architecture

### Email routing — Cloudflare Worker (dual-forward)

`hello@purpleacornz.com` currently forwards to `purpleacornzcreations@gmail.com`
via a single Cloudflare Email Routing custom address rule.

Replace that rule's action with a **Cloudflare Email Worker** that forwards to
both destinations:

```
hello@purpleacornz.com
  → purpleacornzcreations@gmail.com   (admin Gmail, unchanged)
  → hello@ieurkeueld.resend.app       (Resend inbound)
```

This ensures every inbound email — whether the customer is replying to an admin
UI reply or a Gmail reply — always reaches Resend. No Reply-To encoding needed.

The existing Cloudflare custom address rule for `hello@purpleacornz.com` is
**edited** (not deleted) to "Send to a Worker" once the Worker is deployed.
Keep the existing Gmail forwarding rule active until the Worker is live.

The Worker is deployed from `cloudflare/email-worker/` in the repo and a deploy
script `scripts/deploy-cf-worker.sh` is provided for future CI/CD automation.

### Threading — In-Reply-To header matching with email fallback

When the admin sends a reply via the admin UI, Resend returns a message ID.
That ID is stored in `message_replies.resend_message_id`.

When a customer replies, their email client includes:
```
In-Reply-To: <resend_message_id@resend.dev>
```

The inbound webhook matches this header value against `message_replies.resend_message_id`
to find the thread. If no match (e.g. client stripped headers, or reply sent
from Gmail with no tracked Resend ID), fall back to matching the inbound `from`
email against `messages.email`, selecting the most recent message from that
address.

If neither matches, log and return HTTP 200 — Resend must not retry.

### No quoted-reply stripping

Store the raw email body. Stripping quoted content is fragile across email
clients (Gmail, Outlook, Apple Mail all differ). The admin can read the full
body; they know what they sent.

---

## Database Changes

### Migration A — `message_replies` columns

```sql
alter table message_replies
  add column direction text not null default 'outbound'
    check (direction in ('outbound', 'inbound')),
  add column from_email text,
  add column resend_message_id text;

-- All existing rows are admin-sent replies and correctly default to 'outbound'.
```

- `direction`: `'outbound'` (admin sent via UI) | `'inbound'` (customer reply via email)
- `from_email`: populated on inbound replies (customer's email address)
- `resend_message_id`: Resend message ID stored on outbound replies for threading.
  `NULL` when SMTP is the active transport (see Backend Changes §2).

### Migration B — `settings` column

```sql
alter table settings
  add column reply_email_footer text default
    'Please reply to this email to continue our conversation. To send a new message, use our contact form: ${CONTACT_FORM}. This inbox does not accept unsolicited emails.';
-- The ${} placeholders above are stored verbatim and resolved at send time
-- by interpolate() in lib/variables.ts — they are NOT SQL parameters.
```

Editable by admin. Supports `${CONTACT_FORM}` and `${BUSINESS_NAME}` variables.

---

## Backend Changes

### 1. `lib/email.ts` — updated return types + footer

**`getEmailSettings`** — add `reply_email_footer` to the `select()` column list.
No extra query needed.

**`sendViaResend`** — change return type to `{ success: boolean; messageId?: string; error?: string }`.
Propagate `result.data?.id` as `messageId` on success.

**`sendEmail`** — change return type to `{ success: boolean; messageId?: string; error?: string }`.
Pass through `messageId` from `sendViaResend`. When SMTP is used, `messageId`
is `undefined` — callers must treat it as optional.

**`sendReply`** — change return type to `{ success: boolean; messageId?: string; error?: string }`.
Append the editable footer to both `text` and `html` body variants:
- HTML: `<hr /><p style="font-size:12px;color:#888;">${escapedFooter}</p>`
- Text: `\n\n---\n${resolvedFooter}`

The footer is interpolated with `interpolate()` before appending, so
`${CONTACT_FORM}` resolves to the live contact URL.

### 2. `/api/admin/messages/reply` POST — store Resend message ID

After `sendReply()` succeeds, extract `messageId` and include it in the insert:

```ts
.insert({
  message_id: messageId,
  body: replyBody,
  resend_message_id: emailResult.messageId ?? null,  // null when SMTP used
})
```

When SMTP is active, `resend_message_id` is `NULL` and threading falls back to
email-address matching.

### 3. `/api/webhooks/resend-inbound` — new POST route

Sits alongside `/api/webhooks/square/`.

**Flow:**

1. **HMAC + timestamp verification** using `RESEND_WEBHOOK_SECRET`.
   Parse `t=` and `v1=` from the `svix-signature` / `resend-signature` header
   (same algorithm as `/api/newsletter/webhook`). Additionally, **reject requests
   where `|Date.now()/1000 - t| > 300`** (±5-minute window) to prevent replay
   attacks. If secret not set (dev), skip both checks.

2. **Parse webhook payload + fetch full email** — The `email.received` webhook
   contains only metadata (`email_id`, `from`, `to`, `subject`); body and headers
   are excluded by Resend. Immediately after HMAC verification, call
   `resend.emails.receiving.get(email_id)` to retrieve `text`, `html`, and
   `headers` (key-value object). The Resend API key is fetched from the encrypted
   `settings` row via `decryptSettings()`.

   Extract the email address from the webhook `from` field **before** sanitizing
   — use a `/<([^>]+)>/` regex to pull the address out of `"Name <email>"` format,
   then validate with `isValidEmail()`. If `from` is a bare address with no
   angle brackets, use it directly. Only then apply `sanitizeText()` to the body.

3. **Sanitize body**: `sanitizeText(clampLength(text, 50_000))`. The 50k limit
   (vs. 5k for outbound) reflects that inbound emails can include quoted history
   and attachments as text — the limit is a DoS guard, not a UX one.

4. **Thread matching** — in order:
   - Strip angle brackets from `headers['in-reply-to']` value. Query
     `message_replies` where `resend_message_id = strippedValue` → get `message_id`.
   - Fallback: query `messages` where `email = fromAddress` order by
     `created_at desc` limit 1 → get `message_id`.
   - No match → `console.log('[inbound] unmatched email from', fromAddress)`,
     return `{ ok: true }` with status 200.

5. **Insert** into `message_replies`:
   ```ts
   { message_id, body: sanitizedBody, direction: 'inbound', from_email: fromAddress }
   ```

6. **Mark unread**: update `messages.is_read = false` for the parent row.

7. Return `{ ok: true }`, status 200.

**No IP rate limiting** — all requests originate from Resend's servers. HMAC
signature verification with replay protection is the sole guard.

---

## Admin UI Changes

### `IntegrationsEditor` — reply footer field

Add a "Reply email footer" textarea under the "Messages From Email" field in
the Resend section. Shows the variable hint: `${BUSINESS_NAME}` · `${CONTACT_FORM}`.
Saved via the existing settings PUT endpoint.

### `MessagesInbox` — directional reply rendering

`MessageReply` type gains `direction`, `from_email`, `resend_message_id`.

Reply thread rendering:
- `direction === 'outbound'`: existing style — left accent border, no sender label.
- `direction === 'inbound'`: muted left border (`var(--color-border)`), sender
  label showing `selectedMsg.name` to identify the customer.

Both render in the same chronological list.

---

## Cloudflare Worker

### `cloudflare/email-worker/index.js`

```js
export default {
  async email(message, env, ctx) {
    await message.forward(env.DEST_GMAIL);
    await message.forward(env.DEST_RESEND);
  },
};
```

### `cloudflare/email-worker/wrangler.toml`

```toml
name = "purple-acorns-email-forwarder"
main = "index.js"
compatibility_date = "2024-01-01"

[vars]
DEST_GMAIL = "purpleacornzcreations@gmail.com"
# DEST_RESEND is the Resend-assigned inbound routing address for this account.
# It is not a secret — HMAC verification on the inbound webhook is the security
# boundary. Safe to commit.
DEST_RESEND = "hello@ieurkeueld.resend.app"
```

### `scripts/deploy-cf-worker.sh`

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/../cloudflare/email-worker"
npx wrangler deploy
```

Requires `CLOUDFLARE_API_TOKEN` in environment. Run manually for now; wire to
CI/CD when automated deployment is set up.

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `RESEND_WEBHOOK_SECRET` | `.env.local` + Vercel | Shared HMAC secret for both webhook routes |
| `CLOUDFLARE_API_TOKEN` | Local only (not committed) | Used by `scripts/deploy-cf-worker.sh` |

---

## TypeScript Types (`lib/supabase/types.ts`)

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

---

## Test Plan

- **HMAC verification**: valid signature passes; invalid signature returns 401;
  timestamp older than 5 min returns 401; missing secret (dev) skips check.
- **Thread matching**: `in-reply-to` header match finds correct `message_id`;
  email fallback used when header missing; unmatched returns 200 without insert.
- **`from` parsing**: `"Name <email>"` extracts correctly; bare address works;
  malformed value rejected by `isValidEmail()`.
- **`MessagesInbox` rendering**: inbound replies render with muted border and
  sender label; outbound replies retain existing style.

---

## Out of Scope

- Resend inbound payload field verification — check Resend docs during
  implementation; the spec describes expected shape but exact names may differ.
- Worker deployment via CI/CD (script provided, wiring to CI left for later).
- Notification email to admin on inbound reply (Gmail receives a copy via the
  Worker; unread indicator in UI covers admin awareness).
