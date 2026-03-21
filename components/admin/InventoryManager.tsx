'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { Product, Category } from '@/lib/supabase/types'
import ProductForm from './ProductForm'
import CategoryManager from './CategoryManager'

interface Props {
  initialProducts: Product[]
  categories: Category[]
  squareSyncEnabled: boolean
  initialTab?: 'products' | 'categories'
}

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

export default function InventoryManager({ initialProducts, categories, squareSyncEnabled, initialTab }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [syncingStock, setSyncingStock] = useState(false)
  const [syncStockResult, setSyncStockResult] = useState<string | null>(null)
  const [syncingItems, setSyncingItems] = useState(false)
  const [syncItemsResult, setSyncItemsResult] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>(initialTab ?? 'products')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchProducts = useCallback(async (q: string, catId: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      if (catId) params.set('category_id', catId)
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

  async function handleSyncStockFromSquare() {
    setSyncingStock(true)
    setSyncStockResult(null)
    try {
      const res = await fetch('/api/admin/inventory/sync-from-square', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncStockResult(`Error: ${data.error ?? 'Sync failed'}`)
      } else {
        setSyncStockResult(`Done — ${data.updated} updated, ${data.skipped} skipped${data.errors?.length ? `, ${data.errors.length} error(s)` : ''}`)
        fetchProducts(search, categoryFilter)
      }
    } catch (err) {
      setSyncStockResult(`Error: ${String(err)}`)
    } finally {
      setSyncingStock(false)
    }
  }

  async function handleSyncItemsFromSquare() {
    setSyncingItems(true)
    setSyncItemsResult(null)
    try {
      const res = await fetch('/api/admin/inventory/sync-items-from-square', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncItemsResult(`Error: ${data.error ?? 'Sync failed'}`)
      } else {
        setSyncItemsResult(`Done — ${data.upserted} synced${data.errors?.length ? `, ${data.errors.length} error(s)` : ''}`)
        fetchProducts(search, categoryFilter)
      }
    } catch (err) {
      setSyncItemsResult(`Error: ${String(err)}`)
    } finally {
      setSyncingItems(false)
    }
  }

  // Look up category name from the flat categories list
  const topLevelCategories = categories.filter(c => !c.parent_id)

  function getCategoryName(categoryId: string | null): string {
    if (!categoryId) return '—'
    const cat = categories.find(c => c.id === categoryId)
    return cat?.name ?? '—'
  }

  return (
    <div>
      {/* Tab bar */}
      <div role="tablist" aria-label="Inventory tabs" style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid var(--color-border)' }}>
        {(['products', 'categories'] as const).map(tab => (
          <button
            key={tab}
            id={`tab-${tab}`}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 20px', fontSize: '15px', fontWeight: activeTab === tab ? 600 : 400,
              background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize',
              borderBottom: activeTab === tab ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: '-2px', color: activeTab === tab ? 'var(--color-primary)' : 'var(--color-text-muted)',
              minHeight: '48px',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'categories' && (
        <div role="tabpanel" id="panel-categories" aria-labelledby="tab-categories">
          <CategoryManager initialCategories={categories} squareSyncEnabled={squareSyncEnabled} />
        </div>
      )}

      {activeTab === 'products' && (
        <div role="tabpanel" id="panel-products" aria-labelledby="tab-products">
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
              {topLevelCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  style={{
                    ...btnSmallStyle,
                    background: categoryFilter === cat.id ? 'var(--color-primary)' : 'transparent',
                    color: categoryFilter === cat.id ? 'var(--color-accent)' : 'var(--color-primary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {squareSyncEnabled && (
                <>
                  <button
                    onClick={handleSyncItemsFromSquare}
                    disabled={syncingItems}
                    style={{
                      ...btnStyle,
                      background: 'var(--color-surface)',
                      color: 'var(--color-primary)',
                      border: '1px solid var(--color-border)',
                      cursor: syncingItems ? 'not-allowed' : 'pointer',
                      opacity: syncingItems ? 0.7 : 1,
                    }}
                    aria-busy={syncingItems}
                  >
                    {syncingItems ? 'Syncing…' : 'Sync Items from Square'}
                  </button>
                  <button
                    onClick={handleSyncStockFromSquare}
                    disabled={syncingStock}
                    style={{
                      ...btnStyle,
                      background: 'var(--color-surface)',
                      color: 'var(--color-primary)',
                      border: '1px solid var(--color-border)',
                      cursor: syncingStock ? 'not-allowed' : 'pointer',
                      opacity: syncingStock ? 0.7 : 1,
                    }}
                    aria-busy={syncingStock}
                  >
                    {syncingStock ? 'Syncing…' : 'Sync Stock from Square'}
                  </button>
                </>
              )}
              <button style={{ ...btnStyle }} onClick={handleAddNew}>
                + Add Product
              </button>
            </div>
          </div>

          {/* Sync result messages */}
          {syncItemsResult && (
            <p
              role="status"
              style={{
                marginBottom: '8px',
                fontSize: '14px',
                color: syncItemsResult.startsWith('Error') ? 'var(--color-error)' : 'var(--color-success-text)',
              }}
            >
              Items: {syncItemsResult}
            </p>
          )}
          {syncStockResult && (
            <p
              role="status"
              style={{
                marginBottom: '12px',
                fontSize: '14px',
                color: syncStockResult.startsWith('Error') ? 'var(--color-error)' : 'var(--color-success-text)',
              }}
            >
              Stock: {syncStockResult}
            </p>
          )}

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
                    <td style={{ padding: '8px 12px' }}>{getCategoryName(product.category_id)}</td>
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
                  categories={categories}
                  onSave={handleFormSave}
                  onCancel={handleFormCancel}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
