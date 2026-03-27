'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Heart, Link2 } from 'lucide-react'
import { useSavedItems } from '@/lib/saved-items'
import { useToast } from '@/components/shop/ToastContext'

export default function SavedItemsPage() {
  const { items, toggle, loading } = useSavedItems()
  const { toast } = useToast()
  const [sharing, setSharing] = useState(false)

  async function handleShare(mode: 'copy' | 'live') {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pa-list-token') : null
    if (!token) return

    setSharing(true)
    try {
      const res = await fetch('/api/shop/saved-lists/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, mode }),
      })
      if (!res.ok) { toast('Failed to generate share link'); return }
      const { url } = await res.json()
      await navigator.clipboard.writeText(url)
      toast(mode === 'copy' ? 'Snapshot link copied!' : 'Live list link copied!')
    } catch {
      toast('Failed to share')
    } finally {
      setSharing(false)
    }
  }

  async function handleStopSharing() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pa-list-token') : null
    if (!token) return
    const res = await fetch('/api/shop/saved-lists/stop-sharing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (res.ok) toast('Sharing stopped')
    else toast('Failed to stop sharing')
  }

  function copyProductLink(productId: string) {
    const url = `${window.location.origin}/shop/${productId}`
    navigator.clipboard.writeText(url).then(() => toast('Link copied!'))
  }

  if (loading) {
    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading your saved items...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 48px)' }}>
      <style>{`
        .saved-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-top: 40px;
        }
        @media (max-width: 900px) { .saved-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .saved-grid { grid-template-columns: repeat(2, 1fr); } }

        .saved-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }

        .saved-card-action {
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
        .saved-card-action:hover { transform: scale(1.1); }

        .saved-empty {
          text-align: center;
          padding: 80px 0;
        }

        .share-btn {
          padding: 8px 16px;
          font-size: 12px;
          font-family: 'Jost', sans-serif;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          background: var(--color-surface);
          color: var(--color-text);
          cursor: pointer;
          min-height: 48px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .share-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
        .share-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <div>
        <p style={{ color: 'var(--color-accent)', fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 8px 0' }}>
          Your Picks
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)', fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
          Saved Items
          {items.length > 0 && (
            <span style={{ fontSize: '16px', fontFamily: "'Jost', sans-serif", fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '12px' }}>
              {items.length} {items.length === 1 ? 'piece' : 'pieces'}
            </span>
          )}
        </h1>
      </div>

      {/* Share actions */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button className="share-btn" onClick={() => handleShare('copy')} disabled={sharing}>
            <Link2 size={14} /> Share a Copy
          </button>
          <button className="share-btn" onClick={() => handleShare('live')} disabled={sharing}>
            <Link2 size={14} /> Share Live List
          </button>
          <button className="share-btn" onClick={handleStopSharing}>
            Stop Sharing
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="saved-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="1.4" aria-hidden="true" style={{ display: 'block', margin: '0 auto 20px' }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '18px', margin: '0 0 24px 0' }}>
            You haven&apos;t saved any pieces yet.
          </p>
          <Link
            href="/shop"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: 'var(--color-primary)',
              color: '#fff',
              fontFamily: "'Jost', sans-serif",
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              borderRadius: '2px',
            }}
          >
            Browse the Collection
          </Link>
        </div>
      ) : (
        <>
          <div className="saved-grid">
            {items.map(item => (
              <div key={item.product_id} className="saved-card">
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

                <button
                  className="saved-card-action"
                  style={{ right: '10px' }}
                  aria-label={`Remove ${item.name} from saved items`}
                  onClick={() => toggle(item.product_id, { name: item.name, price: item.price, images: item.images })}
                >
                  <Heart size={16} fill="var(--color-primary, #7b5ea7)" stroke="var(--color-primary, #7b5ea7)" />
                </button>
                <button
                  className="saved-card-action"
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

          <div style={{ marginTop: '48px', textAlign: 'center' }}>
            <Link
              href="/shop"
              style={{
                color: 'var(--color-accent)',
                fontSize: '13px',
                textDecoration: 'none',
                letterSpacing: '0.06em',
              }}
            >
              Continue browsing →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
