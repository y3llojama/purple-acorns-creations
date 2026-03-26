'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import ProductCard from './ProductCard'
import { Product } from '@/lib/supabase/types'

interface CategoryOption { id: string; name: string; slug: string; parent_id: string | null }

type SortOption = 'new' | 'popular' | 'price_asc' | 'price_desc'

interface ApiResponse {
  products: Product[]
  total: number
  page: number
  pageSize: number
}

interface Props {
  watermark?: string | null
}

export default function ProductGrid({ watermark }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeCat = searchParams.get('cat') ?? ''
  const activeSub = searchParams.get('sub') ?? ''

  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [catReady, setCatReady] = useState(false)
  const [sort, setSort] = useState<SortOption>('new')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load categories first; gate product fetches on this
  useEffect(() => {
    fetch('/api/shop/categories')
      .then(res => (res.ok ? res.json() : []))
      .then((json: CategoryOption[]) => { setCategories(json); setCatReady(true) })
      .catch(() => setCatReady(true))
  }, [])

  // Dynamic document title
  useEffect(() => {
    if (!catReady) return
    const parts: string[] = ['Shop']
    if (activeCat) {
      const cat = categories.find(c => c.slug === activeCat)
      if (cat) parts.push(cat.name)
    }
    if (activeSub) {
      const sub = categories.find(c => c.slug === activeSub)
      if (sub) parts.push(sub.name)
    }
    document.title = parts.join(' — ')
    return () => { document.title = 'Shop' }
  }, [activeCat, activeSub, categories, catReady])

  // Build API params based on active selection
  const buildCategoryParams = useCallback((): URLSearchParams => {
    const p = new URLSearchParams()
    if (activeSub) {
      const sub = categories.find(c => c.slug === activeSub)
      if (sub) p.set('category_id', sub.id)
    } else if (activeCat) {
      const cat = categories.find(c => c.slug === activeCat)
      if (cat) p.set('parent_category_id', cat.id)
    }
    return p
  }, [activeCat, activeSub, categories])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = buildCategoryParams()
      params.set('sort', sort)
      params.set('page', String(page))
      const res = await fetch(`/api/shop/products?${params.toString()}`)
      if (!res.ok) throw new Error(`Failed to load products (${res.status})`)
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [buildCategoryParams, sort, page])

  useEffect(() => {
    if (!catReady) return
    fetchProducts()
  }, [fetchProducts, catReady])

  // Reset page when URL filters change
  useEffect(() => { setPage(1) }, [activeCat, activeSub])

  const totalPages = Math.ceil((data?.total ?? 0) / 24)

  // Heading: "Shop", "Shop — Jewelry", "Shop — Jewelry — Micro-Crochet"
  const headingParts: string[] = ['Shop']
  if (activeCat && catReady) {
    const cat = categories.find(c => c.slug === activeCat)
    if (cat) headingParts.push(cat.name)
  }
  if (activeSub && catReady) {
    const sub = categories.find(c => c.slug === activeSub)
    if (sub) headingParts.push(sub.name)
  }

  const activeCatObj = catReady ? categories.find(c => c.slug === activeCat) : null
  const activeSubObj = catReady ? categories.find(c => c.slug === activeSub) : null

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: activeCat ? '16px' : '40px', textAlign: 'center' }}>
        Shop
      </h1>

      {catReady && activeCat && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
          <button
            onClick={() => router.push('/shop')}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-text-muted)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            All
          </button>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>›</span>
          <button
            onClick={() => router.push(`/shop?cat=${activeCat}`)}
            style={{
              padding: '4px 12px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
              background: activeSub ? 'var(--color-surface)' : 'var(--color-primary)',
              color: activeSub ? 'var(--color-primary)' : '#fff',
              border: '1px solid var(--color-primary)',
            }}
          >
            {activeCatObj?.name ?? activeCat}
          </button>
          {activeSub && activeSubObj && (
            <>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>›</span>
              <span style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '13px',
                background: 'var(--color-primary)', color: '#fff',
                border: '1px solid var(--color-primary)',
              }}>
                {activeSubObj.name}
              </span>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <div>
          <label htmlFor="shop-sort" style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginRight: '8px' }}>Sort by</label>
          <select
            id="shop-sort"
            value={sort}
            onChange={e => { setSort(e.target.value as SortOption); setPage(1) }}
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

      {loading && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '60px 0' }}>Loading products…</p>
      )}

      {!loading && error && (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '60px 0' }}>{error}</p>
      )}

      {!loading && !error && data && data.products.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <img
            src="/shop-coming-soon.svg"
            alt="Shop coming soon — something beautiful is on its way"
            style={{ maxWidth: '100%', width: '960px', height: 'auto', borderRadius: '8px' }}
          />
        </div>
      )}

      {!loading && !error && data && data.products.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '24px' }}>
          {data.products.map(product => (
            <ProductCard key={product.id} product={product} watermark={watermark} />
          ))}
        </div>
      )}

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
