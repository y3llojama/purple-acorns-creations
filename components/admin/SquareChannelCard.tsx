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
  status: { connected: boolean; enabled: boolean; locationId: string | null; hasAppCredentials: boolean; environment: string }
  conflicts: Conflict[]
  recentErrors: RecentError[]
  onRefresh: () => void
  oauthError?: string | null
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

export default function SquareChannelCard({ status, conflicts, recentErrors, onRefresh, oauthError }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [syncResult, setSyncResult] = useState<{ synced: number; errors: number; details: unknown[] } | null>(null)
  const [credAppId, setCredAppId] = useState('')
  const [credSecret, setCredSecret] = useState('')
  const [credEnv, setCredEnv] = useState(status.environment ?? 'sandbox')
  const [savingCreds, setSavingCreds] = useState(false)
  const [credsMsg, setCredsMsg] = useState('')

  async function saveCredentials() {
    setSavingCreds(true)
    setCredsMsg('')
    try {
      const body: Record<string, string> = { square_environment: credEnv }
      if (credAppId.trim()) body.square_application_id = credAppId.trim()
      if (credSecret.trim()) body.square_application_secret = credSecret.trim()
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setCredsMsg('Saved.')
        setCredSecret('')
        onRefresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setCredsMsg(data.error ?? 'Save failed.')
      }
    } catch {
      setCredsMsg('Network error.')
    } finally {
      setSavingCreds(false)
    }
  }

  async function toggleSync() {
    setToggling(true)
    try {
      const res = await fetch('/api/admin/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ square_sync_enabled: !status.enabled }),
      })
      if (res.ok) onRefresh()
    } finally {
      setToggling(false)
    }
  }

  async function syncNow() {
    setSyncing(true)
    setSyncError('')
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin/sync', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncError(data.error ?? 'Sync failed.')
      } else {
        setSyncResult(data)
        onRefresh()
      }
    } catch {
      setSyncError('Network error.')
    } finally {
      setSyncing(false)
    }
  }

  async function dismissConflict(productId: string) {
    const res = await fetch('/api/admin/channels', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismiss_conflict_product_id: productId, dismiss_conflict_channel: 'square' }),
    })
    if (res.ok) onRefresh()
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '20px', color: 'var(--color-primary)', margin: 0 }}>Square</h2>
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

      {/* App Credentials */}
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', color: 'var(--color-primary)', marginBottom: '12px' }}>App Credentials</h3>
        {!status.hasAppCredentials && (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Enter your Square Application ID and Secret to enable OAuth. Find these in the{' '}
            <a href="https://developer.squareup.com/apps" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
              Square Developer Dashboard
            </a>.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '420px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500' }}>
            Application ID
            <input
              type="text"
              value={credAppId}
              onChange={e => setCredAppId(e.target.value)}
              placeholder={status.hasAppCredentials ? '(saved — enter to replace)' : 'sq0idp-…'}
              style={{
                display: 'block', width: '100%', marginTop: '4px',
                padding: '8px 10px', fontSize: '14px',
                border: '1px solid var(--color-border)', borderRadius: '4px',
                background: 'var(--color-bg)', color: 'var(--color-primary)',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ fontSize: '14px', fontWeight: '500' }}>
            Application Secret
            <input
              type="password"
              value={credSecret}
              onChange={e => setCredSecret(e.target.value)}
              placeholder={status.hasAppCredentials ? '(saved — enter to replace)' : 'sq0csp-…'}
              autoComplete="new-password"
              style={{
                display: 'block', width: '100%', marginTop: '4px',
                padding: '8px 10px', fontSize: '14px',
                border: '1px solid var(--color-border)', borderRadius: '4px',
                background: 'var(--color-bg)', color: 'var(--color-primary)',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ fontSize: '14px', fontWeight: '500' }}>
            Environment
            <select
              value={credEnv}
              onChange={e => setCredEnv(e.target.value)}
              style={{
                display: 'block', width: '100%', marginTop: '4px',
                padding: '8px 10px', fontSize: '14px',
                border: '1px solid var(--color-border)', borderRadius: '4px',
                background: 'var(--color-bg)', color: 'var(--color-primary)',
                boxSizing: 'border-box',
              }}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </label>
          {(() => {
            const hasChanges = credAppId.trim() !== '' || credSecret.trim() !== '' || credEnv !== status.environment || !status.hasAppCredentials
            if (!hasChanges) return credsMsg ? (
              <span style={{ fontSize: '14px', color: 'var(--color-success-text)' }}>{credsMsg}</span>
            ) : null
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button style={btnStyle} onClick={saveCredentials} disabled={savingCreds}>
                  {savingCreds ? 'Saving…' : 'Save Credentials'}
                </button>
                {credsMsg && (
                  <span style={{ fontSize: '14px', color: credsMsg === 'Saved.' ? 'var(--color-success-text)' : 'var(--color-error)' }}>
                    {credsMsg}
                  </span>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {oauthError && (
        <p role="alert" style={{ color: 'var(--color-error)', fontSize: '13px', marginBottom: '12px' }}>
          Connection failed: {oauthError}
        </p>
      )}

      {!status.connected && (
        <div style={{ marginBottom: '16px' }}>
          <a
            href="/api/admin/channels/square/connect"
            style={{
              ...btnStyle,
              display: 'inline-block',
              textDecoration: 'none',
              textAlign: 'center',
              opacity: status.hasAppCredentials ? 1 : 0.5,
              pointerEvents: status.hasAppCredentials ? 'auto' : 'none',
            }}
          >
            Connect Square
          </a>
          {!status.hasAppCredentials && (
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
              Save App Credentials above before connecting.
            </p>
          )}
        </div>
      )}

      {status.connected && (
        <>
          {status.locationId && (
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
              Location ID: <code>{status.locationId}</code>
            </p>
          )}

          <div style={{ marginBottom: '16px' }}>
            <a href="/api/admin/channels/square/connect" style={{ ...btnSecondaryStyle, display: 'inline-block', textDecoration: 'none', fontSize: '14px' }}>
              Re-authorize Square
            </a>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Use this to grant new permissions to an existing connection.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
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

            <button style={btnStyle} onClick={syncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>

          {syncError && (
            <p role="alert" style={{ color: 'var(--color-error)', fontSize: '14px', marginBottom: '12px' }}>{syncError}</p>
          )}

          {syncResult && (
            <details style={{ marginBottom: '16px' }}>
              <summary style={{ fontSize: '14px', cursor: 'pointer', color: 'var(--color-text-muted)', userSelect: 'none' }}>
                Sync complete — {syncResult.synced} synced, {syncResult.errors} error{syncResult.errors !== 1 ? 's' : ''}
              </summary>
              <textarea
                readOnly
                value={JSON.stringify(syncResult.details, null, 2)}
                style={{
                  display: 'block', width: '100%', marginTop: '8px',
                  height: '180px', fontSize: '12px', fontFamily: 'monospace',
                  padding: '8px', boxSizing: 'border-box',
                  border: '1px solid var(--color-border)', borderRadius: '4px',
                  background: 'var(--color-bg)', color: 'var(--color-text-muted)',
                  resize: 'vertical',
                }}
              />
            </details>
          )}

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
  )
}
