'use client'
import { useState } from 'react'
import ImageUploader from './ImageUploader'
import type { Product, Category } from '@/lib/supabase/types'

interface Props {
  product?: Product
  categories: Category[]
  onSave: () => void
  onCancel: () => void
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  fontSize: '16px',
  borderRadius: '4px',
  border: '1px solid var(--color-border)',
  marginBottom: '8px',
  background: 'var(--color-bg)',
  color: 'inherit',
}
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }
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
const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--color-primary)',
  padding: '10px 20px',
  fontSize: '16px',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  cursor: 'pointer',
  minHeight: '48px',
}

export default function ProductForm({ product, categories, onSave, onCancel }: Props) {
  const [name, setName] = useState(product?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [categoryId, setCategoryId] = useState<string>(product?.category_id ?? '')
  const [stockCount, setStockCount] = useState(product ? String(product.stock_count) : '0')
  const [images, setImages] = useState<string[]>(product?.images ?? [])
  const [isActive, setIsActive] = useState(product?.is_active ?? true)
  const [galleryFeatured, setGalleryFeatured] = useState(product?.gallery_featured ?? false)
  const [gallerySortOrder, setGallerySortOrder] = useState(product?.gallery_sort_order ? String(product.gallery_sort_order) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleUpload(url: string) {
    setImages(prev => [...prev, url])
  }

  function removeImage(url: string) {
    setImages(prev => prev.filter(u => u !== url))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Name is required.'); return }
    if (!price || isNaN(Number(price))) { setError('A valid price is required.'); return }

    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        category_id: categoryId || null,
        stock_count: Number(stockCount) || 0,
        images,
        is_active: isActive,
        gallery_featured: galleryFeatured,
        gallery_sort_order: galleryFeatured && gallerySortOrder ? Number(gallerySortOrder) : null,
      }

      const url = product ? `/api/admin/inventory/${product.id}` : '/api/admin/inventory'
      const method = product ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to save product.')
        return
      }

      onSave()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label htmlFor="pf-name" style={labelStyle}>Name <span aria-hidden="true">*</span></label>
        <input
          id="pf-name"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          placeholder="Product name"
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="pf-description" style={labelStyle}>Description</label>
        <textarea
          id="pf-description"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Optional description"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div>
        <label htmlFor="pf-price" style={labelStyle}>Price ($) <span aria-hidden="true">*</span></label>
        <input
          id="pf-price"
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={e => setPrice(e.target.value)}
          required
          placeholder="0.00"
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="pf-category" style={labelStyle}>Category</label>
        <select
          id="pf-category"
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          style={inputStyle}
        >
          <option value="">— Uncategorized —</option>
          {/* Only REGULAR_CATEGORY are assignable to products */}
          {categories.filter(c => !c.parent_id && c.category_type === 'REGULAR_CATEGORY').map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
          {categories.filter(c => !c.parent_id && c.category_type !== 'REGULAR_CATEGORY').map(parent => {
            const children = categories.filter(c => c.parent_id === parent.id && c.category_type === 'REGULAR_CATEGORY')
            if (children.length === 0) return null
            return (
              <optgroup key={parent.id} label={parent.name}>
                {children.map(child => (
                  <option key={child.id} value={child.id}>{child.name}</option>
                ))}
              </optgroup>
            )
          })}
        </select>
      </div>

      <div>
        <label htmlFor="pf-stock" style={labelStyle}>Stock Count</label>
        <input
          id="pf-stock"
          type="number"
          min="0"
          value={stockCount}
          onChange={e => setStockCount(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <p style={{ ...labelStyle, marginBottom: '8px' }}>Images</p>
        {images.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
            {images.map(url => (
              <div key={url} style={{ position: 'relative', display: 'inline-block' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Product" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  aria-label="Remove image"
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: 'var(--color-error)',
                    color: 'var(--color-error-text)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    minWidth: '32px',
                    minHeight: '32px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <ImageUploader
          bucket="products"
          label="Upload Product Image"
          quickSnapLabel={name}
          onUpload={async (url) => { await handleUpload(url) }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '48px' }}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={e => setIsActive(e.target.checked)}
            style={{ width: '18px', height: '18px' }}
          />
          Active (visible to customers)
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '48px' }}>
          <input
            type="checkbox"
            checked={galleryFeatured}
            onChange={e => setGalleryFeatured(e.target.checked)}
            style={{ width: '18px', height: '18px' }}
          />
          Featured in gallery
        </label>
        {galleryFeatured && (
          <div>
            <label htmlFor="pf-sort-order" style={labelStyle}>Gallery Sort Order</label>
            <input
              id="pf-sort-order"
              type="number"
              min="0"
              value={gallerySortOrder}
              onChange={e => setGallerySortOrder(e.target.value)}
              placeholder="e.g. 1"
              style={{ ...inputStyle, width: '120px' }}
            />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--color-error)', fontSize: '14px' }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
        <button type="submit" style={btnStyle} disabled={saving}>
          {saving ? 'Saving…' : (product ? 'Update Product' : 'Create Product')}
        </button>
        <button type="button" style={btnSecondaryStyle} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
