import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSettings } from '@/lib/theme'
import IntegrationsEditor from '@/components/admin/IntegrationsEditor'
import { decryptSettings } from '@/lib/crypto'

export const metadata = { title: 'Admin — Integrations' }

export default async function IntegrationsPage() {
  const [rawSettings, photosResult] = await Promise.all([
    getSettings(),
    createServiceRoleClient()
      .from('follow_along_photos')
      .select('*')
      .order('display_order')
      .then(r => r.data ?? []),
  ])

  const settings = decryptSettings(rawSettings)

  return (
    <IntegrationsEditor
      initialMode={settings.follow_along_mode ?? 'widget'}
      initialPhotos={photosResult}
      initialBeholdWidgetId={settings.behold_widget_id ?? ''}
      hasResendApiKey={!!settings.resend_api_key}
      initialMessagesFromEmail={settings.messages_from_email ?? ''}
      initialReplyEmailFooter={settings.reply_email_footer ?? ''}
      initialNewsletterFromName={settings.newsletter_from_name ?? ''}
      initialNewsletterFromEmail={settings.newsletter_from_email ?? ''}
      initialNewsletterAdminEmails={settings.newsletter_admin_emails ?? ''}
      initialNewsletterSendTime={settings.newsletter_scheduled_send_time ?? '10:00'}
      initialAiProvider={settings.ai_provider ?? ''}
      hasAiApiKey={!!settings.ai_api_key}
      hasSearchApiKey={!!settings.search_api_key}
    />
  )
}
