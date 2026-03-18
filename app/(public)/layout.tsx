import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import { interpolate, buildVars } from '@/lib/variables'
import AnnouncementBanner from '@/components/layout/AnnouncementBanner'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ModernLayout from '@/components/modern/ModernLayout'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const isModern = process.env.NEXT_PUBLIC_LAYOUT_MODE === 'modern'
  const settings = await getSettings()
  const vars = buildVars(settings.business_name)
  const announcementText = settings.announcement_text
    ? sanitizeText(interpolate(settings.announcement_text, vars))
    : ''

  if (isModern) {
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

  return (
    <>
      {settings.announcement_enabled && announcementText && (
        <AnnouncementBanner
          text={announcementText}
          linkUrl={settings.announcement_link_url ?? null}
          linkLabel={settings.announcement_link_label ? sanitizeText(interpolate(settings.announcement_link_label, vars)) : null}
        />
      )}
      <Header logoUrl={settings.logo_url ?? null} businessName={settings.business_name} />
      <main id="main-content">{children}</main>
      <Footer settings={settings} />
      <AnalyticsTracker />
    </>
  )
}
