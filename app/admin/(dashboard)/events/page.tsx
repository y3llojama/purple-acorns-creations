import { createServiceRoleClient } from '@/lib/supabase/server'
import EventsManager from '@/components/admin/EventsManager'
import { DiscoveryProvider } from '@/components/admin/DiscoveryProvider'
import DiscoveryBanner from '@/components/admin/DiscoveryBanner'

export const metadata = { title: 'Admin — Events' }

export default async function EventsAdminPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('events').select('*').order('date')
  return (
    <DiscoveryProvider
      endpoint="/api/admin/events/discover"
      pollEndpoint="/api/admin/events"
      noun="event"
    >
      <DiscoveryBanner searchingMessage="Searching for events in the background — you can keep using the admin while this runs." />
      <EventsManager initialEvents={data ?? []} />
    </DiscoveryProvider>
  )
}
