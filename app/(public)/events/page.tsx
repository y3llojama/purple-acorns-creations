import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Event } from '@/lib/supabase/types'
import EventsTabs from '@/components/public/EventsTabs'

export const metadata = {
  title: 'Events | Purple Acorns Creations',
  description: 'Find Purple Acorns Creations at arts and crafts fairs across Massachusetts and New England. See our upcoming events and past appearances.',
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
          margin: 0 0 40px;
        }
      `}</style>

      <div className="events-page">
        <h1 className="events-page-title">Events</h1>
        <p className="events-page-subtitle">
          Find us at arts and crafts fairs across Massachusetts and New England.
        </p>
        <EventsTabs upcoming={upcoming} past={past} />
      </div>
    </>
  )
}
