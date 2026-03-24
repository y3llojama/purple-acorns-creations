# Unread Messages Badge — Design Spec

**Date:** 2026-03-24
**Status:** Approved for implementation

---

## Overview

Add an iOS-style unread message count badge to three places in the admin UI:

1. **Dashboard Messages tile** — red circle floating in the top-right corner of the tile
2. **Sidebar nav Messages item** — same badge over the `MessageSquare` icon (visible in both expanded and collapsed states)
3. **Home screen icon** — via the Web App Badging API (`navigator.setAppBadge`), so the badge appears on the admin's iOS/Android home screen shortcut

The count reflects messages where `is_read = false`. It decrements immediately when the admin opens an unread message, and polls every 45 seconds for new arrivals.

---

## Architecture

### Single source of truth: `UnreadCountProvider`

A React context provider (`lib/contexts/unread-count-context.tsx`) wraps the entire admin layout. It:

- Initialises with `initialCount` passed from the Server Component layout
- Polls `GET /api/admin/messages/unread-count` every 45 seconds (same interval as the inbox `POLL_INTERVAL = 45_000`)
- **Pauses polling when on `/admin/messages`** — the inbox manages read state directly on that page; polling from both would risk stale-count races
- Stops polling when the tab is hidden; resumes on visibility restore
- Exposes `unreadCount: number` and `markRead: () => void` via context
- Calls `navigator.setAppBadge(count)` (with feature detection) whenever `unreadCount` changes; calls `navigator.clearAppBadge()` when count reaches 0

### Data flow

```
AdminLayout (Server Component)
  → SELECT count(*) FROM messages WHERE is_read = false
  → renders <UnreadCountProvider initialCount={n}>
      ├─ AdminSidebar (client) → useUnreadCount() → badge on Messages nav item
      └─ main > {children}
          └─ Dashboard page (Server Component, async)
              → SELECT count(*) FROM messages WHERE is_read = false (own render-time query)
              → Messages tile rendered with unreadCount prop

MessagesInbox (client) → selectMessage() already guards !msg.is_read
  → calls markRead() from context (within the same guard block) → immediate decrement
```

The dashboard page runs its own Supabase query at render time (accurate on every navigation). The layout query initialises the sidebar context. Both are cheap `count(*)` calls.

---

## New Files

### `lib/contexts/unread-count-context.tsx`

Client component. Exports:
- `UnreadCountProvider` — accepts `initialCount: number`, manages polling and app badge
- `useUnreadCount()` — hook returning `{ unreadCount, markRead }`

`markRead`:
- Decrements `unreadCount` by 1, floor at 0
- Is a no-op if `unreadCount` is already 0
- Only called from `MessagesInbox.selectMessage()` inside the existing `if (msg && !msg.is_read)` guard — prevents double-decrement on already-read messages

Polling behaviour:
- Interval: 45 000 ms (matches inbox `POLL_INTERVAL`)
- Pauses when `document.visibilityState === 'hidden'`; resumes on `visibilitychange`
- Pauses when `pathname === '/admin/messages'` (checked via `usePathname()`); resumes when user navigates away
- On each poll: `GET /api/admin/messages/unread-count` → update state

App badge behaviour:
- On every `unreadCount` change: `if ('setAppBadge' in navigator) navigator.setAppBadge(unreadCount)`
- When `unreadCount === 0`: `if ('clearAppBadge' in navigator) navigator.clearAppBadge()`
- Gracefully degrades on unsupported browsers (feature detection only, no errors)
- Updates only when page is open; background push updates are out of scope

### `app/api/admin/messages/unread-count/route.ts`

```
GET /api/admin/messages/unread-count
→ requireAdminSession()
→ SELECT count(*) FROM messages WHERE is_read = false
→ 200 { count: number }
```

Protected by `requireAdminSession()` (admin-only; no per-IP rate limiting needed since the route is auth-gated). Uses `createServiceRoleClient()`.

---

## Changed Files

### `app/admin/(dashboard)/layout.tsx`

- Import `createServiceRoleClient`
- Make layout function `async`
- Query `count(*)` where `is_read = false`
- Wrap layout JSX in `<UnreadCountProvider initialCount={count}>`
- `AdminSidebar` is **not** passed `unreadCount` as a prop — it reads from context via `useUnreadCount()`

### `components/admin/AdminSidebar.tsx`

- Call `useUnreadCount()` to get `unreadCount`
- For the Messages nav item only, wrap the icon in a `position: relative` container
- Render badge when `unreadCount > 0`:
  - Uses `var(--color-danger)` (already defined in both themes in `globals.css`) — no hardcoded colour values
  - White number text (`color: white`)
  - `position: absolute; top: -8px; right: -8px`
  - `border: 1.5px solid var(--color-primary)` to cut out against sidebar background
  - Display `99+` if count > 99
  - Visible in both expanded and collapsed sidebar states (badge sits over the icon regardless)

### `app/admin/(dashboard)/page.tsx`

- Make the page function `async` (it currently is synchronous — this is a required change)
- Import `createServiceRoleClient`
- Query `count(*) WHERE is_read = false` at render time
- Pass `unreadCount` to the Messages tile only
- Render badge inline on the Messages tile (same `var(--color-danger)` red circle, same overflow cap, `position: absolute; top: -8px; right: -8px`)
- All other tiles are unaffected

### `components/admin/MessagesInbox.tsx`

- Import `useUnreadCount()`
- In `selectMessage()`, inside the existing `if (msg && !msg.is_read)` guard, call `markRead()` after firing the PATCH
- No other changes — the existing guard fully prevents double-decrement

---

## Badge Visual Spec

| Property | Value |
|---|---|
| Background | `var(--color-danger)` |
| Text colour | `white` |
| Font size | `11px` (tile), `9px` (sidebar) |
| Font weight | `700` |
| Min width / height | `20px` / `20px` (tile), `16px` / `16px` (sidebar) |
| Border radius | `10px` (pill) |
| Border | `2px solid white` (tile), `1.5px solid var(--color-primary)` (sidebar) |
| Position | `position: absolute; top: -8px; right: -8px` |
| Overflow cap | Display `99+` when count > 99 |
| Hidden when | `count === 0` (render nothing, not `visibility: hidden`) |

---

## Out of Scope

- **Push notifications / service worker** — the app badge only updates while the admin page is open. Background badge updates require push infrastructure and are a separate feature.
- **Per-message read tracking in the badge** — the badge simply mirrors `count(*) WHERE is_read = false`; no separate "badge seen" state.
- **Web app manifest** — not required for `navigator.setAppBadge`. Can be added separately to improve the PWA install experience.

---

## Testing Notes

- Badge hidden when `unreadCount === 0` (element not rendered, not merely invisible)
- Badge shows `99+` when count > 99
- Decrement is immediate on opening an unread message (no wait for poll)
- Badge does not go below 0
- `markRead()` is a no-op when count is already 0
- `navigator.setAppBadge` / `clearAppBadge` called with feature detection — no errors on unsupported browsers
- Polling pauses when tab is hidden and when on `/admin/messages`; resumes correctly on visibility restore / page navigation
- Dashboard page renders correct count on each navigation (server-rendered, no stale state)
