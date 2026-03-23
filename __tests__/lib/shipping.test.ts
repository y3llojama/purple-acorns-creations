import { calculateShipping } from '@/lib/shipping'

describe('calculateShipping', () => {
  it('returns 0 when shipping_value is 0', () => {
    expect(calculateShipping(100, { shipping_mode: 'fixed', shipping_value: 0 })).toBe(0)
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
})
