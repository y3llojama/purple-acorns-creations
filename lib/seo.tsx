import type { Product } from '@/lib/supabase/types'

const BASE_URL = 'https://www.purpleacornz.com'
const GBP_URL =
  'https://www.google.com/maps/place/Purple+Acornz+Creations/data=!4m2!3m1!1s0x0:0xe3c107aad4de5135?sa=X&ved=1t:2428&hl=en&ictx=111'
const INSTAGRAM_URL = 'https://www.instagram.com/purpleacornz/'
const LOGO_URL = `${BASE_URL}/og-image.jpg`

export function buildProductSchema(
  product: Product,
  url: string,
  variation?: { effectivePrice: number; anyInStock: boolean }
): Record<string, unknown> {
  const price = variation?.effectivePrice ?? product.price
  const inStock = product.is_active && (variation ? variation.anyInStock : product.stock_count > 0)
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    offers: {
      '@type': 'Offer',
      price,
      priceCurrency: 'USD',
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url,
    },
  }
  if (product.description) schema.description = product.description
  if (product.images.length > 0) schema.image = product.images[0]
  return schema
}

export function buildOrganizationSchema(businessName: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: businessName,
    url: BASE_URL,
    logo: LOGO_URL,
    sameAs: [INSTAGRAM_URL, GBP_URL],
  }
}

export function buildBreadcrumbSchema(
  items: { name: string; url: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/**
 * JsonLd — server component that inlines a JSON-LD script tag.
 * Safe: content is JSON.stringify of a controlled server-side object.
 * No user input is ever passed to this component.
 */
export function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // NOTE: safe — JSON.stringify of a server-side object, not HTML or user input
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
