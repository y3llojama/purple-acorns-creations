'use client'
import { useState } from 'react'

interface Props {
  contentKey: string
  label: string
  initialValue: string
  rows: number
}

export default function ContentEditor({ contentKey, label, initialValue, rows }: Props) {
  const [value, setValue] = useState(initialValue)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const id = `content-${contentKey}`

  async function handleSave() {
    setStatus('saving')
    try {
      const res = await fetch('/api/admin/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: contentKey, value }),
      })
      setStatus(res.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <label htmlFor={id} style={{ display: 'block', fontWeight: '600', marginBottom: '6px', fontSize: '16px', color: 'var(--color-primary)' }}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={e => { setValue(e.target.value); setStatus('idle') }}
        rows={rows}
        style={{ width: '100%', padding: '10px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)', fontFamily: 'var(--font-body)', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '10px 20px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {status === 'saved' && <span aria-live="polite" style={{ color: 'green', fontSize: '16px' }}>Saved ✓</span>}
        {status === 'error' && <span role="alert" style={{ color: '#c05050', fontSize: '16px' }}>Error saving. Please try again.</span>}
      </div>
    </div>
  )
}
