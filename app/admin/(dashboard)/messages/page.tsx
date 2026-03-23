import { createServiceRoleClient } from '@/lib/supabase/server'
import MessagesInbox from '@/components/admin/MessagesInbox'

export default async function MessagesPage() {
  const supabase = createServiceRoleClient()
  const { data: messages, count } = await supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, 19)

  return <MessagesInbox initialMessages={messages ?? []} initialTotal={count ?? 0} />
}
