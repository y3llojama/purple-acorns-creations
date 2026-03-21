import { createServiceRoleClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ProductDetail from '@/components/shop/ProductDetail'
import type { Metadata } from 'next'
import type { Product } from '@/lib/supabase/types'
import { JsonLd, buildProductSchema, buildBreadcrumbSchema } from '@/lib/seo'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('products')
    .select('name,description,images,price')
    .eq('id', id)
    .eq('is_active', true)
    .single()
  if (!data) return { title: 'Product Not Found' }

  const description = `$${data.price}${data.description ? ` — ${data.description}` : ''}`
  const firstImage = data.images[0] as string | undefined

  return {
    title: data.name,
    description,
    openGraph: {
      title: data.name,
      description,
      images: firstImage ? [{ url: firstImage, alt: data.name }] : undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: data.name,
      description,
      images: firstImage ? [firstImage] : undefined,
    },
  }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data: product } = await supabase.from('products').select('*').eq('id', id).eq('is_active', true).single()
  if (!product) notFound()

  const productUrl = `https://www.purpleacornz.com/shop/${id}`

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '60px 24px' }}>
      <JsonLd schema={buildProductSchema(product as Product, productUrl)} />
      <JsonLd schema={buildBreadcrumbSchema([
        { name: 'Home', url: 'https://www.purpleacornz.com' },
        { name: 'Shop', url: 'https://www.purpleacornz.com/shop' },
        { name: (product as Product).name, url: productUrl },
      ])} />
      <ProductDetail product={product as Product} />
    </div>
  )
}
