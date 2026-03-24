'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
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
  children: ReactNode
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
    return () => {
      if ('clearAppBadge' in navigator) navigator.clearAppBadge()
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
