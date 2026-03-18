# Purple Acorns Creations

Website for Purple Acorns Creations — a handmade jewellery and crochet shop. Built with Next.js 15, Supabase, and deployed on Vercel.

---

## Table of Contents

- [Stack](#stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [First-Time Setup](#first-time-setup)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Admin Authentication](#admin-authentication)
- [Supabase Infrastructure (Terraform)](#supabase-infrastructure-terraform)
- [Database Backups](#database-backups)
- [Deployment](#deployment)
- [Theming](#theming)
- [Security](#security)

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router, TypeScript |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Styling | CSS custom properties — no Tailwind |
| Testing | Jest + React Testing Library |
| Hosting | Vercel (auto-deploy on push to `main`) |
| Infrastructure | Terraform (`supabase/supabase` + `hashicorp/postgresql` providers) |

---

## Project Structure

```
app/                  # Next.js pages and API routes
  admin/              # Admin dashboard (auth-protected)
  api/                # API routes (auth, contact, newsletter, CRUD)
components/           # React components
  home/               # Homepage section components
  admin/              # Admin UI components
  layout/             # Header, Footer, AnnouncementBanner
  ui/                 # Button, FormField primitives
lib/                  # Core utilities
  auth.ts             # requireAdminSession() — call on all admin API routes
  sanitize.ts         # sanitizeContent(), sanitizeText()
  validate.ts         # isValidEmail(), isValidHttpsUrl()
  cors.ts             # Runtime CORS handling
  supabase/           # server.ts (service role), client.ts (anon), types.ts
infra/                # Terraform — full Supabase IaC
backups/              # Database backups (data.sql committed; settings.sql gitignored)
scripts/              # Automation scripts
supabase/migrations/  # SQL schema
docs/                 # Setup guides and design docs
```

---

## Prerequisites

- Node.js 20+
- `pg_dump` / `psql` (for database backups) — install via `brew install postgresql`
- Terraform 1.6+ (for infrastructure) — install via `brew install terraform`
- A Supabase account and project
- A Google Cloud project with OAuth credentials (for admin login)

---

## First-Time Setup

```bash
# Install dependencies and copy .env.example -> .env.local
./scripts/setup.sh
```

Then fill in the required values in `.env.local` (see [Environment Variables](#environment-variables)).

---

## Environment Variables

Copy `.env.example` to `.env.local` and populate:

```bash
cp .env.example .env.local
```

| Variable | Description | Where to find it |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | App URL (`http://localhost:3000` for dev) | — |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | Supabase dashboard → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | Supabase dashboard → Project Settings → API |
| `ADMIN_EMAILS` | Comma-separated admin Gmail addresses | Your choice |
| `ANTHROPIC_API_KEY` | Anthropic API key (Phase 2 — leave blank) | console.anthropic.com |

> **Never commit `.env.local`** — it is gitignored. Never put real credentials in `.env.example`.

---

## Development

```bash
./scripts/dev.sh        # Start dev server at http://localhost:3000
./scripts/build.sh      # Production build (verify before deploying)
./scripts/test.sh       # Run all tests
./scripts/test.sh --watch               # Watch mode
./scripts/test.sh path/to/test.ts       # Single file
```

---

## Testing

Jest with `ts-jest` and `jsdom`. Test files live in `__tests__/`.

```bash
./scripts/test.sh
```

Key config notes:
- `@/` path aliases resolved via `moduleNameMapper` in `jest.config.js`
- Env vars injected via `jest.setup.env.js` (not `testEnvironmentOptions.env` — ignored by jsdom)
- `ADMIN_EMAILS` must be set for middleware tests to pass

---

## Admin Authentication

Admin login uses Google OAuth via Supabase. Three security layers:

1. **Supabase signups disabled** — only pre-invited users can authenticate
2. **Middleware JWT verification** — `getUser()` verifies the JWT server-side on every `/admin/*` request
3. **`ADMIN_EMAILS` allowlist** — even a valid Supabase session is rejected if the email is not in the env var

### One-Time Supabase Dashboard Setup

1. **Enable Google provider**
   - Authentication → Providers → Google
   - Toggle on, paste Google OAuth Client ID + Secret
   - Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`

2. **Invite admin users**
   - Authentication → Users → Invite user
   - Invite each admin Gmail address

3. **Disable public signups**
   - Authentication → Settings → Allow new users to sign up → **OFF**

4. **Google Cloud Console**
   - APIs & Services → Credentials → OAuth 2.0 Client
   - Add authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
   - Add `http://localhost:3000` to authorized JavaScript origins (for local dev)

See `docs/supabase-setup.md` for full detail.

### Smoke Test

```bash
./scripts/check-auth.sh
```

---

## Supabase Infrastructure (Terraform)

The `infra/` directory contains full Terraform configuration to provision and configure a Supabase project from scratch. Use this to recreate the entire backend with a single command.

### What Terraform manages

- Supabase project creation (name, region, DB password)
- Auth settings: signups disabled, JWT config
- Google OAuth provider configuration
- All database tables and RLS policies (applied via `psql` using `infra/schema.sql`)
- Initial content seed data

### Provider note

The `supabase/supabase` Terraform provider (v1.x) does **not** expose `anon_key` or `service_role_key` as resource outputs. After `terraform apply`, retrieve these two values manually from the Supabase dashboard → Project Settings → API.

### Setup

1. **Install Terraform**
   ```bash
   brew install terraform
   ```

2. **Get a Supabase access token**
   - Supabase dashboard → Account → Access Tokens → Generate new token

3. **Get your organization ID**
   - Supabase dashboard → Organization Settings → General → Organization ID

4. **Create `infra/terraform.tfvars`** (gitignored — never commit this)
   ```hcl
   supabase_access_token    = "sbp_..."
   supabase_organization_id = "org_..."
   db_password              = "a-strong-password"
   google_client_id         = "....apps.googleusercontent.com"
   google_client_secret     = "GOCSPX-..."
   site_url                 = "https://your-project.vercel.app"
   ```

5. **Initialize and apply**
   ```bash
   cd infra
   terraform init
   terraform plan
   terraform apply
   ```

6. **Update `.env.local`** — two sources:
   ```bash
   # From Terraform outputs
   cd infra && terraform output -raw database_url   # → DATABASE_URL
   terraform output supabase_url                    # → NEXT_PUBLIC_SUPABASE_URL

   # From Supabase dashboard → Project Settings → API
   # Copy anon public key  → NEXT_PUBLIC_SUPABASE_ANON_KEY
   # Copy service_role key → SUPABASE_SERVICE_ROLE_KEY
   ```

### Recreating from scratch

```bash
cd infra
terraform destroy    # tears down the Supabase project
terraform apply      # recreates everything fresh
```

> State is stored locally in `infra/terraform.tfstate` — keep this file safe. It is gitignored.

---

## Database Backups

`scripts/backup.sh` dumps the database to SQL files.

### What gets backed up

| File | Contents | Git |
|---|---|---|
| `backups/data.sql` | `content`, `events`, `gallery`, `featured_products` | Committed |
| `backups/settings.sql` | `settings` table (contains API keys) | Gitignored |

### Usage

```bash
# Backup to backups/ (default)
./scripts/backup.sh

# Backup to a specific directory (e.g. iCloud Drive)
./scripts/backup.sh ~/Library/Mobile\ Documents/com~apple~CloudDocs/purple-acorns-backups/

# Install a cron job on the current machine
./scripts/backup.sh --setup-cron "0 2 * * *" ~/backups/purple-acorns
```

The `--setup-cron` option adds an entry to `crontab` with the given schedule (standard cron syntax). Use this on your always-on machine to schedule automatic backups.

### Restore

```bash
psql $DATABASE_URL < backups/data.sql
psql $DATABASE_URL < backups/settings.sql   # if available
```

### Required env var

`DATABASE_URL` must be set (Supabase connection string). Find it in:
Supabase dashboard → Project Settings → Database → Connection string (URI mode)

---

## Deployment

Deployment is via **Vercel + GitHub**. Pushing to `main` triggers an automatic deploy.

### First-time Vercel setup

1. Connect the GitHub repo in the Vercel dashboard
2. Add all environment variables from `.env.local` in Vercel → Project → Settings → Environment Variables
3. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://purple-acorns.vercel.app`)
4. Update Google OAuth authorized redirect URIs in Google Cloud Console to include your Vercel domain

### Verify before pushing

```bash
./scripts/build.sh    # must pass with zero errors
./scripts/test.sh     # must pass
```

---

## Theming

Two themes: `warm-artisan` (default) and `soft-botanical`. Controlled via the `data-theme` attribute on `<html>`.

- All colours defined as CSS custom properties in `app/globals.css`
- No hardcoded colour values outside `globals.css`
- Toggle available in the admin Branding editor

---

## Security

| Area | Implementation |
|---|---|
| Server-side auth | Always `getUser()` — never `getSession()` (does not verify JWT) |
| Admin routes | `requireAdminSession()` in `lib/auth.ts` — call on every admin API route |
| HTML rendering | `sanitizeContent()` / `sanitizeText()` from `lib/sanitize.ts` before all HTML injection |
| External URLs | `isValidHttpsUrl()` from `lib/validate.ts` before use as `href` or `src` |
| External links | Always `rel="noopener noreferrer" target="_blank"` |
| CORS | Runtime validation in `lib/cors.ts` — not static headers |
| Rate limiting | In-memory 60s/IP window on all public API routes |
| Security headers | CSP, X-Frame-Options, etc. set in `next.config.js` |
| Secrets | Never commit `.env.local`, `terraform.tfvars`, or `backups/settings.sql` |
