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
