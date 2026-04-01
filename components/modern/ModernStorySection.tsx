import Link from 'next/link'
import ModernStoryMosaic from './ModernStoryMosaic'

interface GalleryImage {
  url: string
  alt_text: string | null
  square_url?: string | null
}

interface Props {
  teaser: string
  images?: GalleryImage[]
  watermark?: string | null
}

export default function ModernStorySection({ teaser, images = [], watermark }: Props) {
  const photos = images
  const hasPhotos = photos.length > 0

  return (
    <section>
      <style>{`
        .modern-story-section {
          padding: clamp(40px, 5vw, 64px) clamp(16px, 6vw, 80px);
          background: var(--color-surface);
          display: grid;
          grid-template-columns: ${hasPhotos ? '40% 60%' : '1fr'};
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
        <div style={{ paddingRight: hasPhotos ? 'clamp(0px, 4vw, 64px)' : undefined, maxWidth: hasPhotos ? undefined : '720px' }}>
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
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(24px, 3vw, 40px)',
              color: 'var(--color-text)',
              lineHeight: 1.4,
              fontStyle: 'italic',
              margin: '0 0 24px 0',
            }}
            dangerouslySetInnerHTML={{ __html: teaser }}
          />
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

        {/* Right: animated photo mosaic — hidden when no photos */}
        {hasPhotos && (
          <div className="modern-story-right-panel">
            <ModernStoryMosaic photos={photos} watermark={watermark} />
          </div>
        )}
      </div>
    </section>
  )
}
