import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/theme'
import IntegrationsEditor from '@/components/admin/IntegrationsEditor'

export const metadata = { title: 'Admin — Integrations' }

export default async function IntegrationsPage() {
  const [settings, photosResult] = await Promise.all([
    getSettings(),
    createServiceRoleClient()
      .from('follow_along_photos')
      .select('*')
      .order('display_order')
      .then(r => r.data ?? []),
  ])

  return (
    <IntegrationsEditor
      initialMode={settings.follow_along_mode ?? 'widget'}
      initialPhotos={photosResult}
    />
  )
}
