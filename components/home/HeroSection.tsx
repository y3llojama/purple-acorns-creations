import Link from 'next/link'

// Placeholder hero image — CC licensed via Openverse/Flickr. Replace via admin once live.
const HERO_PLACEHOLDER = 'https://live.staticflickr.com/3077/3247078310_cdf30325fd_b.jpg'

interface Props { tagline: string; subtext: string; heroImageUrl?: string | null }

export default function HeroSection({ tagline, subtext, heroImageUrl }: Props) {
  const bgImage = heroImageUrl ?? HERO_PLACEHOLDER
  return (
    <section style={{
      minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: '80px 24px',
      backgroundImage: `url(${bgImage})`,
      backgroundSize: 'cover', backgroundPosition: 'center',
      position: 'relative',
    }}>
      {/* Dark overlay for text legibility */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} aria-hidden="true" />
      {/* Content sits above overlay via z-index */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px, 6vw, 72px)', color: '#fff', marginBottom: '24px', lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
          {tagline}
        </h1>
        <p style={{ fontSize: '20px', color: 'rgba(255,255,255,0.88)', maxWidth: '600px', lineHeight: 1.8, marginBottom: '40px' }}>
          {subtext}
        </p>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/shop" style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '16px 36px', fontSize: '18px', borderRadius: '4px', textDecoration: 'none', minHeight: '48px', display: 'inline-flex', alignItems: 'center' }}>
            Shop Now
          </Link>
          <Link href="/our-story" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '2px solid rgba(255,255,255,0.7)', padding: '16px 36px', fontSize: '18px', borderRadius: '4px', textDecoration: 'none', minHeight: '48px', display: 'inline-flex', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
            Our Story
          </Link>
        </div>
      </div>
    </section>
  )
}
