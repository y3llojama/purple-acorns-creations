'use client'
import { useEffect, useState } from 'react'
import type { Product } from '@/lib/supabase/types'
import ProductCard from '@/components/shop/ProductCard'
import Link from 'next/link'

export default function SavedPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    async function load() {
      setFetchError(false)
      try {
        const ids: string[] = JSON.parse(localStorage.getItem('pac_saved') ?? '[]')
        if (!ids.length) { setLoading(false); return }
        const results = await Promise.all(ids.map(id => fetch(`/api/shop/products/${id}`).then(r => r.ok ? r.json() : null)))
        setProducts(results.filter(Boolean) as Product[])
      } catch {
        setFetchError(true)
      }
      setLoading(false)
    }
    load()
    window.addEventListener('pac_saved_changed', load)
    return () => window.removeEventListener('pac_saved_changed', load)
  }, [])

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading...</div>
  if (fetchError) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--color-error)' }}>Could not load saved items. Please try again.</div>

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '60px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>Saved Items</h1>
      {products.length === 0 ? (
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '18px', marginBottom: '24px' }}>No saved items yet.</p>
          <Link href="/shop" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>Browse the shop →</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '32px' }}>
          {products.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  )
}
