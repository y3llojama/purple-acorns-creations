import type { Metadata } from 'next'

// PWA metadata present on ALL /admin/* routes (login + dashboard).
// iOS reads the current page's head when "Add to Home Screen" is tapped,
// so this must be in a shared ancestor, not just the (dashboard) layout.
export const metadata: Metadata = {
  manifest: '/admin-manifest.json',
  icons: {
    apple: '/admin-icon-180.png',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'PA Admin',
  },
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
