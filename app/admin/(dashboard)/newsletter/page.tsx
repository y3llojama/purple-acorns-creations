import { createServiceRoleClient } from '@/lib/supabase/server'
import NewsletterList from '@/components/admin/newsletter/NewsletterList'
export const metadata = { title: 'Admin — Newsletter' }
export default async function NewsletterAdminPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('newsletters')
    .select('id, slug, title, status, scheduled_at, sent_at, created_at')
    .order('created_at', { ascending: false })
  return <NewsletterList newsletters={data ?? []} />
}
