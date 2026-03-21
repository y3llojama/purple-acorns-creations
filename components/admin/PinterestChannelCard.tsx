'use client'
import { useState } from 'react'

interface Conflict {
  product_id: string
  channel: string
  error: string | null
  products: { name: string } | null
}

interface RecentError {
  error: string | null
  created_at: string
}

interface Props {
  status: { connected: boolean; enabled: boolean; catalogId: string | null }
  conflicts: Conflict[]
  recentErrors: RecentError[]
  onRefresh: () => void
}

const cardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: '8px',
  padding: '24px',
  marginBottom: '24px',
}

const btnStyle: React.CSSProperties = {
  background: 'var(--color-primary)',
  color: 'var(--color-accent)',
  padding: '10px 20px',
  fontSize: '16px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  minHeight: '48px',
}

const btnSecondaryStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--color-primary)',
  padding: '10px 20px',
  fontSize: '16px',
  border: '1px solid var(--color-border)',
  borderRadius: '4px',
  cursor: 'pointer',
  minHeight: '48px',
}

const inputStyle: React.CSSProperties = {
  padding: '10px',
  fontSize: '16px',
  borderRadius: '4px',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'inherit',
  minHeight: '48px',
  flex: 1,
}

export default function PinterestChannelCard({ status, conflicts, recentErrors, onRefresh }: Props) {
  const [catalogId, setCatalogId] = useState(status.catalogId ?? '')
  const [catalogSaved, setCatalogSaved] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [savingCatalog, setSavingCatalog] = useState(false)

  async function toggleSync() {
    setToggling(true)
    try {
      const res = await fetch('/api/admin/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinterest_sync_enabled: !status.enabled }),
      })
      if (res.ok) onRefresh()
    } finally {
      setToggling(false)
    }
  }

  async function saveCatalogId() {
    setSavingCatalog(true)
    setCatalogSaved(false)
    try {
      const res = await fetch('/api/admin/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinterest_catalog_id: catalogId }),
      })
      if (res.ok) {
        setCatalogSaved(true)
        onRefresh()
      }
    } finally {
      setSavingCatalog(false)
    }
  }

  async function dismissConflict(productId: string) {
    const res = await fetch('/api/admin/channels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismiss_conflict_product_id: productId, dismiss_conflict_channel: 'pinterest' }),
    })
    if (res.ok) onRefresh()
  }

  return (
    <>
      {/* Pinterest card */}
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '20px', color: 'var(--color-primary)', margin: 0 }}>Pinterest</h2>
          <span style={{
            padding: '3px 10px',
            borderRadius: '12px',
            fontSize: '13px',
            background: status.connected ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
            color: status.connected ? 'var(--color-success-text)' : 'var(--color-danger-text)',
          }}>
            {status.connected ? 'Connected' : 'Not connected'}
          </span>
        </div>

        {!status.connected && (
          <div style={{ marginBottom: '16px' }}>
            <a
              href="/api/admin/channels/pinterest/connect"
              style={{ ...btnStyle, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}
            >
              Connect Pinterest
            </a>
          </div>
        )}

        {/* Catalog ID input — shown regardless of connection status */}
        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="pinterest-catalog-id" style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
            Pinterest Catalog ID
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              id="pinterest-catalog-id"
              value={catalogId}
              onChange={e => { setCatalogId(e.target.value); setCatalogSaved(false) }}
              placeholder="e.g. 123456789"
              style={inputStyle}
            />
            <button style={btnStyle} onClick={saveCatalogId} disabled={savingCatalog}>
              {savingCatalog ? 'Saving…' : 'Save'}
            </button>
          </div>
          {catalogSaved && (
            <span role="status" aria-live="polite" style={{ fontSize: '14px', color: 'var(--color-success-text)', marginTop: '4px', display: 'block' }}>Saved ✓</span>
          )}
        </div>

        {status.connected && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <a href="/api/admin/channels/pinterest/connect" style={{ display: 'inline-block', textDecoration: 'none', fontSize: '14px', padding: '10px 20px', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-primary)', background: 'transparent', minHeight: '48px', lineHeight: '28px' }}>
                Re-authorize Pinterest
              </a>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Use this to grant new permissions to an existing connection.
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '48px' }}>
                <input
                  type="checkbox"
                  checked={status.enabled}
                  onChange={toggleSync}
                  disabled={toggling}
                  style={{ width: '18px', height: '18px' }}
                />
                Sync enabled
              </label>
            </div>

            {conflicts.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '16px', color: 'var(--color-primary)', marginBottom: '12px' }}>Conflicts ({conflicts.length})</h3>
                {conflicts.map(conflict => (
                  <div
                    key={conflict.product_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: '500' }}>{conflict.products?.name ?? 'Unknown product'}</span>
                      {conflict.error && (
                        <p style={{ fontSize: '13px', color: 'var(--color-error)', margin: '2px 0 0' }}>{conflict.error}</p>
                      )}
                    </div>
                    <button
                      style={btnSecondaryStyle}
                      onClick={() => dismissConflict(conflict.product_id)}
                    >
                      Mark Reviewed
                    </button>
                  </div>
                ))}
              </div>
            )}

            {recentErrors.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '16px', color: 'var(--color-primary)', marginBottom: '8px' }}>Recent Errors</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {recentErrors.map((err, i) => (
                    <li
                      key={i}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        marginBottom: '6px',
                        fontSize: '14px',
                        color: 'var(--color-error)',
                      }}
                    >
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '12px', display: 'block' }}>
                        {new Date(err.created_at).toLocaleString()}
                      </span>
                      {err.error ?? 'Unknown error'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {/* Etsy placeholder */}
      <div style={{ ...cardStyle, opacity: 0.5, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h2 style={{ fontSize: '20px', color: 'var(--color-primary)', margin: 0 }}>Etsy</h2>
          <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Coming soon</span>
        </div>
      </div>
    </>
  )
}
