'use client'
import { useState } from 'react'
import Link from 'next/link'

interface NavChild {
  label: string
  href: string
}

interface NavItem {
  label: string
  href: string
  children: NavChild[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Home',
    href: '/',
    children: [],
  },
  {
    label: 'Shop',
    href: '/shop',
    children: [
      { label: 'New Arrivals', href: '/shop' },
      { label: 'Textiles', href: '/shop' },
      { label: 'Gift Sets', href: '/shop' },
      { label: 'All Products', href: '/shop' },
    ],
  },
  {
    label: 'World of Purple Acorns',
    href: '/our-story',
    children: [
      { label: 'Our Story', href: '/our-story' },
      { label: 'Behind the Craft', href: '/our-story' },
      { label: 'Events', href: '/events' },
    ],
  },
  {
    label: 'Visit Us',
    href: '/contact',
    children: [
      { label: 'Studio', href: '/contact' },
      { label: 'Hours', href: '/contact' },
      { label: 'Contact', href: '/contact' },
    ],
  },
]

export default function ModernNavDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const [openItem, setOpenItem] = useState<string | null>(null)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  function toggleDrawer() {
    setIsOpen(o => !o)
    if (isOpen) {
      setOpenItem(null)
      setHoveredItem(null)
    }
  }

  function handleMobileItemClick(label: string) {
    setOpenItem(prev => (prev === label ? null : label))
  }

  return (
    <div>
      <style>{`
        .mnd-toggle-btn {
          width: 100%;
          min-height: 44px;
          background: var(--color-primary);
          color: #ffffff;
          border: none;
          cursor: pointer;
          font-family: 'Jost', sans-serif;
          font-weight: 500;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .mnd-toggle-arrow {
          display: inline-block;
          transition: transform 0.3s ease;
          font-style: normal;
        }

        .mnd-toggle-arrow.open {
          transform: rotate(180deg);
        }

        .mnd-drawer {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.4s cubic-bezier(0.46, 0.01, 0.32, 1);
          background: var(--color-surface);
          border-bottom: 2px solid var(--color-border);
        }

        .mnd-drawer.open {
          max-height: 320px;
        }

        .mnd-nav-row {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          padding: 4px 0;
        }

        /* Desktop: hide mobile sub-list */
        .mnd-mobile-children {
          display: none;
        }

        /* Desktop flyout */
        .mnd-item-wrap {
          position: relative;
        }

        .mnd-item-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-family: 'Jost', sans-serif;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--color-text);
          padding: 18px 24px;
          display: flex;
          align-items: center;
          gap: 4px;
          text-decoration: none;
          position: relative;
          transition: color 0.2s ease;
        }

        .mnd-item-btn::after {
          content: '';
          position: absolute;
          bottom: 10px;
          left: 24px;
          right: 24px;
          height: 1px;
          background: var(--color-accent);
          transform: scaleX(0);
          transform-origin: left center;
          transition: transform 0.25s ease;
        }

        .mnd-item-btn:hover {
          color: var(--color-accent);
        }

        .mnd-item-btn:hover::after {
          transform: scaleX(1);
        }

        .mnd-flyout {
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%) translateY(-8px);
          min-width: 200px;
          background: #ffffff;
          border-top: 2px solid var(--color-accent);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
          z-index: 300;
        }

        .mnd-flyout.visible {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
          pointer-events: auto;
        }

        .mnd-flyout-item {
          display: block;
          min-height: 44px;
          padding: 10px 16px;
          color: var(--color-text-muted, var(--color-text));
          text-decoration: none;
          font-family: 'Jost', sans-serif;
          font-size: 12px;
          font-weight: 400;
          letter-spacing: 0.06em;
          display: flex;
          align-items: center;
          transition: color 0.18s ease, padding-left 0.18s ease;
          white-space: nowrap;
        }

        .mnd-flyout-item:hover {
          color: var(--color-primary);
          padding-left: 22px;
        }

        /* Mobile overrides */
        @media (max-width: 768px) {
          .mnd-drawer.open {
            max-height: 520px;
          }

          .mnd-nav-row {
            flex-direction: column;
            align-items: stretch;
            padding: 0;
          }

          .mnd-item-wrap {
            border-bottom: 1px solid var(--color-border);
          }

          .mnd-item-btn {
            width: 100%;
            justify-content: space-between;
            padding: 16px 24px;
            font-size: 12px;
          }

          .mnd-item-btn::after {
            display: none;
          }

          .mnd-flyout {
            display: none;
          }

          .mnd-mobile-children {
            display: block;
            overflow: hidden;
            max-height: 0;
            transition: max-height 0.4s cubic-bezier(0.46, 0.01, 0.32, 1);
            background: var(--color-surface);
          }

          .mnd-mobile-children.open {
            max-height: 300px;
          }

          .mnd-mobile-child-link {
            display: flex;
            align-items: center;
            min-height: 44px;
            padding: 10px 36px;
            color: var(--color-text-muted, var(--color-text));
            text-decoration: none;
            font-family: 'Jost', sans-serif;
            font-size: 11px;
            font-weight: 400;
            letter-spacing: 0.08em;
            border-top: 1px solid var(--color-border);
            transition: color 0.18s ease, padding-left 0.18s ease;
          }

          .mnd-mobile-child-link:hover {
            color: var(--color-primary);
            padding-left: 42px;
          }
        }
      `}</style>

      {/* Toggle bar */}
      <button
        className="mnd-toggle-btn"
        onClick={toggleDrawer}
        aria-expanded={isOpen}
        aria-controls="mnd-drawer"
      >
        Explore
        <i className={`mnd-toggle-arrow${isOpen ? ' open' : ''}`} aria-hidden="true">▼</i>
      </button>

      {/* Pull-down drawer */}
      <div
        id="mnd-drawer"
        className={`mnd-drawer${isOpen ? ' open' : ''}`}
        role="navigation"
        aria-label="Main navigation"
      >
        <ul
          className="mnd-nav-row"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {NAV_ITEMS.map(item => (
            <li key={item.label} className="mnd-item-wrap">
              {/* Desktop: hover to open flyout. Mobile: tap to expand inline. */}
              {item.children.length === 0 ? (
                <Link href={item.href} className="mnd-item-btn" onClick={toggleDrawer}>
                  {item.label}
                </Link>
              ) : (
              <button
                className="mnd-item-btn"
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => handleMobileItemClick(item.label)}
                aria-expanded={openItem === item.label}
              >
                {item.label}
                <span aria-hidden="true" style={{ fontSize: '9px', marginLeft: '2px' }}>
                  {openItem === item.label ? '▲' : '▼'}
                </span>
              </button>
              )}

              {/* Desktop flyout submenu */}
              <div
                className={`mnd-flyout${hoveredItem === item.label ? ' visible' : ''}`}
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
                role="list"
              >
                {item.children.map(child => (
                  <Link
                    key={child.label}
                    href={child.href}
                    className="mnd-flyout-item"
                    role="listitem"
                  >
                    {child.label}
                  </Link>
                ))}
              </div>

              {/* Mobile inline children */}
              <div
                className={`mnd-mobile-children${openItem === item.label ? ' open' : ''}`}
                aria-hidden={openItem !== item.label}
              >
                {item.children.map(child => (
                  <Link
                    key={child.label}
                    href={child.href}
                    className="mnd-mobile-child-link"
                    onClick={() => setOpenItem(null)}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
