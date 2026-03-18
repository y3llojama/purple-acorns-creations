import { Settings } from '@/lib/supabase/types'
import AnnouncementBanner from '@/components/layout/AnnouncementBanner'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ModernHeader from './ModernHeader'
import ModernNavDrawer from './ModernNavDrawer'
import ModernFooter from './ModernFooter'
import ModernFAB from './ModernFAB'

interface Props {
  children: React.ReactNode
  settings: Settings
  announcementText: string
  announcementLinkUrl: string | null
  announcementLinkLabel: string | null
  announcementEnabled: boolean
}

export default function ModernLayout({
  children,
  settings,
  announcementText,
  announcementLinkUrl,
  announcementLinkLabel,
  announcementEnabled,
}: Props) {
  return (
    <>
      {announcementEnabled && announcementText && (
        <AnnouncementBanner
          text={announcementText}
          linkUrl={announcementLinkUrl}
          linkLabel={announcementLinkLabel}
        />
      )}
      <ModernHeader
        logoUrl={settings.logo_url}
        businessName={settings.business_name}
        squareStoreUrl={settings.square_store_url}
      />
      <ModernNavDrawer />
      <main id="main-content" style={{ minHeight: '60vh' }}>
        {children}
      </main>
      <ModernFooter settings={settings} />
      <ModernFAB />
      <AnalyticsTracker />
    </>
  )
}
