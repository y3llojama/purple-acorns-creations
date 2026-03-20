interface Item {
  id: string
  image_url: string | null
  title: string | null
  description: string | null
}

interface Props {
  items: Item[]
  watermark: string | null | undefined
}

const SKELETON_CARDS = ['sk-1', 'sk-2', 'sk-3', 'sk-4']

export default function ModernFeaturedGrid({ items, watermark }: Props) {
  const viewAllHref = '/shop'
  const isEmpty = items.length === 0

  return (
    <section>
      <style>{`
        .modern-featured-grid-section {
          padding: clamp(48px, 6vw, 80px) clamp(16px, 4vw, 48px);
          background: var(--color-bg);
        }

        .modern-featured-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }

        @media (max-width: 768px) {
          .modern-featured-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 480px) {
          .modern-featured-grid {
            grid-template-columns: 1fr;
          }
        }

        .modern-featured-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 2px;
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .modern-featured-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        }
      `}</style>

      <div className="modern-featured-grid-section">
        {/* Section header */}
        <div style={{ marginBottom: '32px' }}>
          <p
            style={{
              color: 'var(--color-accent)',
              fontSize: '11px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              margin: '0 0 8px 0',
            }}
          >
            Collection
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2
              style={{
                color: 'var(--color-text)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'clamp(24px, 3vw, 36px)',
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              Featured Pieces
            </h2>
            <a
              href={viewAllHref}
              style={{
                color: 'var(--color-accent)',
                fontSize: '13px',
                textDecoration: 'none',
                letterSpacing: '0.06em',
              }}
            >
              View All →
            </a>
          </div>
        </div>

        {/* Grid */}
        <div className="modern-featured-grid">
          {isEmpty
            ? SKELETON_CARDS.map((key) => (
                <div key={key} className="modern-featured-card">
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      background: 'linear-gradient(135deg, var(--color-border) 0%, var(--color-surface) 100%)',
                    }}
                  />
                  <div style={{ padding: '14px 16px' }}>
                    <p
                      style={{
                        fontSize: '13px',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        fontWeight: 500,
                        margin: 0,
                        color: 'var(--color-text)',
                      }}
                    >
                      Coming Soon
                    </p>
                  </div>
                </div>
              ))
            : items.map((item) => (
                <div key={item.id} className="modern-featured-card">
                  {/* Image area */}
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.title ?? ''}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          background: 'linear-gradient(135deg, var(--color-border) 0%, var(--color-surface) 100%)',
                        }}
                      />
                    )}
                    {/* Watermark overlay — bottom-right, toggleable via gallery_watermark setting */}
                    {watermark && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          bottom: '8px',
                          right: '10px',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 500,
                          letterSpacing: '0.08em',
                          textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                          opacity: 0.75,
                          pointerEvents: 'none',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {watermark}
                      </span>
                    )}
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '14px 16px' }}>
                    {item.title && (
                      <p
                        style={{
                          fontSize: '13px',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          fontWeight: 500,
                          margin: '0 0 6px 0',
                          color: 'var(--color-text)',
                        }}
                      >
                        {item.title}
                      </p>
                    )}
                    <a
                      href={`/shop/${item.id}`}
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-accent)',
                        textDecoration: 'none',
                        display: 'block',
                      }}
                    >
                      Shop Now
                    </a>
                  </div>
                </div>
              ))}
        </div>
      </div>
    </section>
  )
}
