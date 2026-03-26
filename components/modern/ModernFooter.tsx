'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props {
  settings: Settings
}

export default function ModernFooter({ settings }: Props) {
  const pathname = usePathname()
  const isContactPage = pathname === '/contact'
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

  const socialIcons: Record<string, React.ReactNode> = {
    Instagram: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
    TikTok: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.3 0 .59.04.86.11V9.03a6.27 6.27 0 0 0-.86-.06 6.27 6.27 0 0 0-6.27 6.27 6.27 6.27 0 0 0 6.27 6.27 6.27 6.27 0 0 0 6.27-6.27V8.98a8.22 8.22 0 0 0 4.84 1.56V7.09c-.35 0-.68-.04-1.01-.1V6.69Z" />
      </svg>
    ),
    Pinterest: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0Z" />
      </svg>
    ),
    X: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    Facebook: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073Z" />
      </svg>
    ),
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
            <Link href="/" className="modern-footer-nav-link">
              Home
            </Link>
            <Link href="/shop" className="modern-footer-nav-link">
              Shop
            </Link>
            <Link href="/our-story" className="modern-footer-nav-link">
              Our Story
            </Link>
            <Link href="/events" className="modern-footer-nav-link">
              Events
            </Link>
            <Link href="/contact" className="modern-footer-nav-link">
              Contact
            </Link>
          </nav>
        </div>

        {/* Contact column */}
        {!isContactPage && (
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
          <Link
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
          </Link>
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
        )}
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
