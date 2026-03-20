'use client'
import { useState, useEffect, useCallback } from 'react'
import SquareChannelCard from './SquareChannelCard'
import PinterestChannelCard from './PinterestChannelCard'

interface ChannelsData {
  square: {
    status: { connected: boolean; enabled: boolean; locationId: string | null; hasAppCredentials: boolean; environment: string }
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

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/channels')
      if (!res.ok) {
        setError('Failed to load channels data.')
        return
      }
      const json = await res.json()
      setData(json)
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
