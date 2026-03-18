'use client'
import { useState } from 'react'
import Image from 'next/image'
import ImageUploader from './ImageUploader'
import ConfirmDialog from './ConfirmDialog'
import type { GalleryItem } from '@/lib/supabase/types'

interface Props { initialItems: GalleryItem[] }

export default function GalleryManager({ initialItems }: Props) {
  const [items, setItems] = useState<GalleryItem[]>(initialItems)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [altText, setAltText] = useState('')

  // ImageUploader calls onUpload with the public URL; we then POST to /api/admin/gallery
  async function handleUpload(url: string) {
    const res = await fetch('/api/admin/gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, alt_text: altText }),
    })
    if (res.ok) {
      const item = await res.json()
      setItems(prev => [...prev, item])
    }
  }

  async function handleDelete(id: string) {
    await fetch('/api/admin/gallery', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setItems(prev => prev.filter(i => i.id !== id))
    setDeleteId(null)
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '24px' }}>Gallery</h1>

      <div style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Add Photo</h2>
        <div style={{ marginBottom: '12px' }}>
          <label htmlFor="gallery-alt" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Alt text</label>
          <input id="gallery-alt" value={altText} onChange={e => setAltText(e.target.value)} placeholder="Describe the photo" style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)', marginBottom: '8px' }} />
        </div>
        <ImageUploader bucket="gallery" onUpload={handleUpload} label="Upload Photo" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        {items.map(item => (
          <div key={item.id} style={{ position: 'relative', background: 'var(--color-surface)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <Image src={item.url} alt={item.alt_text} width={200} height={200} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
            <div style={{ padding: '8px' }}>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '8px', lineHeight: 1.3 }}>{item.alt_text}</p>
              <button
                onClick={() => setDeleteId(item.id)}
                aria-label={`Delete ${item.alt_text}`}
                style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '4px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', width: '100%', minHeight: '36px' }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {deleteId && (
        <ConfirmDialog
          message="Delete this photo? This cannot be undone."
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
