import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Event } from '@/lib/supabase/types'

export const metadata = {
  title: 'Markets & Fairs | Purple Acorns Creations',
  description: 'The markets and craft fairs where Purple Acorns Creations has had the joy and privilege of sharing handcrafted jewelry with our community.',
}

export default async function MarketsAndFairsPage() {
  const supabase = createServiceRoleClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('events')
    .select('name, location, date')
    .lt('date', today)
    .order('date', { ascending: false })

  const events: Pick<Event, 'name' | 'location' | 'date'>[] = data ?? []

  // Deduplicate by name, keeping the most recent location
  const seen = new Map<string, string>()
  for (const e of events) {
    if (!seen.has(e.name)) seen.set(e.name, e.location)
  }
  const markets = Array.from(seen.entries())
    .sort(([a], [b]) => a.localeCompare(b))

  return (
    <>
      <style>{`
        .mf-page {
          max-width: 700px;
          margin: 0 auto;
          padding: clamp(40px, 6vw, 80px) clamp(16px, 4vw, 32px);
        }
        .mf-title {
          font-family: var(--font-display);
          font-size: clamp(28px, 4vw, 42px);
          color: var(--color-primary);
          font-weight: 400;
          margin: 0 0 20px;
        }
        .mf-intro {
          font-family: 'Jost', sans-serif;
          font-size: clamp(15px, 1.4vw, 17px);
          line-height: 1.85;
          color: var(--color-text-muted);
          margin: 0 0 48px;
          max-width: 560px;
        }
        .mf-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .mf-list li {
          display: flex;
          align-items: baseline;
          gap: 10px;
          padding: 14px 0;
          border-bottom: 1px solid var(--color-border);
          font-family: 'Jost', sans-serif;
        }
        .mf-list li:first-child {
          border-top: 1px solid var(--color-border);
        }
        .mf-name {
          font-size: clamp(15px, 1.4vw, 17px);
          font-weight: 500;
          color: var(--color-text);
        }
        .mf-sep {
          color: var(--color-border);
          font-size: 13px;
          flex-shrink: 0;
        }
        .mf-location {
          font-size: 14px;
          color: var(--color-text-muted);
        }
        .mf-empty {
          font-family: 'Jost', sans-serif;
          font-size: 16px;
          color: var(--color-text-muted);
          font-style: italic;
        }
      `}</style>

      <div className="mf-page">
        <h1 className="mf-title">Markets &amp; Fairs</h1>
        <p className="mf-intro">
          It has been our joy and privilege to be welcomed at these markets and fairs.
          We are deeply grateful to the organizers and communities who have made space for us
          and supported handmade craft.
        </p>

        {markets.length === 0 ? (
          <p className="mf-empty">No past markets yet — check back soon!</p>
        ) : (
          <ul className="mf-list">
            {markets.map(([name, location]) => (
              <li key={name}>
                <span className="mf-name">{name}</span>
                <span className="mf-sep" aria-hidden="true">·</span>
                <span className="mf-location">{location}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
