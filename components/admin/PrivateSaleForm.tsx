'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Product } from '@/lib/supabase/types'

interface SelectedProduct {
  product: Product
  quantity: number
  customPrice: number
}

interface Props {
  initialItems?: SelectedProduct[]
  initialNote?: string
}

export default function PrivateSaleForm({ initialItems = [], initialNote = '' }: Props) {
  const router = useRouter()
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>(initialItems)
  const [expiresIn, setExpiresIn] = useState<'48h' | '7d' | '14d'>('7d')
  const [customerNote, setCustomerNote] = useState(initialNote)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [productsLoading, setProductsLoading] = useState(true)

  useEffect(() => {
    async function loadProducts() {
      setProductsLoading(true)
      const res = await fetch('/api/shop/products?limit=100')
      if (!res.ok) {
        setError('Failed to load products. Please refresh the page.')
        setProductsLoading(false)
        return
      }
      const body = await res.json()
      setProducts(body.products ?? [])
      setProductsLoading(false)
    }
    loadProducts()
  }, [])

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  function addProduct(product: Product) {
    const alreadyAdded = selectedProducts.some(s => s.product.id === product.id)
    if (alreadyAdded) return
    setSelectedProducts(prev => [
      ...prev,
      { product, quantity: 1, customPrice: product.price },
    ])
  }

  function removeProduct(productId: string) {
    setSelectedProducts(prev => prev.filter(s => s.product.id !== productId))
  }

  function updateQuantity(productId: string, quantity: number) {
    setSelectedProducts(prev =>
      prev.map(s => s.product.id === productId ? { ...s, quantity: Math.max(1, quantity) } : s)
    )
  }

  function updateCustomPrice(productId: string, customPrice: number) {
    setSelectedProducts(prev =>
      prev.map(s => s.product.id === productId ? { ...s, customPrice: Math.max(0, customPrice) } : s)
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedProducts.length === 0) {
      setError('Add at least one product before creating a link.')
      return
    }
    setLoading(true)
    setError(null)

    const res = await fetch('/api/admin/private-sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: selectedProducts.map(s => ({
          productId: s.product.id,
          quantity: s.quantity,
          customPrice: s.customPrice,
        })),
        expiresIn,
        customerNote,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to create private sale link')
      setLoading(false)
      return
    }

    router.push('/admin/private-sales')
  }

  const selectedIds = new Set(selectedProducts.map(s => s.product.id))

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '720px' }}>
      {error && (
        <p role="alert" style={{ color: '#dc2626', marginBottom: '16px', padding: '12px', background: '#fef2f2', borderRadius: '4px', border: '1px solid #fecaca' }}>
          {error}
        </p>
      )}

      {/* Product search */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-primary)', marginBottom: '12px' }}>
          Add Products
        </h2>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products…"
          style={{
            width: '100%',
            padding: '0 14px',
            minHeight: '48px',
            borderRadius: '4px',
            border: '1px solid var(--color-border, #d1d5db)',
            fontSize: '14px',
            boxSizing: 'border-box',
            marginBottom: '12px',
          }}
        />
        {productsLoading ? (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>Loading products…</p>
        ) : (
          <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--color-border, #d1d5db)', borderRadius: '4px' }}>
            {filteredProducts.length === 0 ? (
              <p style={{ padding: '16px', color: '#6b7280', fontSize: '14px', margin: 0 }}>No products found.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {filteredProducts.map(product => {
                  const added = selectedIds.has(product.id)
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => addProduct(product)}
                        disabled={added}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          width: '100%',
                          padding: '0 16px',
                          minHeight: '48px',
                          background: added ? '#f3f4f6' : 'transparent',
                          border: 'none',
                          borderBottom: '1px solid var(--color-border, #e5e7eb)',
                          cursor: added ? 'default' : 'pointer',
                          textAlign: 'left',
                          fontSize: '14px',
                          color: added ? '#9ca3af' : 'var(--color-text, #111827)',
                        }}
                      >
                        <span>{product.name}</span>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>
                          {added ? 'Added' : `$${product.price.toFixed(2)}`}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Selected products */}
      {selectedProducts.length > 0 && (
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-primary)', marginBottom: '12px' }}>
            Selected Products
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {selectedProducts.map(({ product, quantity, customPrice }) => (
              <div
                key={product.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  border: '1px solid var(--color-border, #d1d5db)',
                  borderRadius: '4px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ flex: 1, minWidth: '120px', fontSize: '14px', fontWeight: '500' }}>
                  {product.name}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280' }}>
                  Qty
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={e => updateQuantity(product.id, parseInt(e.target.value, 10) || 1)}
                    style={{ width: '64px', padding: '0 8px', minHeight: '48px', border: '1px solid var(--color-border, #d1d5db)', borderRadius: '4px', fontSize: '14px' }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280' }}>
                  Price $
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={customPrice}
                    onChange={e => updateCustomPrice(product.id, parseFloat(e.target.value) || 0)}
                    style={{ width: '88px', padding: '0 8px', minHeight: '48px', border: '1px solid var(--color-border, #d1d5db)', borderRadius: '4px', fontSize: '14px' }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeProduct(product.id)}
                  aria-label={`Remove ${product.name}`}
                  style={{
                    padding: '0 16px',
                    minHeight: '48px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Expiry + customer note */}
      <section style={{ marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label htmlFor="expiresIn" style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: 'var(--color-primary)' }}>
            Link expires in
          </label>
          <select
            id="expiresIn"
            value={expiresIn}
            onChange={e => setExpiresIn(e.target.value as '48h' | '7d' | '14d')}
            style={{ padding: '0 14px', minHeight: '48px', borderRadius: '4px', border: '1px solid var(--color-border, #d1d5db)', fontSize: '14px', background: '#fff' }}
          >
            <option value="48h">48 hours</option>
            <option value="7d">7 days</option>
            <option value="14d">14 days</option>
          </select>
        </div>

        <div>
          <label htmlFor="customerNote" style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px', color: 'var(--color-primary)' }}>
            Customer note <span style={{ color: '#9ca3af', fontWeight: '400' }}>(optional)</span>
          </label>
          <textarea
            id="customerNote"
            value={customerNote}
            onChange={e => setCustomerNote(e.target.value)}
            rows={3}
            placeholder="e.g. Special pricing for Sarah's custom order"
            style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid var(--color-border, #d1d5db)', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
      </section>

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: '0 28px',
          minHeight: '48px',
          background: 'var(--color-primary)',
          color: 'var(--color-accent)',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '15px',
          fontWeight: '600',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Creating…' : 'Create Private Sale Link'}
      </button>
    </form>
  )
}
