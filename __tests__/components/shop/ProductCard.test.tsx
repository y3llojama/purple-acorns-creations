import { render, screen } from '@testing-library/react'
import ProductCard from '@/components/shop/ProductCard'
import type { ProductWithDefault } from '@/lib/supabase/types'

// Mock next/image and next/link
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <img {...props} />,
}))
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) => <a {...props}>{children}</a>,
}))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('@/lib/image-url', () => ({ watermarkSrc: (src: string) => src }))
jest.mock('@/components/shop/ShareButton', () => ({
  __esModule: true,
  default: () => null,
}))

const baseProduct: ProductWithDefault = {
  id: 'p1', name: 'Ring', description: null, price: 45, category_id: null,
  stock_count: 0, stock_reserved: 0, images: ['https://example.com/img.jpg'],
  is_active: true, gallery_featured: false, gallery_sort_order: null, view_count: 0,
  square_catalog_id: null, square_variation_id: null, pinterest_product_id: null,
  created_at: '', updated_at: '',
  // View fields
  default_variation_id: 'v1', effective_price: 45, effective_stock: 0,
  default_sku: null, any_in_stock: false,
}

describe('ProductCard — sold-out badge (R11)', () => {
  it('shows "Sold out" when any_in_stock is false', () => {
    render(<ProductCard product={{ ...baseProduct, any_in_stock: false }} />)
    expect(screen.getByText('Sold out')).toBeInTheDocument()
  })

  it('hides sold-out badge when any_in_stock is true, even if stock_count is 0', () => {
    render(<ProductCard product={{ ...baseProduct, stock_count: 0, any_in_stock: true }} />)
    expect(screen.queryByText('Sold out')).not.toBeInTheDocument()
  })

  it('displays effective_price from variation, not product.price', () => {
    render(<ProductCard product={{ ...baseProduct, price: 45, effective_price: 65, any_in_stock: true }} />)
    expect(screen.getByText('$65.00')).toBeInTheDocument()
    expect(screen.queryByText('$45.00')).not.toBeInTheDocument()
  })
})
