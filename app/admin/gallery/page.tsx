import { createServiceRoleClient } from '@/lib/supabase/server'
import GalleryManager from '@/components/admin/GalleryManager'

export const metadata = { title: 'Admin — Gallery' }

export default async function GalleryAdminPage() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('gallery').select('*').order('sort_order')
  return <GalleryManager initialItems={data ?? []} />
}
