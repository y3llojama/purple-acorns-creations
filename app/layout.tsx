import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getSettings } from '@/lib/theme'
import { deriveCustomThemeVars } from '@/lib/color'
import type { ThemeVars } from '@/lib/color'
import './globals.css'

// business_name rarely changes and is always loaded in RootLayout below.
// Fetching settings here doubled DB hits on every page load because
// generateMetadata runs in a separate RSC execution context from the page.
const SITE_NAME = 'Purple Acorns Creations'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.purpleacornz.com'),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description:
    'Handcrafted jewelry by a mother-daughter duo. Crochet jewelry, sterling silver, brass, and artisan pieces made with love.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    siteName: SITE_NAME,
    images: ['/og-image.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings()
  let themeAttr: string = settings.theme ?? 'modern'
  let inlineVars: ThemeVars | undefined

  if (settings.theme === 'custom' && settings.custom_primary && settings.custom_accent) {
    try {
      inlineVars = deriveCustomThemeVars(settings.custom_primary, settings.custom_accent)
    } catch {
      themeAttr = 'modern'
    }
  } else if (settings.theme === 'custom') {
    themeAttr = 'modern'
  }

  // Modern template overrides DB theme
  if (process.env.NEXT_PUBLIC_LAYOUT_MODE === 'modern') {
    themeAttr = 'modern'
    inlineVars = undefined
  }

  return (
    <html lang="en" data-theme={themeAttr} style={inlineVars as React.CSSProperties}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
