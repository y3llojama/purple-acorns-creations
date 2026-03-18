'use client'
import { useEffect, useRef } from 'react'

interface Props { message: string; onConfirm: () => void; onCancel: () => void }

export default function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
    const cancelBtn = dialogRef.current?.querySelector<HTMLButtonElement>('button')
    cancelBtn?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key !== 'Tab') return
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      if (buttons.length === 0) return
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [onCancel])

  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="confirm-msg" style={{ background: '#fff', borderRadius: '8px', padding: '32px', maxWidth: '400px', width: '90%' }}>
        <p id="confirm-msg" style={{ fontSize: '18px', marginBottom: '24px', color: 'var(--color-text)' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '12px 24px', fontSize: '18px', border: '2px solid var(--color-primary)', background: 'transparent', color: 'var(--color-primary)', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '12px 24px', fontSize: '18px', border: 'none', background: '#c05050', color: '#fff', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}
