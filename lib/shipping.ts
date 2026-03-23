import type { Settings } from '@/lib/supabase/types'

export function calculateShipping(
  subtotal: number,
  settings: Pick<Settings, 'shipping_mode' | 'shipping_value'>
): number {
  if (subtotal <= 0) return 0
  if (settings.shipping_value === 0) return 0
  if (settings.shipping_mode === 'fixed') return settings.shipping_value
  return parseFloat(((subtotal * settings.shipping_value) / 100).toFixed(2))
}
