'use client'
import { useState } from 'react'
import Image from 'next/image'
import ImageUploader from './ImageUploader'
import ConfirmDialog from './ConfirmDialog'
import SiteMap from './SiteMap'
import type { GalleryItem } from '@/lib/supabase/types'

function EditableDescription({ id, value, onSave }: { id: string; value: string; onSave: (id: string, v: string) => void }) {
  const [text, setText] = useState(value)
  const [saved, setSaved] = useState(false)
  const changed = text !== value

  return (
    <div style={{ marginBottom: '8px' }}>
      <textarea
        value={text}
        onChange={e => { setText(e.target.value); setSaved(false) }}
        rows={2}
        maxLength={500}
        style={{ width: '100%', fontSize: '13px', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', resize: 'vertical', lineHeight: 1.3, fontFamily: 'inherit' }}
      />
      {changed && (
        <button
          onClick={() => { onSave(id, text.trim()); setSaved(true) }}
          style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer', marginTop: '4px', minHeight: '48px', width: '100%' }}
        >
          Save Description
        </button>
      )}
      {saved && !changed && <span style={{ fontSize: '12px', color: 'green' }}>Saved ✓</span>}
    </div>
  )
}

interface Props { initialItems: GalleryItem[]; watermark: string | null }

export default function GalleryManager({ initialItems, watermark }: Props) {
  const [items, setItems] = useState<GalleryItem[]>(initialItems)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [watermarkText, setWatermarkText] = useState(watermark ?? '')
  const [watermarkSaved, setWatermarkSaved] = useState(false)
  const [watermarkError, setWatermarkError] = useState<string | null>(null)

  async function handleUpload(url: string, altText: string) {
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
    try {
      const res = await fetch('/api/admin/gallery', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) { setDeleteId(null); return }
      setItems(prev => prev.filter(i => i.id !== id))
    } catch { /* Network error — keep item in list */ }
    setDeleteId(null)
  }

  async function handleDescriptionSave(id: string, newAltText: string) {
    const res = await fetch('/api/admin/gallery', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, alt_text: newAltText }),
    })
    if (res.ok) {
      const updated = await res.json()
      setItems(prev => prev.map(i => i.id === id ? updated : i))
    }
  }

  async function saveWatermark() {
    setWatermarkError(null)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gallery_watermark: watermarkText.trim() || null }),
    })
    if (res.ok) { setWatermarkSaved(true) }
    else {
      const data = await res.json().catch(() => ({}))
      setWatermarkError(`Save failed (${res.status}): ${data.error ?? res.statusText}`)
    }
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '24px' }}>Gallery</h1>

      <SiteMap highlight="gallery" label="Gallery Strip" description="Horizontal scrolling photo strip in the middle of the homepage." />

      {/* Watermark setting */}
      <div style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Watermark</h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
          Optional text overlaid on all gallery images. Leave blank for no watermark.
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={watermarkText}
            onChange={e => { setWatermarkText(e.target.value); setWatermarkSaved(false) }}
            placeholder="e.g. Purple Acorns Creations"
            maxLength={100}
            style={{ flex: 1, minWidth: '200px', padding: '10px 12px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)', minHeight: '48px' }}
          />
          <button
            onClick={saveWatermark}
            style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 24px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
          >
            Save
          </button>
          {watermarkSaved && <span style={{ color: 'green', fontSize: '14px' }}>Saved ✓</span>}
          {watermarkError && <span style={{ color: '#c05050', fontSize: '14px' }}>{watermarkError}</span>}
        </div>
      </div>

      <div style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Add Photo</h2>
        <ImageUploader bucket="gallery" onUpload={handleUpload} label="Upload Photo" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        {items.map(item => (
          <div key={item.id} style={{ position: 'relative', background: 'var(--color-surface)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
            <Image src={item.url} alt={item.alt_text} width={200} height={200} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
            <div style={{ padding: '8px' }}>
              <EditableDescription
                id={item.id}
                value={item.alt_text}
                onSave={handleDescriptionSave}
              />
              <button
                onClick={() => setDeleteId(item.id)}
                aria-label={`Delete ${item.alt_text}`}
                style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '4px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', width: '100%', minHeight: '48px' }}
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
