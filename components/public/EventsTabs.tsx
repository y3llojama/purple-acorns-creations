'use client'
import { useState } from 'react'
import { isValidHttpsUrl } from '@/lib/validate'
import type { Event } from '@/lib/supabase/types'

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
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      padding: '24px',
      marginBottom: '16px',
    }}>
      <h3 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(18px, 2vw, 22px)',
        color: 'var(--color-primary)',
        margin: '0 0 8px',
        fontWeight: 400,
      }}>
        {event.name}
      </h3>
      <p style={{
        fontSize: '15px',
        color: muted ? 'var(--color-text-muted)' : 'var(--color-text)',
        margin: '0 0 4px',
      }}>
        {formatDate(event.date)}{event.time ? ` · ${event.time}` : ''}
      </p>
      <p style={{
        fontSize: '15px',
        color: muted ? 'var(--color-text-muted)' : 'var(--color-text)',
        margin: '0 0 16px',
      }}>
        {event.location}
      </p>
      {event.description && (
        <p style={{ fontSize: '15px', color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
          {event.description}
        </p>
      )}
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

interface Props {
  upcoming: Event[]
  past: Event[]
}

export default function EventsTabs({ upcoming, past }: Props) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  const tabStyle = (active: boolean): React.CSSProperties => ({
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
    fontFamily: 'var(--font-display)',
    fontSize: 'clamp(16px, 2vw, 20px)',
    fontWeight: active ? 500 : 400,
    padding: '8px 0',
    marginRight: '32px',
    cursor: 'pointer',
    minHeight: '48px',
  })

  return (
    <>
      <div role="tablist" aria-label="Events" style={{ borderBottom: '1px solid var(--color-border)', marginBottom: '32px', display: 'flex' }}>
        <button
          role="tab"
          aria-selected={tab === 'upcoming'}
          aria-controls="upcoming-panel"
          onClick={() => setTab('upcoming')}
          style={tabStyle(tab === 'upcoming')}
        >
          Upcoming{upcoming.length > 0 ? ` (${upcoming.length})` : ''}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'past'}
          aria-controls="past-panel"
          onClick={() => setTab('past')}
          style={tabStyle(tab === 'past')}
        >
          Past{past.length > 0 ? ` (${past.length})` : ''}
        </button>
      </div>

      <div id="upcoming-panel" role="tabpanel" hidden={tab !== 'upcoming'}>
        {upcoming.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '16px', fontStyle: 'italic' }}>
            Check back soon — we&apos;re always finding new markets and fairs to join.
          </p>
        ) : (
          upcoming.map(event => <EventCard key={event.id} event={event} />)
        )}
      </div>

      <div id="past-panel" role="tabpanel" hidden={tab !== 'past'}>
        {past.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '16px', fontStyle: 'italic' }}>
            No past events recorded yet.
          </p>
        ) : (
          past.map(event => <EventCard key={event.id} event={event} muted />)
        )}
      </div>
    </>
  )
}
