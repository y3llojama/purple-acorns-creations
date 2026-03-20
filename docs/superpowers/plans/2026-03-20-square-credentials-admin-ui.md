# Square Credentials Admin UI — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the admin to configure Square Application ID, Secret, and Environment through the Channels admin UI instead of requiring Vercel env vars.

**Architecture:** Add three columns to the `settings` table (`square_application_id`, `square_application_secret`, `square_environment`). The secret is encrypted at rest using the existing `encryptValue`/`decryptSettings` pattern. The connect/callback routes read credentials from DB (decrypted), falling back to env vars. A credentials form is added above the Connect button in `SquareChannelCard`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL), existing `lib/crypto.ts` encryption utilities.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/017_square_app_credentials.sql` | Create | Add 3 columns to settings table |
| `lib/supabase/types.ts` | Modify | Add 3 fields to `Settings` interface |
| `lib/theme.ts` | Modify | Add 3 fields to `DEFAULT_SETTINGS` |
| `lib/crypto.ts` | Modify | Add `square_application_secret` to `SENSITIVE_SETTINGS_FIELDS` |
| `app/api/admin/settings/route.ts` | Modify | Handle the 3 new fields (encrypt secret, validate env/id) |
| `app/api/admin/channels/square/connect/route.ts` | Modify | Read credentials from DB before env fallback |
| `app/api/admin/channels/square/callback/route.ts` | Modify | Read credentials from DB before env fallback |
| `app/api/admin/channels/route.ts` | Modify | Include `hasSquareAppCredentials` in response |
| `components/admin/SquareChannelCard.tsx` | Modify | Add credentials form above Connect button |
| `app/admin/(dashboard)/channels/page.tsx` | Modify | Pass decrypted settings to `ChannelsManager` |
| `components/admin/ChannelsManager.tsx` | Modify | Pass `squareAppCredentials` prop to `SquareChannelCard` |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/017_square_app_credentials.sql`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS square_application_id   TEXT,
  ADD COLUMN IF NOT EXISTS square_application_secret TEXT,
  ADD COLUMN IF NOT EXISTS square_environment       TEXT DEFAULT 'sandbox';
```

- [ ] **Step 2: Run locally to verify it applies cleanly**

```bash
# If using Supabase CLI:
supabase db push
# OR apply directly in the Supabase dashboard SQL editor
```

Expected: No errors, three new nullable columns on settings.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_square_app_credentials.sql
git commit -m "feat: migration — add square app credentials columns to settings"
```

---

### Task 2: Types + defaults + encryption

**Files:**
- Modify: `lib/supabase/types.ts`
- Modify: `lib/theme.ts`
- Modify: `lib/crypto.ts`

- [ ] **Step 1: Add fields to `Settings` interface in `lib/supabase/types.ts`**

Add after `square_location_id: string | null`:
```ts
square_application_id: string | null
square_application_secret: string | null
square_environment: string | null
```

- [ ] **Step 2: Add fields to `DEFAULT_SETTINGS` in `lib/theme.ts`**

Add after `square_location_id: null,`:
```ts
square_application_id: null,
square_application_secret: null,
square_environment: 'sandbox',
```

- [ ] **Step 3: Add secret to `SENSITIVE_SETTINGS_FIELDS` in `lib/crypto.ts`**

Add `'square_application_secret'` to the array (line 8–17).

The `decryptSettings` function will then automatically decrypt it whenever settings are loaded.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error TS"
```

Expected: No output (no errors).

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/types.ts lib/theme.ts lib/crypto.ts
git commit -m "feat: add square app credential fields to types, defaults, and encryption list"
```

---

### Task 3: Settings API — save credentials

**Files:**
- Modify: `app/api/admin/settings/route.ts`

- [ ] **Step 1: Add handling for the three new fields**

In the `POST` handler, after the `mailchimp_audience_id` block, add:

```ts
// Square app credentials — secret is encrypted at rest.
// IMPORTANT: omitting square_application_secret from the body preserves the existing
// encrypted value (the if-undefined guard skips it). The client must omit this field
// when the password input is blank — never send an empty string for it.
if (body.square_application_id !== undefined) {
  update.square_application_id = sanitizeText(String(body.square_application_id ?? '')).slice(0, 200) || null
}
if (body.square_application_secret !== undefined) {
  const secret = String(body.square_application_secret ?? '').trim()
  update.square_application_secret = secret ? encryptValue(secret) : null
}
if (body.square_environment !== undefined) {
  const env = String(body.square_environment ?? '')
  update.square_environment = ['sandbox', 'production'].includes(env) ? env : 'sandbox'
}
```

Add a top-level import of `encryptValue` from `@/lib/crypto` at the top of the file alongside existing imports.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error TS"
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/settings/route.ts
git commit -m "feat: settings API handles square_application_id, secret (encrypted), environment"
```

---

### Task 4: Square connect/callback — read credentials from DB

**Files:**
- Modify: `app/api/admin/channels/square/connect/route.ts`
- Modify: `app/api/admin/channels/square/callback/route.ts`

- [ ] **Step 1: Update `connect/route.ts` to prefer DB credentials**

Replace the `process.env.SQUARE_APPLICATION_ID` reads with a DB lookup + env fallback:

Note: `connect/route.ts` only reads `square_application_id` and `square_environment` — neither is encrypted, so `decryptSettings` is NOT needed here.

```ts
import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data: raw } = await supabase
    .from('settings')
    .select('square_application_id, square_environment')
    .single()

  const appId = raw?.square_application_id || process.env.SQUARE_APPLICATION_ID
  const environment = raw?.square_environment || process.env.SQUARE_ENVIRONMENT || 'sandbox'

  if (!appId) return NextResponse.json({ error: 'Square not configured' }, { status: 500 })

  const baseUrl = environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/square/callback`
  const scope = [
    'MERCHANT_PROFILE_READ', 'ITEMS_READ', 'ITEMS_WRITE',
    'INVENTORY_READ', 'INVENTORY_WRITE',
    'ORDERS_READ', 'ORDERS_WRITE',
    'PAYMENTS_READ', 'PAYMENTS_WRITE',
  ].join(' ')

  const url = new URL(`${baseUrl}/oauth2/authorize`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('scope', scope)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('session', 'false')

  return NextResponse.redirect(url.toString())
}
```

- [ ] **Step 2: Update `callback/route.ts` to prefer DB credentials**

In `callback/route.ts`, replace the `process.env.SQUARE_APPLICATION_ID` and `process.env.SQUARE_APPLICATION_SECRET` reads:

Add `import { decryptSettings } from '@/lib/crypto'` as a static top-level import. Then after `requireAdminSession()`, add:

```ts
const supabase2 = createServiceRoleClient()
const { data: rawCreds } = await supabase2
  .from('settings')
  .select('square_application_id, square_application_secret, square_environment')
  .single()
// decryptSettings only touches SENSITIVE_SETTINGS_FIELDS; square_application_secret
// is in that list after Task 2, so it will be decrypted automatically.
// Cast to satisfy the generic constraint — only the secret field is a SensitiveField.
const creds = decryptSettings((rawCreds ?? {}) as Parameters<typeof decryptSettings>[0])

const appId       = (rawCreds?.square_application_id)     || process.env.SQUARE_APPLICATION_ID
const appSecret   = (creds.square_application_secret)     || process.env.SQUARE_APPLICATION_SECRET
const environment = (rawCreds?.square_environment)        || process.env.SQUARE_ENVIRONMENT || 'sandbox'
```

Then use `appId`, `appSecret`, and `environment` in place of the env vars throughout the rest of the handler.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error TS"
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/channels/square/connect/route.ts app/api/admin/channels/square/callback/route.ts
git commit -m "feat: square connect/callback reads app credentials from DB with env fallback"
```

---

### Task 5: Channels API — surface credential presence

**Files:**
- Modify: `app/api/admin/channels/route.ts`

- [ ] **Step 1: Include `hasAppCredentials` in the square status**

In the `GET` handler, update the settings select to include the new fields, and add `hasAppCredentials` to the square status object:

```ts
const [{ data: settings }, ...] = await Promise.all([
  supabase.from('settings').select(
    'square_sync_enabled,pinterest_sync_enabled,square_location_id,pinterest_catalog_id,' +
    'square_access_token,pinterest_access_token,' +
    'square_application_id,square_application_secret,square_environment'
  ).single(),
  ...
])

// hasAppCredentials requires BOTH an app ID and a secret (from DB or env).
// The secret column stores the encrypted value — non-null means it's present.
const hasDbId     = !!settings?.square_application_id
const hasEnvId    = !!process.env.SQUARE_APPLICATION_ID
const hasDbSecret = !!settings?.square_application_secret
const hasEnvSecret = !!process.env.SQUARE_APPLICATION_SECRET

// In the response:
square: {
  status: {
    connected: !!settings?.square_access_token,
    enabled: settings?.square_sync_enabled ?? false,
    locationId: settings?.square_location_id ?? null,
    hasAppCredentials: (hasDbId || hasEnvId) && (hasDbSecret || hasEnvSecret),
    environment: settings?.square_environment || process.env.SQUARE_ENVIRONMENT || 'sandbox',
  },
  ...
}
```

- [ ] **Step 2: Update `ChannelsData` type in `ChannelsManager.tsx` to match**

```ts
status: {
  connected: boolean
  enabled: boolean
  locationId: string | null
  hasAppCredentials: boolean
  environment: string
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error TS"
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/channels/route.ts components/admin/ChannelsManager.tsx
git commit -m "feat: channels API exposes hasAppCredentials and environment in square status"
```

---

### Task 6: Channels page — pass settings to SquareChannelCard

**Files:**
- Modify: `app/admin/(dashboard)/channels/page.tsx`
- Modify: `components/admin/ChannelsManager.tsx`
- Modify: `components/admin/SquareChannelCard.tsx`

- [ ] **Step 1: Load decrypted settings in channels page**

Update `channels/page.tsx`:

```ts
import { requireAdminSession } from '@/lib/auth'
import { getSettings } from '@/lib/theme'
import { decryptSettings } from '@/lib/crypto'
import ChannelsManager from '@/components/admin/ChannelsManager'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Channels' }

export default async function ChannelsPage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')

  const rawSettings = await getSettings()
  const settings = decryptSettings(rawSettings)

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Channels</h1>
      <ChannelsManager
        initialSquareAppId={settings.square_application_id ?? ''}
        initialSquareEnvironment={settings.square_environment ?? 'sandbox'}
      />
    </div>
  )
}
```

Note: We pass `application_id` (not sensitive to display) and `environment` as SSR-seeded initial state for the form. We do NOT pass the decrypted secret to the client — the form shows a placeholder when a secret is saved. After `onRefresh()` runs, the form retains whatever the user typed (i.e. `initialEnvironment` only seeds `useState` once and is not re-synced from the API). This is acceptable — the save itself always wins, and a full page refresh would re-seed from the DB.

- [ ] **Step 2: Update `ChannelsManager` to accept and forward props**

Add to `ChannelsManager` interface:
```ts
interface Props {
  initialSquareAppId: string
  initialSquareEnvironment: string
}
```

Pass as props to `SquareChannelCard`:
```tsx
<SquareChannelCard
  ...
  initialAppId={initialSquareAppId}
  initialEnvironment={initialSquareEnvironment}
/>
```

- [ ] **Step 3: Add credentials form to `SquareChannelCard`**

Add props:
```ts
interface Props {
  status: { connected: boolean; enabled: boolean; locationId: string | null; hasAppCredentials: boolean; environment: string }
  conflicts: Conflict[]
  recentErrors: RecentError[]
  onRefresh: () => void
  initialAppId: string
  initialEnvironment: string
}
```

Add state and save handler at top of component:
```ts
const [appId, setAppId] = useState(initialAppId)
const [appSecret, setAppSecret] = useState('')  // never pre-filled
const [environment, setEnvironment] = useState(initialEnvironment)
const [credSaving, setCredSaving] = useState(false)
const [credSaved, setCredSaved] = useState(false)
const [credError, setCredError] = useState('')

async function saveCredentials() {
  setCredSaving(true)
  setCredError('')
  setCredSaved(false)
  const body: Record<string, string> = {
    square_application_id: appId.trim(),
    square_environment: environment,
  }
  if (appSecret.trim()) body.square_application_secret = appSecret.trim()
  const res = await fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.ok) {
    setCredSaved(true)
    setAppSecret('')  // clear after save
    onRefresh()
  } else {
    const d = await res.json().catch(() => ({}))
    setCredError(d.error ?? 'Save failed')
  }
  setCredSaving(false)
}
```

Add credentials form section above the Connect button:

```tsx
{/* App Credentials */}
<div style={{ marginBottom: '20px' }}>
  <h3 style={{ fontSize: '15px', marginBottom: '12px', color: 'var(--color-text)' }}>
    App Credentials
    {status.hasAppCredentials && (
      <span style={{ marginLeft: '8px', fontSize: '12px', color: 'green' }}>✓ Configured</span>
    )}
  </h3>
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <div>
      <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px', color: 'var(--color-text-muted)' }}>
        Application ID
      </label>
      <input
        type="text"
        value={appId}
        onChange={e => { setAppId(e.target.value); setCredSaved(false) }}
        placeholder="sq0idp-..."
        style={{ width: '100%', padding: '8px 10px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: '4px', minHeight: '40px', boxSizing: 'border-box' }}
      />
    </div>
    <div>
      <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px', color: 'var(--color-text-muted)' }}>
        Application Secret {status.hasAppCredentials && <span style={{ color: 'green' }}>(saved — enter new value to replace)</span>}
      </label>
      <input
        type="password"
        value={appSecret}
        onChange={e => { setAppSecret(e.target.value); setCredSaved(false) }}
        placeholder={status.hasAppCredentials ? '••••••••' : 'sq0csp-...'}
        style={{ width: '100%', padding: '8px 10px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: '4px', minHeight: '40px', boxSizing: 'border-box' }}
      />
    </div>
    <div>
      <label style={{ fontSize: '13px', display: 'block', marginBottom: '4px', color: 'var(--color-text-muted)' }}>
        Environment
      </label>
      <select
        value={environment}
        onChange={e => { setEnvironment(e.target.value); setCredSaved(false) }}
        style={{ width: '100%', padding: '8px 10px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: '4px', minHeight: '40px' }}
      >
        <option value="sandbox">Sandbox (testing)</option>
        <option value="production">Production</option>
      </select>
    </div>
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <button
        onClick={saveCredentials}
        disabled={credSaving}
        style={{ ...btnStyle, opacity: credSaving ? 0.7 : 1 }}
      >
        {credSaving ? 'Saving…' : 'Save Credentials'}
      </button>
      {credSaved && <span style={{ fontSize: '13px', color: 'green' }}>Saved ✓</span>}
      {credError && <span style={{ fontSize: '13px', color: 'var(--color-error, #c05050)' }}>{credError}</span>}
    </div>
  </div>
</div>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v "__tests__" | grep "error TS"
```

- [ ] **Step 5: Commit**

```bash
git add app/admin/\(dashboard\)/channels/page.tsx components/admin/ChannelsManager.tsx components/admin/SquareChannelCard.tsx
git commit -m "feat: Square credentials form in Channels admin UI"
```

---

### Task 7: Push and verify

- [ ] **Step 1: Push to main**

```bash
git push
```

- [ ] **Step 2: Wait for Vercel build to complete**

```bash
npx vercel ls 2>/dev/null | head -1
# Then:
npx vercel inspect <deployment-url> 2>&1 | grep status
```

Expected: `● Ready`

- [ ] **Step 3: Manually test the flow**

1. Go to `https://purple-acorns-creations.vercel.app/admin/channels`
2. Enter App ID, Secret, and set Environment → click "Save Credentials"
3. Verify "✓ Configured" appears
4. Click "Connect Square" — should redirect to Square OAuth (no longer returns `{"error":"Square not configured"}`)

- [ ] **Step 4: Apply migration in production Supabase**

Run `017_square_app_credentials.sql` in the Supabase dashboard SQL editor for the production project.
