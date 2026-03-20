'use client'

import Link from 'next/link'
import { useSavedItems } from '@/lib/saved-items'

export default function SavedItemsPage() {
  const { items, toggle } = useSavedItems()

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

        .saved-card-remove {
          position: absolute;
          top: 10px;
          right: 10px;
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
        .saved-card-remove:hover { transform: scale(1.1); }

        .saved-empty {
          text-align: center;
          padding: 80px 0;
        }
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
              <div key={item.id} className="saved-card">
                {/* Image */}
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt={item.title ?? ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--color-border) 0%, var(--color-surface) 100%)' }} />
                  )}
                  <button
                    className="saved-card-remove"
                    aria-label={`Remove ${item.title ?? 'item'} from saved items`}
                    onClick={() => toggle(item)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-primary, #7b5ea7)" stroke="var(--color-primary, #7b5ea7)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                </div>

                {/* Title */}
                {item.title && (
                  <div style={{ padding: '12px 14px' }}>
                    <p style={{ fontSize: '13px', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500, margin: 0, color: 'var(--color-text)' }}>
                      {item.title}
                    </p>
                  </div>
                )}
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
