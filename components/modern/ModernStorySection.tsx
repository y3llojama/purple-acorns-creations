import Link from 'next/link'

interface Props {
  teaser: string
}

export default function ModernStorySection({ teaser }: Props) {
  return (
    <section>
      <style>{`
        .modern-story-section {
          padding: clamp(64px, 8vw, 96px) clamp(16px, 6vw, 80px);
          background: var(--color-surface);
          display: grid;
          grid-template-columns: 40% 60%;
          gap: 0;
        }

        @media (max-width: 768px) {
          .modern-story-section {
            grid-template-columns: 1fr;
          }
          .modern-story-right-panel {
            display: none;
          }
        }
      `}</style>

      <div className="modern-story-section">
        {/* Left: text */}
        <div style={{ paddingRight: 'clamp(24px, 4vw, 64px)' }}>
          <p
            style={{
              color: 'var(--color-secondary)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              margin: '0 0 16px 0',
            }}
          >
            Our Story
          </p>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(24px, 3vw, 40px)',
              color: 'var(--color-text)',
              lineHeight: 1.4,
              fontStyle: 'italic',
              margin: '0 0 24px 0',
            }}
          >
            {teaser}
          </p>
          <Link
            href="/our-story"
            style={{
              color: 'var(--color-primary)',
              fontSize: '13px',
              letterSpacing: '0.08em',
              textDecoration: 'none',
              borderBottom: '1px solid var(--color-primary)',
              paddingBottom: '2px',
              display: 'inline-block',
            }}
          >
            Read our story →
          </Link>
        </div>

        {/* Right: decorative panel */}
        <div
          className="modern-story-right-panel"
          style={{
            background: 'rgba(var(--color-primary-rgb, 0,0,0), 0.05)',
            borderLeft: '4px solid var(--color-accent)',
            minHeight: '280px',
          }}
        />
      </div>
    </section>
  )
}
