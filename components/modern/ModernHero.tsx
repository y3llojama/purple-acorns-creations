import Link from 'next/link'
import HeroCarousel from './HeroCarousel'
import type { HeroSlide } from '@/lib/supabase/types'

interface Props {
  tagline: string
  subtext: string
  slides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
}

export default function ModernHero({ tagline, subtext, slides, transition, intervalMs }: Props) {
  return (
    <section>
      <style>{`
        .modern-hero {
          display: grid;
          grid-template-columns: 1fr 1fr;
          min-height: 400px;
        }

        @media (max-width: 768px) {
          .modern-hero {
            grid-template-columns: 1fr;
          }
          .modern-hero-image-panel {
            order: -1;
          }
          .modern-hero-text-panel {
            order: 1;
          }
        }

        .modern-hero-cta-btn:hover {
          opacity: 0.9;
        }
      `}</style>
      <div className="modern-hero" style={{ marginTop: 'calc(-1 * var(--logo-overflow, clamp(60px, 7vw, 90px)))' }}>
        {/* Left panel */}
        <div
          className="modern-hero-text-panel"
          style={{
            background: 'var(--color-primary)',
            padding: 'clamp(40px, 6vw, 80px)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div>
            <p
              style={{
                color: 'var(--color-accent)',
                fontSize: '11px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                marginBottom: '16px',
                margin: '0 0 16px 0',
              }}
            >
              Purple Acorns Creations
            </p>
            <h1
              style={{
                color: 'var(--color-on-primary)',
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(28px, 4vw, 52px)',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              {tagline}
            </h1>
            <div
              style={{
                color: 'var(--color-on-primary)',
                opacity: 0.7,
                fontSize: 'clamp(15px, 1.8vw, 18px)',
                marginTop: '16px',
              }}
              dangerouslySetInnerHTML={{ __html: subtext }}
            />
            <div style={{ position: 'relative', display: 'inline-block', marginTop: '32px' }}>
              <Link
                href="/shop"
                className="modern-hero-cta-btn"
                style={{
                  display: 'inline-block',
                  background: 'var(--color-accent)',
                  color: 'var(--color-primary)',
                  border: 'none',
                  padding: '14px 32px',
                  fontSize: '13px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                Shop Now
              </Link>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/craft/sunflower-badge.png"
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '-18px',
                  right: '-20px',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  transform: 'rotate(12deg)',
                  pointerEvents: 'none',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="modern-hero-image-panel">
          <HeroCarousel slides={slides} transition={transition} intervalMs={intervalMs} />
        </div>
      </div>
    </section>
  )
}
