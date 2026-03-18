import { createServiceRoleClient } from '@/lib/supabase/server'
import MessagesInbox from '@/components/admin/MessagesInbox'

export default async function MessagesPage() {
  const supabase = createServiceRoleClient()
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })

  return <MessagesInbox initialMessages={messages ?? []} />
}
