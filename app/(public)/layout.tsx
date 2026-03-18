import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import AnnouncementBanner from '@/components/layout/AnnouncementBanner'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings()
  const announcementText = settings.announcement_text ? sanitizeText(settings.announcement_text) : ''

  return (
    <>
      {settings.announcement_enabled && announcementText && (
        <AnnouncementBanner
          text={announcementText}
          linkUrl={settings.announcement_link_url ?? null}
          linkLabel={settings.announcement_link_label ?? null}
        />
      )}
      <Header logoUrl={settings.logo_url ?? null} />
      <main id="main-content">{children}</main>
      <Footer settings={settings} />
    </>
  )
}
