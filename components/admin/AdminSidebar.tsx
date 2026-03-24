'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, FileText, Calendar, Image, MessageSquare,
  Palette, Plug, Mail, BarChart2, ClipboardList,
  ChevronLeft, ChevronRight, ExternalLink, LogOut,
  Package, Radio, MapPin, Settings, Tag,
} from 'lucide-react'
import { useUnreadCount } from '@/lib/contexts/unread-count-context'

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/admin/content', label: 'Content', Icon: FileText },
  { href: '/admin/events', label: 'Events', Icon: Calendar },
  { href: '/admin/markets', label: 'Markets', Icon: MapPin },
  { href: '/admin/gallery', label: 'Gallery', Icon: Image },
  { href: '/admin/inventory', label: 'Inventory', Icon: Package },
  { href: '/admin/private-sales', label: 'Private Sales', Icon: Tag },
  { href: '/admin/messages', label: 'Messages', Icon: MessageSquare },
  { href: '/admin/branding', label: 'Branding', Icon: Palette },
  { href: '/admin/integrations', label: 'Integrations', Icon: Plug },
  { href: '/admin/channels', label: 'Channels', Icon: Radio },
  { href: '/admin/newsletter', label: 'Newsletter', Icon: Mail },
  { href: '/admin/analytics', label: 'Analytics', Icon: BarChart2 },
  { href: '/admin/reports', label: 'Reports', Icon: ClipboardList },
  { href: '/admin/settings', label: 'Settings', Icon: Settings },
]

interface Props { businessName: string }

export default function AdminSidebar({ businessName }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const { unreadCount } = useUnreadCount()

  useEffect(() => {
    setMounted(true)
    const mobile = window.innerWidth < 768
    setIsMobile(mobile)
    const saved = localStorage.getItem('admin-sidebar-collapsed')
    if (saved === 'true') {
      setCollapsed(true)
    } else if (saved !== 'false' && mobile) {
      setCollapsed(true)
    }
  }, [])

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('admin-sidebar-collapsed', String(next))
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const width = collapsed ? '56px' : '220px'
  const mobileExpanded = isMobile && !collapsed

  return (
    <>
      {mobileExpanded && (
        <>
          <div style={{ width: '56px', flexShrink: 0 }} aria-hidden="true" />
          <div
            onClick={toggleCollapsed}
            aria-hidden="true"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999 }}
          />
        </>
      )}
    <aside
      style={{ width, minHeight: '100vh', background: 'var(--color-primary)', color: 'var(--color-accent)', display: 'flex', flexDirection: 'column', flexShrink: 0, transition: mounted ? 'width 0.2s ease' : 'none', overflow: 'hidden', position: mobileExpanded ? 'fixed' : 'relative', top: mobileExpanded ? 0 : undefined, left: mobileExpanded ? 0 : undefined, height: mobileExpanded ? '100dvh' : undefined, zIndex: mobileExpanded ? 1000 : undefined }}
    >
      {/* Header */}
      <div style={{ padding: collapsed ? '20px 0' : '0 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', minHeight: '72px' }}>
        {!collapsed && (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
            {businessName} Admin
          </span>
        )}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-accent)', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '48px', minWidth: '48px', borderRadius: '4px' }}
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Nav */}
      <nav aria-label="Admin navigation" style={{ flex: 1, padding: '16px 0' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const isActive = pathname === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={mobileExpanded ? toggleCollapsed : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={collapsed ? (href === '/admin/messages' && unreadCount > 0 ? `${label}, ${unreadCount > 99 ? '99+' : unreadCount} unread` : label) : undefined}
                  title={collapsed ? label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: collapsed ? '12px 0' : '12px 20px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    fontSize: '16px',
                    textDecoration: 'none',
                    color: isActive ? 'var(--color-accent)' : 'rgba(255,255,255,0.7)',
                    background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                    fontWeight: isActive ? '600' : '400',
                    minHeight: '48px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {href === '/admin/messages' ? (
                    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                      <Icon size={20} style={{ flexShrink: 0 }} />
                      {unreadCount > 0 && (
                        <span aria-hidden="true" style={{
                          position: 'absolute',
                          top: '-8px',
                          right: '-10px',
                          background: 'var(--color-danger)',
                          color: 'var(--color-badge-text)',
                          fontSize: '9px',
                          fontWeight: '700',
                          minWidth: '16px',
                          height: '16px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 3px',
                          border: '1.5px solid var(--color-primary)',
                          lineHeight: 1,
                        }}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </span>
                  ) : (
                    <Icon size={20} style={{ flexShrink: 0 }} />
                  )}
                  {!collapsed && label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div style={{ padding: collapsed ? '16px 0' : '16px 20px', borderTop: '1px solid rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: collapsed ? 'center' : 'stretch' }}>
        <Link
          href="/"
          aria-label="View live site"
          style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', minHeight: '48px', justifyContent: collapsed ? 'center' : 'flex-start' }}
        >
          <ExternalLink size={16} style={{ flexShrink: 0 }} />
          {!collapsed && 'View Live Site'}
        </Link>
        <button
          onClick={signOut}
          aria-label="Sign out"
          style={{ background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.7)', padding: collapsed ? '8px 0' : '8px 12px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', minHeight: '48px', justifyContent: collapsed ? 'center' : 'flex-start', width: '100%' }}
        >
          <LogOut size={16} style={{ flexShrink: 0 }} />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </aside>
    </>
  )
}
