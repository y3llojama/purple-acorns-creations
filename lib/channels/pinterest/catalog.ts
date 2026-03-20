import { getPinterestHeaders } from './client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Product, SyncResult } from '@/lib/channels/types'

const PINTEREST_API = 'https://api.pinterest.com/v5'

export async function pushProduct(product: Product): Promise<SyncResult> {
  try {
    const { headers, catalogId } = await getPinterestHeaders()
    if (!catalogId) throw new Error('Pinterest catalog ID not configured')

    const res = await fetch(`${PINTEREST_API}/catalogs/items/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        country: 'US',
        language: 'EN',
        operation: 'UPSERT',
        items: [{
          catalog_id: catalogId,
          item_id: product.id,
          operation: 'CREATE_OR_UPDATE',
          attributes: {
            title: product.name,
            description: product.description ?? '',
            link: `${process.env.NEXT_PUBLIC_APP_URL}/shop/${product.id}`,
            image_link: product.images[0] ?? '',
            price: `${product.price.toFixed(2)} USD`,
            availability: product.stock_count > 0 ? 'in stock' : 'out of stock',
            google_product_category: '188',
          },
        }],
      }),
    })

    if (!res.ok) throw new Error(`Pinterest API error ${res.status}: ${await res.text()}`)

    const result = await res.json()
    if (result?.batch_id && !product.pinterest_product_id) {
      const supabase = createServiceRoleClient()
      await supabase.from('products').update({ pinterest_product_id: result.batch_id }).eq('id', product.id)
    }

    return { productId: product.id, channel: 'pinterest', success: true }
  } catch (err) {
    return { productId: product.id, channel: 'pinterest', success: false, error: String(err) }
  }
}

export async function fullSync(products: Product[]): Promise<SyncResult[]> {
  return Promise.all(products.map(pushProduct))
}
