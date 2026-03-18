'use client'
import { useState, useRef } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import ImageUploader from './ImageUploader'
import ConfirmDialog from './ConfirmDialog'
import SiteMap from './SiteMap'
import type { GalleryItem } from '@/lib/supabase/types'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE = 5 * 1024 * 1024

function EditableField({ id, value, onSave, label, placeholder, rows = 2, maxLength = 500, type = 'textarea' }: {
  id: string; value: string; onSave: (id: string, v: string) => void
  label: string; placeholder?: string; rows?: number; maxLength?: number; type?: 'textarea' | 'url'
}) {
  const [text, setText] = useState(value)
  const [saved, setSaved] = useState(false)
  const changed = text !== value

  const inputStyle = { width: '100%', fontSize: '13px', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', resize: 'vertical' as const, lineHeight: 1.3, fontFamily: 'inherit' }

  return (
    <div style={{ marginBottom: '8px' }}>
      {type === 'textarea' ? (
        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setSaved(false) }}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          style={inputStyle}
        />
      ) : (
        <input
          type="url"
          value={text}
          onChange={e => { setText(e.target.value); setSaved(false) }}
          placeholder={placeholder}
          style={{ ...inputStyle, minHeight: '36px' }}
        />
      )}
      {changed && (
        <button
          onClick={() => { onSave(id, text.trim()); setSaved(true) }}
          style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '12px', cursor: 'pointer', marginTop: '4px', minHeight: '48px', width: '100%' }}
        >
          Save {label}
        </button>
      )}
      {saved && !changed && <span style={{ fontSize: '12px', color: 'green' }}>Saved ✓</span>}
    </div>
  )
}

interface Props { initialItems: GalleryItem[]; watermark: string | null; businessName: string }

export default function GalleryManager({ initialItems, watermark, businessName }: Props) {
  const [items, setItems] = useState<GalleryItem[]>(initialItems)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
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

  async function handlePatch(id: string, fields: Record<string, unknown>) {
    const res = await fetch('/api/admin/gallery', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...fields }),
    })
    if (res.ok) {
      const updated = await res.json()
      setItems(prev => prev.map(i => i.id === id ? updated : i))
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const a = items[index]
    const b = items[target]
    // Swap sort_order values
    const aOrder = a.sort_order
    const bOrder = b.sort_order
    // Optimistic UI update
    const newItems = [...items]
    newItems[index] = { ...b, sort_order: aOrder }
    newItems[target] = { ...a, sort_order: bOrder }
    newItems.sort((x, y) => x.sort_order - y.sort_order)
    setItems(newItems)
    // Persist both
    await Promise.all([
      fetch('/api/admin/gallery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, sort_order: bOrder }),
      }),
      fetch('/api/admin/gallery', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, sort_order: aOrder }),
      }),
    ])
  }

  function startReplace(id: string) {
    setReplacingId(id)
    setTimeout(() => replaceInputRef.current?.click(), 0)
  }

  async function handleReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !replacingId) { setReplacingId(null); return }
    if (!ALLOWED_TYPES.includes(file.type)) { setReplacingId(null); return }
    if (file.size > MAX_SIZE) { setReplacingId(null); return }
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('gallery').upload(path, file)
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('gallery').getPublicUrl(path)
      await handlePatch(replacingId, { url: data.publicUrl })
    } catch { /* upload failed — keep existing image */ }
    setReplacingId(null)
    if (replaceInputRef.current) replaceInputRef.current.value = ''
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
          Variables: <code>{'${BUSINESS_NAME}'}</code> · <code>{'${CONTACT_FORM}'}</code>
        </p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={watermarkText}
            onChange={e => { setWatermarkText(e.target.value); setWatermarkSaved(false) }}
            placeholder={`e.g. ${businessName}`}
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
        {items.map((item, idx) => (
          <div key={item.id} style={{ position: 'relative', background: 'var(--color-surface)', borderRadius: '8px', overflow: 'hidden', border: item.is_featured ? '2px solid var(--color-primary)' : '1px solid var(--color-border)' }}>
            <Image src={item.url} alt={item.alt_text} width={200} height={200} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
            <div style={{ padding: '8px' }}>
              <button
                onClick={() => startReplace(item.id)}
                disabled={replacingId === item.id}
                style={{ width: '100%', minHeight: '48px', fontSize: '13px', cursor: 'pointer', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '4px', marginBottom: '8px' }}
              >
                {replacingId === item.id ? 'Uploading…' : 'Replace Photo'}
              </button>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                <button
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  aria-label="Move left"
                  style={{ flex: 1, minHeight: '48px', fontSize: '18px', cursor: idx === 0 ? 'default' : 'pointer', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '4px', opacity: idx === 0 ? 0.3 : 1 }}
                >
                  ←
                </button>
                <button
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === items.length - 1}
                  aria-label="Move right"
                  style={{ flex: 1, minHeight: '48px', fontSize: '18px', cursor: idx === items.length - 1 ? 'default' : 'pointer', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '4px', opacity: idx === items.length - 1 ? 0.3 : 1 }}
                >
                  →
                </button>
              </div>
              <EditableField
                id={item.id}
                value={item.alt_text}
                onSave={(id, v) => handlePatch(id, { alt_text: v })}
                label="Description"
              />
              <EditableField
                id={item.id}
                value={item.square_url ?? ''}
                onSave={(id, v) => handlePatch(id, { square_url: v || null })}
                label="Square Link"
                placeholder="https://squareup.com/..."
                type="url"
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '8px', minHeight: '48px' }}>
                <input
                  type="checkbox"
                  checked={item.is_featured}
                  onChange={() => handlePatch(item.id, { is_featured: !item.is_featured })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                Featured Piece
              </label>
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

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleReplace}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        aria-hidden="true"
        tabIndex={-1}
      />

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
