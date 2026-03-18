import Link from 'next/link'

interface Props { teaser: string }

export default function StoryTeaser({ teaser }: Props) {
  return (
    <section style={{ padding: '80px 24px', background: 'var(--color-surface)', textAlign: 'center' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '36px', color: 'var(--color-primary)', marginBottom: '24px' }}>
          Our Story
        </h2>
        <p style={{ fontStyle: 'italic', fontSize: '20px', color: 'var(--color-text-muted)', lineHeight: 1.8, marginBottom: '32px' }}>
          {teaser}
        </p>
        <Link href="/our-story" style={{ color: 'var(--color-primary)', fontSize: '18px', textDecoration: 'underline' }}>
          Read Full Story →
        </Link>
      </div>
    </section>
  )
}
