import Link from 'next/link'

const TILES = [
  { href: '/admin/events', label: 'Add Event', description: 'Schedule upcoming markets and events' },
  { href: '/admin/gallery', label: 'Upload Photo', description: 'Add photos to your gallery' },
  { href: '/admin/content', label: 'Edit Content', description: 'Update homepage and story text' },
  { href: '/admin/branding', label: 'Manage Branding', description: 'Theme, logo, and announcement banner' },
]

export const metadata = { title: 'Admin Dashboard' }

export default function AdminDashboard() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--color-primary)', marginBottom: '32px' }}>
        Dashboard
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
        {TILES.map(({ href, label, description }) => (
          <Link
            key={href}
            href={href}
            style={{ display: 'block', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '28px', textDecoration: 'none', minHeight: '120px', transition: 'box-shadow 0.2s' }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'var(--color-primary)', marginBottom: '8px', fontWeight: '600' }}>
              {label}
            </div>
            <div style={{ fontSize: '16px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
              {description}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
