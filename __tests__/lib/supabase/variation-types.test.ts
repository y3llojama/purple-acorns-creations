import type {
  ProductVariation,
  ItemOption,
  ItemOptionValue,
  StockMovement,
  ProductWithDefault,
} from '@/lib/supabase/types'

describe('Variation type definitions', () => {
  it('ProductVariation has required fields', () => {
    const v: ProductVariation = {
      id: 'v1',
      product_id: 'p1',
      sku: null,
      price: 45,
      cost: null,
      stock_count: 3,
      stock_reserved: 0,
      is_default: true,
      is_active: true,
      image_url: null,
      square_variation_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(v.id).toBe('v1')
    expect(v.price).toBe(45)
    expect(v.is_default).toBe(true)
  })

  it('ItemOption has required fields', () => {
    const o: ItemOption = {
      id: 'o1',
      name: 'Size',
      display_name: '',
      is_reusable: true,
      square_option_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(o.name).toBe('Size')
    expect(o.is_reusable).toBe(true)
  })

  it('ItemOptionValue has required fields', () => {
    const v: ItemOptionValue = {
      id: 'ov1',
      option_id: 'o1',
      name: 'Small',
      sort_order: 0,
      square_option_value_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(v.name).toBe('Small')
  })

  it('StockMovement has required fields with valid reason and source', () => {
    const m: StockMovement = {
      id: 'sm1',
      variation_id: 'v1',
      quantity_change: -1,
      reason: 'sale',
      source: 'website',
      reference_id: 'order-123',
      note: null,
      created_at: '2026-01-01T00:00:00Z',
    }
    expect(m.quantity_change).toBe(-1)
    expect(m.reason).toBe('sale')
  })

  it('ProductWithDefault includes view fields', () => {
    const p: ProductWithDefault = {
      id: 'p1',
      name: 'Ring',
      description: null,
      price: 45,
      category_id: null,
      stock_count: 3,
      stock_reserved: 0,
      images: [],
      is_active: true,
      gallery_featured: false,
      gallery_sort_order: null,
      view_count: 0,
      square_catalog_id: null,
      square_variation_id: null,
      pinterest_product_id: null,
      created_at: '',
      updated_at: '',
      // View fields
      default_variation_id: 'v1',
      effective_price: 45,
      effective_stock: 3,
      default_sku: null,
      any_in_stock: true,
    }
    expect(p.any_in_stock).toBe(true)
    expect(p.effective_price).toBe(45)
  })
})
