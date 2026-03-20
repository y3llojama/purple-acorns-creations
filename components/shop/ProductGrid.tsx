'use client'

import { useState, useEffect, useCallback } from 'react'
import CategoryFilter from './CategoryFilter'
import ProductCard from './ProductCard'
import { Product } from '@/lib/supabase/types'

type SortOption = 'new' | 'popular' | 'price_asc' | 'price_desc'

interface ApiResponse {
  products: Product[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 24

export default function ProductGrid() {
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<SortOption>('new')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      params.set('sort', sort)
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))

      const res = await fetch(`/api/shop/products?${params.toString()}`)
      if (!res.ok) throw new Error(`Failed to load products (${res.status})`)
      const json: ApiResponse = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [category, sort, page])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const handleCategoryChange = (cat: string) => {
    setCategory(cat)
    setPage(1)
  }

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSort(e.target.value as SortOption)
    setPage(1)
  }

  const totalPages = Math.ceil((data?.total ?? 0) / 24)

  return (
    <div>
      {/* Controls row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
        <CategoryFilter active={category} onChange={handleCategoryChange} />
        <div>
          <label htmlFor="shop-sort" style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginRight: '8px' }}>Sort by</label>
          <select
            id="shop-sort"
            value={sort}
            onChange={handleSortChange}
            style={{
              padding: '8px 12px', minHeight: '48px', border: '1px solid var(--color-border)',
              borderRadius: '4px', background: 'var(--color-surface)', color: 'var(--color-primary)',
              fontSize: '14px', cursor: 'pointer',
            }}
          >
            <option value="new">New</option>
            <option value="popular">Popular</option>
            <option value="price_asc">Price: Low–High</option>
            <option value="price_desc">Price: High–Low</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '60px 0' }}>Loading products…</p>
      )}

      {!loading && error && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '60px 0' }}>{error}</p>
      )}

      {!loading && !error && data && data.products.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '60px 0' }}>No products found.</p>
      )}

      {!loading && !error && data && data.products.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
          {data.products.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginTop: '40px' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              padding: '8px 20px', minHeight: '48px', border: '1px solid var(--color-border)',
              borderRadius: '4px', background: 'transparent', color: 'var(--color-primary)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontSize: '14px',
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              padding: '8px 20px', minHeight: '48px', border: '1px solid var(--color-border)',
              borderRadius: '4px', background: 'transparent', color: 'var(--color-primary)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.4 : 1, fontSize: '14px',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
