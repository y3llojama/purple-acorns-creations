# Messages UI Improvements — Design Spec
_Date: 2026-03-23_

## Overview

Five improvements to the admin messages inbox:
1. Chat-bubble thread style (visual distinction between admin and user messages)
2. Numbered pagination for long reply threads
3. Image upload support (both outbound admin attachments and inbound customer images)
4. Send confirmation dialog before dispatching a reply email
5. Auto-refresh: inbox polling with "N new messages" banner; open-thread polling with new-reply highlight

---

## Architecture

Current: one monolithic `MessagesInbox.tsx` (243 lines). After this work:

```
MessagesInbox.tsx        ← coordinator: state, polling, selected ID (~80 lines)
  ├── MessageList.tsx    ← left panel: inbox rows, unread dot, banner, refresh button
  └── ThreadView.tsx     ← right panel: original message, chat bubbles, pagination, composer
```

`MessagesInbox` owns shared state (messages list, selected ID, replies, pagination, polling). It passes data and callbacks down as props. No new hooks file — logic stays simple enough for co-location.

---

## Prerequisite changes

### Extract `validateFile` to `lib/validate.ts`

`validateFile` is currently a private function in `ImageUploader.tsx`. Extract it to `lib/validate.ts` so it can be shared by `ThreadView` and the reply API route:

```ts
// lib/validate.ts additions
export const MESSAGE_ATTACHMENT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const MESSAGE_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export function validateImageAttachment(file: File): string | null {
  if (!MESSAGE_ATTACHMENT_ALLOWED_TYPES.includes(file.type))
    return 'Only JPEG, PNG, WebP, and GIF images are allowed.'
  if (file.size > MESSAGE_ATTACHMENT_MAX_SIZE) return 'Image must be under 5MB.'
  return null
}
```

Note: SVG is excluded (unlike `ImageUploader`) to reduce XSS risk in email HTML.

### Add `confirmLabel` prop to `ConfirmDialog`

`ConfirmDialog` currently hardcodes the confirm button label as "Delete". Add an optional `confirmLabel?: string` prop (default `'Delete'`) so the send confirmation can use `'Send'`:

```tsx
// ConfirmDialog.tsx — add prop
interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string   // new — defaults to 'Delete'
}
// In JSX: <button onClick={onConfirm}>{ confirmLabel ?? 'Delete' }</button>
```

---

## 1. Chat Bubble Thread Style

- Outbound replies (admin) → right-aligned, `var(--color-primary)` background, `var(--color-accent)` text
- Inbound replies (customer) → left-aligned, `var(--color-surface)` background, `var(--color-border)` border
- Original message shown as a distinct header section above the thread (not a bubble)
- Each bubble shows sender label above, timestamp below
- New inbound replies arriving via polling get a gold highlight border (`var(--color-accent)`) + "just now · new" label for ~5s, then transition to normal styling via CSS transition
- Attachment filenames passed through `sanitizeText` before display
- Attachment `src` URLs validated with `isValidHttpsUrl` **in `ThreadView`** before rendering `<img>` tags

---

## 2. Pagination

- Page size: 20 replies per page; Page 1 = oldest, page N = newest
- Thread opens on the last page (most recent activity)
- Prev/Next + numbered page buttons at top and bottom of thread; hidden if ≤20 replies total
- If total pages > 10: show first, last, current ±1, ellipsis — max 7 page buttons

**API change (breaking shape change — update all callers atomically):**
- `GET /api/admin/messages/reply` currently returns `MessageReply[]`
- After: returns `{ data: MessageReply[], total: number, page: number, per_page: number }`
- The only existing caller is `selectMessage` in `MessagesInbox.tsx` — must be updated in the same PR

**Polling and page tracking:**
- `MessagesInbox` tracks `currentPage` in state alongside `selected`
- Thread polling polls the **currently visible page** — not always the last page
- New replies arriving on a different page are silently stored; visible when user navigates there

---

## 3. Image Uploads

### 3a. Outbound (admin attaches image to reply)

- "Attach image" button in reply composer (below textarea, min 48px touch target)
- Client validates with `validateImageAttachment` (from `lib/validate.ts`) before upload
- Uploads to `messages` Supabase storage bucket before sending
- Thumbnail preview with × remove button; **send blocked if any upload fails** (per-image error shown)
- URL stored in `message_replies.attachments text[]`
- **Server-side enforcement:** `POST /api/admin/messages/reply` rejects payloads with > 5 attachment URLs; validates each with `isValidHttpsUrl`

**`sendReply` signature change:**

```ts
// lib/email.ts — current
sendReply(to: string, toName: string, body: string): Promise<...>

// After
sendReply(to: string, toName: string, body: string, attachments?: string[]): Promise<...>
```

Each URL in `attachments` is already validated with `isValidHttpsUrl` before reaching `sendReply`. Inside `sendReply`, each URL is HTML-escaped with the existing `escapeHtml` helper before concatenation into the email HTML body:

```html
<img src="${escapeHtml(url)}" alt="" style="max-width:100%;display:block;margin:8px 0;">
```

### 3b. Inbound (customer sends image via email reply)

- Resend webhook already calls `resend.emails.receiving.get(emailId)`
- **Before implementing:** verify the exact field shape of `attachments` against Resend docs. Expected: `Array<{ filename: string, content_type: string, data: string /* base64 */ }>`
- For each item where `content_type` starts with `image/`: base64-decode, upload to `messages` bucket, collect public URL
- **Fallback:** if `attachments` is absent, null, empty, or an item is malformed — skip silently, never throw
- Collected URLs stored in `message_replies.attachments` on insert
- Display in thread: same thumbnail style as outbound; URLs validated with `isValidHttpsUrl` in `ThreadView` before rendering

**Storage note:** `messages` bucket is public — required for inline email delivery. No PII-sensitive documents expected. Signed URLs can be added in future if needed.

---

## 4. Send Confirmation Dialog

- Clicking "Send Reply" opens `ConfirmDialog` with:
  - `message`: `"This will send an email to <email> and cannot be unsent."`
  - `confirmLabel`: `"Send"`
  - `onConfirm`: fires reply send logic
  - `onCancel`: dismisses dialog, leaves compose area intact (text + attachments preserved)

---

## 5. Auto-Refresh

### Inbox list (MessageList)

- `MessagesInbox` polls `GET /api/admin/messages` every 45 seconds
- Polling **paused** when `document.visibilityState === 'hidden'` (via `visibilitychange` event listener in `useEffect`)
- Compares returned IDs against current list
- New IDs found → show banner "N new message(s)" with "Load" button; Load merges and dismisses
- Manual "↻ Refresh" button in list header — triggers immediate poll

### Open thread (ThreadView)

- When thread selected, also poll current page every 45 seconds (same visibility guard)
- New replies → append to thread, highlight with gold border for 5s via CSS transition
- Polling stops when thread is deselected

---

## Database Migration

```sql
-- supabase/migrations/036_message_reply_attachments.sql
-- NOT NULL DEFAULT '{}' backfills existing rows automatically via ALTER TABLE.
alter table message_replies
  add column attachments text[] not null default '{}';
```

---

## Storage

New Supabase bucket: `messages`
- Public read (serves inline images in email and admin UI)
- Authenticated write (admin uploads + service role for inbound webhook)
- Path convention: `<timestamp>-<random>.<ext>`

Migration file: `supabase/migrations/037_messages_storage_bucket.sql`

---

## API Changes

| Endpoint | Change |
|---|---|
| `GET /api/admin/messages/reply` | Add `page` + `per_page` query params; return `{ data, total, page, per_page }` — breaking shape change, update all callers atomically |
| `POST /api/admin/messages/reply` | Accept `attachments: string[]`; validate URLs server-side (isValidHttpsUrl, max 5); store in DB; pass to updated `sendReply` |
| `POST /api/webhooks/resend-inbound` | Parse image attachments from Resend response; upload to `messages` bucket; store URLs in `attachments` column |

All admin API routes already use `requireAdminSession()`. The inbound webhook is public by design and already uses HMAC/svix signature verification.

---

## Security

- `validateImageAttachment` (extracted to `lib/validate.ts`) enforces MIME type + size client-side
- All attachment URLs validated with `isValidHttpsUrl` server-side before storage, and in `ThreadView` before rendering as `<img src>`
- Server-side attachment count capped at 5 per reply
- Attachment filenames passed through `sanitizeText` before display
- Inbound attachment content validated to `image/*` before upload
- Attachment URLs HTML-escaped with `escapeHtml` before injection into email HTML body
- No unvalidated external URLs injected anywhere

---

## Out of Scope

- Video attachments
- Attachment downloads / ZIP export
- Marking individual replies as unread
- Multi-admin support
- Signed URLs for storage objects
