import { createServiceRoleClient } from '@/lib/supabase/server'
import EventsManager from '@/components/admin/EventsManager'

export const metadata = { title: 'Admin — Events' }

export default async function EventsAdminPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('events').select('*').order('date')
  return <EventsManager initialEvents={data ?? []} />
}
