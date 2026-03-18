'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

// ── Nav data ─────────────────────────────────────────────────────────────────

interface NavLink { label: string; href: string }
interface NavColumn { heading: string; links: NavLink[] }
interface NavItem {
  label: string
  href: string
  /** Desktop: categorised mega-menu columns */
  columns?: NavColumn[]
  /** Mobile: flat link list */
  mobile?: NavLink[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Shop',
    href: '/shop',
    columns: [
      {
        heading: 'Featured',
        links: [
          { label: 'New Arrivals', href: '/shop' },
          { label: 'Gift Sets', href: '/shop' },
          { label: 'All Products', href: '/shop' },
        ],
      },
      {
        heading: 'By Craft',
        links: [
          { label: 'Ceramics', href: '/shop' },
          { label: 'Textiles', href: '/shop' },
          { label: 'Mixed Media', href: '/shop' },
          { label: 'Wall Art', href: '/shop' },
        ],
      },
      {
        heading: 'Collections',
        links: [
          { label: 'Seasonal', href: '/shop' },
          { label: 'Limited Edition', href: '/shop' },
          { label: 'Handmade Favourites', href: '/shop' },
        ],
      },
    ],
    mobile: [
      { label: 'New Arrivals', href: '/shop' },
      { label: 'Ceramics', href: '/shop' },
      { label: 'Textiles', href: '/shop' },
      { label: 'Gift Sets', href: '/shop' },
      { label: 'All Products', href: '/shop' },
    ],
  },
  {
    label: 'World of Purple Acorns',
    href: '/our-story',
    columns: [
      {
        heading: 'Our World',
        links: [
          { label: 'Our Story', href: '/our-story' },
          { label: 'Behind the Craft', href: '/our-story' },
          { label: 'The Makers', href: '/our-story' },
        ],
      },
      {
        heading: 'Community',
        links: [
          { label: 'Upcoming Events', href: '/#events' },
          { label: 'Markets & Fairs', href: '/#events' },
          { label: 'Newsletter', href: '/#newsletter' },
        ],
      },
    ],
    mobile: [
      { label: 'Our Story', href: '/our-story' },
      { label: 'Behind the Craft', href: '/our-story' },
      { label: 'Events', href: '/#events' },
    ],
  },
  {
    label: 'Visit Us',
    href: '/contact',
    columns: [
      {
        heading: 'Find Us',
        links: [
          { label: 'Studio & Gallery', href: '/contact' },
          { label: 'Hours', href: '/contact' },
          { label: 'Contact Us', href: '/contact' },
        ],
      },
    ],
    mobile: [
      { label: 'Studio', href: '/contact' },
      { label: 'Hours', href: '/contact' },
      { label: 'Contact', href: '/contact' },
    ],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  logoUrl: string | null
  businessName: string
  squareStoreUrl: string | null
}

export default function ModernHeader({ logoUrl, businessName, squareStoreUrl }: Props) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileOpenItem, setMobileOpenItem] = useState<string | null>(null)
  const headerRef = useRef<HTMLElement>(null)

  const cartHref = squareStoreUrl ?? '/shop'
  const cartIsExternal = !!squareStoreUrl

  // Close mega menu when clicking outside the entire header
  useEffect(() => {
    if (!hoveredItem) return
    function onPointer(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setHoveredItem(null)
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [hoveredItem])

  return (
    <header
      ref={headerRef}
      style={{ position: 'sticky', top: 0, zIndex: 200, background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', width: '100%' }}
    >
      <style>{`
        /* ── Bar layout ── */
        .mh-bar {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          height: 70px;
          padding: 0 clamp(16px, 4vw, 48px);
        }

        /* ── Desktop nav ── */
        .mh-desktop-nav { display: flex; align-items: center; }

        .mh-nav-item { position: relative; }

        .mh-nav-link {
          display: flex;
          align-items: center;
          height: 70px;
          padding: 0 18px;
          font-family: 'Jost', sans-serif;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--color-text);
          text-decoration: none;
          white-space: nowrap;
          transition: color 0.2s ease;
          position: relative;
          cursor: pointer;
          background: none;
          border: none;
        }

        .mh-nav-link::after {
          content: '';
          position: absolute;
          bottom: 16px;
          left: 18px;
          right: 18px;
          height: 1px;
          background: var(--color-primary);
          transform: scaleX(0);
          transform-origin: left center;
          transition: transform 0.25s ease;
        }

        .mh-nav-link:hover,
        .mh-nav-link.active {
          color: var(--color-primary);
        }

        .mh-nav-link:hover::after,
        .mh-nav-link.active::after {
          transform: scaleX(1);
        }

        /* ── Mega menu ── */
        .mh-mega {
          position: absolute;
          top: 100%;
          left: 0;
          /* stretch to full viewport width, anchored to left edge of header */
          width: 100vw;
          background: var(--color-surface);
          border-top: 2px solid var(--color-primary);
          box-shadow: 0 12px 40px rgba(0,0,0,0.10);
          opacity: 0;
          pointer-events: none;
          transform: translateY(-6px);
          transition: opacity 0.22s ease, transform 0.22s ease;
          z-index: 300;
        }

        /* Offset so the mega menu left edge aligns with the viewport, not the nav item */
        .mh-mega-offset {
          /* will be set inline per item via JS — fallback 0 */
          left: 0;
        }

        .mh-mega.visible {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .mh-mega-inner {
          display: flex;
          gap: 48px;
          padding: 32px clamp(24px, 6vw, 64px) 36px;
          max-width: 900px;
        }

        .mh-mega-col { min-width: 140px; }

        .mh-mega-heading {
          font-family: 'Jost', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--color-primary);
          margin-bottom: 14px;
          opacity: 0.7;
        }

        .mh-mega-link {
          display: block;
          padding: 6px 0;
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          font-weight: 400;
          letter-spacing: 0.04em;
          color: var(--color-text);
          text-decoration: none;
          transition: color 0.15s ease, padding-left 0.15s ease;
          white-space: nowrap;
        }

        .mh-mega-link:hover {
          color: var(--color-primary);
          padding-left: 6px;
        }

        /* ── Logo ── */
        .mh-logo {
          display: flex;
          justify-content: center;
          align-items: center;
          text-decoration: none;
        }

        .mh-logo-text {
          font-family: 'Jost', sans-serif;
          font-weight: 700;
          font-size: clamp(13px, 2vw, 19px);
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--color-text);
          white-space: nowrap;
        }

        .mh-logo img {
          height: clamp(40px, 6vw, 60px);
          max-width: clamp(100px, 18vw, 220px);
          object-fit: contain;
          display: block;
        }

        /* ── Right icons ── */
        .mh-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
        }

        .mh-icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--color-text);
          min-width: 44px;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          text-decoration: none;
          transition: color 0.2s ease;
          padding: 0;
        }

        .mh-icon-btn:hover { color: var(--color-primary); }

        /* ── Search slide-in ── */
        .mh-search-wrap {
          overflow: hidden;
          max-width: 0;
          transition: max-width 0.4s cubic-bezier(0.46, 0.01, 0.32, 1);
          display: flex;
          align-items: center;
        }
        .mh-search-wrap.open { max-width: 220px; }

        .mh-search-input {
          border: 1px solid var(--color-border);
          border-radius: 4px;
          padding: 6px 10px;
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          color: var(--color-text);
          background: var(--color-surface);
          outline: none;
          width: 180px;
        }
        .mh-search-input:focus { border-color: var(--color-primary); }

        /* ── Hamburger ── */
        .mh-hamburger {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          min-width: 44px;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 5px;
          padding: 0;
        }

        .mh-hamburger-line {
          width: 22px;
          height: 1.5px;
          background: var(--color-text);
          transition: transform 0.3s ease, opacity 0.3s ease;
          display: block;
        }

        .mh-hamburger.open .mh-hamburger-line:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
        .mh-hamburger.open .mh-hamburger-line:nth-child(2) { opacity: 0; }
        .mh-hamburger.open .mh-hamburger-line:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

        /* ── Mobile drawer ── */
        .mh-mobile-drawer {
          overflow: hidden;
          max-height: 0;
          transition: max-height 0.4s cubic-bezier(0.46, 0.01, 0.32, 1);
          background: var(--color-surface);
          border-bottom: 1px solid var(--color-border);
        }
        .mh-mobile-drawer.open { max-height: 600px; }

        .mh-mobile-item-btn {
          width: 100%;
          background: none;
          border: none;
          border-bottom: 1px solid var(--color-border);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px clamp(16px, 4vw, 48px);
          font-family: 'Jost', sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--color-text);
        }

        .mh-mobile-children {
          overflow: hidden;
          max-height: 0;
          transition: max-height 0.4s cubic-bezier(0.46, 0.01, 0.32, 1);
          background: color-mix(in srgb, var(--color-surface) 95%, var(--color-border) 5%);
        }
        .mh-mobile-children.open { max-height: 280px; }

        .mh-mobile-child-link {
          display: flex;
          align-items: center;
          min-height: 44px;
          padding: 10px clamp(28px, 6vw, 64px);
          font-family: 'Jost', sans-serif;
          font-size: 11px;
          font-weight: 400;
          letter-spacing: 0.08em;
          color: var(--color-text);
          text-decoration: none;
          border-bottom: 1px solid var(--color-border);
          transition: color 0.15s ease;
        }
        .mh-mobile-child-link:last-child { border-bottom: none; }
        .mh-mobile-child-link:hover { color: var(--color-primary); }

        /* ── Mobile overrides ── */
        @media (max-width: 900px) {
          .mh-bar { height: 56px; }
          .mh-desktop-nav { display: none; }
          .mh-hamburger { display: flex; }
        }
      `}</style>

      {/* ── Main bar ── */}
      <div className="mh-bar">

        {/* Left */}
        <div>
          <nav className="mh-desktop-nav" aria-label="Main navigation">
            {NAV_ITEMS.map(item => (
              <div
                key={item.label}
                className="mh-nav-item"
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <Link
                  href={item.href}
                  className={`mh-nav-link${hoveredItem === item.label ? ' active' : ''}`}
                >
                  {item.label}
                </Link>

                {/* Mega menu — full-width panel */}
                {item.columns && (
                  <MegaMenu
                    columns={item.columns}
                    visible={hoveredItem === item.label}
                  />
                )}
              </div>
            ))}
          </nav>

          <button
            className={`mh-hamburger${mobileOpen ? ' open' : ''}`}
            onClick={() => { setMobileOpen(o => !o); setMobileOpenItem(null) }}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mh-mobile-drawer"
          >
            <span className="mh-hamburger-line" />
            <span className="mh-hamburger-line" />
            <span className="mh-hamburger-line" />
          </button>
        </div>

        {/* Center: logo */}
        <Link href="/" className="mh-logo" aria-label={`${businessName} — home`}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={businessName} />
          ) : (
            <span className="mh-logo-text">{businessName}</span>
          )}
        </Link>

        {/* Right: search + cart */}
        <div className="mh-right">
          <div className={`mh-search-wrap${searchOpen ? ' open' : ''}`}>
            <input
              className="mh-search-input"
              type="search"
              placeholder="Search…"
              value={searchQuery}
              aria-label="Search"
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {searchOpen && (
            <button
              className="mh-icon-btn"
              aria-label="Close search"
              onClick={() => { setSearchOpen(false); setSearchQuery('') }}
              style={{ fontSize: '14px' }}
            >
              ✕
            </button>
          )}

          <button
            className="mh-icon-btn"
            aria-label={searchOpen ? 'Submit search' : 'Open search'}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(o => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>

          {cartIsExternal ? (
            <a href={cartHref} rel="noopener noreferrer" target="_blank" aria-label="Visit our shop" className="mh-icon-btn">
              <BagIcon />
            </a>
          ) : (
            <Link href="/shop" aria-label="Shop" className="mh-icon-btn">
              <BagIcon />
            </Link>
          )}
        </div>
      </div>

      {/* ── Mobile slide-down drawer ── */}
      <nav
        id="mh-mobile-drawer"
        className={`mh-mobile-drawer${mobileOpen ? ' open' : ''}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
      >
        {NAV_ITEMS.map(item => (
          <div key={item.label}>
            <button
              className="mh-mobile-item-btn"
              onClick={() => setMobileOpenItem(prev => prev === item.label ? null : item.label)}
              aria-expanded={mobileOpenItem === item.label}
            >
              {item.label}
              <span aria-hidden="true" style={{ fontSize: '9px' }}>
                {mobileOpenItem === item.label ? '▲' : '▼'}
              </span>
            </button>
            <div className={`mh-mobile-children${mobileOpenItem === item.label ? ' open' : ''}`}>
              {(item.mobile ?? item.columns?.flatMap(c => c.links) ?? []).map(link => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="mh-mobile-child-link"
                  onClick={() => { setMobileOpen(false); setMobileOpenItem(null) }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </header>
  )
}

// ── Mega menu panel ───────────────────────────────────────────────────────────

function MegaMenu({ columns, visible }: { columns: NavColumn[]; visible: boolean }) {
  const navItemRef = useRef<HTMLDivElement>(null)
  const [offsetLeft, setOffsetLeft] = useState(0)

  // Calculate how far left we need to shift to align with the viewport left edge
  useEffect(() => {
    if (!visible || !navItemRef.current) return
    const rect = navItemRef.current.getBoundingClientRect()
    setOffsetLeft(-rect.left)
  }, [visible])

  return (
    <div
      ref={navItemRef}
      className={`mh-mega${visible ? ' visible' : ''}`}
      style={{ left: `${offsetLeft}px` }}
      role="region"
    >
      <div className="mh-mega-inner">
        {columns.map(col => (
          <div key={col.heading} className="mh-mega-col">
            <div className="mh-mega-heading">{col.heading}</div>
            {col.links.map(link => (
              <Link key={link.label} href={link.href} className="mh-mega-link">
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function BagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  )
}
