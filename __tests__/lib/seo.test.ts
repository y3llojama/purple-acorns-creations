import { buildProductSchema, buildOrganizationSchema, buildBreadcrumbSchema } from '@/lib/seo'
import type { Product } from '@/lib/supabase/types'

const baseProduct: Product = {
  id: 'abc123',
  name: 'Moonlit Lace Earrings',
  description: 'Handcrafted crochet earrings',
  price: 24,
  images: ['https://example.com/image.jpg'],
  is_active: true,
  category_id: null,
  square_variation_id: null,
  square_catalog_id: null,
  pinterest_product_id: null,
  stock_count: 5,
  gallery_featured: false,
  gallery_sort_order: null,
  view_count: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('buildProductSchema — variation-aware (R9)', () => {
  const url = 'https://www.purpleacornz.com/shop/abc123'

  it('sets @type to Product', () => {
    const schema = buildProductSchema(baseProduct, url, { effectivePrice: 24, anyInStock: true })
    expect(schema['@type']).toBe('Product')
  })

  it('uses effectivePrice from variation, not product.price', () => {
    const schema = buildProductSchema(baseProduct, url, { effectivePrice: 55, anyInStock: true })
    expect(schema['offers']['price']).toBe(55)
  })

  it('sets InStock when anyInStock is true, regardless of product.stock_count', () => {
    const schema = buildProductSchema(
      { ...baseProduct, stock_count: 0 },
      url,
      { effectivePrice: 24, anyInStock: true },
    )
    expect(schema['offers']['availability']).toBe('https://schema.org/InStock')
  })

  it('sets OutOfStock when anyInStock is false', () => {
    const schema = buildProductSchema(baseProduct, url, { effectivePrice: 24, anyInStock: false })
    expect(schema['offers']['availability']).toBe('https://schema.org/OutOfStock')
  })

  it('still sets OutOfStock when is_active is false even if anyInStock', () => {
    const schema = buildProductSchema(
      { ...baseProduct, is_active: false },
      url,
      { effectivePrice: 24, anyInStock: true },
    )
    expect(schema['offers']['availability']).toBe('https://schema.org/OutOfStock')
  })

  it('omits description when null', () => {
    const schema = buildProductSchema(
      { ...baseProduct, description: null },
      url,
      { effectivePrice: 24, anyInStock: true },
    )
    expect('description' in schema).toBe(false)
  })

  it('omits image when images array is empty', () => {
    const schema = buildProductSchema(
      { ...baseProduct, images: [] },
      url,
      { effectivePrice: 24, anyInStock: true },
    )
    expect('image' in schema).toBe(false)
  })
})

describe('buildOrganizationSchema', () => {
  it('sets @type to Organization', () => {
    const schema = buildOrganizationSchema('Purple Acornz Creations')
    expect(schema['@type']).toBe('Organization')
  })

  it('includes name, url, logo, and sameAs with Instagram and GBP URLs', () => {
    const schema = buildOrganizationSchema('Purple Acornz Creations')
    expect(schema['name']).toBe('Purple Acornz Creations')
    expect(schema['url']).toBe('https://www.purpleacornz.com')
    expect(schema['logo']).toBe('https://www.purpleacornz.com/og-image.jpg')
    expect(schema['sameAs']).toContain('https://www.instagram.com/purpleacornz/')
    expect((schema['sameAs'] as string[]).some((u: string) => u.includes('google.com/maps'))).toBe(true)
  })
})

describe('buildBreadcrumbSchema', () => {
  it('sets @type to BreadcrumbList', () => {
    const schema = buildBreadcrumbSchema([{ name: 'Home', url: 'https://www.purpleacornz.com' }])
    expect(schema['@type']).toBe('BreadcrumbList')
  })

  it('maps items to ListItem with correct position', () => {
    const schema = buildBreadcrumbSchema([
      { name: 'Home', url: 'https://www.purpleacornz.com' },
      { name: 'Shop', url: 'https://www.purpleacornz.com/shop' },
    ])
    expect(schema['itemListElement']).toHaveLength(2)
    expect(schema['itemListElement'][0]).toMatchObject({ '@type': 'ListItem', position: 1, name: 'Home' })
    expect(schema['itemListElement'][1]).toMatchObject({ '@type': 'ListItem', position: 2, name: 'Shop' })
  })
})
