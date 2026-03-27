'use client'

import { useState, useEffect, useRef, use } from 'react'
import Link from 'next/link'
import { Heart, HeartPlus, HeartHandshake, Link2 } from 'lucide-react'
import { useToast } from '@/components/shop/ToastContext'

interface SharedItem {
  product_id: string
  name: string
  price: number
  images: string[]
  availability: string
  added_at: string
}

interface SharedListData {
  id: string
  is_snapshot: boolean
  is_live: boolean
  updated_at: string
  items: SharedItem[]
}

export default function SharedListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const { toast } = useToast()
  const [data, setData] = useState<SharedListData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set())
  const [showHandshake, setShowHandshake] = useState(false)
  const lastUpdatedRef = useRef<string | null>(null)

  const [editToken, setEditToken] = useState<string | null>(null)
  useEffect(() => {
    const hash = window.location.hash
    const match = hash.match(/edit=([a-f0-9-]+)/i)
    if (match) setEditToken(match[1])
  }, [])

  useEffect(() => {
    async function fetchList() {
      const res = await fetch(`/api/shop/saved-lists/${slug}`)
      if (!res.ok) {
        setError(res.status === 404 ? 'This shared list was not found.' : 'Failed to load list.')
        setLoading(false)
        return
      }
      const listData: SharedListData = await res.json()
      setData(listData)
      lastUpdatedRef.current = listData.updated_at
      setLoading(false)
    }
    fetchList()
  }, [slug])

  useEffect(() => {
    if (!data?.is_live) return

    const interval = setInterval(async () => {
      if (document.hidden) return
      const res = await fetch(`/api/shop/saved-lists/${slug}`)
      if (!res.ok) return
      const listData: SharedListData = await res.json()

      if (lastUpdatedRef.current && listData.updated_at !== lastUpdatedRef.current) {
        setShowHandshake(true)
        setTimeout(() => setShowHandshake(false), 5000)
      }

      lastUpdatedRef.current = listData.updated_at
      setData(listData)
    }, 30_000)

    return () => clearInterval(interval)
  }, [data?.is_live, slug])

  async function addToMine(productId: string) {
    let myToken = localStorage.getItem('pa-list-token')
    if (!myToken) {
      const res = await fetch('/api/shop/saved-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!res.ok) { toast('Failed to create your list'); return }
      const { token } = await res.json()
      localStorage.setItem('pa-list-token', token)
      myToken = token
    }

    const res = await fetch(`/api/shop/saved-lists/${slug}/add-to-mine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ my_token: myToken, product_id: productId }),
    })

    if (res.ok) {
      setAddedItems(prev => new Set(prev).add(productId))
      toast('Added to your favorites')
      window.dispatchEvent(new CustomEvent('pa-saved-items-changed'))
    } else {
      const err = await res.json().catch(() => ({}))
      toast(err.error || 'Failed to add')
    }
  }

  async function toggleLiveItem(productId: string) {
    if (!editToken) return
    const isInList = data?.items.some(i => i.product_id === productId)

    const endpoint = isInList
      ? '/api/shop/saved-lists/items/remove'
      : '/api/shop/saved-lists/items'

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: editToken, product_id: productId }),
    })

    if (res.ok) {
      const listRes = await fetch(`/api/shop/saved-lists/${slug}`)
      if (listRes.ok) {
        const listData = await listRes.json()
        setData(listData)
        lastUpdatedRef.current = listData.updated_at
      }
    }
  }

  function copyProductLink(productId: string) {
    const url = `${window.location.origin}/shop/${productId}`
    navigator.clipboard.writeText(url).then(() => toast('Link copied!'))
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading shared list...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '18px' }}>{error || 'List not found'}</p>
        <Link href="/shop" style={{ color: 'var(--color-accent)', fontSize: '13px', textDecoration: 'none', letterSpacing: '0.06em' }}>
          Browse the Collection →
        </Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)' }}>
      <style>{`
        .shared-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-top: 40px;
        }
        @media (max-width: 900px) { .shared-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .shared-grid { grid-template-columns: repeat(2, 1fr); } }

        .shared-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }

        .shared-card-action {
          position: absolute;
          top: 10px;
          background: rgba(255,255,255,0.92);
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease;
          z-index: 2;
          padding: 0;
          backdrop-filter: blur(4px);
        }
        .shared-card-action:hover { transform: scale(1.1); }
      `}</style>

      {/* Banner */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '12px 16px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {showHandshake && <HeartHandshake size={18} stroke="var(--color-accent)" />}
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {data.is_snapshot
            ? 'Shared favorites list'
            : data.is_live && editToken
              ? 'Shared live list \u2014 anyone with this link can add or remove items. Share carefully.'
              : 'Shared favorites list'
          }
        </p>
      </div>

      {/* Header */}
      <div>
        <p style={{ color: 'var(--color-accent)', fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 8px 0' }}>
          Shared Collection
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
          Favorites
          <span style={{ fontSize: '16px', fontFamily: "'Jost', sans-serif", fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '12px' }}>
            {data.items.length} {data.items.length === 1 ? 'piece' : 'pieces'}
          </span>
        </h1>
      </div>

      {data.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '18px' }}>This list is empty.</p>
        </div>
      ) : (
        <div className="shared-grid">
          {data.items.map(item => (
            <div key={item.product_id} className="shared-card">
              <Link href={`/shop/${item.product_id}`} style={{ textDecoration: 'none' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
                  {item.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.images[0]}
                      alt={item.name ?? ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--color-border) 0%, var(--color-surface) 100%)' }} />
                  )}
                  {item.availability === 'sold_out' && (
                    <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'var(--color-text-muted)', color: 'var(--color-surface)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                      Sold out
                    </div>
                  )}
                </div>
              </Link>

              {data.is_live && editToken ? (
                <button
                  className="shared-card-action"
                  style={{ right: '10px' }}
                  aria-label={`Toggle ${item.name} in shared list`}
                  onClick={() => toggleLiveItem(item.product_id)}
                >
                  <Heart size={16} fill="var(--color-primary)" stroke="var(--color-primary)" />
                </button>
              ) : (
                <button
                  className="shared-card-action"
                  style={{ right: '10px' }}
                  aria-label={addedItems.has(item.product_id) ? `${item.name} added to your favorites` : `Add ${item.name} to my favorites`}
                  onClick={() => addToMine(item.product_id)}
                  disabled={addedItems.has(item.product_id)}
                >
                  <HeartPlus
                    size={16}
                    stroke={addedItems.has(item.product_id) ? 'var(--color-primary)' : 'var(--color-text-muted)'}
                    fill={addedItems.has(item.product_id) ? 'var(--color-primary)' : 'none'}
                  />
                </button>
              )}

              <button
                className="shared-card-action"
                style={{ right: '52px' }}
                aria-label={`Copy link for ${item.name}`}
                onClick={() => copyProductLink(item.product_id)}
              >
                <Link2 size={14} stroke="var(--color-text-muted)" />
              </button>

              <div style={{ padding: '12px 14px' }}>
                {item.name && (
                  <p style={{ fontSize: '13px', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, margin: 0, color: 'var(--color-text)' }}>
                    {item.name}
                  </p>
                )}
                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                  ${item.price.toFixed(2)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '48px', textAlign: 'center' }}>
        <Link
          href="/shop"
          style={{ color: 'var(--color-accent)', fontSize: '13px', textDecoration: 'none', letterSpacing: '0.06em' }}
        >
          Browse the Collection →
        </Link>
      </div>
    </div>
  )
}
