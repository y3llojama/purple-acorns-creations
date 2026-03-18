'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  bucket: string
  onUpload: (url: string, altText: string) => Promise<void>
  label?: string
}

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Only JPEG, PNG, WebP, and GIF images are allowed.'
  if (file.size > MAX_SIZE) return 'Image must be under 5MB.'
  return null
}

export default function ImageUploader({ bucket, onUpload, label = 'Upload Image' }: Props) {
  const [altText, setAltText] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = validateFile(file)
    if (validationError) { setError(validationError); return }
    if (!altText.trim()) { setError('Please enter alt text before uploading.'); return }
    setError('')
    setStatus('uploading')
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file)
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      await onUpload(data.publicUrl, altText)
      setStatus('done')
      setAltText('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
      setStatus('error')
    }
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
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleChange}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
        aria-hidden="true"
        tabIndex={-1}
      />
      {error && <p role="alert" style={{ color: '#c05050', marginTop: '8px', fontSize: '14px' }}>{error}</p>}
      {status === 'done' && <p role="status" style={{ color: 'green', marginTop: '8px', fontSize: '14px' }}>Upload successful!</p>}
    </div>
  )
}
