import { getSettings } from '@/lib/theme'
import { isValidHttpsUrl } from '@/lib/validate'

export const metadata = { title: 'Shop' }

export default async function ShopPage() {
  const settings = await getSettings()
  const storeUrl = settings.square_store_url

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>Shop</h1>
      {storeUrl && isValidHttpsUrl(storeUrl) ? (
        <iframe
          src={storeUrl}
          title="Purple Acorns Creations Store"
          style={{ width: '100%', minHeight: '800px', border: 'none' }}
          loading="lazy"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
        />
      ) : (
        <p style={{ textAlign: 'center', fontSize: '20px', color: 'var(--color-text-muted)' }}>
          Our shop is coming soon! Check back later.
        </p>
      )}
    </main>
  )
}
