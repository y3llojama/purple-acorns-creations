'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import SquareChannelCard from './SquareChannelCard'
import PinterestChannelCard from './PinterestChannelCard'

interface ChannelsData {
  square: {
    status: { connected: boolean; enabled: boolean; locationId: string | null; hasAppCredentials: boolean; environment: string; logLevel: string; logExpiresAt: string | null }
    conflicts: Array<{ product_id: string; channel: string; error: string | null; products: { name: string } | null }>
    recentErrors: Array<{ error: string | null; created_at: string }>
  }
  pinterest: {
    status: { connected: boolean; enabled: boolean; catalogId: string | null }
    conflicts: Array<{ product_id: string; channel: string; error: string | null; products: { name: string } | null }>
    recentErrors: Array<{ error: string | null; created_at: string }>
  }
}

export default function ChannelsManager() {
  const [data, setData] = useState<ChannelsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const hasLoaded = useRef(false)

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const oauthError = params?.get('error') ?? null
  const oauthDetail = params?.get('detail') ?? null

  const fetchData = useCallback(async () => {
    if (!hasLoaded.current) setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/channels')
      if (!res.ok) {
        setError('Failed to load channels data.')
        return
      }
      const json = await res.json()
      setData(json)
      hasLoaded.current = true
    } catch {
      setError('Network error loading channels.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Loading channels…</p>
  }

  if (error) {
    return (
      <div>
        <p role="alert" style={{ color: 'var(--color-error)', marginBottom: '12px' }}>{error}</p>
        <button
          onClick={fetchData}
          style={{
            background: 'var(--color-primary)',
            color: 'var(--color-accent)',
            padding: '10px 20px',
            fontSize: '16px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            minHeight: '48px',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      <SquareChannelCard
        status={data.square.status}
        conflicts={data.square.conflicts}
        recentErrors={data.square.recentErrors}
        onRefresh={fetchData}
        oauthError={oauthError === 'square_token' || oauthError === 'square_denied' || oauthError === 'square_location' ? (oauthDetail ?? oauthError) : null}
      />
      <PinterestChannelCard
        status={data.pinterest.status}
        conflicts={data.pinterest.conflicts}
        recentErrors={data.pinterest.recentErrors}
        onRefresh={fetchData}
      />
    </div>
  )
}
