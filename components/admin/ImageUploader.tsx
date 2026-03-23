'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  bucket: string
  onUpload: (url: string, altText: string) => Promise<void>
  label?: string
  quickSnapLabel?: string
}

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPEG, PNG, WebP, GIF, and SVG images are allowed.'
  if (file.size > MAX_SIZE) return 'Image must be under 5MB.'
  return null
}

export default function ImageUploader({ bucket, onUpload, label = 'Upload Image', quickSnapLabel }: Props) {
  const [altText, setAltText] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File, resolvedAltText: string) {
    const validationError = validateFile(file)
    if (validationError) { setError(validationError); return }
    setError('')
    setStatus('uploading')
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file)
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      await onUpload(data.publicUrl, resolvedAltText)
      setStatus('done')
      setAltText('')
      if (fileRef.current) fileRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
      setStatus('error')
    }
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!altText.trim()) { setError('Please enter alt text before uploading.'); return }
    await uploadFile(file, altText)
  }

  async function handleCameraChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const resolvedAltText = quickSnapLabel?.trim() || altText.trim()
    if (!resolvedAltText) { setError('Enter a product name first — it will be used as alt text.'); return }
    await uploadFile(file, resolvedAltText)
  }

  function handleQuickSnap() {
    if (!quickSnapLabel?.trim() && !altText.trim()) {
      setError('Enter a product name first — it will be used as alt text.')
      return
    }
    cameraRef.current?.click()
  }

  return (
    <div>
      <label htmlFor="alt-text-input" style={{ display: 'block', marginBottom: '6px', fontSize: '16px', fontWeight: '500' }}>
        Alt text (required for accessibility)
      </label>
      <input
        id="alt-text-input"
        type="text"
        value={altText}
        onChange={e => setAltText(e.target.value)}
        placeholder="Describe the image for screen readers"
        maxLength={500}
        style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)', marginBottom: '12px' }}
      />
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!altText.trim() || status === 'uploading'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '12px 24px',
            background: altText.trim() ? 'var(--color-primary)' : '#ccc',
            color: '#fff',
            borderRadius: '4px',
            cursor: altText.trim() ? 'pointer' : 'not-allowed',
            fontSize: '16px',
            minHeight: '48px',
            border: 'none',
          }}
        >
          {status === 'uploading' ? 'Uploading…' : label}
        </button>
        {quickSnapLabel !== undefined && (
          <button
            type="button"
            onClick={handleQuickSnap}
            disabled={status === 'uploading'}
            aria-label="Take a photo with your camera"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 20px',
              background: 'var(--color-primary)',
              color: '#fff',
              borderRadius: '4px',
              cursor: status === 'uploading' ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              minHeight: '48px',
              border: 'none',
              opacity: status === 'uploading' ? 0.6 : 1,
            }}
          >
            📷 Quick Snap
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        onChange={handleChange}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        capture="environment"
        onChange={handleCameraChange}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        aria-hidden="true"
        tabIndex={-1}
      />
      {error && <p role="alert" style={{ color: '#c05050', marginTop: '8px', fontSize: '14px' }}>{error}</p>}
      {status === 'done' && <p role="status" style={{ color: 'green', marginTop: '8px', fontSize: '14px' }}>Upload successful!</p>}
    </div>
  )
}
