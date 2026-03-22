'use client'
import { useState, useRef } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import ConfirmDialog from './ConfirmDialog'
import type { FollowAlongPhoto } from '@/lib/supabase/types'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024
const MAX_PHOTOS = 10

interface Props {
  initialMode: 'gallery' | 'widget'
  initialPhotos: FollowAlongPhoto[]
  hasBehold: boolean
}

export default function FollowAlongManager({ initialMode, initialPhotos, hasBehold }: Props) {
  const [photos, setPhotos] = useState<FollowAlongPhoto[]>(initialPhotos)
  const [mode, setMode] = useState(initialMode)
  const [modeSaved, setModeSaved] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function saveMode(newMode: 'gallery' | 'widget') {
    setMode(newMode)
    setModeSaved(false)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follow_along_mode: newMode }),
    })
    if (res.ok) setModeSaved(true)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) { setError('Only JPG, PNG, and WebP are allowed'); return }
    if (file.size > MAX_SIZE) { setError('File must be under 5MB'); return }
    if (photos.length >= MAX_PHOTOS) { setError(`Maximum ${MAX_PHOTOS} photos reached`); return }

    setError(null)
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `follow-along/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('gallery').upload(path, file)
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('gallery').getPublicUrl(path)

      const res = await fetch('/api/admin/follow-along', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlData.publicUrl }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save photo')
      }
      const photo = await res.json()
      setPhotos(prev => [...prev, photo])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/admin/follow-along', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setPhotos(prev => prev.filter(p => p.id !== id))
    setDeleteId(null)
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= photos.length) return
    const a = photos[index]
    const b = photos[target]
    const aOrder = a.display_order
    const bOrder = b.display_order
    const next = [...photos]
    next[index] = { ...b, display_order: aOrder }
    next[target] = { ...a, display_order: bOrder }
    next.sort((x, y) => x.display_order - y.display_order)
    setPhotos(next)
    await Promise.all([
      fetch('/api/admin/follow-along', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, display_order: bOrder }),
      }),
      fetch('/api/admin/follow-along', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: b.id, display_order: aOrder }),
      }),
    ])
  }

  const modeCardStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '14px',
    border: `2px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    borderRadius: '10px',
    textAlign: 'center',
    cursor: 'pointer',
    opacity: active ? 1 : 0.5,
    background: active ? 'var(--color-surface)' : 'transparent',
    minHeight: '48px',
  })

  return (
    <div style={{ marginBottom: '40px', paddingBottom: '40px', borderBottom: '1px solid var(--color-border)' }}>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: 'var(--color-primary)' }}>Follow Along Section</h2>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <button type="button" onClick={() => saveMode('gallery')} style={modeCardStyle(mode === 'gallery')}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Curated Gallery</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Upload &amp; arrange your own photos</div>
        </button>
        <button type="button" onClick={() => saveMode('widget')} style={modeCardStyle(mode === 'widget')}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Instagram Widget</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {hasBehold ? 'Behold.so automatic feed' : 'Behold.so — not configured'}
          </div>
        </button>
      </div>
      {modeSaved && <span role="status" style={{ color: 'green', fontSize: '14px' }}>Mode saved ✓</span>}

      {mode === 'gallery' && (
        <div style={{ marginTop: '20px', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', margin: 0 }}>Follow Along Photos</h3>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', background: 'var(--color-bg)', padding: '4px 10px', borderRadius: '12px' }}>
              {photos.length} / {MAX_PHOTOS}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {photos.map((photo, idx) => (
              <div key={photo.id} style={{ position: 'relative', width: '100px' }}>
                <Image src={photo.storage_path} alt="" role="presentation" width={100} height={100}
                  style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px' }} />
                <button onClick={() => setDeleteId(photo.id)} aria-label="Remove photo"
                  style={{
                    position: 'absolute', top: '-6px', right: '-6px', width: '24px', height: '24px',
                    borderRadius: '50%', background: '#c05050', color: 'white', border: 'none',
                    fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', lineHeight: 1,
                  }}>×</button>
                <div style={{
                  position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--color-text)', color: 'var(--color-bg)', fontSize: '10px',
                  padding: '1px 6px', borderRadius: '8px',
                }}>{idx + 1}</div>
                <div style={{ display: 'flex', gap: '2px', marginTop: '8px' }}>
                  <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} aria-label="Move left"
                    style={{ flex: 1, minHeight: '32px', fontSize: '14px', cursor: idx === 0 ? 'default' : 'pointer',
                      background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '4px',
                      opacity: idx === 0 ? 0.3 : 1 }}>←</button>
                  <button onClick={() => handleMove(idx, 1)} disabled={idx === photos.length - 1} aria-label="Move right"
                    style={{ flex: 1, minHeight: '32px', fontSize: '14px', cursor: idx === photos.length - 1 ? 'default' : 'pointer',
                      background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '4px',
                      opacity: idx === photos.length - 1 ? 0.3 : 1 }}>→</button>
                </div>
              </div>
            ))}

            {photos.length < MAX_PHOTOS && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                style={{
                  width: '100px', height: '100px', border: '2px dashed var(--color-border)',
                  borderRadius: '8px', background: 'transparent', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: '4px', fontSize: '24px', color: 'var(--color-text-muted)',
                }}>
                {uploading ? '…' : '+'}
                <span style={{ fontSize: '10px' }}>{uploading ? 'Uploading' : 'Upload'}</span>
              </button>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            aria-hidden="true" tabIndex={-1} />

          {error && <p role="alert" style={{ color: '#c05050', fontSize: '14px', margin: '8px 0 0' }}>{error}</p>}
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
            Use arrows to reorder · Click × to remove · Max 10 · JPG/PNG/WebP under 5MB
          </p>
        </div>
      )}

      {deleteId && (
        <ConfirmDialog
          message="Remove this photo from Follow Along? This cannot be undone."
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
