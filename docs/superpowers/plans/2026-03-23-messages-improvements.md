# Messages UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the admin messages inbox with chat-bubble threading, paginated replies, image attachments (both directions), send confirmation, and background auto-refresh.

**Architecture:** Split monolithic `MessagesInbox.tsx` into three focused components: a coordinator (`MessagesInbox`), a left-panel list (`MessageList`), and a right-panel thread view (`ThreadView`). API routes are updated to support pagination and attachment URLs. Polling uses `setInterval` + `visibilitychange` guard in the coordinator.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + Storage), Resend (email + inbound webhook), CSS custom properties, Jest + React Testing Library.

**Parallelism note:** Tasks 1 and 2 are fully independent and can run in parallel. Tasks 3, 4, 5 depend on Task 2. Tasks 6, 7, 8 depend on Tasks 1–5 and should run after them (Task 6 and 7 can run in parallel).

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `lib/validate.ts` | Modify | Add `validateImageAttachment`, `MESSAGE_ATTACHMENT_ALLOWED_TYPES`, `MESSAGE_ATTACHMENT_MAX_SIZE` |
| `lib/supabase/types.ts` | Modify | Add `attachments: string[]` to `MessageReply` |
| `lib/email.ts` | Modify | Add `attachments?: string[]` param to `sendReply`; render inline `<img>` tags |
| `components/admin/ConfirmDialog.tsx` | Modify | Add optional `confirmLabel?: string` prop (default `'Delete'`) |
| `components/admin/MessagesInbox.tsx` | Modify | Shrink to coordinator; add polling + visibility guard |
| `components/admin/MessageList.tsx` | Create | Left panel: inbox rows, unread dot, "N new" banner, refresh button |
| `components/admin/ThreadView.tsx` | Create | Right panel: original message header, chat bubbles, pagination, reply composer, image attach, send confirm |
| `app/api/admin/messages/reply/route.ts` | Modify | GET: add pagination; POST: accept + validate `attachments[]` |
| `app/api/webhooks/resend-inbound/route.ts` | Modify | Parse image attachments from Resend; upload to `messages` bucket |
| `supabase/migrations/036_message_reply_attachments.sql` | Create | Add `attachments text[]` to `message_replies` |
| `supabase/migrations/037_messages_storage_bucket.sql` | Create | Create `messages` storage bucket |
| `__tests__/security/message-security.test.ts` | Modify | Add tests for `validateImageAttachment` |
| `__tests__/components/admin/ConfirmDialog.test.tsx` | Modify | Update for `confirmLabel` prop |
| `__tests__/components/admin/MessageList.test.tsx` | Create | Render + interaction tests |
| `__tests__/components/admin/ThreadView.test.tsx` | Create | Render + interaction tests |

---

## Task 1: Foundation — shared helpers, types, ConfirmDialog prop

**Files:**
- Modify: `lib/validate.ts`
- Modify: `lib/supabase/types.ts`
- Modify: `components/admin/ConfirmDialog.tsx`
- Modify: `__tests__/security/message-security.test.ts`
- Modify: `__tests__/components/admin/ConfirmDialog.test.tsx`

- [ ] **Step 1.1: Add `validateImageAttachment` to `lib/validate.ts`**

  Append to the end of `lib/validate.ts`:

  ```ts
  export const MESSAGE_ATTACHMENT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  export const MESSAGE_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024 // 5 MB

  export function validateImageAttachment(file: File): string | null {
    if (!MESSAGE_ATTACHMENT_ALLOWED_TYPES.includes(file.type))
      return 'Only JPEG, PNG, WebP, and GIF images are allowed.'
    if (file.size > MESSAGE_ATTACHMENT_MAX_SIZE) return 'Image must be under 5MB.'
    return null
  }
  ```

- [ ] **Step 1.2: Write tests for `validateImageAttachment`**

  In `__tests__/security/message-security.test.ts`, add a new `describe` block after the existing ones:

  ```ts
  import { validateImageAttachment, MESSAGE_ATTACHMENT_MAX_SIZE } from '@/lib/validate'

  describe('Image attachment validation', () => {
    function makeFile(type: string, size: number): File {
      return new File(['x'.repeat(size)], 'test.jpg', { type })
    }

    it('accepts JPEG under 5MB', () => {
      expect(validateImageAttachment(makeFile('image/jpeg', 100))).toBeNull()
    })
    it('accepts PNG under 5MB', () => {
      expect(validateImageAttachment(makeFile('image/png', 100))).toBeNull()
    })
    it('rejects SVG', () => {
      expect(validateImageAttachment(makeFile('image/svg+xml', 100))).toMatch(/not allowed/)
    })
    it('rejects file over 5MB', () => {
      expect(validateImageAttachment(makeFile('image/jpeg', MESSAGE_ATTACHMENT_MAX_SIZE + 1))).toMatch(/5MB/)
    })
    it('rejects non-image', () => {
      expect(validateImageAttachment(makeFile('application/pdf', 100))).toMatch(/not allowed/)
    })
  })
  ```

- [ ] **Step 1.3: Run tests to verify they fail (function not exported yet)**

  ```bash
  npx jest __tests__/security/message-security.test.ts --no-coverage
  ```

  Expected: FAIL — `validateImageAttachment is not a function` or similar

- [ ] **Step 1.4: Run tests again after Step 1.1 is applied**

  ```bash
  npx jest __tests__/security/message-security.test.ts --no-coverage
  ```

  Expected: all PASS

- [ ] **Step 1.5: Add `attachments` to `MessageReply` type in `lib/supabase/types.ts`**

  Change the `MessageReply` interface:

  ```ts
  export interface MessageReply {
    id: string
    message_id: string
    body: string
    direction: 'outbound' | 'inbound'
    from_email: string | null
    resend_message_id: string | null
    attachments: string[]   // ← add this
    created_at: string
  }
  ```

- [ ] **Step 1.6: Add `confirmLabel` prop to `ConfirmDialog`**

  In `components/admin/ConfirmDialog.tsx`, update the Props interface and the confirm button:

  ```tsx
  interface Props {
    message: string
    onConfirm: () => void
    onCancel: () => void
    confirmLabel?: string   // new
  }
  ```

  Change the confirm button from:
  ```tsx
  <button onClick={onConfirm} style={{ ... }}>Delete</button>
  ```
  To:
  ```tsx
  <button onClick={onConfirm} style={{ ... }}>{confirmLabel ?? 'Delete'}</button>
  ```

- [ ] **Step 1.7: Update `ConfirmDialog` tests**

  In `__tests__/components/admin/ConfirmDialog.test.tsx`, add two new tests after the existing ones:

  ```tsx
  it('shows "Delete" by default when confirmLabel is omitted', () => {
    render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })
  it('shows custom confirmLabel when provided', () => {
    render(<ConfirmDialog message="Send?" onConfirm={jest.fn()} onCancel={jest.fn()} confirmLabel="Send" />)
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })
  ```

- [ ] **Step 1.8: Run ConfirmDialog tests**

  ```bash
  npx jest __tests__/components/admin/ConfirmDialog.test.tsx --no-coverage
  ```

  Expected: all PASS (including the 2 new ones)

- [ ] **Step 1.9: Commit**

  ```bash
  git add lib/validate.ts lib/supabase/types.ts components/admin/ConfirmDialog.tsx \
    __tests__/security/message-security.test.ts __tests__/components/admin/ConfirmDialog.test.tsx
  git commit -m "feat: extract validateImageAttachment, add attachments type, confirmLabel prop"
  ```

---

## Task 2: Database migrations

**Files:**
- Create: `supabase/migrations/036_message_reply_attachments.sql`
- Create: `supabase/migrations/037_messages_storage_bucket.sql`

- [ ] **Step 2.1: Create migration 036**

  Create `supabase/migrations/036_message_reply_attachments.sql`:

  ```sql
  -- Add attachments column to message_replies.
  -- NOT NULL DEFAULT '{}' backfills all existing rows automatically.
  alter table message_replies
    add column attachments text[] not null default '{}';
  ```

- [ ] **Step 2.2: Create migration 037**

  Create `supabase/migrations/037_messages_storage_bucket.sql`:

  ```sql
  -- Create messages bucket for admin reply image uploads and inbound email attachments.
  insert into storage.buckets (id, name, public)
    values ('messages', 'messages', true)
    on conflict (id) do nothing;

  -- Public read — required for inline email image delivery.
  create policy "Public read messages"
    on storage.objects for select
    using (bucket_id = 'messages');

  -- Authenticated write — admin uploads only.
  create policy "Authenticated upload messages"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'messages');

  create policy "Authenticated update messages"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'messages');

  create policy "Authenticated delete messages"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'messages');
  ```

- [ ] **Step 2.3: Apply migrations to Supabase**

  Run both migration files against your Supabase project (Supabase Dashboard → SQL Editor, or via Supabase CLI if configured). Verify that:
  - `message_replies` table now has an `attachments` column (type `text[]`, default `{}`)
  - A `messages` bucket appears in Storage

- [ ] **Step 2.4: Commit**

  ```bash
  git add supabase/migrations/036_message_reply_attachments.sql \
    supabase/migrations/037_messages_storage_bucket.sql
  git commit -m "feat: add message_reply attachments column and messages storage bucket"
  ```

---

## Task 3: Paginated replies API (GET)

**Files:**
- Modify: `app/api/admin/messages/reply/route.ts`

- [ ] **Step 3.1: Update GET handler to support pagination**

  Replace the existing `GET` function in `app/api/admin/messages/reply/route.ts`:

  ```ts
  export async function GET(request: Request) {
    const { error } = await requireAdminSession()
    if (error) return error

    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get('message_id')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10)))

    if (!messageId || !isValidUuid(messageId)) {
      return NextResponse.json({ error: 'Valid message_id required' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    // Get total count
    const { count, error: countError } = await supabase
      .from('message_replies')
      .select('*', { count: 'exact', head: true })
      .eq('message_id', messageId)

    if (countError) return NextResponse.json({ error: 'Failed to count replies' }, { status: 500 })

    const total = count ?? 0
    const offset = (page - 1) * perPage

    const { data, error: dbError } = await supabase
      .from('message_replies')
      .select('*')
      .eq('message_id', messageId)
      .order('created_at', { ascending: true })
      .range(offset, offset + perPage - 1)

    if (dbError) return NextResponse.json({ error: 'Failed to load replies' }, { status: 500 })
    return NextResponse.json({ data, total, page, per_page: perPage })
  }
  ```

- [ ] **Step 3.2: Commit**

  ```bash
  git add app/api/admin/messages/reply/route.ts
  git commit -m "feat: add pagination to GET replies API"
  ```

---

## Task 4: Attachment support in POST replies + sendReply

**Files:**
- Modify: `lib/email.ts`
- Modify: `app/api/admin/messages/reply/route.ts`

- [ ] **Step 4.1: Update `sendReply` in `lib/email.ts` to accept attachments**

  Change the `sendReply` signature and HTML body (lines ~144–165):

  ```ts
  export async function sendReply(to: string, toName: string, body: string, attachments?: string[]) {
    const settings = await getEmailSettings()
    const businessName = settings?.business_name ?? 'Purple Acorns Creations'
    const resolvedBody = interpolate(body, buildVars(businessName))

    const rawFooter = settings?.reply_email_footer ?? ''
    const resolvedFooter = interpolate(rawFooter, buildVars(businessName))

    const safeName = escapeHtml(stripControlChars(toName))
    const safeBody = escapeHtml(resolvedBody)
    const safeBusinessName = escapeHtml(businessName)
    const safeFooter = escapeHtml(resolvedFooter)

    // Build inline image HTML — URLs are already validated with isValidHttpsUrl before reaching here
    const imagesHtml = attachments && attachments.length > 0
      ? attachments
          .map(url => `<img src="${escapeHtml(url)}" alt="" style="max-width:100%;display:block;margin:8px 0;">`)
          .join('')
      : ''

    return sendEmail({
      to,
      subject: `Reply from ${businessName}`,
      text: `Hi ${stripControlChars(toName)},\n\n${resolvedBody}\n\n— ${businessName}${resolvedFooter ? `\n\n---\n${resolvedFooter}` : ''}`,
      html: `<p>Hi ${safeName},</p>
  <p>${safeBody.replace(/\n/g, '<br />')}</p>
  ${imagesHtml}
  <p>— ${safeBusinessName}</p>${safeFooter ? `<hr /><p style="font-size:12px;color:#888;">${safeFooter.replace(/\n/g, '<br />')}</p>` : ''}`,
    })
  }
  ```

- [ ] **Step 4.2: Update POST handler to accept and validate attachments**

  In `app/api/admin/messages/reply/route.ts`, update the `POST` function:

  ```ts
  import { isValidUuid, isValidHttpsUrl } from '@/lib/validate'
  // (isValidHttpsUrl should already be importable from lib/validate — verify the import)

  export async function POST(request: Request) {
    const { error } = await requireAdminSession()
    if (error) return error

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const messageId = String(body.message_id ?? '')
    const replyBody = sanitizeText(clampLength(String(body.body ?? ''), 5000))

    // Validate attachments: array of https URLs, max 5
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : []
    if (rawAttachments.length > 5) {
      return NextResponse.json({ error: 'Maximum 5 attachments allowed' }, { status: 400 })
    }
    const attachments: string[] = rawAttachments.map(String).filter(isValidHttpsUrl)

    if (!messageId || !isValidUuid(messageId)) {
      return NextResponse.json({ error: 'Valid message_id required' }, { status: 400 })
    }
    if (!replyBody) return NextResponse.json({ error: 'Reply body required' }, { status: 400 })

    const supabase = createServiceRoleClient()

    const { data: message, error: msgError } = await supabase
      .from('messages')
      .select('email, name')
      .eq('id', messageId)
      .single()

    if (msgError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const emailResult = await sendReply(message.email, message.name, replyBody, attachments)
    if (!emailResult?.success) {
      return NextResponse.json({ error: emailResult?.error ?? 'Failed to send reply' }, { status: 500 })
    }

    const { data: reply, error: dbError } = await supabase
      .from('message_replies')
      .insert({
        message_id: messageId,
        body: replyBody,
        direction: 'outbound',
        resend_message_id: emailResult.messageId ?? null,
        attachments,
      })
      .select()
      .single()

    if (dbError) {
      return NextResponse.json({ error: 'Reply sent but failed to save record' }, { status: 500 })
    }

    await supabase.from('messages').update({ is_read: true }).eq('id', messageId)

    return NextResponse.json(reply, { status: 201 })
  }
  ```

- [ ] **Step 4.3: Commit**

  ```bash
  git add lib/email.ts app/api/admin/messages/reply/route.ts
  git commit -m "feat: add attachment support to sendReply and POST replies API"
  ```

---

## Task 5: Inbound webhook — parse and store image attachments

**Files:**
- Modify: `app/api/webhooks/resend-inbound/route.ts`

- [ ] **Step 5.1: Check Resend receiving API docs for attachment field shape**

  Before coding, verify the shape returned by `resend.emails.receiving.get()`. Expected:
  ```ts
  fullEmail.attachments: Array<{
    filename: string
    content_type: string
    data: string  // base64-encoded
  }>
  ```
  If the field is named differently or structured differently, adjust accordingly in Step 5.2.

- [ ] **Step 5.2: Update the inbound webhook to parse and upload attachments**

  In `app/api/webhooks/resend-inbound/route.ts`, add a helper function and update the insert:

  ```ts
  import { createServiceRoleClient } from '@/lib/supabase/server'
  // (already imported — no new imports needed)

  // Add this helper before the POST handler:
  async function uploadInboundAttachments(
    attachments: Array<{ filename?: string; content_type?: string; data?: string }> | null | undefined
  ): Promise<string[]> {
    if (!attachments || attachments.length === 0) return []
    const supabase = createServiceRoleClient()
    const urls: string[] = []

    for (const att of attachments.slice(0, 5)) {
      // Skip non-images or malformed entries
      if (!att.content_type?.startsWith('image/') || !att.data) continue
      try {
        const buffer = Buffer.from(att.data, 'base64')
        const ext = att.content_type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error } = await supabase.storage
          .from('messages')
          .upload(path, buffer, { contentType: att.content_type })
        if (error) continue
        const { data } = supabase.storage.from('messages').getPublicUrl(path)
        urls.push(data.publicUrl)
      } catch {
        // skip malformed attachment silently
      }
    }
    return urls
  }
  ```

  Then in the `POST` handler, replace the final insert block:

  ```ts
  // Parse attachments (after fullEmail is fetched, before the insert)
  const attachmentUrls = await uploadInboundAttachments(
    (fullEmail as Record<string, unknown>).attachments as Array<{
      filename?: string; content_type?: string; data?: string
    }> | undefined
  )

  // Change the insert to include attachments:
  await supabase
    .from('message_replies')
    .insert({
      message_id: messageId,
      body: text,
      direction: 'inbound',
      from_email: fromEmail,
      attachments: attachmentUrls,
    })
  ```

- [ ] **Step 5.3: Commit**

  ```bash
  git add app/api/webhooks/resend-inbound/route.ts
  git commit -m "feat: parse and store image attachments from inbound email webhook"
  ```

---

## Task 6: Create `MessageList` component

**Files:**
- Create: `components/admin/MessageList.tsx`
- Create: `__tests__/components/admin/MessageList.test.tsx`

- [ ] **Step 6.1: Write failing test**

  Create `__tests__/components/admin/MessageList.test.tsx`:

  ```tsx
  import { render, screen, fireEvent } from '@testing-library/react'
  import MessageList from '@/components/admin/MessageList'
  import type { Message } from '@/lib/supabase/types'

  const makeMsg = (overrides: Partial<Message> = {}): Message => ({
    id: '1', name: 'Alice', email: 'alice@example.com',
    message: 'Hello', is_read: false, created_at: new Date().toISOString(),
    ...overrides,
  })

  describe('MessageList', () => {
    it('renders message names', () => {
      render(<MessageList messages={[makeMsg()]} selected={null} onSelect={jest.fn()} onRefresh={jest.fn()} newCount={0} onLoadNew={jest.fn()} />)
      expect(screen.getByText('Alice')).toBeInTheDocument()
    })
    it('shows unread count', () => {
      render(<MessageList messages={[makeMsg(), makeMsg({ id: '2', is_read: true })]} selected={null} onSelect={jest.fn()} onRefresh={jest.fn()} newCount={0} onLoadNew={jest.fn()} />)
      expect(screen.getByText(/1 unread/i)).toBeInTheDocument()
    })
    it('shows "N new messages" banner when newCount > 0', () => {
      render(<MessageList messages={[]} selected={null} onSelect={jest.fn()} onRefresh={jest.fn()} newCount={3} onLoadNew={jest.fn()} />)
      expect(screen.getByText(/3 new message/i)).toBeInTheDocument()
    })
    it('calls onLoadNew when Load button clicked', () => {
      const onLoadNew = jest.fn()
      render(<MessageList messages={[]} selected={null} onSelect={jest.fn()} onRefresh={jest.fn()} newCount={2} onLoadNew={onLoadNew} />)
      fireEvent.click(screen.getByRole('button', { name: /load/i }))
      expect(onLoadNew).toHaveBeenCalled()
    })
    it('calls onRefresh when Refresh button clicked', () => {
      const onRefresh = jest.fn()
      render(<MessageList messages={[]} selected={null} onSelect={jest.fn()} onRefresh={onRefresh} newCount={0} onLoadNew={jest.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
      expect(onRefresh).toHaveBeenCalled()
    })
    it('calls onSelect with message id on click', () => {
      const onSelect = jest.fn()
      render(<MessageList messages={[makeMsg()]} selected={null} onSelect={onSelect} onRefresh={jest.fn()} newCount={0} onLoadNew={jest.fn()} />)
      fireEvent.click(screen.getByText('Alice'))
      expect(onSelect).toHaveBeenCalledWith('1')
    })
  })
  ```

- [ ] **Step 6.2: Run tests to verify they fail**

  ```bash
  npx jest __tests__/components/admin/MessageList.test.tsx --no-coverage
  ```

  Expected: FAIL — `Cannot find module '@/components/admin/MessageList'`

- [ ] **Step 6.3: Create `MessageList.tsx`**

  Create `components/admin/MessageList.tsx`:

  ```tsx
  'use client'
  import type { Message } from '@/lib/supabase/types'

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  interface Props {
    messages: Message[]
    selected: string | null
    onSelect: (id: string) => void
    onRefresh: () => void
    newCount: number
    onLoadNew: () => void
  }

  export default function MessageList({ messages, selected, onSelect, onRefresh, newCount, onLoadNew }: Props) {
    const unreadCount = messages.filter(m => !m.is_read).length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* New messages banner */}
        {newCount > 0 && (
          <div style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
            <span>{newCount} new message{newCount !== 1 ? 's' : ''}</span>
            <button
              onClick={onLoadNew}
              aria-label="Load new messages"
              style={{ background: 'var(--color-accent)', color: 'var(--color-primary)', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}
            >
              Load
            </button>
          </div>
        )}

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
          </span>
          <button
            onClick={onRefresh}
            aria-label="Refresh messages"
            style={{ background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Message rows */}
        {messages.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>No messages yet.</p>
        )}
        {messages.map(msg => (
          <button
            key={msg.id}
            onClick={() => onSelect(msg.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '16px',
              background: selected === msg.id ? 'var(--color-primary)' : 'var(--color-surface)',
              color: selected === msg.id ? 'var(--color-accent)' : 'var(--color-text)',
              border: '1px solid var(--color-border)', borderRadius: '8px', cursor: 'pointer',
              minHeight: '48px', fontWeight: msg.is_read ? '400' : '600',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {!msg.is_read && (
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0 }} aria-hidden="true" />
                )}
                {msg.name}
              </span>
              <span style={{ fontSize: '12px', opacity: 0.7 }}>{timeAgo(msg.created_at)}</span>
            </div>
            <div style={{ fontSize: '13px', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {msg.message.slice(0, 80)}{msg.message.length > 80 ? '…' : ''}
            </div>
          </button>
        ))}
      </div>
    )
  }
  ```

- [ ] **Step 6.4: Run tests**

  ```bash
  npx jest __tests__/components/admin/MessageList.test.tsx --no-coverage
  ```

  Expected: all PASS

- [ ] **Step 6.5: Commit**

  ```bash
  git add components/admin/MessageList.tsx __tests__/components/admin/MessageList.test.tsx
  git commit -m "feat: add MessageList component with new-message banner and refresh"
  ```

---

## Task 7: Create `ThreadView` component

**Files:**
- Create: `components/admin/ThreadView.tsx`
- Create: `__tests__/components/admin/ThreadView.test.tsx`

- [ ] **Step 7.1: Write failing tests**

  Create `__tests__/components/admin/ThreadView.test.tsx`:

  ```tsx
  import { render, screen, fireEvent, waitFor } from '@testing-library/react'
  import ThreadView from '@/components/admin/ThreadView'
  import type { Message, MessageReply } from '@/lib/supabase/types'

  const msg: Message = {
    id: '1', name: 'Sarah', email: 'sarah@example.com',
    message: 'Hi, do you have wraps in size M?', is_read: true,
    created_at: '2026-03-22T10:00:00Z',
  }

  const outbound: MessageReply = {
    id: 'r1', message_id: '1', body: 'Yes we do!', direction: 'outbound',
    from_email: null, resend_message_id: null, attachments: [],
    created_at: '2026-03-22T11:00:00Z',
  }

  const inbound: MessageReply = {
    id: 'r2', message_id: '1', body: 'Great, I will take one.', direction: 'inbound',
    from_email: 'sarah@example.com', resend_message_id: null, attachments: [],
    created_at: '2026-03-22T12:00:00Z',
  }

  const defaultProps = {
    message: msg,
    replies: [outbound, inbound],
    total: 2, page: 1, perPage: 20,
    onPageChange: jest.fn(),
    onBack: jest.fn(),
    onDelete: jest.fn(),
    onSendReply: jest.fn(),
    isMobile: false,
    newReplyIds: new Set<string>(),
  }

  describe('ThreadView', () => {
    it('renders original message header', () => {
      render(<ThreadView {...defaultProps} />)
      expect(screen.getByText('Sarah')).toBeInTheDocument()
      expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
    })

    it('renders outbound reply on the right', () => {
      render(<ThreadView {...defaultProps} />)
      const bubble = screen.getByText('Yes we do!')
      // Outbound bubbles are wrapped in a right-aligned container
      expect(bubble.closest('[data-direction="outbound"]')).toBeTruthy()
    })

    it('renders inbound reply on the left', () => {
      render(<ThreadView {...defaultProps} />)
      const bubble = screen.getByText('Great, I will take one.')
      expect(bubble.closest('[data-direction="inbound"]')).toBeTruthy()
    })

    it('does not show pagination when total <= perPage', () => {
      render(<ThreadView {...defaultProps} total={2} perPage={20} />)
      expect(screen.queryByRole('button', { name: /older/i })).toBeNull()
    })

    it('shows pagination when total > perPage', () => {
      render(<ThreadView {...defaultProps} total={50} perPage={20} page={2} />)
      expect(screen.getByRole('button', { name: /older/i })).toBeInTheDocument()
    })

    it('calls onPageChange when Older clicked', () => {
      const onPageChange = jest.fn()
      render(<ThreadView {...defaultProps} total={50} perPage={20} page={2} onPageChange={onPageChange} />)
      fireEvent.click(screen.getByRole('button', { name: /older/i }))
      expect(onPageChange).toHaveBeenCalledWith(1)
    })

    it('shows send confirmation when Send Reply clicked', async () => {
      render(<ThreadView {...defaultProps} />)
      const textarea = screen.getByPlaceholderText(/type your reply/i)
      fireEvent.change(textarea, { target: { value: 'Thanks!' } })
      fireEvent.click(screen.getByRole('button', { name: /send reply/i }))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
      expect(screen.getByText(/sarah@example.com/)).toBeInTheDocument()
    })

    it('calls onSendReply after confirming send', async () => {
      const onSendReply = jest.fn().mockResolvedValue(undefined)
      render(<ThreadView {...defaultProps} onSendReply={onSendReply} />)
      fireEvent.change(screen.getByPlaceholderText(/type your reply/i), { target: { value: 'Thanks!' } })
      fireEvent.click(screen.getByRole('button', { name: /send reply/i }))
      await waitFor(() => screen.getByRole('dialog'))
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
      expect(onSendReply).toHaveBeenCalledWith('Thanks!', [])
    })

    it('highlights replies in newReplyIds', () => {
      render(<ThreadView {...defaultProps} newReplyIds={new Set(['r2'])} />)
      const bubble = screen.getByText('Great, I will take one.')
      expect(bubble.closest('[data-new="true"]')).toBeTruthy()
    })
  })
  ```

- [ ] **Step 7.2: Run tests to verify they fail**

  ```bash
  npx jest __tests__/components/admin/ThreadView.test.tsx --no-coverage
  ```

  Expected: FAIL — module not found

- [ ] **Step 7.3: Create `ThreadView.tsx`**

  Create `components/admin/ThreadView.tsx`:

  ```tsx
  'use client'
  import { useState, useRef } from 'react'
  import ConfirmDialog from './ConfirmDialog'
  import { createClient } from '@/lib/supabase/client'
  import { validateImageAttachment } from '@/lib/validate'
  import { isValidHttpsUrl } from '@/lib/validate'
  import { sanitizeText } from '@/lib/sanitize'
  import type { Message, MessageReply } from '@/lib/supabase/types'

  interface Props {
    message: Message
    replies: MessageReply[]
    total: number
    page: number
    perPage: number
    onPageChange: (page: number) => void
    onBack: () => void
    onDelete: (id: string) => void
    onSendReply: (body: string, attachments: string[]) => Promise<void>
    isMobile: boolean
    newReplyIds: Set<string>
  }

  function formatTimestamp(dateStr: string): string {
    return new Date(dateStr).toLocaleString()
  }

  function buildPageButtons(current: number, total: number): (number | '…')[] {
    if (total <= 10) return Array.from({ length: total }, (_, i) => i + 1)
    const set = new Set<number>([1, total, current, current - 1, current + 1].filter(p => p >= 1 && p <= total))
    const sorted = Array.from(set).sort((a, b) => a - b)
    const result: (number | '…')[] = []
    sorted.forEach((p, i) => {
      if (i > 0 && (p as number) - (sorted[i - 1] as number) > 1) result.push('…')
      result.push(p)
    })
    return result
  }

  export default function ThreadView({ message, replies, total, page, perPage, onPageChange, onBack, onDelete, onSendReply, isMobile, newReplyIds }: Props) {
    const [replyText, setReplyText] = useState('')
    const [attachments, setAttachments] = useState<string[]>([])
    const [attachNames, setAttachNames] = useState<string[]>([])
    const [uploadErrors, setUploadErrors] = useState<string[]>([])
    const [uploading, setUploading] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [sendError, setSendError] = useState<string | null>(null)
    const [sending, setSending] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const totalPages = Math.ceil(total / perPage)

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0]
      if (!file) return
      const validationError = validateImageAttachment(file)
      if (validationError) {
        setUploadErrors(prev => [...prev, validationError])
        return
      }
      setUploading(true)
      try {
        const supabase = createClient()
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('messages').upload(path, file)
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from('messages').getPublicUrl(path)
        setAttachments(prev => [...prev, data.publicUrl])
        setAttachNames(prev => [...prev, file.name])
      } catch (err) {
        setUploadErrors(prev => [...prev, err instanceof Error ? err.message : 'Upload failed'])
      } finally {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }

    function removeAttachment(index: number) {
      setAttachments(prev => prev.filter((_, i) => i !== index))
      setAttachNames(prev => prev.filter((_, i) => i !== index))
    }

    async function doSend() {
      setSending(true)
      setSendError(null)
      try {
        await onSendReply(replyText.trim(), attachments)
        setReplyText('')
        setAttachments([])
        setAttachNames([])
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Failed to send')
      } finally {
        setSending(false)
        setShowConfirm(false)
      }
    }

    return (
      <div style={{ background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)', padding: '24px' }}>
        {/* Mobile back button */}
        {isMobile && (
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '15px', cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: '6px', minHeight: '48px' }}
          >
            ← Back
          </button>
        )}

        {/* Message header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '20px', marginBottom: '4px' }}>{message.name}</h2>
            <span style={{ color: 'var(--color-accent)', fontSize: '14px' }}>{message.email}</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: '12px' }}>
              {formatTimestamp(message.created_at)}
            </span>
          </div>
          <button
            onClick={() => setDeleteConfirm(true)}
            style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '8px 16px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
          >
            Delete
          </button>
        </div>

        {/* Original message body */}
        <div style={{ padding: '16px', background: 'var(--color-bg)', borderRadius: '6px', marginBottom: '24px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {message.message}
        </div>

        {/* Pagination — top */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                aria-label="Older"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: page > 1 ? 'pointer' : 'not-allowed', opacity: page <= 1 ? 0.4 : 1 }}
              >
                ‹ Older
              </button>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                aria-label="Newer"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: page < totalPages ? 'pointer' : 'not-allowed', opacity: page >= totalPages ? 0.4 : 1 }}
              >
                Newer ›
              </button>
            </div>
          </div>
        )}

        {/* Chat bubbles */}
        {replies.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
            {replies.map(r => {
              const isOut = r.direction === 'outbound'
              const isNew = newReplyIds.has(r.id)
              return (
                <div
                  key={r.id}
                  data-direction={r.direction}
                  data-new={isNew ? 'true' : undefined}
                  style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}
                >
                  <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isOut ? 'flex-end' : 'flex-start', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {isOut ? 'You' : message.name}
                    </span>
                    <div style={{
                      background: isOut ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: isOut ? 'var(--color-accent)' : 'var(--color-text)',
                      border: isNew
                        ? '2px solid var(--color-accent)'
                        : isOut ? 'none' : '1px solid var(--color-border)',
                      borderRadius: isOut ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                      padding: '11px 15px',
                      fontSize: '14px',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}>
                      <p style={{ margin: 0 }}>{r.body}</p>
                      {r.attachments.map(url => isValidHttpsUrl(url) && (
                        <img
                          key={url}
                          src={url}
                          alt=""
                          style={{ display: 'block', maxWidth: '100%', borderRadius: '6px', marginTop: '8px' }}
                        />
                      ))}
                    </div>
                    <span style={{ fontSize: '11px', color: isNew ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                      {isNew ? 'just now · new' : formatTimestamp(r.created_at)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination — bottom (numbered buttons) */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {buildPageButtons(page, totalPages).map((p, i) =>
              p === '…'
                ? <span key={`ellipsis-${i}`} style={{ padding: '4px 6px', fontSize: '13px', color: 'var(--color-text-muted)' }}>…</span>
                : (
                  <button
                    key={p}
                    onClick={() => onPageChange(p as number)}
                    aria-label={`Page ${p}`}
                    style={{
                      background: p === page ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: p === page ? 'var(--color-accent)' : 'var(--color-text)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px', width: '32px', height: '32px',
                      fontSize: '13px', cursor: 'pointer', fontWeight: p === page ? '700' : '400',
                    }}
                  >
                    {p}
                  </button>
                )
            )}
          </div>
        )}

        {/* Reply composer */}
        <div>
          <label htmlFor="reply-text" style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
            Reply to {message.name}
          </label>
          <textarea
            id="reply-text"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Type your reply…"
            style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />

          {/* Attachment thumbnails */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {attachments.map((url, i) => (
                <div key={url} style={{ position: 'relative', width: '56px', height: '56px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                  {isValidHttpsUrl(url) && <img src={url} alt={sanitizeText(attachNames[i] ?? '')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <button
                    onClick={() => removeAttachment(i)}
                    aria-label={`Remove attachment ${attachNames[i]}`}
                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '10px', cursor: 'pointer', lineHeight: '18px', padding: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload errors */}
          {uploadErrors.map((err, i) => (
            <p key={i} style={{ color: '#c05050', fontSize: '13px', marginTop: '4px' }}>{err}</p>
          ))}

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => { setSendError(null); setShowConfirm(true) }}
              disabled={!replyText.trim() || sending || uploading}
              style={{
                background: replyText.trim() ? 'var(--color-primary)' : '#ccc',
                color: 'var(--color-accent)', padding: '12px 24px', fontSize: '16px',
                border: 'none', borderRadius: '4px', cursor: replyText.trim() ? 'pointer' : 'not-allowed', minHeight: '48px',
              }}
            >
              {sending ? 'Sending…' : 'Send Reply'}
            </button>

            {attachments.length < 5 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: uploading ? 'wait' : 'pointer', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '12px 16px', fontSize: '14px', minHeight: '48px', boxSizing: 'border-box' }}>
                {uploading ? 'Uploading…' : '📎 Attach image'}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>
            )}
          </div>

          {sendError && <p style={{ color: '#c05050', fontSize: '14px', marginTop: '8px' }}>{sendError}</p>}
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            Variables: <code>{'${BUSINESS_NAME}'}</code> · <code>{'${CONTACT_FORM}'}</code>
          </p>
        </div>

        {/* Send confirmation dialog */}
        {showConfirm && (
          <ConfirmDialog
            message={`This will send an email to ${message.email} and cannot be unsent.`}
            confirmLabel="Send"
            onConfirm={doSend}
            onCancel={() => setShowConfirm(false)}
          />
        )}

        {/* Delete confirmation dialog */}
        {deleteConfirm && (
          <ConfirmDialog
            message="Delete this message and all replies? This cannot be undone."
            onConfirm={() => { onDelete(message.id); setDeleteConfirm(false) }}
            onCancel={() => setDeleteConfirm(false)}
          />
        )}
      </div>
    )
  }
  ```

- [ ] **Step 7.4: Run tests**

  ```bash
  npx jest __tests__/components/admin/ThreadView.test.tsx --no-coverage
  ```

  Expected: all PASS

- [ ] **Step 7.5: Commit**

  ```bash
  git add components/admin/ThreadView.tsx __tests__/components/admin/ThreadView.test.tsx
  git commit -m "feat: add ThreadView with chat bubbles, pagination, image attach, send confirmation"
  ```

---

## Task 8: Refactor `MessagesInbox` to coordinator + add polling

**Files:**
- Modify: `components/admin/MessagesInbox.tsx`

- [ ] **Step 8.1: Rewrite `MessagesInbox.tsx` as coordinator**

  Replace the entire file content:

  ```tsx
  'use client'
  import { useState, useEffect, useCallback, useRef } from 'react'
  import MessageList from './MessageList'
  import ThreadView from './ThreadView'
  import { useIsMobile } from '@/lib/hooks/useIsMobile'
  import type { Message, MessageReply } from '@/lib/supabase/types'

  const POLL_INTERVAL = 45_000

  interface PaginatedReplies {
    data: MessageReply[]
    total: number
    page: number
    per_page: number
  }

  interface Props { initialMessages: Message[] }

  export default function MessagesInbox({ initialMessages }: Props) {
    const [messages, setMessages] = useState<Message[]>(initialMessages)
    const [selected, setSelected] = useState<string | null>(null)
    const [replies, setReplies] = useState<MessageReply[]>([])
    const [replyTotal, setReplyTotal] = useState(0)
    const [replyPage, setReplyPage] = useState(1)
    const [newMsgCount, setNewMsgCount] = useState(0)
    const [pendingMessages, setPendingMessages] = useState<Message[]>([])
    const [newReplyIds, setNewReplyIds] = useState<Set<string>>(new Set())
    const isMobile = useIsMobile()
    const knownIdsRef = useRef(new Set(initialMessages.map(m => m.id)))
    const PER_PAGE = 20

    const selectedMsg = messages.find(m => m.id === selected) ?? null

    // ── Reply loader ──────────────────────────────────────────────────
    const loadReplies = useCallback(async (messageId: string, page: number, highlight = false) => {
      const res = await fetch(`/api/admin/messages/reply?message_id=${messageId}&page=${page}&per_page=${PER_PAGE}`)
      if (!res.ok) return
      const data: PaginatedReplies = await res.json()
      if (highlight) {
        const existingIds = new Set(replies.map(r => r.id))
        const fresh = data.data.filter(r => !existingIds.has(r.id)).map(r => r.id)
        if (fresh.length > 0) {
          setNewReplyIds(new Set(fresh))
          setTimeout(() => setNewReplyIds(new Set()), 5000)
        }
      }
      setReplies(data.data)
      setReplyTotal(data.total)
      setReplyPage(data.page)
    }, [replies])

    // ── Select message ────────────────────────────────────────────────
    async function selectMessage(id: string) {
      setSelected(id)
      setNewReplyIds(new Set())

      const msg = messages.find(m => m.id === id)
      if (msg && !msg.is_read) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m))
        fetch('/api/admin/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, is_read: true }),
        })
      }

      // Open on last page
      const countRes = await fetch(`/api/admin/messages/reply?message_id=${id}&page=1&per_page=${PER_PAGE}`)
      if (countRes.ok) {
        const data: PaginatedReplies = await countRes.json()
        const lastPage = Math.max(1, Math.ceil(data.total / PER_PAGE))
        await loadReplies(id, lastPage)
      }
    }

    // ── Send reply ────────────────────────────────────────────────────
    async function handleSendReply(body: string, attachments: string[]) {
      if (!selected) return
      const res = await fetch('/api/admin/messages/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: selected, body, attachments }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to send reply')
      }
      const lastPage = Math.max(1, Math.ceil((replyTotal + 1) / PER_PAGE))
      await loadReplies(selected, lastPage)
    }

    // ── Delete message ────────────────────────────────────────────────
    async function handleDelete(id: string) {
      const res = await fetch('/api/admin/messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== id))
        if (selected === id) { setSelected(null); setReplies([]) }
      }
    }

    // ── Polling ───────────────────────────────────────────────────────
    const pollMessages = useCallback(async () => {
      const res = await fetch('/api/admin/messages')
      if (!res.ok) return
      const fresh: Message[] = await res.json()
      const newOnes = fresh.filter(m => !knownIdsRef.current.has(m.id))
      if (newOnes.length > 0) {
        newOnes.forEach(m => knownIdsRef.current.add(m.id))
        setPendingMessages(newOnes)
        setNewMsgCount(newOnes.length)
      }
    }, [])

    const pollReplies = useCallback(async () => {
      if (!selected) return
      await loadReplies(selected, replyPage, true)
    }, [selected, replyPage, loadReplies])

    useEffect(() => {
      let msgTimer: ReturnType<typeof setInterval>
      let replyTimer: ReturnType<typeof setInterval>

      function startPolling() {
        msgTimer = setInterval(pollMessages, POLL_INTERVAL)
        replyTimer = setInterval(pollReplies, POLL_INTERVAL)
      }
      function stopPolling() {
        clearInterval(msgTimer)
        clearInterval(replyTimer)
      }

      startPolling()

      function handleVisibility() {
        if (document.visibilityState === 'hidden') stopPolling()
        else startPolling()
      }
      document.addEventListener('visibilitychange', handleVisibility)

      return () => {
        stopPolling()
        document.removeEventListener('visibilitychange', handleVisibility)
      }
    }, [pollMessages, pollReplies])

    function handleLoadNew() {
      setMessages(prev => {
        const existing = new Set(prev.map(m => m.id))
        const merged = [...pendingMessages.filter(m => !existing.has(m.id)), ...prev]
        return merged
      })
      setPendingMessages([])
      setNewMsgCount(0)
    }

    return (
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '24px' }}>
          Messages
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: !isMobile && selected ? '1fr 2fr' : '1fr', gap: '24px' }}>
          {/* Left panel */}
          <div style={{ display: isMobile && selected ? 'none' : 'block' }}>
            <MessageList
              messages={messages}
              selected={selected}
              onSelect={selectMessage}
              onRefresh={pollMessages}
              newCount={newMsgCount}
              onLoadNew={handleLoadNew}
            />
          </div>

          {/* Right panel */}
          {selectedMsg && (
            <ThreadView
              message={selectedMsg}
              replies={replies}
              total={replyTotal}
              page={replyPage}
              perPage={PER_PAGE}
              onPageChange={page => loadReplies(selected!, page)}
              onBack={() => { setSelected(null); setReplies([]) }}
              onDelete={handleDelete}
              onSendReply={handleSendReply}
              isMobile={isMobile}
              newReplyIds={newReplyIds}
            />
          )}
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 8.2: Run full test suite**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all existing tests PASS; new tests for MessageList, ThreadView, ConfirmDialog, validate PASS.

- [ ] **Step 8.3: Manual smoke test**

  1. Start dev server: `npm run dev`
  2. Open `/admin/messages`
  3. Verify: left panel shows inbox list with refresh button
  4. Click a message → right panel shows original message + chat bubbles
  5. Type a reply → click "Send Reply" → confirm dialog appears with "Send" button
  6. Confirm → reply sent and appears as right-aligned bubble
  7. Wait 45s with another tab — verify no poll fires when tab is hidden
  8. Come back → poll resumes

- [ ] **Step 8.4: Commit**

  ```bash
  git add components/admin/MessagesInbox.tsx
  git commit -m "feat: refactor MessagesInbox to coordinator with polling and visibility guard"
  ```

---

## Final verification

- [ ] **Run full test suite one more time**

  ```bash
  npx jest --no-coverage
  ```

  Expected: all PASS

- [ ] **Check for TypeScript errors**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors

- [ ] **Final commit if any loose files**

  If any files are unstaged, commit them. Then the feature is ready for review.
