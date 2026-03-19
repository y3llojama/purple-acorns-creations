import Link from 'next/link'
import ModernStoryMosaic from './ModernStoryMosaic'

interface GalleryImage {
  url: string
  alt_text: string | null
}

interface Props {
  teaser: string
  images?: GalleryImage[]
}

export default function ModernStorySection({ teaser, images = [] }: Props) {
  const photos = images

  return (
    <section>
      <style>{`
        .modern-story-section {
          padding: clamp(40px, 5vw, 64px) clamp(16px, 6vw, 80px);
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
            margin-top: 28px;
            max-height: 220px;
          }
        }

        .modern-story-right-panel {
          min-height: 280px;
          max-height: clamp(320px, 42vw, 460px);
        }
      `}</style>

      <div className="modern-story-section">
        {/* Left: text */}
        <div style={{ paddingRight: 'clamp(0px, 4vw, 64px)' }}>
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

        {/* Right: animated photo mosaic */}
        <div className="modern-story-right-panel">
          {photos.length > 0 ? (
            <ModernStoryMosaic photos={photos} />
          ) : (
            <div
              style={{
                background: 'color-mix(in srgb, var(--color-primary) 8%, var(--color-surface) 92%)',
                borderLeft: '4px solid var(--color-accent)',
                minHeight: '280px',
                height: '100%',
              }}
            />
          )}
        </div>
      </div>
    </section>
  )
}
