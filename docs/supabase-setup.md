# Supabase Google OAuth Setup

These are one-time manual steps in the Supabase dashboard.

## 1. Enable Google Provider

- Supabase dashboard → Authentication → Providers → Google
- Toggle **Enable Google provider** on
- Paste your **Google OAuth Client ID** and **Client Secret**
  (obtain from Google Cloud Console → APIs & Services → Credentials)
- Save

## 2. Pre-register Admin Users

- Auth → Users → **Invite user**
- Invite each authorized admin email address
- Only invited users will be able to sign in

## 3. Disable Public Signups

- Auth → Settings → **Allow new users to sign up** → toggle OFF
- This ensures no new accounts can self-register; only pre-invited admins can authenticate

## 4. Set Environment Variables

Add to `.env.local` (never commit this file):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
ADMIN_EMAILS=admin@yourdomain.com,owner@yourdomain.com
```

## Security Layers

1. Supabase: signups disabled, only invited users can authenticate
2. Middleware (`middleware.ts`): `getUser()` verifies JWT server-side on every `/admin/*` request
3. `ADMIN_EMAILS` env var: explicit allowlist as a third layer — even a valid Supabase user is rejected if their email isn't in the list
