import type { Event } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props { event: Event | null }

export default function NextEvent({ event }: Props) {
  if (!event) return null

  const formattedDate = new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(event.location)}`

  return (
    <section id="events" style={{ padding: '80px 24px', background: 'var(--color-surface)' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '36px', color: 'var(--color-primary)', marginBottom: '24px' }}>
          Upcoming Event
        </h2>
        <h3 style={{ fontSize: '24px', color: 'var(--color-primary)', marginBottom: '12px' }}>
          {event.name}
        </h3>
        <p style={{ fontSize: '18px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
          {formattedDate}
          {event.time && ` · ${event.time}`}
        </p>
        <p style={{ fontSize: '18px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
          >
            {event.location}
          </a>
        </p>
        {event.description && (
          <p style={{ fontSize: '16px', color: 'var(--color-text-muted)', lineHeight: 1.8, marginBottom: '24px' }}>
            {event.description}
          </p>
        )}
        {event.link_url && isValidHttpsUrl(event.link_url) && (
          <a
            href={event.link_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '14px 32px', borderRadius: '4px', textDecoration: 'none', fontSize: '18px', minHeight: '48px' }}
          >
            {event.link_label ?? 'Learn More'}
          </a>
        )}
      </div>
    </section>
  )
}
