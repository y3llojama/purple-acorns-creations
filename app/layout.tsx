import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Purple Acorns Creations',
    template: '%s — Purple Acorns Creations',
  },
  description: 'Handcrafted jewelry by a mother-daughter duo in Brooklyn, NY. Crochet jewelry, sterling silver, brass, and artisan pieces made with love.',
  openGraph: {
    siteName: 'Purple Acorns Creations',
    images: ['/og-image.jpg'],
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings()
  const theme = settings.theme ?? 'warm-artisan'

  // Sanitize announcement text before rendering (defense-in-depth)
  const announcementText = settings.announcement_text
    ? sanitizeText(settings.announcement_text)
    : ''

  return (
    <html lang="en" data-theme={theme}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {settings.announcement_enabled && announcementText && (
          <div id="announcement-placeholder" data-text={announcementText} data-link-url={settings.announcement_link_url ?? ''} data-link-label={settings.announcement_link_label ?? ''} />
        )}
        <main id="main-content">{children}</main>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
