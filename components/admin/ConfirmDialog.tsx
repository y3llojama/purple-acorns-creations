'use client'
interface Props { message: string; onConfirm: () => void; onCancel: () => void }

export default function ConfirmDialog({ message, onConfirm, onCancel }: Props) {
  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-msg" style={{ background: '#fff', borderRadius: '8px', padding: '32px', maxWidth: '400px', width: '90%' }}>
        <p id="confirm-msg" style={{ fontSize: '18px', marginBottom: '24px', color: 'var(--color-text)' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '12px 24px', fontSize: '18px', border: '2px solid var(--color-primary)', background: 'transparent', color: 'var(--color-primary)', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: '12px 24px', fontSize: '18px', border: 'none', background: '#c05050', color: '#fff', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}
