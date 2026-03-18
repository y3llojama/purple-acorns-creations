'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/gallery', label: 'Gallery' },
  { href: '/admin/messages', label: 'Messages' },
  { href: '/admin/branding', label: 'Branding' },
  { href: '/admin/integrations', label: 'Integrations' },
  { href: '/admin/newsletter', label: 'Newsletter' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/reports', label: 'Reports' },
]

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <aside style={{ width: '220px', minHeight: '100vh', background: 'var(--color-primary)', color: 'var(--color-accent)', display: 'flex', flexDirection: 'column', padding: '24px 0', flexShrink: 0 }}>
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--color-accent)' }}>
          Purple Acorns Admin
        </span>
      </div>
      <nav aria-label="Admin navigation" style={{ flex: 1, padding: '16px 0' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {NAV_ITEMS.map(({ href, label }) => {
            const isActive = pathname === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 20px',
                    fontSize: '16px',
                    textDecoration: 'none',
                    color: isActive ? 'var(--color-accent)' : 'rgba(255,255,255,0.7)',
                    background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                    fontWeight: isActive ? '600' : '400',
                    minHeight: '48px',
                  }}
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', textDecoration: 'none' }}>
          View Live Site →
        </Link>
        <button
          onClick={signOut}
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.7)', padding: '8px 12px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', minHeight: '48px' }}
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
