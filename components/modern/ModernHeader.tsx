'use client'
import { useState } from 'react'
import Link from 'next/link'

interface Props {
  logoUrl: string | null
  businessName: string
  squareStoreUrl: string | null
}

export default function ModernHeader({ logoUrl, businessName, squareStoreUrl }: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const cartHref = squareStoreUrl ?? '/shop'
  const cartIsExternal = !!squareStoreUrl

  return (
    <header
      style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        position: 'sticky',
        top: 0,
        zIndex: 200,
        width: '100%',
      }}
    >
      <style>{`
        .modern-header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
          padding: 0 clamp(16px, 4vw, 48px);
        }

        @media (max-width: 768px) {
          .modern-header-inner {
            height: 56px;
          }
        }

        .modern-header-icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 20px;
          color: var(--color-text);
          min-width: 48px;
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: color 0.2s ease;
          padding: 0;
        }

        .modern-header-icon-btn:hover {
          color: var(--color-accent);
        }

        .modern-header-search-wrap {
          display: flex;
          align-items: center;
          overflow: hidden;
          max-width: 0;
          transition: max-width 0.4s cubic-bezier(0.46, 0.01, 0.32, 1);
        }

        .modern-header-search-wrap.open {
          max-width: 240px;
        }

        .modern-header-search-input {
          border: 1px solid var(--color-border);
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 14px;
          color: var(--color-text);
          background: var(--color-surface);
          outline: none;
          width: 200px;
          white-space: nowrap;
        }

        .modern-header-search-input:focus {
          border-color: var(--color-accent);
        }

        .modern-header-business-name {
          font-family: 'Jost', sans-serif;
          font-weight: 600;
          font-size: clamp(14px, 2vw, 20px);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--color-primary);
          text-decoration: none;
        }
      `}</style>

      <div className="modern-header-inner">
        {/* Logo / Business name */}
        <Link href="/" aria-label={`${businessName} — home`} style={{ textDecoration: 'none', flexShrink: 0 }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={businessName}
              style={{
                height: 'clamp(48px, 8vw, 80px)',
                maxWidth: 'clamp(120px, 24vw, 280px)',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : (
            <span className="modern-header-business-name">{businessName}</span>
          )}
        </Link>

        {/* Right icon group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Search slide-in */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div className={`modern-header-search-wrap${searchOpen ? ' open' : ''}`}>
              <input
                className="modern-header-search-input"
                type="search"
                placeholder="Search..."
                value={searchQuery}
                aria-label="Search"
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {searchOpen && (
              <button
                className="modern-header-icon-btn"
                aria-label="Close search"
                onClick={() => {
                  setSearchOpen(false)
                  setSearchQuery('')
                }}
                style={{ fontSize: '16px' }}
              >
                ✕
              </button>
            )}

            <button
              className="modern-header-icon-btn"
              aria-label={searchOpen ? 'Submit search' : 'Open search'}
              aria-expanded={searchOpen}
              onClick={() => setSearchOpen(o => !o)}
            >
              🔍
            </button>
          </div>

          {/* Cart */}
          {cartIsExternal ? (
            <a
              href={cartHref}
              rel="noopener noreferrer"
              target="_blank"
              aria-label="Visit our shop"
              className="modern-header-icon-btn"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '20px',
                color: 'var(--color-text)',
                minWidth: '48px',
                minHeight: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                textDecoration: 'none',
              }}
            >
              🛍
            </a>
          ) : (
            <Link
              href="/shop"
              aria-label="Shop"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '20px',
                color: 'var(--color-text)',
                minWidth: '48px',
                minHeight: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                textDecoration: 'none',
              }}
            >
              🛍
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
