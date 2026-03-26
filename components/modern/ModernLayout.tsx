import { Settings } from '@/lib/supabase/types'
import AnnouncementBanner from '@/components/layout/AnnouncementBanner'
import AnalyticsTracker from '@/components/AnalyticsTracker'
import ModernHeader from './ModernHeader'
import ModernFooter from './ModernFooter'
import ModernFAB from './ModernFAB'
import PageLoadOverlay from './PageLoadOverlay'
import { CartProvider } from '@/components/shop/CartContext'
import CartDrawer from '@/components/shop/CartDrawer'

interface NavCategory { id: string; name: string; slug: string; children: { id: string; name: string; slug: string }[] }

interface Props {
  children: React.ReactNode
  navCategories: NavCategory[]
  settings: Settings
  announcementText: string
  announcementLinkUrl: string | null
  announcementLinkLabel: string | null
  announcementEnabled: boolean
}

export default function ModernLayout({
  children,
  navCategories,
  settings,
  announcementText,
  announcementLinkUrl,
  announcementLinkLabel,
  announcementEnabled,
}: Props) {
  return (
    <CartProvider>
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
        navCategories={navCategories}
      />
      {/* padding-top offsets the floating logo that overflows below the header bar.
          Pages that start with a full-bleed hero cancel this with margin-top: calc(-1 * var(--logo-overflow)) */}
      <main id="main-content" style={{ minHeight: '60vh', paddingTop: 'var(--logo-overflow, clamp(60px, 7vw, 90px))' }}>
        {children}
      </main>
      <ModernFooter settings={settings} />
      <ModernFAB />
      <CartDrawer />
      <AnalyticsTracker />
      <PageLoadOverlay />
    </CartProvider>
  )
}
