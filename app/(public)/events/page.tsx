import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidHttpsUrl } from '@/lib/validate'
import type { Event } from '@/lib/supabase/types'

export const metadata = {
  title: 'Events | Purple Acorns Creations',
  description: 'Find Purple Acorns Creations at arts and crafts fairs across Brooklyn and NYC. See our upcoming events and past appearances.',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function EventCard({ event, muted }: { event: Event; muted?: boolean }) {
  const hasLink = event.link_url && isValidHttpsUrl(event.link_url)
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '16px',
      }}
    >
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(18px, 2vw, 22px)',
          color: 'var(--color-primary)',
          margin: '0 0 8px',
          fontWeight: 400,
        }}
      >
        {event.name}
      </h3>
      <p
        style={{
          fontSize: '15px',
          color: muted ? 'var(--color-text-muted)' : 'var(--color-text)',
          opacity: muted ? 0.7 : 1,
          margin: '0 0 4px',
        }}
      >
        {formatDate(event.date)}
        {event.time ? ` · ${event.time}` : ''}
      </p>
      <p
        style={{
          fontSize: '15px',
          color: muted ? 'var(--color-text-muted)' : 'var(--color-text)',
          opacity: muted ? 0.7 : 1,
          margin: '0 0 16px',
        }}
      >
        {event.location}
      </p>
      {hasLink && (
        <a
          href={event.link_url!}
          rel="noopener noreferrer"
          target="_blank"
          style={{
            display: 'inline-block',
            background: 'var(--color-primary)',
            color: 'var(--color-accent)',
            padding: '10px 20px',
            fontSize: '15px',
            fontWeight: 500,
            borderRadius: '4px',
            textDecoration: 'none',
            minHeight: '48px',
            lineHeight: '28px',
          }}
        >
          {event.link_label ?? 'Learn more'}
        </a>
      )}
    </div>
  )
}

export default async function EventsPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('events').select('*').order('date')
  const allEvents: Event[] = data ?? []

  const today = new Date().toISOString().slice(0, 10)
  const upcoming = allEvents
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const past = allEvents
    .filter(e => e.date < today)
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <style>{`
        .events-page {
          max-width: 800px;
          margin: 0 auto;
          padding: clamp(32px, 5vw, 64px) clamp(16px, 4vw, 32px);
        }
        .events-page-title {
          font-family: var(--font-display);
          font-size: clamp(28px, 4vw, 42px);
          color: var(--color-primary);
          font-weight: 400;
          margin: 0 0 8px;
        }
        .events-page-subtitle {
          font-size: 16px;
          color: var(--color-text-muted);
          margin: 0 0 48px;
        }
        .events-section-heading {
          font-family: var(--font-display);
          font-size: clamp(20px, 2.5vw, 26px);
          color: var(--color-primary);
          font-weight: 400;
          margin: 0 0 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--color-border);
        }
        .events-empty {
          color: var(--color-text-muted);
          font-size: 16px;
          font-style: italic;
          padding: '16px 0';
        }
        .events-past-section {
          margin-top: 48px;
        }
      `}</style>

      <div className="events-page">
        <h1 className="events-page-title">Events</h1>
        <p className="events-page-subtitle">
          Find us at arts and crafts fairs across Brooklyn and NYC.
        </p>

        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="events-section-heading">Upcoming Events</h2>
          {upcoming.length === 0 ? (
            <p className="events-empty">
              Check back soon — we&apos;re always finding new markets and fairs to join.
            </p>
          ) : (
            upcoming.map(event => (
              <EventCard key={event.id} event={event} />
            ))
          )}
        </section>

        {past.length > 0 && (
          <section aria-labelledby="past-heading" className="events-past-section">
            <h2 id="past-heading" className="events-section-heading">Past Events</h2>
            {past.map(event => (
              <EventCard key={event.id} event={event} muted />
            ))}
          </section>
        )}
      </div>
    </>
  )
}
