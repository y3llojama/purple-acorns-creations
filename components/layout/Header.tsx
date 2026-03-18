import Link from 'next/link'
import Image from 'next/image'

interface Props { logoUrl: string | null }

export default function Header({ logoUrl }: Props) {
  return (
    <header style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 100 }}>
      <nav aria-label="Main navigation" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
        <Link href="/" aria-label="Purple Acorns Creations — home">
          {logoUrl
            ? <Image src={logoUrl} alt="Purple Acorns Creations" height={48} width={160} style={{ objectFit: 'contain' }} />
            : <span style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 600, letterSpacing: '0.01em', color: 'var(--color-primary)' }}>Purple Acorns Creations</span>
          }
        </Link>
        <ul style={{ listStyle: 'none', display: 'flex', gap: '32px', alignItems: 'center' }}>
          {[
            { href: '/shop', label: 'Shop' },
            { href: '/our-story', label: 'Our Story' },
            { href: '/#events', label: 'Events' },
            { href: '/contact', label: 'Contact' },
          ].map(({ href, label }) => (
            <li key={href}>
              <Link href={href} style={{ color: 'var(--color-text)', textDecoration: 'none', fontSize: '18px', fontWeight: '500' }}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
