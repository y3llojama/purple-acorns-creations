import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/theme'
import GalleryManager from '@/components/admin/GalleryManager'

export const metadata = { title: 'Admin — Gallery' }

export default async function GalleryAdminPage() {
  const supabase = createServiceRoleClient()
  const [{ data }, settings] = await Promise.all([
    supabase.from('gallery').select('*').order('sort_order'),
    getSettings(),
  ])
  return <GalleryManager initialItems={data ?? []} watermark={settings.gallery_watermark} />
}
