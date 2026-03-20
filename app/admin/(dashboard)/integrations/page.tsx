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
      initialResendApiKey={settings.resend_api_key ?? ''}
      initialNewsletterFromName={settings.newsletter_from_name ?? ''}
      initialNewsletterFromEmail={settings.newsletter_from_email ?? ''}
      initialNewsletterAdminEmails={settings.newsletter_admin_emails ?? ''}
      initialNewsletterSendTime={settings.newsletter_scheduled_send_time ?? '10:00'}
      initialAiProvider={settings.ai_provider ?? ''}
      initialAiApiKey={settings.ai_api_key ?? ''}
    />
  )
}
