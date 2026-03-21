import Link from 'next/link'
import {
  Calendar, Image, FileText, Palette, BarChart2,
  Package, MessageSquare, Plug, Radio, Mail, ClipboardList,
} from 'lucide-react'

const TILES = [
  { href: '/admin/events',       label: 'Add Event',       description: 'Schedule upcoming markets and events',       Icon: Calendar },
  { href: '/admin/gallery',      label: 'Upload Photo',    description: 'Add photos to your gallery',                Icon: Image },
  { href: '/admin/content',      label: 'Edit Content',    description: 'Update homepage and story text',            Icon: FileText },
  { href: '/admin/inventory',    label: 'Inventory',       description: 'Manage products, stock, and categories',    Icon: Package },
  { href: '/admin/messages',     label: 'Messages',        description: 'View and reply to customer messages',       Icon: MessageSquare },
  { href: '/admin/branding',     label: 'Manage Branding', description: 'Theme, logo, and announcement banner',      Icon: Palette },
  { href: '/admin/integrations', label: 'Integrations',    description: 'Square, Pinterest, and AI settings',        Icon: Plug },
  { href: '/admin/channels',     label: 'Channels',        description: 'Storefront channel settings',               Icon: Radio },
  { href: '/admin/newsletter',   label: 'Newsletter',      description: 'Compose and send newsletters',              Icon: Mail },
  { href: '/admin/analytics',    label: 'View Analytics',  description: 'Page views, visitors, traffic sources',     Icon: BarChart2 },
  { href: '/admin/reports',      label: 'Reports',         description: 'Sales and inventory reports',               Icon: ClipboardList },
]

export const metadata = { title: 'Admin Dashboard' }

export default function AdminDashboard() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--color-primary)', marginBottom: '32px' }}>
        Dashboard
      </h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        {TILES.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '24px', textDecoration: 'none', transition: 'box-shadow 0.2s' }}
          >
            <Icon size={24} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', color: 'var(--color-primary)', marginBottom: '4px', fontWeight: '600' }}>
                {label}
              </div>
              <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                {description}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
