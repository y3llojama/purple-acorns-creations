import { Settings } from '@/lib/supabase/types'
import AnnouncementBanner from '@/components/layout/AnnouncementBanner'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ModernHeader from './ModernHeader'
import ModernFooter from './ModernFooter'
import ModernFAB from './ModernFAB'
import PageLoadOverlay from './PageLoadOverlay'

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
      {/* padding-top offsets the floating logo that overflows below the header bar.
          Pages that start with a full-bleed hero cancel this with margin-top: calc(-1 * var(--logo-overflow)) */}
      <main id="main-content" style={{ minHeight: '60vh', paddingTop: 'var(--logo-overflow, clamp(60px, 7vw, 90px))' }}>
        {children}
      </main>
      <ModernFooter settings={settings} />
      <ModernFAB />
      <AnalyticsTracker />
      <PageLoadOverlay />
    </>
  )
}
