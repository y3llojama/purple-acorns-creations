import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getSettings } from '@/lib/theme'
import { deriveCustomThemeVars } from '@/lib/color'
import type { ThemeVars } from '@/lib/color'
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
  let themeAttr: string = settings.theme ?? 'warm-artisan'
  let inlineVars: ThemeVars | undefined

  if (settings.theme === 'custom' && settings.custom_primary && settings.custom_accent) {
    try {
      inlineVars = deriveCustomThemeVars(settings.custom_primary, settings.custom_accent)
    } catch {
      themeAttr = 'warm-artisan'
    }
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
