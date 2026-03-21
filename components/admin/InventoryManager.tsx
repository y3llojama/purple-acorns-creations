'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { Product, ProductCategory } from '@/lib/supabase/types'
import ProductForm from './ProductForm'

interface Props {
  initialProducts: Product[]
  squareSyncEnabled: boolean
  squareCategoryIds: Record<string, string>
}

const CATEGORIES: ProductCategory[] = ['rings', 'necklaces', 'earrings', 'bracelets', 'crochet', 'other']

const btnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-accent)',
  padding: '10px 20px',
  fontSize: '16px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  minHeight: '48px',
}

const btnSmallStyle: React.CSSProperties = {
  padding: '6px 14px',
  fontSize: '14px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  minHeight: '48px',
  minWidth: '48px',
}

export default function InventoryManager({ initialProducts, squareSyncEnabled, squareCategoryIds: initialCategoryIds }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | ''>('')
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [categoryIds, setCategoryIds] = useState<Record<string, string>>(initialCategoryIds)
  const [syncingCategories, setSyncingCategories] = useState(false)
  const [categorySyncMsg, setCategorySyncMsg] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchProducts = useCallback(async (q: string, cat: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      if (cat) params.set('category', cat)
      const res = await fetch(`/api/admin/inventory?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products ?? data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchProducts(search, categoryFilter)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, categoryFilter, fetchProducts])

  async function handleDelete(id: string) {
    if (!confirm('Delete this product?')) return
    const res = await fetch(`/api/admin/inventory/${id}`, { method: 'DELETE' })
    if (res.ok) {
      fetchProducts(search, categoryFilter)
    }
  }

  function handleEdit(product: Product) {
    setEditingProduct(product)
    setShowForm(true)
  }

  function handleAddNew() {
    setEditingProduct(undefined)
    setShowForm(true)
  }

  function handleFormSave() {
    setShowForm(false)
    setEditingProduct(undefined)
    fetchProducts(search, categoryFilter)
  }

  function handleFormCancel() {
    setShowForm(false)
    setEditingProduct(undefined)
  }

  async function syncCategories() {
    setSyncingCategories(true)
    setCategorySyncMsg('')
    try {
      const res = await fetch('/api/admin/inventory/sync-categories', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCategorySyncMsg(data.error ?? 'Sync failed.')
      } else {
        setCategoryIds(data.categoryIds ?? {})
        setCategorySyncMsg('All categories synced.')
      }
    } catch {
      setCategorySyncMsg('Network error.')
    } finally {
      setSyncingCategories(false)
    }
  }

  return (
    <div>
      {/* Square category sync panel */}
      {squareSyncEnabled && (
        <div style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: 'var(--color-primary)' }}>Square Categories</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {categorySyncMsg && (
                <span style={{ fontSize: '13px', color: categorySyncMsg.includes('failed') || categorySyncMsg.includes('error') ? 'var(--color-error)' : 'var(--color-success-text)' }}>
                  {categorySyncMsg}
                </span>
              )}
              <button style={{ ...btnSmallStyle, background: 'var(--color-primary)', color: 'var(--color-accent)' }} onClick={syncCategories} disabled={syncingCategories}>
                {syncingCategories ? 'Syncing…' : 'Sync Categories'}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => {
              const synced = !!categoryIds[cat]
              return (
                <div key={cat} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  background: synced ? 'var(--color-success-bg)' : 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  color: synced ? 'var(--color-success-text)' : 'var(--color-text-muted)',
                  textTransform: 'capitalize',
                }}>
                  <span style={{ fontSize: '10px' }}>{synced ? '●' : '○'}</span>
                  {cat}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products…"
          aria-label="Search products"
          style={{
            padding: '10px',
            fontSize: '16px',
            borderRadius: '4px',
            border: '1px solid var(--color-border)',
            minHeight: '48px',
            width: '240px',
            background: 'var(--color-bg)',
            color: 'inherit',
          }}
        />

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCategoryFilter('')}
            style={{
              ...btnSmallStyle,
              background: categoryFilter === '' ? 'var(--color-primary)' : 'transparent',
              color: categoryFilter === '' ? 'var(--color-accent)' : 'var(--color-primary)',
              border: '1px solid var(--color-border)',
            }}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                ...btnSmallStyle,
                background: categoryFilter === cat ? 'var(--color-primary)' : 'transparent',
                color: categoryFilter === cat ? 'var(--color-accent)' : 'var(--color-primary)',
                border: '1px solid var(--color-border)',
                textTransform: 'capitalize',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <button style={{ ...btnStyle, marginLeft: 'auto' }} onClick={handleAddNew}>
          + Add Product
        </button>
      </div>

      {/* Loading indicator */}
      {loading && (
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>Loading…</p>
      )}

      {/* Products table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Image</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Name</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Category</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Price</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Stock</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Active</th>
              <th style={{ padding: '8px 12px', fontWeight: '600' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  No products found.
                </td>
              </tr>
            )}
            {products.map(product => (
              <tr key={product.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '8px 12px' }}>
                  {product.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                    />
                  ) : (
                    <div style={{ width: '40px', height: '40px', borderRadius: '4px', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} aria-label="No image" />
                  )}
                </td>
                <td style={{ padding: '8px 12px' }}>{product.name}</td>
                <td style={{ padding: '8px 12px', textTransform: 'capitalize' }}>{product.category}</td>
                <td style={{ padding: '8px 12px' }}>${product.price.toFixed(2)}</td>
                <td style={{ padding: '8px 12px' }}>{product.stock_count}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    background: product.is_active ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                    color: product.is_active ? 'var(--color-success-text)' : 'var(--color-danger-text)',
                  }}>
                    {product.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleEdit(product)}
                      style={{ ...btnSmallStyle, background: 'var(--color-primary)', color: 'var(--color-accent)' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      style={{ ...btnSmallStyle, background: 'var(--color-error)', color: 'var(--color-error-text)' }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal overlay for product form */}
      {showForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingProduct ? 'Edit product' : 'Add product'}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 1000,
            overflowY: 'auto',
            padding: '40px 16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) handleFormCancel() }}
        >
          <div style={{
            background: 'var(--color-bg)',
            borderRadius: '8px',
            padding: '32px',
            width: '100%',
            maxWidth: '600px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'var(--color-primary)', marginBottom: '24px' }}>
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </h2>
            <ProductForm
              product={editingProduct}
              onSave={handleFormSave}
              onCancel={handleFormCancel}
            />
          </div>
        </div>
      )}
    </div>
  )
}
