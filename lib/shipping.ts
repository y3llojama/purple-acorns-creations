import type { Settings } from '@/lib/supabase/types'

type ShippingTier = Pick<Settings, 'shipping_mode' | 'shipping_value'>

type AllShippingSettings = Pick<Settings,
  | 'shipping_mode' | 'shipping_value'
  | 'shipping_mode_canada_mexico' | 'shipping_value_canada_mexico'
  | 'shipping_mode_intl' | 'shipping_value_intl'
>

/** Resolve the correct shipping tier based on a 2-letter country code. */
export function resolveShippingTier(country: string, settings: AllShippingSettings): ShippingTier {
  const code = country.trim().toUpperCase()
  if (code === 'US') {
    return { shipping_mode: settings.shipping_mode, shipping_value: settings.shipping_value }
  }
  if (code === 'CA' || code === 'MX') {
    return { shipping_mode: settings.shipping_mode_canada_mexico, shipping_value: settings.shipping_value_canada_mexico }
  }
  return { shipping_mode: settings.shipping_mode_intl, shipping_value: settings.shipping_value_intl }
}

export function calculateShipping(
  subtotal: number,
  settings: ShippingTier
): number {
  if (subtotal <= 0) return 0
  if (settings.shipping_value === 0) return 0
  if (settings.shipping_mode === 'fixed') return settings.shipping_value
  return parseFloat(((subtotal * settings.shipping_value) / 100).toFixed(2))
}
