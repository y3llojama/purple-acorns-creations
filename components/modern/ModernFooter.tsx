import Link from 'next/link'
import { Settings } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props {
  settings: Settings
}

export default function ModernFooter({ settings }: Props) {
  const year = new Date().getFullYear()
  const businessName = settings.business_name || 'Purple Acorns Creations'

  const socials: { key: keyof Settings; label: string; href: (v: string) => string }[] = [
    {
      key: 'social_instagram',
      label: 'Instagram',
      href: (v) => `https://instagram.com/${v}`,
    },
    {
      key: 'social_tiktok',
      label: 'TikTok',
      href: (v) => `https://tiktok.com/@${v}`,
    },
    {
      key: 'social_pinterest',
      label: 'Pinterest',
      href: (v) => `https://pinterest.com/${v}`,
    },
    {
      key: 'social_x',
      label: 'X',
      href: (v) => `https://x.com/${v}`,
    },
  ]

  // Facebook stores the full URL
  const facebookUrl =
    settings.social_facebook && isValidHttpsUrl(settings.social_facebook)
      ? settings.social_facebook
      : null

  const socialIcons: Record<string, string> = {
    Instagram: '📷',
    TikTok: '🎵',
    Pinterest: '📌',
    X: '✕',
    Facebook: '𝒇',
  }

  return (
    <footer
      style={{
        background: 'var(--color-primary)',
        color: '#fff',
        padding: '48px clamp(16px, 6vw, 80px) 32px',
      }}
    >
      <style>{`
        .modern-footer-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 48px;
          margin-bottom: 40px;
        }

        @media (max-width: 768px) {
          .modern-footer-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }
        }

        .modern-footer-social-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          min-height: 44px;
          font-size: 20px;
          color: #fff;
          text-decoration: none;
          border-radius: 50%;
          transition: color 0.2s ease;
        }

        .modern-footer-social-link:hover {
          color: var(--color-accent);
        }

        .modern-footer-nav-link {
          color: rgba(255,255,255,0.85);
          text-decoration: none;
          font-size: 15px;
          transition: color 0.2s ease;
          display: block;
          padding: 3px 0;
        }

        .modern-footer-nav-link:hover {
          color: var(--color-accent);
        }

        .modern-footer-bottom-link {
          color: rgba(255,255,255,0.6);
          text-decoration: none;
          font-size: 13px;
          transition: color 0.2s ease;
        }

        .modern-footer-bottom-link:hover {
          color: rgba(255,255,255,0.9);
        }
      `}</style>

      <div className="modern-footer-grid">
        {/* Brand column */}
        <div>
          <div
            style={{
              fontFamily: 'Jost, sans-serif',
              fontWeight: 600,
              fontSize: 'clamp(16px, 2vw, 20px)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            {businessName}
          </div>
          <div
            style={{
              fontSize: '14px',
              opacity: 0.75,
              marginBottom: '20px',
              fontStyle: 'italic',
            }}
          >
            Handmade with love
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {socials.map(({ key, label, href }) => {
              const val = settings[key] as string | null
              if (!val) return null
              return (
                <a
                  key={key}
                  href={href(val)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="modern-footer-social-link"
                >
                  {socialIcons[label]}
                </a>
              )
            })}
            {facebookUrl && (
              <a
                href={facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="modern-footer-social-link"
              >
                {socialIcons['Facebook']}
              </a>
            )}
          </div>
        </div>

        {/* Quick links column */}
        <div>
          <div
            style={{
              color: 'var(--color-accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            Explore
          </div>
          <nav aria-label="Footer navigation">
            <Link href="/shop" className="modern-footer-nav-link">
              Shop
            </Link>
            <Link href="/our-story" className="modern-footer-nav-link">
              Our Story
            </Link>
            <Link href="/#events" className="modern-footer-nav-link">
              Events
            </Link>
            <Link href="/contact" className="modern-footer-nav-link">
              Contact
            </Link>
          </nav>
        </div>

        {/* Contact column */}
        <div>
          <div
            style={{
              color: 'var(--color-accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            Get in Touch
          </div>
          <a
            href="/contact"
            style={{
              color: 'rgba(255,255,255,0.85)',
              textDecoration: 'none',
              fontSize: '15px',
              display: 'block',
              padding: '3px 0',
            }}
          >
            Send us a message →
          </a>
          {settings.square_store_url && isValidHttpsUrl(settings.square_store_url) && (
            <a
              href={settings.square_store_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'rgba(255,255,255,0.85)',
                textDecoration: 'none',
                fontSize: '15px',
                display: 'block',
                padding: '3px 0',
                marginTop: '8px',
              }}
            >
              Visit Our Shop ↗
            </a>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.12)',
          paddingTop: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px 16px',
          fontSize: '13px',
          opacity: 0.6,
          textAlign: 'center',
        }}
      >
        <span>
          &copy; {year} {businessName}. All rights reserved.
        </span>
        <span aria-hidden="true">|</span>
        <Link href="/privacy" className="modern-footer-bottom-link">
          Privacy Policy
        </Link>
        <span aria-hidden="true">|</span>
        <Link href="/terms" className="modern-footer-bottom-link">
          Terms
        </Link>
        <span aria-hidden="true">|</span>
        <Link href="/accessibility" className="modern-footer-bottom-link">
          Accessibility
        </Link>
      </div>
    </footer>
  )
}
