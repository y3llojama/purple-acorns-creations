import Link from 'next/link'
import type { Settings } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'
import ContactForm from './ContactForm'

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
    <footer id="contact" style={{ background: 'var(--color-primary)', color: 'var(--color-bg)', padding: '48px 24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-accent)', marginBottom: '24px', fontSize: '28px' }}>
            Get in Touch
          </h2>
          <ContactForm />
        </div>
        <div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
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
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', marginTop: '16px' }}>
            © {year} Purple Acorns Creations ·{' '}
            <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.5)' }}>Privacy Policy</Link> ·{' '}
            <Link href="/terms" style={{ color: 'rgba(255,255,255,0.5)' }}>Terms of Service</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
