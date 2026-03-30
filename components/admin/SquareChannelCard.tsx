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
  status: { connected: boolean; enabled: boolean; locationId: string | null; hasAppCredentials: boolean; environment: string; logLevel: string; logExpiresAt: string | null }
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
  const [logLevel, setLogLevel] = useState(status.logLevel ?? 'none')
  const [logDuration, setLogDuration] = useState(30)
  const [savingLog, setSavingLog] = useState(false)
  const [logMsg, setLogMsg] = useState('')
  const [logs, setLogs] = useState<Array<{
    id: string; created_at: string; method: string; path: string;
    status_code: number | null; error: string | null; duration_ms: number;
    request_body: unknown; response_body: unknown;
  }>>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)

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

  async function saveLogSettings() {
    setSavingLog(true)
    setLogMsg('')
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          square_log_level: logLevel,
          square_log_duration_mins: logLevel !== 'none' ? logDuration : 0,
        }),
      })
      if (res.ok) {
        setLogMsg(logLevel === 'none' ? 'Logging disabled.' : `Logging enabled for ${logDuration} min.`)
        onRefresh()
      } else {
        const data = await res.json().catch(() => ({}))
        setLogMsg(data.error ?? 'Save failed.')
      }
    } catch {
      setLogMsg('Network error.')
    } finally {
      setSavingLog(false)
    }
  }

  async function fetchLogs() {
    setLoadingLogs(true)
    try {
      const res = await fetch('/api/admin/channels/square/logs?limit=50')
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs ?? [])
      }
    } catch { /* ignore */ } finally {
      setLoadingLogs(false)
    }
  }

  async function clearLogs() {
    await fetch('/api/admin/channels/square/logs', { method: 'DELETE' })
    setLogs([])
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

          {/* Debug Logging */}
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
            <h3 style={{ fontSize: '16px', color: 'var(--color-primary)', marginBottom: '4px' }}>Debug Logging</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              Log Square API requests for debugging. Logs auto-delete after 7 days.
              Full logging captures request/response bodies and may increase storage costs.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '360px' }}>
              {(['none', 'basic', 'full'] as const).map(level => (
                <label key={level} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  <input
                    type="radio"
                    name="square_log_level"
                    value={level}
                    checked={logLevel === level}
                    onChange={() => setLogLevel(level)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span>
                    {level === 'none' && 'No logging (default)'}
                    {level === 'basic' && 'Basic — method, path, status, errors'}
                    {level === 'full' && (
                      <>Full — includes request/response bodies <span style={{ color: 'var(--color-error)', fontSize: '12px' }}>(storage costs)</span></>
                    )}
                  </span>
                </label>
              ))}

              {logLevel !== 'none' && (
                <label style={{ fontSize: '14px', fontWeight: '500', marginTop: '8px' }}>
                  Duration (minutes)
                  <input
                    type="number"
                    min={1}
                    max={1500}
                    value={logDuration}
                    onChange={e => setLogDuration(Math.max(1, Math.min(1500, parseInt(e.target.value, 10) || 1)))}
                    style={{
                      display: 'block', width: '120px', marginTop: '4px',
                      padding: '8px 10px', fontSize: '14px',
                      border: '1px solid var(--color-border)', borderRadius: '4px',
                      background: 'var(--color-bg)', color: 'var(--color-primary)',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    1–1500 min (max 25 hours). Logging disables automatically after this.
                  </span>
                </label>
              )}

              {status.logExpiresAt && status.logLevel !== 'none' && (
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  Logging active until {new Date(status.logExpiresAt).toLocaleString()}
                </p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button style={btnStyle} onClick={saveLogSettings} disabled={savingLog}>
                  {savingLog ? 'Saving…' : logLevel === 'none' ? 'Disable Logging' : 'Enable Logging'}
                </button>
                {logMsg && (
                  <span style={{ fontSize: '14px', color: logMsg.includes('fail') || logMsg.includes('error') ? 'var(--color-error)' : 'var(--color-success-text)' }}>
                    {logMsg}
                  </span>
                )}
              </div>
            </div>

            {/* Log Viewer */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  style={btnSecondaryStyle}
                  onClick={() => { setLogsOpen(!logsOpen); if (!logsOpen) fetchLogs() }}
                >
                  {logsOpen ? 'Hide Logs' : 'View Logs'}
                </button>
                {logsOpen && logs.length > 0 && (
                  <button style={{ ...btnSecondaryStyle, fontSize: '13px', color: 'var(--color-error)' }} onClick={clearLogs}>
                    Clear All
                  </button>
                )}
              </div>

              {logsOpen && (
                <div style={{ marginTop: '12px' }}>
                  {loadingLogs ? (
                    <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Loading…</p>
                  ) : logs.length === 0 ? (
                    <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>No log entries.</p>
                  ) : (
                    <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-bg)', position: 'sticky', top: 0 }}>
                            <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Time</th>
                            <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Status</th>
                            <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Method</th>
                            <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>Path</th>
                            <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid var(--color-border)' }}>Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map(log => (
                            <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleTimeString()}</td>
                              <td style={{ padding: '6px 8px' }}>
                                <span style={{ color: log.status_code && log.status_code < 400 ? 'var(--color-success-text)' : 'var(--color-error)' }}>
                                  {log.status_code ?? '—'}
                                </span>
                              </td>
                              <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{log.method}</td>
                              <td style={{ padding: '6px 8px', fontFamily: 'monospace', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {log.path}
                                {log.error && <div style={{ color: 'var(--color-error)', fontSize: '12px' }}>{log.error}</div>}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{log.duration_ms}ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
