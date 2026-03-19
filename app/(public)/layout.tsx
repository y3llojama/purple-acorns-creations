import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import { interpolate, buildVars } from '@/lib/variables'
import ModernLayout from '@/components/modern/ModernLayout'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings()
  const vars = buildVars(settings.business_name)
  const announcementText = settings.announcement_text
    ? sanitizeText(interpolate(settings.announcement_text, vars))
    : ''

  return (
    <ModernLayout
      settings={settings}
      announcementText={announcementText}
      announcementLinkUrl={settings.announcement_link_url ?? null}
      announcementLinkLabel={settings.announcement_link_label ? sanitizeText(interpolate(settings.announcement_link_label, vars)) : null}
      announcementEnabled={settings.announcement_enabled}
    >
      {children}
    </ModernLayout>
  )
}
