# Square API Debug Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rolling API log for all Square API calls with admin-controlled log levels (none/basic/full), auto-expiry timer, and 7-day retention.

**Architecture:** New `square_api_log` table stores log entries. A logging proxy wraps the Square SDK client, intercepting all API calls and writing log rows based on the current `square_log_level` setting. The log level auto-disables when `square_log_expires_at` passes. The SquareChannelCard UI gains a Debug section with radio buttons for level, a duration input, and a collapsible log viewer.

**Tech Stack:** Next.js API routes, Supabase/PostgREST, Square SDK v44, React (no Tailwind — CSS custom properties)

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/048_square_api_debug_log.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Square API debug logging: settings columns + log table

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS square_log_level TEXT NOT NULL DEFAULT 'none'
    CHECK (square_log_level IN ('none', 'basic', 'full')),
  ADD COLUMN IF NOT EXISTS square_log_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS square_api_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INT,
  error TEXT,
  request_body JSONB,
  response_body JSONB,
  duration_ms INT,
  CONSTRAINT square_api_log_retention CHECK (created_at > now() - INTERVAL '8 days')
);

CREATE INDEX IF NOT EXISTS idx_square_api_log_created_at ON square_api_log (created_at DESC);

-- RLS: no public access, service role only
ALTER TABLE square_api_log ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply migration to production Supabase**

Run the SQL in Supabase SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/048_square_api_debug_log.sql
git commit -m "feat: add square_api_log table and log level settings columns"
```

---

### Task 2: Logging Utility

**Files:**
- Create: `lib/channels/square/logger.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/channels/square/logger.test.ts`:

```typescript
import { shouldLog, buildLogEntry } from '@/lib/channels/square/logger'

describe('shouldLog', () => {
  it('returns false for level none', () => {
    expect(shouldLog('none', null)).toBe(false)
  })

  it('returns false when expired', () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString()
    expect(shouldLog('basic', pastDate)).toBe(false)
  })

  it('returns true for basic with future expiry', () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    expect(shouldLog('basic', futureDate)).toBe(true)
  })

  it('returns true for full with future expiry', () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    expect(shouldLog('full', futureDate)).toBe(true)
  })
})

describe('buildLogEntry', () => {
  it('omits bodies for basic level', () => {
    const entry = buildLogEntry('basic', 'POST', '/v2/catalog/object', 200, 42, { foo: 1 }, { bar: 2 })
    expect(entry.request_body).toBeNull()
    expect(entry.response_body).toBeNull()
    expect(entry.method).toBe('POST')
    expect(entry.path).toBe('/v2/catalog/object')
    expect(entry.status_code).toBe(200)
    expect(entry.duration_ms).toBe(42)
  })

  it('includes bodies for full level', () => {
    const entry = buildLogEntry('full', 'POST', '/v2/catalog/object', 200, 42, { foo: 1 }, { bar: 2 })
    expect(entry.request_body).toEqual({ foo: 1 })
    expect(entry.response_body).toEqual({ bar: 2 })
  })

  it('captures error string for non-2xx', () => {
    const entry = buildLogEntry('basic', 'POST', '/v2/catalog/object', 401, 10, null, { errors: [{ detail: 'Unauthorized' }] })
    expect(entry.error).toBe('Unauthorized')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `scripts/test.sh __tests__/lib/channels/square/logger.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the logger utility**

Create `lib/channels/square/logger.ts`:

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'

export type LogLevel = 'none' | 'basic' | 'full'

export function shouldLog(level: string | null, expiresAt: string | null): boolean {
  if (!level || level === 'none') return false
  if (!expiresAt) return false
  return new Date(expiresAt) > new Date()
}

export function buildLogEntry(
  level: string,
  method: string,
  path: string,
  statusCode: number | null,
  durationMs: number,
  requestBody: unknown,
  responseBody: unknown,
): {
  method: string
  path: string
  status_code: number | null
  error: string | null
  request_body: unknown
  response_body: unknown
  duration_ms: number
} {
  const isFull = level === 'full'
  let error: string | null = null

  if (statusCode && statusCode >= 400 && responseBody) {
    const body = responseBody as { errors?: Array<{ detail?: string }> }
    error = body.errors?.[0]?.detail ?? `HTTP ${statusCode}`
  }

  return {
    method,
    path,
    status_code: statusCode,
    error,
    request_body: isFull ? requestBody : null,
    response_body: isFull ? responseBody : null,
    duration_ms: durationMs,
  }
}

export async function writeLogEntry(entry: ReturnType<typeof buildLogEntry>): Promise<void> {
  try {
    const supabase = createServiceRoleClient()
    await supabase.from('square_api_log').insert(entry)
  } catch (err) {
    console.error('[square/logger] failed to write log entry:', err)
  }
}

export async function getLogSettings(): Promise<{ level: LogLevel; expiresAt: string | null }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('id, square_log_level, square_log_expires_at')
    .single()

  const level = (data?.square_log_level as LogLevel) ?? 'none'
  const expiresAt = data?.square_log_expires_at ?? null

  // Auto-disable if expired
  if (level !== 'none' && !shouldLog(level, expiresAt)) {
    await supabase.from('settings').update({
      square_log_level: 'none',
      square_log_expires_at: null,
    }).eq('id', data!.id)
    return { level: 'none', expiresAt: null }
  }

  return { level, expiresAt }
}

export async function cleanupOldLogs(): Promise<number> {
  const supabase = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('square_api_log')
    .delete()
    .lt('created_at', cutoff)
    .select('id', { count: 'exact', head: true })
  return count ?? 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `scripts/test.sh __tests__/lib/channels/square/logger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/channels/square/logger.ts __tests__/lib/channels/square/logger.test.ts
git commit -m "feat: add square API debug logger utility"
```

---

### Task 3: Logging Proxy in Square Client

**Files:**
- Modify: `lib/channels/square/client.ts`

- [ ] **Step 1: Add logging proxy to getSquareClient**

The Square SDK uses method-chaining like `client.catalog.object.upsert()`. Rather than proxying the entire SDK (complex and brittle), wrap the client in a logging fetch interceptor. The Square SDK's `SquareClient` constructor accepts a `fetchApi` option — we pass a custom fetch that logs requests/responses.

Modify `lib/channels/square/client.ts` to wrap the client construction with a logging fetch:

```typescript
import { SquareClient, SquareEnvironment } from 'square'
import { decryptToken, encryptToken, decryptValue } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getLogSettings, shouldLog, buildLogEntry, writeLogEntry } from './logger'

export async function getSquareClient(): Promise<{ client: SquareClient; locationId: string }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('id, square_access_token, square_refresh_token, square_token_expires_at, square_location_id, square_application_id, square_application_secret, square_environment, square_log_level, square_log_expires_at')
    .single()

  if (!data?.square_access_token) throw new Error('Square not connected')

  const environment = data.square_environment ?? process.env.SQUARE_ENVIRONMENT
  const isProd = environment === 'production'
  const baseUrl = isProd ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com'

  // Refresh the access token if it expires within the next 24 hours
  let accessToken = decryptToken(data.square_access_token)
  if (data.square_token_expires_at && data.square_refresh_token) {
    const expiresAt = new Date(data.square_token_expires_at)
    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    if (expiresAt <= oneDayFromNow) {
      try {
        const appId = data.square_application_id ?? process.env.SQUARE_APPLICATION_ID
        const appSecret = data.square_application_secret
          ? decryptValue(data.square_application_secret)
          : (process.env.SQUARE_APPLICATION_SECRET ?? '')
        const refreshToken = decryptToken(data.square_refresh_token)

        const refreshRes = await fetch(`${baseUrl}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' },
          body: JSON.stringify({
            client_id: appId,
            client_secret: appSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        })

        if (refreshRes.ok) {
          const tokens = await refreshRes.json()
          accessToken = tokens.access_token
          await supabase.from('settings').update({
            square_access_token: encryptToken(tokens.access_token),
            square_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : data.square_refresh_token,
            square_token_expires_at: tokens.expires_at ?? null,
          }).eq('id', data.id)
        } else {
          console.error('[square/client] token refresh failed — using existing token:', refreshRes.status)
        }
      } catch (err) {
        console.error('[square/client] token refresh error — using existing token:', err)
      }
    }
  }

  // Determine log level from settings (already fetched)
  const logLevel = data.square_log_level ?? 'none'
  const logActive = shouldLog(logLevel, data.square_log_expires_at)

  // Build a logging fetch wrapper
  const loggingFetch: typeof globalThis.fetch = logActive
    ? async (input, init) => {
        const start = Date.now()
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
        const method = init?.method ?? 'GET'
        const path = url.replace(/^https:\/\/connect\.(squareup|squareupsandbox)\.com/, '')

        let requestBody: unknown = null
        if (logLevel === 'full' && init?.body) {
          try { requestBody = JSON.parse(String(init.body)) } catch { requestBody = null }
        }

        const response = await fetch(input, init)
        const duration = Date.now() - start

        let responseBody: unknown = null
        let responseClone = response.clone()
        try {
          responseBody = await responseClone.json()
        } catch {
          responseBody = null
        }

        const entry = buildLogEntry(logLevel, method, path, response.status, duration, requestBody, responseBody)
        writeLogEntry(entry) // fire-and-forget

        return response
      }
    : undefined

  const client = new SquareClient({
    token: accessToken,
    environment: isProd ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    ...(loggingFetch ? { fetchApi: loggingFetch } : {}),
  })

  // Auto-discover and persist location ID if missing
  let locationId = data.square_location_id ?? ''
  if (!locationId) {
    const locResult = await client.locations.list()
    locationId = locResult.locations?.[0]?.id ?? ''
    if (locationId) {
      await supabase.from('settings').update({ square_location_id: locationId }).eq('id', data.id)
    }
  }

  return { client, locationId }
}
```

- [ ] **Step 2: Verify the SDK accepts fetchApi**

Check the Square SDK typings to confirm `fetchApi` is a valid constructor option. If the option is named differently (e.g., `fetcher` or `httpClient`), adjust accordingly. The `square` npm package v44+ supports a custom fetch via the `fetchApi` option.

If `fetchApi` is not supported, fall back to monkey-patching `globalThis.fetch` within the scope of the client call (less clean but functional). Check with:

```bash
grep -r "fetchApi\|fetcher\|httpClient" node_modules/square/dist/ | head -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/channels/square/client.ts
git commit -m "feat: add logging fetch proxy to square client"
```

---

### Task 4: Settings API — Save Log Level and Duration

**Files:**
- Modify: `app/api/admin/settings/route.ts`

- [ ] **Step 1: Add log level and duration handling to POST**

Add after the existing `square_environment` handling (around line 87):

```typescript
  if (body.square_log_level !== undefined) {
    const val = String(body.square_log_level ?? '')
    update.square_log_level = ['none', 'basic', 'full'].includes(val) ? val : 'none'
  }
  if (body.square_log_duration_mins !== undefined) {
    const mins = Math.max(0, Math.min(1500, parseInt(String(body.square_log_duration_mins), 10) || 0))
    if (mins > 0 && update.square_log_level && update.square_log_level !== 'none') {
      update.square_log_expires_at = new Date(Date.now() + mins * 60 * 1000).toISOString()
    } else if (update.square_log_level === 'none') {
      update.square_log_expires_at = null
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/settings/route.ts
git commit -m "feat: handle square_log_level and duration in settings API"
```

---

### Task 5: Logs API Endpoint

**Files:**
- Create: `app/api/admin/channels/square/logs/route.ts`

- [ ] **Step 1: Write the logs endpoint**

```typescript
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { cleanupOldLogs } from '@/lib/channels/square/logger'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))

  const supabase = createServiceRoleClient()

  // Clean up old logs opportunistically
  await cleanupOldLogs()

  const { data: logs, error: dbError } = await supabase
    .from('square_api_log')
    .select('id, created_at, method, path, status_code, error, request_body, response_body, duration_ms')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ logs })
}

export async function DELETE() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  await supabase.from('square_api_log').delete().gte('id', '00000000-0000-0000-0000-000000000000')

  return NextResponse.json({ cleared: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/channels/square/logs/route.ts
git commit -m "feat: add square API logs endpoint with cleanup"
```

---

### Task 6: Channels API — Expose Log Settings

**Files:**
- Modify: `app/api/admin/channels/route.ts`

- [ ] **Step 1: Add log level to the status response**

In the GET handler, add `square_log_level` and `square_log_expires_at` to the select query and include them in the response status object:

```typescript
logLevel: settings?.square_log_level ?? 'none',
logExpiresAt: settings?.square_log_expires_at ?? null,
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/channels/route.ts
git commit -m "feat: expose square log level in channels status"
```

---

### Task 7: SquareChannelCard UI — Debug Section

**Files:**
- Modify: `components/admin/SquareChannelCard.tsx`

- [ ] **Step 1: Update the Props interface**

Add to the status type:

```typescript
logLevel: string
logExpiresAt: string | null
```

- [ ] **Step 2: Add Debug section state and UI**

Add state variables:

```typescript
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
```

Add functions:

```typescript
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
```

Add the Debug section JSX (rendered inside the `{status.connected && ( ... )}` block, after the recent errors section). The section should be on the right side of the panel, but since the card is a single column, add it after all existing sections:

```tsx
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
```

- [ ] **Step 3: Update ChannelsManager to pass new status fields**

In `components/admin/ChannelsManager.tsx`, ensure the `square.status` object includes `logLevel` and `logExpiresAt` from the channels API response.

- [ ] **Step 4: Commit**

```bash
git add components/admin/SquareChannelCard.tsx components/admin/ChannelsManager.tsx
git commit -m "feat: add debug logging UI to square channel card"
```

---

### Task 8: Log Cleanup in Cron

**Files:**
- Modify: `app/api/cron/sync/route.ts`

- [ ] **Step 1: Add log cleanup to existing sync cron**

Add at the top of the cron handler, before the sync:

```typescript
import { cleanupOldLogs } from '@/lib/channels/square/logger'

// Near the start of the GET handler:
await cleanupOldLogs()
```

This runs daily at 3 AM alongside the existing product sync.

- [ ] **Step 2: Commit**

```bash
git add app/api/cron/sync/route.ts
git commit -m "feat: add square log cleanup to daily cron"
```

---

### Task 9: Integration Test & Deploy

- [ ] **Step 1: Run all tests**

```bash
scripts/test.sh
```

- [ ] **Step 2: Build check**

```bash
scripts/build.sh
```

- [ ] **Step 3: Apply migration 048 to production Supabase**

Run in Supabase SQL editor:

```sql
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS square_log_level TEXT NOT NULL DEFAULT 'none'
    CHECK (square_log_level IN ('none', 'basic', 'full')),
  ADD COLUMN IF NOT EXISTS square_log_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS square_api_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INT,
  error TEXT,
  request_body JSONB,
  response_body JSONB,
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_square_api_log_created_at ON square_api_log (created_at DESC);
ALTER TABLE square_api_log ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Push to deploy**

```bash
git push
```

- [ ] **Step 5: Verify in production**

1. Go to Admin → Channels → Square
2. Set logging to "Basic" for 5 minutes
3. Click Sync Now
4. View Logs — should show catalog API calls
5. Wait for expiry or set to "None" to disable
