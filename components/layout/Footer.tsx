import Link from 'next/link'
import type { Settings } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props { settings: Settings }

type SocialDef = { key: keyof Settings; label: string; buildUrl: (val: string) => string }

const SOCIALS: SocialDef[] = [
  { key: 'social_instagram', label: 'Instagram', buildUrl: (h) => `https://instagram.com/${h}` },
  { key: 'social_facebook', label: 'Facebook', buildUrl: (u) => u },
  { key: 'social_tiktok', label: 'TikTok', buildUrl: (h) => `https://tiktok.com/@${h}` },
  { key: 'social_pinterest', label: 'Pinterest', buildUrl: (h) => `https://pinterest.com/${h}` },
  { key: 'social_x', label: 'X', buildUrl: (h) => `https://x.com/${h}` },
]

export default function Footer({ settings }: Props) {
  const year = new Date().getFullYear()
  return (
    <footer style={{ background: 'var(--color-primary)', color: 'var(--color-bg)', padding: '48px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '24px' }}>
          <Link href="/contact" style={{ color: 'var(--color-accent)', fontSize: '18px' }}>
            Contact Us
          </Link>
          {SOCIALS.map(({ key, label, buildUrl }) => {
            const val = settings[key] as string | null
            if (!val) return null
            const href = buildUrl(val)
            if (!isValidHttpsUrl(href)) return null
            return (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', fontSize: '18px' }}>
                {label}
              </a>
            )
          })}
        </div>
        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)' }}>
          © {year} Purple Acorns Creations ·{' '}
          <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.5)' }}>Privacy Policy</Link> ·{' '}
          <Link href="/terms" style={{ color: 'rgba(255,255,255,0.5)' }}>Terms of Service</Link>
        </p>
      </div>
    </footer>
  )
}
