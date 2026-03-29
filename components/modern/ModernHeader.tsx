'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSavedItems } from '@/lib/saved-items'
import CartButton from '@/components/shop/CartButton'

interface SearchItem {
  id: string
  url: string
  alt_text: string
  category: string | null
  square_url: string | null
}

// ── Nav data ─────────────────────────────────────────────────────────────────

interface NavLink { label: string; href: string }
interface NavColumn { heading: string; slug?: string; links: NavLink[] }
interface NavPanel { headline: string; sub: string; href: string; cta: string; bg: string }
interface NavItem {
  label: string
  href: string
  columns?: NavColumn[]
  panel?: NavPanel
  mobile?: NavLink[]
}
interface NavCategory { id: string; name: string; slug: string; children: { id: string; name: string; slug: string }[] }

function buildNavItems(businessName: string, navCategories: NavCategory[]): NavItem[] {
  const shopColumns: NavColumn[] = navCategories.map(cat => ({
    heading: cat.name,
    slug: cat.slug,
    links: cat.children.length > 0
      ? cat.children.map(child => ({
          label: child.name,
          href: `/shop?cat=${cat.slug}&sub=${child.slug}`,
        }))
      : [{ label: `All ${cat.name}`, href: `/shop?cat=${cat.slug}` }],
  }))

  const shopMobile: NavLink[] = [
    ...navCategories.flatMap(cat =>
      cat.children.length > 0
        ? cat.children.map(child => ({ label: child.name, href: `/shop?cat=${cat.slug}&sub=${child.slug}` }))
        : [{ label: cat.name, href: `/shop?cat=${cat.slug}` }]
    ),
    { label: 'All Products', href: '/shop' },
  ]

  return [
  {
    label: 'Home',
    href: '/',
  },
  {
    label: 'Shop',
    href: '/shop',
    columns: shopColumns.length > 0 ? shopColumns : [
      { heading: 'All', links: [{ label: 'All Products', href: '/shop' }] },
    ],
    panel: {
      headline: 'Made by hand,\nworn with joy.',
      sub: 'Crochet jewelry & textiles — each piece one of a kind.',
      href: '/shop',
      cta: 'Shop All',
      bg: 'linear-gradient(135deg, #4a2d6b 0%, #7b5ea7 60%, #a590c8 100%)',
    },
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
          { label: 'Upcoming Events', href: '/events' },
          { label: 'Markets & Fairs', href: '/markets-and-fairs' },
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
      { label: 'Events', href: '/events' },
    ],
  },
  {
    label: 'Contact',
    href: '/contact',
    columns: [
      {
        heading: 'Get in Touch',
        links: [
          { label: 'Custom Orders', href: '/contact' },
          { label: 'Wholesale Enquiries', href: '/contact' },
          { label: 'General Enquiries', href: '/contact' },
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
      { label: 'Custom Orders', href: '/contact' },
      { label: 'Wholesale', href: '/contact' },
      { label: 'General Enquiries', href: '/contact' },
    ],
  },
]}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  logoUrl: string | null
  businessName: string
  squareStoreUrl: string | null
  navCategories: NavCategory[]
}

export default function ModernHeader({ logoUrl, businessName, squareStoreUrl, navCategories }: Props) {
  const NAV_ITEMS = buildNavItems(businessName, navCategories)
  const { count: savedCount } = useSavedItems()
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoaded, setSearchLoaded] = useState(false)
  const searchCache = useRef<SearchItem[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch catalog once on first search open
  useEffect(() => {
    if (!searchOpen || searchLoaded) return
    fetch('/api/search')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.items) {
          searchCache.current = data.items
          setSearchLoaded(true)
        }
      })
      .catch(() => {}) // silent fail — search just returns nothing
  }, [searchOpen, searchLoaded])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const q = searchQuery.trim().toLowerCase()
  const searchResults: SearchItem[] = q.length < 2 ? [] : searchCache.current.filter(item =>
    item.alt_text.toLowerCase().includes(q) ||
    (item.category ?? '').toLowerCase().includes(q)
  ).slice(0, 8)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileOpenItem, setMobileOpenItem] = useState<string | null>(null)

  const cartHref = squareStoreUrl ?? '/shop'
  const cartIsExternal = !!squareStoreUrl

  // Close search results on click outside
  const searchWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!searchOpen) return
    function onPointer(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
        setSearchQuery('')
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onPointer), 100)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onPointer) }
  }, [searchOpen])


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

        /* ── Search results dropdown ── */
        .mh-search-results {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          width: 320px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          overflow: hidden;
          z-index: 600;
        }

        .mh-search-result-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          text-decoration: none;
          color: var(--color-text);
          border-bottom: 1px solid var(--color-border);
          transition: background 0.15s ease;
        }
        .mh-search-result-item:last-child { border-bottom: none; }
        a.mh-search-result-item:hover { background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface) 94%); }
        .mh-search-result-item.no-link { cursor: default; opacity: 0.7; }

        .mh-search-result-thumb {
          width: 44px;
          height: 44px;
          border-radius: 4px;
          object-fit: cover;
          flex-shrink: 0;
          background: var(--color-border);
        }

        .mh-search-result-name {
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: var(--color-text);
          line-height: 1.3;
        }

        .mh-search-result-cat {
          font-family: 'Jost', sans-serif;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--color-text-muted);
          margin-top: 2px;
        }

        .mh-search-result-soon {
          font-family: 'Jost', sans-serif;
          font-size: 10px;
          letter-spacing: 0.08em;
          color: var(--color-text-muted);
          margin-top: 3px;
          font-style: italic;
        }

        .mh-search-empty {
          padding: 16px 14px;
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          color: var(--color-text-muted);
          text-align: center;
        }

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
        /* ── Mobile drawer — slides in from the left ── */
        .mh-mobile-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.35);
          z-index: 498;
          opacity: 0;
          transition: opacity 0.35s ease;
        }
        .mh-mobile-overlay.open {
          display: block;
          opacity: 1;
        }

        .mh-mobile-drawer {
          position: fixed;
          top: 0;
          left: 0;
          width: min(80vw, 340px);
          height: 100dvh;
          background: var(--color-surface);
          z-index: 499;
          overflow-y: auto;
          transform: translateX(-100%);
          transition: transform 0.4s cubic-bezier(0.46, 0.01, 0.32, 1);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
        }
        .mh-mobile-drawer.open {
          transform: translateX(0);
        }

        .mh-mobile-drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--color-border);
        }

        .mh-mobile-close-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 22px;
          color: var(--color-text);
          min-width: 44px;
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }

        .mh-mobile-item-btn {
          width: 100%;
          background: none;
          border: none;
          border-bottom: 1px solid var(--color-border);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 28px;
          font-family: 'Jost', sans-serif;
          font-size: clamp(22px, 6vw, 30px);
          font-weight: 300;
          letter-spacing: 0.01em;
          color: var(--color-text);
          text-align: left;
        }

        .mh-mobile-item-toggle {
          font-size: 22px;
          font-weight: 200;
          line-height: 1;
          color: var(--color-text-muted);
          flex-shrink: 0;
          margin-left: 12px;
        }

        .mh-mobile-children {
          overflow: hidden;
          max-height: 0;
          transition: max-height 0.4s cubic-bezier(0.46, 0.01, 0.32, 1);
        }
        .mh-mobile-children.open { max-height: 800px; }

        .mh-mobile-child-link {
          display: block;
          padding: 12px 28px 12px 40px;
          font-family: 'Jost', sans-serif;
          font-size: 15px;
          font-weight: 400;
          letter-spacing: 0.02em;
          color: var(--color-text-muted);
          text-decoration: none;
          transition: color 0.15s ease;
          border-bottom: 1px solid var(--color-border);
        }
        .mh-mobile-child-link:last-child { border-bottom: none; }
        .mh-mobile-child-link:hover { color: var(--color-primary); }

        .mh-mobile-col-heading {
          padding: 14px 28px 8px;
          font-family: 'Jost', sans-serif;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--color-primary);
          opacity: 0.7;
          border-bottom: 1px solid var(--color-border);
        }
        a.mh-mobile-col-heading {
          display: block;
          text-decoration: none;
          transition: opacity 0.15s ease;
        }
        a.mh-mobile-col-heading:hover { opacity: 1; }

        .mh-mobile-child-link.indent { padding-left: 44px; }

        .mh-mobile-cta {
          display: block;
          width: 100%;
          background: var(--color-primary);
          color: #fff;
          border: none;
          padding: 18px 28px;
          font-family: 'Jost', sans-serif;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          text-align: center;
          text-decoration: none;
          cursor: pointer;
          margin-top: auto;
        }

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

        {/* Center: spacer — logo is rendered outside the grid below */}
        <div aria-hidden="true" />

        {/* Right: search + cart */}
        <div className="mh-right" ref={searchWrapRef}>
          <div className={`mh-search-wrap${searchOpen ? ' open' : ''}`}>
            <input
              ref={searchInputRef}
              className="mh-search-input"
              type="search"
              placeholder="Search…"
              value={searchQuery}
              aria-label="Search"
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') } }}
            />
          </div>

          {/* Results dropdown */}
          {searchOpen && q.length >= 2 && (
            <div className="mh-search-results" role="listbox" aria-label="Search results">
              {searchResults.length > 0 ? searchResults.map(item => {
                const thumb = (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="mh-search-result-thumb" src={item.url} alt="" />
                    <div>
                      <div className="mh-search-result-name">{item.alt_text}</div>
                      {item.category && <div className="mh-search-result-cat">{item.category}</div>}
                      {!item.square_url && <div className="mh-search-result-soon">Available in shop soon</div>}
                    </div>
                  </>
                )
                return item.square_url ? (
                  <a
                    key={item.id}
                    href={item.square_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mh-search-result-item"
                    onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                  >
                    {thumb}
                  </a>
                ) : (
                  <div key={item.id} className="mh-search-result-item no-link">
                    {thumb}
                  </div>
                )
              }) : (
                <div className="mh-search-empty">
                  {searchLoaded ? `No results for "${searchQuery}"` : 'Loading…'}
                </div>
              )}
            </div>
          )}

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

          <Link
            href="/shop/saved"
            className="mh-icon-btn"
            aria-label={savedCount > 0 ? `Saved items (${savedCount})` : 'Saved items'}
            style={{ position: 'relative' }}
          >
            <HeartNavIcon />
            {savedCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  fontSize: '9px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  fontFamily: "'Jost', sans-serif",
                  pointerEvents: 'none',
                }}
                aria-hidden="true"
              >
                {savedCount > 9 ? '9+' : savedCount}
              </span>
            )}
          </Link>

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
            <CartButton className="mh-icon-btn" />
          )}
        </div>
      </div>

      {/* ── Logo — direct child of <header> so left:50% = full header width ── */}
      <Link href="/" className="mh-logo" aria-label={`${businessName} — home`}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={businessName} />
        ) : (
          <span className="mh-logo-text">{businessName}</span>
        )}
      </Link>

      {/* ── Mobile overlay backdrop ── */}
      <div
        className={`mh-mobile-overlay${mobileOpen ? ' open' : ''}`}
        aria-hidden="true"
        onClick={() => { setMobileOpen(false); setMobileOpenItem(null) }}
      />

      {/* ── Mobile side drawer (slides in from left) ── */}
      <nav
        id="mh-mobile-drawer"
        className={`mh-mobile-drawer${mobileOpen ? ' open' : ''}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
      >
        {/* Drawer header */}
        <div className="mh-mobile-drawer-header">
          <span style={{ fontFamily: "'Jost', sans-serif", fontSize: '11px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
            Menu
          </span>
          <button
            className="mh-mobile-close-btn"
            onClick={() => { setMobileOpen(false); setMobileOpenItem(null) }}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {NAV_ITEMS.map(item => (
          <div key={item.label}>
            {item.mobile || item.columns ? (
              <button
                className="mh-mobile-item-btn"
                onClick={() => setMobileOpenItem(prev => prev === item.label ? null : item.label)}
                aria-expanded={mobileOpenItem === item.label}
              >
                {item.label}
                <span className="mh-mobile-item-toggle" aria-hidden="true">
                  {mobileOpenItem === item.label ? '−' : '+'}
                </span>
              </button>
            ) : (
              <Link
                href={item.href}
                className="mh-mobile-item-btn"
                onClick={() => { setMobileOpen(false); setMobileOpenItem(null) }}
              >
                {item.label}
              </Link>
            )}
            <div className={`mh-mobile-children${mobileOpenItem === item.label ? ' open' : ''}`}>
              {item.mobile
                ? item.mobile.map(link => (
                    <Link key={link.label} href={link.href} className="mh-mobile-child-link" onClick={() => { setMobileOpen(false); setMobileOpenItem(null) }}>
                      {link.label}
                    </Link>
                  ))
                : item.columns?.map(col => (
                    <div key={col.heading}>
                      {col.slug
                        ? <Link href={`/shop?cat=${col.slug}`} className="mh-mobile-col-heading" onClick={() => { setMobileOpen(false); setMobileOpenItem(null) }}>{col.heading}</Link>
                        : <div className="mh-mobile-col-heading">{col.heading}</div>
                      }
                      {col.links.map(link => (
                        <Link key={link.label} href={link.href} className="mh-mobile-child-link indent" onClick={() => { setMobileOpen(false); setMobileOpenItem(null) }}>
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ))
              }
            </div>
          </div>
        ))}

        <Link href="/shop" className="mh-mobile-cta" onClick={() => { setMobileOpen(false); setMobileOpenItem(null) }}>
          Shop All
        </Link>
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

function HeartNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
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
