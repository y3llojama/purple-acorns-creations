'use client'
import { useDiscovery } from './DiscoveryProvider'

interface Props { searchingMessage?: string }

export default function DiscoveryBanner({ searchingMessage = 'Searching in the background — you can keep using the admin while this runs.' }: Props) {
  const { state, message, error, dismiss } = useDiscovery()
  if (state === 'idle') return null

  const searching = state === 'searching'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 20px',
        marginBottom: '20px',
        borderRadius: '4px',
        border: `1px solid ${error ? '#c05050' : 'var(--color-border)'}`,
        background: error ? '#fff5f5' : 'var(--color-surface)',
        fontSize: '15px',
        color: error ? '#c05050' : 'var(--color-text)',
      }}
    >
      <span>{searching ? searchingMessage : (error ?? message)}</span>
      {!searching && (
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--color-text-muted)', lineHeight: 1, padding: '4px 8px', minHeight: '36px' }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
