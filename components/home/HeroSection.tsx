import Link from 'next/link'

interface Props { tagline: string; subtext: string }

export default function HeroSection({ tagline, subtext }: Props) {
  return (
    <section style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '80px 24px', background: 'var(--color-bg)' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px, 6vw, 72px)', color: 'var(--color-primary)', marginBottom: '24px', lineHeight: 1.2 }}>
        {tagline}
      </h1>
      <p style={{ fontSize: '20px', color: 'var(--color-text-muted)', maxWidth: '600px', lineHeight: 1.8, marginBottom: '40px' }}>
        {subtext}
      </p>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/shop" style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '16px 36px', fontSize: '18px', borderRadius: '4px', textDecoration: 'none', minHeight: '48px', display: 'inline-flex', alignItems: 'center' }}>
          Shop Now
        </Link>
        <Link href="/our-story" style={{ background: 'transparent', color: 'var(--color-primary)', border: '2px solid var(--color-primary)', padding: '16px 36px', fontSize: '18px', borderRadius: '4px', textDecoration: 'none', minHeight: '48px', display: 'inline-flex', alignItems: 'center' }}>
          Our Story
        </Link>
      </div>
    </section>
  )
}
