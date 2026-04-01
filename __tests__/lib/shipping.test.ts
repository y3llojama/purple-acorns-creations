import { calculateShipping, resolveShippingTier } from '@/lib/shipping'
import type { Settings } from '@/lib/supabase/types'

type AllShippingSettings = Pick<Settings,
  | 'shipping_mode' | 'shipping_value'
  | 'shipping_mode_canada_mexico' | 'shipping_value_canada_mexico'
  | 'shipping_mode_intl' | 'shipping_value_intl'
>

const SETTINGS: AllShippingSettings = {
  shipping_mode: 'fixed',
  shipping_value: 8.50,
  shipping_mode_canada_mexico: 'percentage',
  shipping_value_canada_mexico: 15,
  shipping_mode_intl: 'fixed',
  shipping_value_intl: 25.00,
}

// ─── resolveShippingTier ──────────────────────────────────────────────────────

describe('resolveShippingTier', () => {
  describe('US domestic', () => {
    it('returns domestic tier for "US"', () => {
      const tier = resolveShippingTier('US', SETTINGS)
      expect(tier.shipping_mode).toBe('fixed')
      expect(tier.shipping_value).toBe(8.50)
    })

    it('normalises lowercase "us" to domestic tier', () => {
      const tier = resolveShippingTier('us', SETTINGS)
      expect(tier.shipping_value).toBe(8.50)
    })

    it('normalises mixed-case "Us" to domestic tier', () => {
      const tier = resolveShippingTier('Us', SETTINGS)
      expect(tier.shipping_value).toBe(8.50)
    })

    it('strips surrounding whitespace', () => {
      expect(resolveShippingTier(' US ', SETTINGS).shipping_value).toBe(8.50)
      expect(resolveShippingTier('US ', SETTINGS).shipping_value).toBe(8.50)
    })
  })

  describe('Canada / Mexico tier', () => {
    it('returns canada_mexico tier for "CA"', () => {
      const tier = resolveShippingTier('CA', SETTINGS)
      expect(tier.shipping_mode).toBe('percentage')
      expect(tier.shipping_value).toBe(15)
    })

    it('returns canada_mexico tier for "MX"', () => {
      const tier = resolveShippingTier('MX', SETTINGS)
      expect(tier.shipping_mode).toBe('percentage')
      expect(tier.shipping_value).toBe(15)
    })

    it('normalises lowercase "ca" and "mx"', () => {
      expect(resolveShippingTier('ca', SETTINGS).shipping_value).toBe(15)
      expect(resolveShippingTier('mx', SETTINGS).shipping_value).toBe(15)
    })
  })

  describe('International tier', () => {
    it.each(['GB', 'JP', 'AU', 'DE'])('returns intl tier for "%s"', (code) => {
      const tier = resolveShippingTier(code, SETTINGS)
      expect(tier.shipping_mode).toBe('fixed')
      expect(tier.shipping_value).toBe(25.00)
    })

    it('normalises lowercase international codes', () => {
      expect(resolveShippingTier('gb', SETTINGS).shipping_value).toBe(25.00)
    })

    it('falls through to intl for empty string', () => {
      expect(resolveShippingTier('', SETTINGS).shipping_value).toBe(25.00)
    })

    it('falls through to intl for 3-letter code "USA"', () => {
      expect(resolveShippingTier('USA', SETTINGS).shipping_value).toBe(25.00)
    })

    it('falls through to intl for whitespace-only input', () => {
      expect(resolveShippingTier('   ', SETTINGS).shipping_value).toBe(25.00)
    })
  })

  describe('tier isolation', () => {
    it('domestic does not use other tier values', () => {
      const tier = resolveShippingTier('US', SETTINGS)
      expect(tier.shipping_value).not.toBe(SETTINGS.shipping_value_canada_mexico)
      expect(tier.shipping_value).not.toBe(SETTINGS.shipping_value_intl)
    })

    it('canada_mexico does not use other tier values', () => {
      const tier = resolveShippingTier('CA', SETTINGS)
      expect(tier.shipping_value).not.toBe(SETTINGS.shipping_value)
      expect(tier.shipping_value).not.toBe(SETTINGS.shipping_value_intl)
    })

    it('intl does not use other tier values', () => {
      const tier = resolveShippingTier('GB', SETTINGS)
      expect(tier.shipping_value).not.toBe(SETTINGS.shipping_value)
      expect(tier.shipping_value).not.toBe(SETTINGS.shipping_value_canada_mexico)
    })
  })
})

// ─── calculateShipping (regression) ─────────────────────────────────────────

describe('calculateShipping', () => {
  it('returns 0 when shipping_value is 0', () => {
    expect(calculateShipping(100, { shipping_mode: 'fixed', shipping_value: 0 })).toBe(0)
    expect(calculateShipping(100, { shipping_mode: 'percentage', shipping_value: 0 })).toBe(0)
  })

  it('returns the fixed value regardless of subtotal', () => {
    expect(calculateShipping(45, { shipping_mode: 'fixed', shipping_value: 8.50 })).toBe(8.50)
    expect(calculateShipping(200, { shipping_mode: 'fixed', shipping_value: 8.50 })).toBe(8.50)
  })

  it('calculates percentage of subtotal rounded to 2 decimal places', () => {
    expect(calculateShipping(100, { shipping_mode: 'percentage', shipping_value: 10 })).toBe(10)
    expect(calculateShipping(13.99, { shipping_mode: 'percentage', shipping_value: 10 })).toBe(1.40)
  })

  it('calculates correct cent total for Square', () => {
    const subtotal = 45.00
    const shipping = calculateShipping(subtotal, { shipping_mode: 'fixed', shipping_value: 8.50 })
    expect(Math.round((subtotal + shipping) * 100)).toBe(5350)
  })

  it('returns 0 when subtotal is 0 or negative', () => {
    expect(calculateShipping(0, { shipping_mode: 'percentage', shipping_value: 10 })).toBe(0)
    expect(calculateShipping(-5, { shipping_mode: 'percentage', shipping_value: 10 })).toBe(0)
  })
})

// ─── Integration: resolveShippingTier + calculateShipping ────────────────────

describe('resolveShippingTier + calculateShipping integration', () => {
  it('US order with fixed domestic rate', () => {
    const tier = resolveShippingTier('US', SETTINGS)
    expect(calculateShipping(50, tier)).toBe(8.50)
    expect(calculateShipping(200, tier)).toBe(8.50)
  })

  it('CA order with percentage canada_mexico rate', () => {
    const tier = resolveShippingTier('CA', SETTINGS)
    expect(calculateShipping(100, tier)).toBe(15.00)
    expect(calculateShipping(60, tier)).toBe(9.00)
  })

  it('MX order with percentage canada_mexico rate', () => {
    const tier = resolveShippingTier('MX', SETTINGS)
    expect(calculateShipping(80, tier)).toBe(12.00)
  })

  it('GB (intl) order with fixed intl rate', () => {
    const tier = resolveShippingTier('GB', SETTINGS)
    expect(calculateShipping(50, tier)).toBe(25.00)
    expect(calculateShipping(500, tier)).toBe(25.00)
  })

  it('three tiers produce three distinct results on same subtotal', () => {
    const subtotal = 100
    const domestic = calculateShipping(subtotal, resolveShippingTier('US', SETTINGS))
    const canadaMexico = calculateShipping(subtotal, resolveShippingTier('CA', SETTINGS))
    const intl = calculateShipping(subtotal, resolveShippingTier('AU', SETTINGS))
    expect(domestic).toBe(8.50)
    expect(canadaMexico).toBe(15)
    expect(intl).toBe(25.00)
    expect(new Set([domestic, canadaMexico, intl]).size).toBe(3)
  })

  it('zero-value tier returns 0', () => {
    const zeroIntl: AllShippingSettings = { ...SETTINGS, shipping_mode_intl: 'fixed', shipping_value_intl: 0 }
    expect(calculateShipping(200, resolveShippingTier('JP', zeroIntl))).toBe(0)

    const zeroCaMx: AllShippingSettings = { ...SETTINGS, shipping_mode_canada_mexico: 'fixed', shipping_value_canada_mexico: 0 }
    expect(calculateShipping(150, resolveShippingTier('CA', zeroCaMx))).toBe(0)
  })

  it('percentage rounding preserved end-to-end', () => {
    const tier = resolveShippingTier('CA', SETTINGS) // 15%
    // 13.99 * 0.15 = 2.0985 → 2.10
    expect(calculateShipping(13.99, tier)).toBe(2.10)
  })
})
