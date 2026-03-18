import Link from 'next/link'
import { isValidHttpsUrl } from '@/lib/validate'

interface EventShape {
  id: string
  name: string
  date: string
  location: string | null
  description: string | null
  link_url: string | null
  link_label: string | null
}

interface Props {
  event: EventShape | null
}

export default function ModernEventSection({ event }: Props) {
  if (!event) return null

  const formattedDate = new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const hasExternalLink = event.link_url && isValidHttpsUrl(event.link_url)

  return (
    <section>
      <style>{`
        .modern-event-banner {
          padding: clamp(32px, 4vw, 48px) clamp(16px, 4vw, 48px);
          background: var(--color-primary);
          color: #fff;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
        }

        @media (max-width: 768px) {
          .modern-event-banner {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        .modern-event-cta-btn {
          background: transparent;
          border: 2px solid var(--color-accent);
          color: var(--color-accent);
          padding: 12px 28px;
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          white-space: nowrap;
          flex-shrink: 0;
          transition: background 0.2s ease, color 0.2s ease;
        }

        .modern-event-cta-btn:hover {
          background: var(--color-accent);
          color: var(--color-primary);
        }
      `}</style>

      <div className="modern-event-banner">
        {/* Left: event info */}
        <div>
          <p
            style={{
              color: 'var(--color-accent)',
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              margin: '0 0 8px 0',
            }}
          >
            Next Event
          </p>
          <h3
            style={{
              color: '#fff',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'clamp(20px, 2.5vw, 28px)',
              letterSpacing: '-0.01em',
              margin: '0 0 8px 0',
            }}
          >
            {event.name}
          </h3>
          <p style={{ fontSize: '14px', color: '#fff', opacity: 0.7, margin: '0 0 0 0' }}>
            {formattedDate}
            {event.location && ` · ${event.location}`}
          </p>
          {event.description && (
            <p
              style={{
                fontSize: '14px',
                color: '#fff',
                opacity: 0.6,
                marginTop: '8px',
                margin: '8px 0 0 0',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              } as React.CSSProperties}
            >
              {event.description}
            </p>
          )}
        </div>

        {/* Right: CTA */}
        {hasExternalLink && (
          <Link
            href={event.link_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="modern-event-cta-btn"
          >
            {event.link_label ?? 'Learn More'}
          </Link>
        )}
      </div>
    </section>
  )
}
