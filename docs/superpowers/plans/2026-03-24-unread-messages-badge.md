# Unread Messages Badge Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an iOS-style unread message count badge to the dashboard Messages tile, sidebar nav Messages item, and the device home screen icon — powered by a single polling context in the admin layout.

**Architecture:** A new `UnreadCountProvider` (client component) wraps the admin layout, initialised with a server-side count and polling every 45s. `AdminSidebar` and the dashboard page both consume the count; `MessagesInbox` calls `markRead()` on message open for immediate decrement. The Web App Badging API (`navigator.setAppBadge`) is called on every count change for home screen icon updates.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service role client), React context, Web App Badging API, Jest + `@testing-library/react`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `app/api/admin/messages/unread-count/route.ts` | `GET` endpoint — returns `{ count: number }` of unread messages |
| Create | `lib/contexts/unread-count-context.tsx` | Context, provider with polling + app badge, `useUnreadCount` hook |
| Create | `__tests__/api/admin/messages/unread-count.test.ts` | API route unit tests |
| Create | `__tests__/lib/unread-count-context.test.tsx` | Context unit tests (markRead behaviour) |
| Modify | `app/admin/(dashboard)/layout.tsx` | Make async, fetch initial count, wrap in `UnreadCountProvider` |
| Modify | `components/admin/AdminSidebar.tsx` | Read context, render badge on Messages nav item |
| Modify | `app/admin/(dashboard)/page.tsx` | Make async, query unread count, render badge on Messages tile |
| Modify | `components/admin/MessagesInbox.tsx` | Call `markRead()` from context inside existing `!msg.is_read` guard |

---

## Task 1: Unread Count API Endpoint

**Files:**
- Create: `app/api/admin/messages/unread-count/route.ts`
- Create: `__tests__/api/admin/messages/unread-count.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/admin/messages/unread-count.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({
  requireAdminSession: jest.fn().mockResolvedValue({ error: null }),
}))

describe('GET /api/admin/messages/unread-count', () => {
  beforeEach(() => jest.resetModules())

  it('returns count of unread messages', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 3, error: null }),
        })),
      })),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 3 })
  })

  it('returns 0 when no unread messages', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
        })),
      })),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(await res.json()).toEqual({ count: 0 })
  })

  it('returns 0 when count is null (empty table)', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: null, error: null }),
        })),
      })),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(await res.json()).toEqual({ count: 0 })
  })

  it('returns 401 when not authenticated', async () => {
    jest.resetModules()
    jest.doMock('@/lib/auth', () => ({
      requireAdminSession: jest.fn().mockResolvedValue({
        error: new Response(null, { status: 401 }),
      }),
    }))
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 500 on database error', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: null, error: { message: 'db error' } }),
        })),
      })),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/admin/messages/unread-count.test.ts --no-coverage
```
Expected: all tests fail with "Cannot find module"

- [ ] **Step 3: Implement the route**

Create `app/api/admin/messages/unread-count/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { count, error: dbError } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false)

  if (dbError) return NextResponse.json({ error: 'Failed to fetch count' }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/api/admin/messages/unread-count.test.ts --no-coverage
```
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/messages/unread-count/route.ts __tests__/api/admin/messages/unread-count.test.ts
git commit -m "feat: add GET /api/admin/messages/unread-count endpoint"
```

---

## Task 2: UnreadCountContext

**Files:**
- Create: `lib/contexts/unread-count-context.tsx`
- Create: `__tests__/lib/unread-count-context.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/unread-count-context.test.tsx`:

```tsx
import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { UnreadCountProvider, useUnreadCount } from '@/lib/contexts/unread-count-context'

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/admin'),
}))

// Suppress polling fetch calls in tests
global.fetch = jest.fn().mockResolvedValue({ ok: false })

function wrapper({ children }: { children: React.ReactNode }) {
  return <UnreadCountProvider initialCount={5}>{children}</UnreadCountProvider>
}

describe('useUnreadCount', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('initialises with the provided count', () => {
    const { result } = renderHook(() => useUnreadCount(), { wrapper })
    expect(result.current.unreadCount).toBe(5)
  })

  it('markRead decrements unreadCount by 1', () => {
    const { result } = renderHook(() => useUnreadCount(), { wrapper })
    act(() => result.current.markRead())
    expect(result.current.unreadCount).toBe(4)
  })

  it('markRead does not go below 0', () => {
    function zeroWrapper({ children }: { children: React.ReactNode }) {
      return <UnreadCountProvider initialCount={0}>{children}</UnreadCountProvider>
    }
    const { result } = renderHook(() => useUnreadCount(), { wrapper: zeroWrapper })
    act(() => result.current.markRead())
    expect(result.current.unreadCount).toBe(0)
  })

  it('markRead called multiple times decrements correctly', () => {
    const { result } = renderHook(() => useUnreadCount(), { wrapper })
    act(() => {
      result.current.markRead()
      result.current.markRead()
    })
    expect(result.current.unreadCount).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/lib/unread-count-context.test.tsx --no-coverage
```
Expected: fail with "Cannot find module"

- [ ] **Step 3: Implement the context**

Create `lib/contexts/unread-count-context.tsx`:

```tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const POLL_INTERVAL = 45_000

interface UnreadCountContextValue {
  unreadCount: number
  markRead: () => void
}

const UnreadCountContext = createContext<UnreadCountContextValue>({
  unreadCount: 0,
  markRead: () => {},
})

export function useUnreadCount() {
  return useContext(UnreadCountContext)
}

interface Props {
  initialCount: number
  children: React.ReactNode
}

export function UnreadCountProvider({ initialCount, children }: Props) {
  const [unreadCount, setUnreadCount] = useState(initialCount)
  const pathname = usePathname()

  // Sync app badge on every count change
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount)
    } else if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge()
    }
  }, [unreadCount])

  // Poll for updated count — paused on /admin/messages (inbox manages state there)
  useEffect(() => {
    if (pathname === '/admin/messages') return

    let timer: ReturnType<typeof setInterval>

    async function poll() {
      const res = await fetch('/api/admin/messages/unread-count')
      if (!res.ok) return
      const { count } = await res.json()
      setUnreadCount(count)
    }

    function startPolling() {
      timer = setInterval(poll, POLL_INTERVAL)
    }
    function stopPolling() {
      clearInterval(timer)
    }

    startPolling()

    function handleVisibility() {
      stopPolling()
      if (document.visibilityState !== 'hidden') startPolling()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [pathname])

  function markRead() {
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  return (
    <UnreadCountContext.Provider value={{ unreadCount, markRead }}>
      {children}
    </UnreadCountContext.Provider>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/lib/unread-count-context.test.tsx --no-coverage
```
Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add lib/contexts/unread-count-context.tsx __tests__/lib/unread-count-context.test.tsx
git commit -m "feat: add UnreadCountProvider context with polling and app badge"
```

---

## Task 3: Wire Admin Layout

**Files:**
- Modify: `app/admin/(dashboard)/layout.tsx`

No new tests needed — the layout is a thin async Server Component. Its correctness is verified by the context tests and manual verification.

- [ ] **Step 1: Update the layout**

Replace the entire contents of `app/admin/(dashboard)/layout.tsx`:

```tsx
import AdminSidebar from '@/components/admin/AdminSidebar'
import { getSettings } from '@/lib/theme'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { UnreadCountProvider } from '@/lib/contexts/unread-count-context'
import styles from './layout.module.css'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServiceRoleClient()
  const [settings, { count }] = await Promise.all([
    getSettings(),
    supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false),
  ])

  return (
    <UnreadCountProvider initialCount={count ?? 0}>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
        <AdminSidebar businessName={settings.business_name} />
        <main className={styles.main}>
          {children}
        </main>
      </div>
    </UnreadCountProvider>
  )
}
```

- [ ] **Step 2: Run the test suite to verify no regressions**

```bash
bash scripts/test.sh
```
Expected: all existing tests pass

- [ ] **Step 3: Commit**

```bash
git add app/admin/(dashboard)/layout.tsx
git commit -m "feat: wire UnreadCountProvider into admin layout"
```

---

## Task 4: AdminSidebar Badge

**Files:**
- Modify: `components/admin/AdminSidebar.tsx`

- [ ] **Step 1: Add `useUnreadCount` import and badge to the Messages nav item**

In `components/admin/AdminSidebar.tsx`:

1. Add import at the top (after existing imports):
```tsx
import { useUnreadCount } from '@/lib/contexts/unread-count-context'
```

2. Inside the `AdminSidebar` component body, add after the existing hooks:
```tsx
const { unreadCount } = useUnreadCount()
```

3. Replace the nav item icon rendering inside the `{NAV_ITEMS.map(...)}` block.

Find this block:
```tsx
<Icon size={20} style={{ flexShrink: 0 }} />
{!collapsed && label}
```

Replace with:
```tsx
{href === '/admin/messages' ? (
  <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
    <Icon size={20} style={{ flexShrink: 0 }} />
    {unreadCount > 0 && (
      <span style={{
        position: 'absolute',
        top: '-8px',
        right: '-10px',
        background: 'var(--color-danger)',
        color: 'white',
        fontSize: '9px',
        fontWeight: '700',
        minWidth: '16px',
        height: '16px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 3px',
        border: '1.5px solid var(--color-primary)',
        lineHeight: 1,
      }}>
        {unreadCount > 99 ? '99+' : unreadCount}
      </span>
    )}
  </span>
) : (
  <Icon size={20} style={{ flexShrink: 0 }} />
)}
{!collapsed && label}
```

- [ ] **Step 2: Run the test suite**

```bash
bash scripts/test.sh
```
Expected: all tests pass

- [ ] **Step 3: Manually verify in the browser**

Start the dev server (`bash scripts/dev.sh`). Navigate to `/admin`. Verify:
- Badge appears on the Messages sidebar item when unread messages exist
- Badge is visible when sidebar is collapsed (icon-only mode)
- Badge is not rendered when unread count is 0

- [ ] **Step 4: Commit**

```bash
git add components/admin/AdminSidebar.tsx
git commit -m "feat: add unread count badge to sidebar Messages nav item"
```

---

## Task 5: Dashboard Messages Tile Badge

**Files:**
- Modify: `app/admin/(dashboard)/page.tsx`

- [ ] **Step 1: Update the dashboard page**

Replace the entire contents of `app/admin/(dashboard)/page.tsx`:

```tsx
import Link from 'next/link'
import { createServiceRoleClient } from '@/lib/supabase/server'
import {
  Calendar, Image, FileText, Palette, BarChart2,
  Package, MessageSquare, Plug, Radio, Mail, ClipboardList,
} from 'lucide-react'

const TILES = [
  { href: '/admin/events',       label: 'Add Event',       description: 'Schedule upcoming markets and events',       Icon: Calendar },
  { href: '/admin/gallery',      label: 'Upload Photo',    description: 'Add photos to your gallery',                Icon: Image },
  { href: '/admin/content',      label: 'Edit Content',    description: 'Update homepage and story text',            Icon: FileText },
  { href: '/admin/inventory',    label: 'Inventory',       description: 'Manage products, stock, and categories',    Icon: Package },
  { href: '/admin/messages',     label: 'Messages',        description: 'View and reply to customer messages',       Icon: MessageSquare },
  { href: '/admin/branding',     label: 'Manage Branding', description: 'Theme, logo, and announcement banner',      Icon: Palette },
  { href: '/admin/integrations', label: 'Integrations',    description: 'Square, Pinterest, and AI settings',        Icon: Plug },
  { href: '/admin/channels',     label: 'Channels',        description: 'Storefront channel settings',               Icon: Radio },
  { href: '/admin/newsletter',   label: 'Newsletter',      description: 'Compose and send newsletters',              Icon: Mail },
  { href: '/admin/analytics',    label: 'View Analytics',  description: 'Page views, visitors, traffic sources',     Icon: BarChart2 },
  { href: '/admin/reports',      label: 'Reports',         description: 'Sales and inventory reports',               Icon: ClipboardList },
]

export const metadata = { title: 'Admin Dashboard' }

export default async function AdminDashboard() {
  const supabase = createServiceRoleClient()
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false)

  const unreadCount = count ?? 0

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--color-primary)', marginBottom: '32px' }}>
        Dashboard
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        {TILES.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '24px', textDecoration: 'none', transition: 'box-shadow 0.2s' }}
          >
            {href === '/admin/messages' && unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                background: 'var(--color-danger)',
                color: 'white',
                fontSize: '11px',
                fontWeight: '700',
                minWidth: '20px',
                height: '20px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
                border: '2px solid white',
                boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                lineHeight: 1,
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            <Icon size={24} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--color-primary)', marginBottom: '4px', fontWeight: '600' }}>
                {label}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                {description}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the test suite**

```bash
bash scripts/test.sh
```
Expected: all tests pass

- [ ] **Step 3: Manually verify in the browser**

Navigate to `/admin`. Verify:
- Red badge floats in the top-right corner of the Messages tile when unread messages exist
- Badge shows `99+` if you temporarily set `unreadCount = 100` in the code
- No badge on any other tile
- Badge is not rendered (no empty space) when unread count is 0

- [ ] **Step 4: Commit**

```bash
git add app/admin/(dashboard)/page.tsx
git commit -m "feat: add unread count badge to dashboard Messages tile"
```

---

## Task 6: MessagesInbox Real-Time Decrement

**Files:**
- Modify: `components/admin/MessagesInbox.tsx`

- [ ] **Step 1: Add `useUnreadCount` import**

In `components/admin/MessagesInbox.tsx`, add to the existing imports at the top:

```tsx
import { useUnreadCount } from '@/lib/contexts/unread-count-context'
```

- [ ] **Step 2: Destructure `markRead` from the hook**

Inside the `MessagesInbox` component body, add after the existing hook declarations (e.g., after `const isMobile = useIsMobile()`):

```tsx
const { markRead } = useUnreadCount()
```

- [ ] **Step 3: Call `markRead` inside the existing guard in `selectMessage`**

Find this existing block in `selectMessage` (around line 249):

```tsx
if (msg && !msg.is_read) {
  setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m))
  fetch('/api/admin/messages', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, is_read: true }),
  })
}
```

Add `markRead()` inside the guard, after the `fetch` call:

```tsx
if (msg && !msg.is_read) {
  setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m))
  fetch('/api/admin/messages', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, is_read: true }),
  })
  markRead()
}
```

- [ ] **Step 4: Run the test suite**

```bash
bash scripts/test.sh
```
Expected: all tests pass

- [ ] **Step 5: Manually verify end-to-end**

1. Navigate to `/admin` — note the badge count on the Messages tile and sidebar
2. Navigate to `/admin/messages` — open an unread message
3. Navigate back to `/admin` — badge count should be one lower
4. While on `/admin`, wait 45 seconds — badge should update if new messages arrived

- [ ] **Step 6: Commit**

```bash
git add components/admin/MessagesInbox.tsx
git commit -m "feat: decrement unread badge immediately when message is opened"
```

---

## Task 7: Full Test Run and Cleanup

- [ ] **Step 1: Run the complete test suite**

```bash
bash scripts/test.sh
```
Expected: all tests pass, no new failures

- [ ] **Step 2: Build check**

```bash
bash scripts/build.sh
```
Expected: clean build with no TypeScript errors

- [ ] **Step 3: Final commit if any cleanup was needed**

If the build revealed any type errors or lint issues, fix them and commit:

```bash
git add -p
git commit -m "fix: address build warnings from unread badge feature"
```
