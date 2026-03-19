'use client'

import { useState } from 'react'
import Link from 'next/link'

// ── Nav data ─────────────────────────────────────────────────────────────────

interface NavLink { label: string; href: string }
interface NavColumn { heading: string; links: NavLink[] }
interface NavPanel { headline: string; sub: string; href: string; cta: string; bg: string }
interface NavItem {
  label: string
  href: string
  columns?: NavColumn[]
  panel?: NavPanel
  mobile?: NavLink[]
}

function buildNavItems(businessName: string): NavItem[] { return [
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
    panel: {
      headline: 'Made by hand,\nworn with joy.',
      sub: 'Crochet jewelry, ceramics & textiles — each piece one of a kind.',
      href: '/shop',
      cta: 'Shop All',
      bg: 'linear-gradient(135deg, #4a2d6b 0%, #7b5ea7 60%, #a590c8 100%)',
    },
    mobile: [
      { label: 'New Arrivals', href: '/shop' },
      { label: 'Ceramics', href: '/shop' },
      { label: 'Textiles', href: '/shop' },
      { label: 'Gift Sets', href: '/shop' },
      { label: 'All Products', href: '/shop' },
    ],
  },
  {
    label: `World of ${businessName}`,
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
    panel: {
      headline: 'A mother &\ndaughter duo.',
      sub: 'A mother and daughter sharing a passion for making things by hand.',
      href: '/our-story',
      cta: 'Read Our Story',
      bg: 'linear-gradient(135deg, #3a2255 0%, #6b4c9a 55%, #9b7bb8 100%)',
    },
    mobile: [
      { label: 'Our Story', href: '/our-story' },
      { label: 'Behind the Craft', href: '/our-story' },
      { label: 'Events', href: '/#events' },
    ],
  },
  {
    label: 'Contact',
    href: '/contact',
    columns: [
      {
        heading: 'Get in Touch',
        links: [
          { label: 'Send a Message', href: '/contact' },
          { label: 'Custom Orders', href: '/contact' },
          { label: 'Wholesale Enquiries', href: '/contact' },
        ],
      },
    ],
    panel: {
      headline: 'We\'d love to\nhear from you.',
      sub: 'Questions, custom orders, or just a hello — reach out any time.',
      href: '/contact',
      cta: 'Contact Us',
      bg: 'linear-gradient(135deg, #2a1845 0%, #5c3d8a 55%, #8b6ab0 100%)',
    },
    mobile: [
      { label: 'Send a Message', href: '/contact' },
      { label: 'Custom Orders', href: '/contact' },
      { label: 'Wholesale', href: '/contact' },
    ],
  },
]}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  logoUrl: string | null
  businessName: string
  squareStoreUrl: string | null
}

export default function ModernHeader({ logoUrl, businessName, squareStoreUrl }: Props) {
  const NAV_ITEMS = buildNavItems(businessName)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileOpenItem, setMobileOpenItem] = useState<string | null>(null)

  const cartHref = squareStoreUrl ?? '/shop'
  const cartIsExternal = !!squareStoreUrl


  return (
    <header
      style={{ position: 'sticky', top: 0, zIndex: 200, background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', width: '100%', overflow: 'visible' }}
      onMouseLeave={() => setHoveredItem(null)}
    >
      <style>{`
        /* ── Bar layout ── */
        .mh-bar {
          display: grid;
          grid-template-columns: 1fr 200px 1fr;
          align-items: center;
          height: 100px;
          padding: 0 clamp(16px, 4vw, 48px);
          position: relative;
        }

        /* ── Desktop nav ── */
        .mh-desktop-nav { display: flex; align-items: center; }

        .mh-nav-item { position: relative; }

        .mh-nav-link {
          display: flex;
          align-items: center;
          height: 100px;
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
        /* Rendered as a direct child of the sticky <header>, so
           position:absolute top:100% always sits right below the header bar
           regardless of announcement banner height. */
        .mh-mega {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          width: 100%;
          background: var(--color-surface);
          border-top: 2px solid var(--color-primary);
          box-shadow: 0 16px 48px rgba(0,0,0,0.12);
          opacity: 0;
          pointer-events: none;
          transform: translateY(-10px);
          transition: opacity 0.3s cubic-bezier(0.46, 0.01, 0.32, 1),
                      transform 0.35s cubic-bezier(0.46, 0.01, 0.32, 1);
          z-index: 300;
        }

        .mh-mega.visible {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        @media (max-width: 900px) {
          .mh-mega { display: none; }
        }

        /* Two-column layout: links left, hero panel right */
        .mh-mega-inner {
          display: grid;
          grid-template-columns: 1fr auto;
          min-height: 280px;
        }

        .mh-mega-links {
          display: flex;
          gap: 48px;
          padding: 36px clamp(24px, 6vw, 64px) 40px;
          align-items: flex-start;
        }

        .mh-mega-col { min-width: 130px; }

        .mh-mega-heading {
          font-family: 'Jost', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--color-primary);
          margin-bottom: 16px;
          opacity: 0.65;
        }

        .mh-mega-link {
          display: block;
          padding: 5px 0;
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

        /* Right hero panel */
        .mh-mega-panel {
          width: clamp(260px, 30vw, 400px);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 36px 40px;
          position: relative;
          overflow: hidden;
          text-decoration: none;
        }

        .mh-mega-panel-headline {
          font-family: 'Jost', sans-serif;
          font-size: clamp(20px, 2.2vw, 28px);
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #ffffff;
          margin-bottom: 10px;
          line-height: 1.2;
          white-space: pre-line;
        }

        .mh-mega-panel-sub {
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          font-weight: 400;
          color: rgba(255,255,255,0.82);
          margin-bottom: 20px;
          line-height: 1.5;
        }

        .mh-mega-panel-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'Jost', sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.55);
          padding: 9px 18px;
          border-radius: 2px;
          transition: background 0.2s ease, border-color 0.2s ease;
          width: fit-content;
        }

        .mh-mega-panel:hover .mh-mega-panel-cta {
          background: rgba(255,255,255,0.15);
          border-color: #ffffff;
        }

        /* ── Logo — floats on its own layer, anchored to bar bottom ── */
        .mh-logo {
          position: absolute;
          left: 50%;
          bottom: 0;
          transform: translate(-50%, 50%);
          z-index: 10;
          text-decoration: none;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
        }

        .mh-logo-text {
          font-family: 'Jost', sans-serif;
          font-weight: 700;
          font-size: clamp(16px, 2.4vw, 24px);
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--color-text);
          white-space: nowrap;
        }

        .mh-logo img {
          height: clamp(120px, 13vw, 180px);
          width: auto;
          object-fit: contain;
          display: block;
          /* soft drop shadow so it reads on any background */
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.12));
        }

        /* ── Right icons ── */
        .mh-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          position: relative;
          z-index: 20;
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
          .mh-bar { height: 64px; }
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

      {/* ── Mega menu panels — direct children of sticky header so
           position:absolute top:100% lands right below the bar ── */}
      {NAV_ITEMS.map(item => item.columns ? (
        <MegaMenu
          key={item.label}
          columns={item.columns}
          panel={item.panel}
          visible={hoveredItem === item.label}
          onMouseEnter={() => setHoveredItem(item.label)}
          onMouseLeave={() => setHoveredItem(null)}
        />
      ) : null)}
    </header>
  )
}

// ── Mega menu panel ───────────────────────────────────────────────────────────

function MegaMenu({ columns, panel, visible, onMouseEnter, onMouseLeave }: {
  columns: NavColumn[]
  panel?: NavPanel
  visible: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}) {
  return (
    <div
      className={`mh-mega${visible ? ' visible' : ''}`}
      role="region"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mh-mega-inner">
        {/* Left: link columns */}
        <div className="mh-mega-links">
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

        {/* Right: hero panel */}
        {panel && (
          <Link
            href={panel.href}
            className="mh-mega-panel"
            style={{ background: panel.bg }}
          >
            <p className="mh-mega-panel-headline">{panel.headline}</p>
            <p className="mh-mega-panel-sub">{panel.sub}</p>
            <span className="mh-mega-panel-cta">{panel.cta} →</span>
          </Link>
        )}
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
