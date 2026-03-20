import { createServiceRoleClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ProductDetail from '@/components/shop/ProductDetail'
import type { Metadata } from 'next'
import type { Product } from '@/lib/supabase/types'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('products').select('name,description').eq('id', id).eq('is_active', true).single()
  if (!data) return { title: 'Product Not Found' }
  return { title: data.name, description: data.description ?? undefined }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data: product } = await supabase.from('products').select('*').eq('id', id).eq('is_active', true).single()
  if (!product) notFound()
  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '60px 24px' }}>
      <ProductDetail product={product as Product} />
    </div>
  )
}
