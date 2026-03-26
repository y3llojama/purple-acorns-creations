'use client'

import { useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'

/** Generate or retrieve an anonymous session ID from sessionStorage */
function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  const KEY = 'pac_sid'
  let sid = sessionStorage.getItem(KEY)
  if (!sid) {
    sid = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    sessionStorage.setItem(KEY, sid)
  }
  return sid
}

/** Debounced event queue — batches events and sends them periodically */
const EVENT_QUEUE: Array<Record<string, unknown>> = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL = 2000 // 2 seconds

async function flushEvents() {
  if (EVENT_QUEUE.length === 0) return
  const events = EVENT_QUEUE.splice(0, EVENT_QUEUE.length)
  for (const evt of events) {
    try {
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evt),
        keepalive: true,
      })
    } catch {
      // Silently drop — analytics should never break the user experience
    }
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushEvents()
  }, FLUSH_INTERVAL)
}

function queueEvent(event: Record<string, unknown>) {
  EVENT_QUEUE.push(event)
  scheduleFlush()
}

export default function AnalyticsTracker() {
  const pathname = usePathname()
  const isFirstLoad = useRef(true)
  const lastTrackedPath = useRef<string | null>(null)

/** Capture UTM params from URL and persist in sessionStorage for the session */
function getUtmParams(): Record<string, string> | null {
  const KEY = 'pac_utms'
  const stored = sessionStorage.getItem(KEY)
  if (stored) {
    try { return JSON.parse(stored) } catch { /* ignore */ }
  }
  const params = new URLSearchParams(window.location.search)
  const utms: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const val = params.get(key)
    if (val) utms[key] = val
  }
  if (Object.keys(utms).length === 0) return null
  sessionStorage.setItem(KEY, JSON.stringify(utms))
  return utms
}

  const trackPageView = useCallback((path: string) => {
    if (path === lastTrackedPath.current) return
    lastTrackedPath.current = path

    const event: Record<string, unknown> = {
      event_type: 'page_view',
      page_path: path,
      session_id: getSessionId(),
    }

    // Include referrer only on the first page load
    if (isFirstLoad.current) {
      isFirstLoad.current = false
      const ref = document.referrer
      // Only include external referrers (not self-referrals)
      if (ref && !ref.includes(window.location.hostname)) {
        event.referrer = ref
      }
      const utms = getUtmParams()
      if (utms) event.metadata = utms
    } else {
      // Attach persisted UTMs to subsequent page views in same session
      const stored = sessionStorage.getItem('pac_utms')
      if (stored) {
        try { event.metadata = JSON.parse(stored) } catch { /* ignore */ }
      }
    }

    queueEvent(event)
  }, [])

  useEffect(() => {
    trackPageView(pathname)
  }, [pathname, trackPageView])

  // Flush on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      flushEvents()
    }
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleUnload()
    })
    return () => {
      handleUnload()
    }
  }, [])

  return null // This component renders nothing
}
