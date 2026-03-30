import { renderHook, act } from '@testing-library/react'
import { CartProvider, useCart } from '@/components/shop/CartContext'
import type { Product } from '@/lib/supabase/types'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CartProvider>{children}</CartProvider>
)

const product: Product = {
  id: 'p1', name: 'Ring', description: null, price: 45, category_id: null,
  stock_count: 5, stock_reserved: 0, images: [], is_active: true,
  gallery_featured: false, gallery_sort_order: null, view_count: 0,
  square_catalog_id: null, square_variation_id: null, pinterest_product_id: null,
  created_at: '', updated_at: '',
}

describe('CartContext — variation-aware', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('addToCart stores variationId alongside product', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addToCart(product, 'v1'))
    expect(result.current.items[0].variationId).toBe('v1')
  })

  it('addToCart stores optional variationLabel', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addToCart(product, 'v1', 'Large, Blue'))
    expect(result.current.items[0].variationLabel).toBe('Large, Blue')
  })

  it('treats same product with different variationId as separate items', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => {
      result.current.addToCart(product, 'v1')
      result.current.addToCart(product, 'v2')
    })
    expect(result.current.items).toHaveLength(2)
  })

  it('increments quantity when same product+variation combo is added', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => {
      result.current.addToCart(product, 'v1')
      result.current.addToCart(product, 'v1')
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].quantity).toBe(2)
  })

  it('removeFromCart uses variationId key, not productId alone', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => {
      result.current.addToCart(product, 'v1')
      result.current.addToCart(product, 'v2')
      result.current.removeFromCart('p1', 'v1')
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].variationId).toBe('v2')
  })

  it('uses variation price for total when available', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addToCart(product, 'v1', undefined, 55))
    expect(result.current.total).toBe(55)
  })

  it('persists variationId to localStorage', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.addToCart(product, 'v1'))
    const stored = JSON.parse(localStorage.getItem('pac_cart') ?? '[]')
    expect(stored[0].variationId).toBe('v1')
  })
})
