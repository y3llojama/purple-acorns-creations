'use client'
import { createContext, useContext, useState, useCallback, useRef } from 'react'

type DiscoverState = 'idle' | 'searching' | 'done'

interface DiscoveryContextValue {
  state: DiscoverState
  message: string | null
  error: string | null
  startDiscovery: () => void
  dismiss: () => void
}

const DiscoveryContext = createContext<DiscoveryContextValue>({
  state: 'idle',
  message: null,
  error: null,
  startDiscovery: () => {},
  dismiss: () => {},
})

export function useDiscovery() {
  return useContext(DiscoveryContext)
}

export function DiscoveryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DiscoverState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resolvedRef = useRef(false)

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  const resolve = useCallback((msg: string | null, err: string | null) => {
    if (resolvedRef.current) return
    resolvedRef.current = true
    stopPolling()
    setMessage(msg)
    setError(err)
    setState('done')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback(() => {
    setState('idle')
    setMessage(null)
    setError(null)
    resolvedRef.current = false
  }, [])

  const startDiscovery = useCallback(async () => {
    if (state === 'searching') return
    setState('searching')
    setMessage(null)
    setError(null)
    resolvedRef.current = false

    // Snapshot current event count so we can detect additions via polling
    let baseCount = 0
    try {
      const r = await fetch('/api/admin/events')
      if (r.ok) { const ev = await r.json(); baseCount = Array.isArray(ev) ? ev.length : 0 }
    } catch { /* best-effort */ }

    // Fire the discovery request. keepalive: true keeps it alive even after navigation.
    const discoverPromise = fetch('/api/admin/events/discover', { method: 'POST', keepalive: true })
      .then(r => r.ok ? r.json() : r.json().then((d: { error?: string }) => ({ error: d.error ?? 'Discovery failed. Please try again.' })))
      .catch(() => ({ error: 'Discovery failed. Please try again.' }))

    // Poll the events list every 5s so results show early if the user stays on the page
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const r = await fetch('/api/admin/events')
        if (r.ok) {
          const ev = await r.json()
          const newCount = Array.isArray(ev) ? ev.length : 0
          if (newCount > baseCount) {
            const added = newCount - baseCount
            resolve(`${added} event${added !== 1 ? 's' : ''} added!`, null)
            return
          }
        }
      } catch { /* best-effort */ }
      if (attempts >= 20) stopPolling() // safety: stop after 100s
    }, 5000)

    // When the discover fetch resolves, use its result as the source of truth
    discoverPromise.then((data: { added?: number; skipped?: number; error?: string }) => {
      if (data.error) {
        resolve(null, data.error)
      } else if ((data.added ?? 0) > 0) {
        const added = data.added!
        resolve(`${added} event${added !== 1 ? 's' : ''} added${data.skipped ? `, ${data.skipped} already in your list` : ''}!`, null)
      } else {
        resolve('No new events found.', null)
      }
    })
  }, [state, resolve])

  return (
    <DiscoveryContext.Provider value={{ state, message, error, startDiscovery, dismiss }}>
      {children}
    </DiscoveryContext.Provider>
  )
}
