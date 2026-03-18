'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

const NAV_LINKS = [
  { href: '/shop', label: 'Shop' },
  { href: '/our-story', label: 'Our Story' },
  { href: '/#events', label: 'Events' },
  { href: '/contact', label: 'Contact' },
]

interface Props { logoUrl: string | null; businessName: string }

export default function Header({ logoUrl, businessName }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 100 }}>
      <nav aria-label="Main navigation" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
        <Link href="/" aria-label={`${businessName} — home`}>
          {logoUrl
            ? <Image src={logoUrl} alt={businessName} height={48} width={160} style={{ objectFit: 'contain' }} />
            : <span style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 600, letterSpacing: '0.01em', color: 'var(--color-primary)' }}>{businessName}</span>
          }
        </Link>

        {/* Desktop nav */}
        <ul className="header-nav-desktop" style={{ listStyle: 'none', display: 'flex', gap: '32px', alignItems: 'center' }}>
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} style={{ color: 'var(--color-text)', textDecoration: 'none', fontSize: '18px', fontWeight: '500' }}>
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Mobile hamburger button */}
        <button
          className="header-menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text)', fontSize: '28px', lineHeight: 1, minHeight: '48px', minWidth: '48px', display: 'none', alignItems: 'center', justifyContent: 'center' }}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <div id="mobile-nav" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }} className="header-nav-mobile">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <Link
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  style={{ display: 'block', padding: '16px 24px', color: 'var(--color-text)', textDecoration: 'none', fontSize: '18px', fontWeight: '500', minHeight: '48px' }}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}
