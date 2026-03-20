import type { Product } from '@/lib/supabase/types'

export type { Product }

export interface SyncResult {
  productId: string
  channel: 'square' | 'pinterest' | 'etsy'
  success: boolean
  error?: string
}

export interface ChannelAdapter {
  push(product: Product): Promise<SyncResult>
  fullSync(products: Product[]): Promise<SyncResult[]>
}
