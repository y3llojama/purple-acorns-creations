# Purple Acorns Creations

Website for Purple Acorns Creations — a handmade jewellery and crochet shop. Built with Next.js 15, Supabase, and deployed on Vercel.

---

## Table of Contents

- [Pre-Launch Checklist](#pre-launch-checklist)
- [Flipping Square to Production](#8-flip-square-from-sandbox-to-production)
- [Stack](#stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [First-Time Setup](#first-time-setup)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Admin Authentication](#admin-authentication)
- [Newsletter](#newsletter)
- [Email (Contact Notifications & Replies)](#email-contact-notifications--replies)
- [Supabase Infrastructure (Terraform)](#supabase-infrastructure-terraform)
- [Database Backups](#database-backups)
- [Deployment](#deployment)
- [Theming](#theming)
- [Template Variables](#template-variables)
- [Security](#security)

---

## Pre-Launch Checklist

Everything the code cannot do for you. Complete these in order before going live.

### 1. Google Cloud Console — Create OAuth credentials

> Needed for admin login via Google.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://your-project.vercel.app`
4. Add authorized redirect URIs:
   - `https://jfovputrcntthmesmjmh.supabase.co/auth/v1/callback`
   - `https://your-project.vercel.app/api/auth/callback`
5. Save — note the **Client ID** and **Client Secret**

---

### 2. Supabase Dashboard — Configure auth

> One-time setup at [supabase.com/dashboard](https://supabase.com/dashboard) → project `jfovputrcntthmesmjmh`.

- **Authentication → Providers → Google**
  - Toggle Google on
  - Paste Client ID and Client Secret from step 1
  - Save

- **Authentication → Users → Invite user**
  - Invite your admin Gmail address (the one you'll sign in with)

- **Authentication → Settings**
  - Turn off **Allow new users to sign up**

- **Project Settings → API**
  - Copy **anon public** key → needed for `.env.local`
  - Copy **service_role** key → needed for `.env.local`

---

### 3. Fill in `.env.local`

```bash
# Already set:
NEXT_PUBLIC_SUPABASE_URL=https://jfovputrcntthmesmjmh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Dj3phbLfgTnbBsDKINg5Xw_q2FPSrsl

# Still needed:
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase dashboard>
ADMIN_EMAILS=<your admin Gmail address>
DATABASE_URL=postgresql://postgres:<db-password>@db.jfovputrcntthmesmjmh.supabase.co:5432/postgres
```

---

### 4. Run the database schema

> Only needed if you're using the existing Supabase project (not Terraform).

```bash
psql "postgresql://postgres:<db-password>@db.jfovputrcntthmesmjmh.supabase.co:5432/postgres" \
  -f supabase/migrations/001_initial_schema.sql
```

Get the DB password from Supabase dashboard → Project Settings → Database → Database password.

---

### 5. Verify locally

```bash
./scripts/setup.sh   # install deps (skip if already done)
./scripts/dev.sh     # start dev server
./scripts/check-auth.sh  # smoke test admin auth flow
```

---

### 6. Deploy to Vercel

1. Push repo to GitHub
2. Connect repo at [vercel.com/new](https://vercel.com/new)
3. Add all `.env.local` values as environment variables in Vercel → Project → Settings → Environment Variables
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://purple-acorns.vercel.app`)
5. Add the Vercel domain to Google Cloud Console authorized origins and redirect URIs (step 1)
6. Trigger a deploy — push to `main` or click "Redeploy"

---

### 7. Cloudflare Email Worker + Resend inbound (customer reply capture)

> Lets customer replies to admin emails appear in the admin messages thread.

1. **Verify domain in Resend** — Domains → Add `purpleacornz.com` → add DKIM/SPF DNS records in Cloudflare
2. **Enable Resend inbound** — Domains → `purpleacornz.com` → Receiving → set webhook URL to `https://purpleacornz.com/api/webhooks/resend-inbound` → copy Signing Secret
3. **Add env vars** — add `RESEND_WEBHOOK_SECRET` to `.env.local` and Vercel
4. **Deploy Cloudflare Worker**
   ```bash
   CLOUDFLARE_API_TOKEN=<token> bash scripts/deploy-cf-worker.sh
   ```
   Get token: Cloudflare → My Profile → API Tokens → Create Token (Edit Cloudflare Workers template)
5. **Update Cloudflare routing rule** — Email → Email Routing → `hello@purpleacornz.com` → Edit → change action to **Send to a Worker** → select `purple-acorns-email-forwarder`
6. **Configure in admin** — Admin → Integrations → set Resend API Key, Messages From Email (`hello@purpleacornz.com`), and Reply Email Footer

See [Email (Contact Notifications & Replies)](#email-contact-notifications--replies) for full details.

---

### 8. Flip Square from Sandbox to Production

> Complete steps 8a–8e in order. The app stays in sandbox mode until all env vars are updated.

#### 8a. Square Developer Dashboard — create production credentials

1. Go to [developer.squareup.com](https://developer.squareup.com) → your app → **Production** tab
2. Copy **Production Application ID** and **Production Access Token**
3. Copy your **Production Location ID** (Locations → your location)

#### 8b. Register the production webhook

1. Square Developer Dashboard → your app → **Production** → **Webhooks**
2. Add endpoint: `https://purpleacornz.com/api/webhooks/square`
3. Subscribe to events:
   - `inventory.count.updated`
   - `catalog.version.updated`
4. Copy the **Webhook Signature Key** shown after saving

#### 8c. Update environment variables

In both `.env.local` and Vercel → Environment Variables:

```bash
SQUARE_ENVIRONMENT=production
SQUARE_APPLICATION_ID=<production app ID from 8a>
SQUARE_APPLICATION_SECRET=<production app secret from Square dashboard>
SQUARE_WEBHOOK_SIGNATURE_KEY=<webhook signature key from 8b>
SQUARE_WEBHOOK_URL=https://purpleacornz.com/api/webhooks/square
NEXT_PUBLIC_SQUARE_APPLICATION_ID=<production app ID from 8a>
NEXT_PUBLIC_SQUARE_LOCATION_ID=<production location ID from 8a>
```

> The `SQUARE_WEBHOOK_URL` must match the URL exactly as registered in the dashboard — Square uses it in the HMAC signature calculation.

#### 8d. Re-connect Square via OAuth (admin UI)

The `square_access_token` stored in the database is a **sandbox** token. You must replace it with a production token:

1. Log in to admin
2. Go to **Integrations → Square**
3. Click **Connect Square** — this runs the OAuth flow against production
4. Confirm the location ID shown matches your production location

#### 8e. Verify after deploy

```bash
# Confirm env var is set correctly on Vercel
vercel env ls | grep SQUARE_ENVIRONMENT

# Trigger a test webhook delivery from Square dashboard
# Square Developer → Production → Webhooks → Send test event → inventory.count.updated
# Confirm the admin sync log shows no errors
```

---

### 9. (Optional) Terraform — for full IaC / recreate from scratch

Only needed if you want to be able to `terraform destroy` + `terraform apply` to recreate the entire Supabase project from scratch. See [Supabase Infrastructure (Terraform)](#supabase-infrastructure-terraform).

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
cloudflare/
  email-worker/       # Cloudflare Email Worker — fans out hello@purpleacornz.com to Gmail + Resend
infra/                # Terraform — full Supabase IaC
backups/              # Database backups (JSON archives, gitignored — production data)
scripts/              # Automation scripts (includes deploy-cf-worker.sh)
supabase/migrations/  # SQL schema
docs/                 # Setup guides and design docs
```

---

## Prerequisites

- Node.js 20+
- `curl`, `jq`, `gzip`, `tar` (for database backups) — `jq` via `brew install jq`; rest built into macOS
- `psql` (optional, for bi-monthly restore tests) — install via `brew install libpq`
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
| `RESEND_API_KEY` | Resend API key for newsletter delivery | [resend.com](https://resend.com) |
| `NEWSLETTER_FROM_EMAIL` | Verified sender address | Your verified Resend domain |
| `NEWSLETTER_ADMIN_EMAILS` | Preview recipients (comma-separated) | Your choice |
| `RESEND_WEBHOOK_SECRET` | Webhook signing secret — used for newsletter open/click tracking **and** inbound email replies | Resend dashboard → Domains → Receiving → Signing Secret |
| `CRON_SECRET` | Shared secret for Vercel Cron endpoint | Generate with `openssl rand -hex 32` |
| `AI_API_KEY` | API key for AI draft generation | Depends on provider (see [Newsletter](#newsletter)) |
| `NEXT_PUBLIC_SITE_URL` | Production domain for newsletter links | Your Vercel domain |

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

## Newsletter

The newsletter system uses [Resend](https://resend.com) for delivery, Supabase for subscriber storage, and Vercel Cron for scheduled sends. AI-assisted draft generation supports Claude, OpenAI, and Groq.

See **[docs/newsletter-setup.md](docs/newsletter-setup.md)** for full setup instructions including:
- Required environment variables (`RESEND_API_KEY`, `CRON_SECRET`, `AI_API_KEY`, etc.)
- Resend domain verification and webhook configuration
- Vercel Cron setup
- Admin workflow (Brief → Draft → Edit → Preview → Send)
- Public pages (`/newsletter`, `/newsletter/[slug]`)

---

## Email (Contact Notifications & Replies)

Transactional emails (contact form notifications and admin message replies) use **Resend as primary** with **Gmail SMTP as fallback** if configured. Customer replies to admin emails are captured back into the admin messages thread via Resend inbound.

> **Troubleshooting:** See [docs/email-troubleshooting.md](docs/email-troubleshooting.md) for common issues — Cloudflare bot protection blocking webhooks, signature verification failures, API key permissions, MX record conflicts, and more.

### 1. Verify your domain in Resend

1. [resend.com](https://resend.com) → Domains → Add Domain → `purpleacornz.com`
2. Add the DKIM and SPF DNS records Resend provides to Cloudflare DNS
3. Wait for verification (usually a few minutes)

### 2. Configure Resend inbound

1. Resend dashboard → Domains → `purpleacornz.com` → **Receiving**
2. Enable inbound and set the webhook URL to:
   ```
   https://purpleacornz.com/api/webhooks/resend-inbound
   ```
3. Copy the **Signing Secret** → add to `.env.local` and Vercel:
   ```
   RESEND_WEBHOOK_SECRET=whsec_...
   ```

### 3. Deploy the Cloudflare Email Worker

The Worker fans out `hello@purpleacornz.com` to both Gmail and Resend inbound simultaneously.

```bash
CLOUDFLARE_API_TOKEN=<your-token> bash scripts/deploy-cf-worker.sh
```

Get your API token at Cloudflare dashboard → My Profile → API Tokens → Create Token (use the "Edit Cloudflare Workers" template).

### 4. Update Cloudflare Email Routing rule

1. Cloudflare dashboard → Email → Email Routing → Custom Addresses
2. Find `hello@purpleacornz.com` → **Edit**
3. Change action from "Send to an email" to **Send to a Worker**
4. Select `purple-acorns-email-forwarder`
5. Save

> **Rollback:** if anything breaks, edit the rule back to "Send to an email" → `purpleacornzcreations@gmail.com`.

### 5. Configure email settings in admin

Admin → Integrations → Resend section:
- **Resend API Key** — from [resend.com](https://resend.com) → API Keys
- **From Name** — e.g. `Purple Acorns Creations`
- **Messages From Email** — `hello@purpleacornz.com`
- **Reply Email Footer** — text appended to every admin reply (supports `${CONTACT_FORM}`, `${BUSINESS_NAME}`). Default: directs customers to reply to the thread or use the contact form for new messages.

### 6. (Optional) Use `hello@purpleacornz.com` in iOS Mail

Cloudflare Email Routing is receive-only — it has no IMAP server. To send from `hello@purpleacornz.com` in iOS Mail:

1. Gmail → Settings → Accounts → **Send mail as** → Add `hello@purpleacornz.com`
2. Gmail will send a verification email to `hello@purpleacornz.com` → Cloudflare forwards it to your Gmail → click the link
3. Set it as your default From address
4. Add the Gmail account to iOS Mail (IMAP) — it will send as `hello@purpleacornz.com`

> Replies sent this way bypass Resend and have no message ID — threading in the admin UI falls back to email address matching, which works correctly.

### How inbound threading works

When a customer replies to an admin reply email:
1. Their email arrives at `hello@purpleacornz.com`
2. Cloudflare Worker forwards it to both Gmail (so you see it in your inbox) and Resend inbound
3. Resend calls `/api/webhooks/resend-inbound` with the email metadata
4. The webhook fetches the full email (body + headers) via `resend.emails.receiving.get(email_id)`
5. The `In-Reply-To` header is matched against stored Resend message IDs to find the thread; falls back to matching by sender email address
6. The reply is saved to the thread and marked unread in the admin messages UI

### Provider priority (outbound)

1. **Resend** — used if `resend_api_key` and `messages_from_email` are set in Admin → Integrations
2. **SMTP (Gmail fallback)** — used if Resend is not configured or fails, and SMTP credentials are set

### Testing

Admin → Integrations → **Test SMTP** / **Test Resend** buttons verify connectivity without sending a real email.

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

`scripts/backup.sh` backs up the entire Supabase database via the REST API (PostgREST). No direct database connection or port 5432 access required — it uses the service role key from `infra/terraform.tfvars`.

### How it works

1. **Discovers all tables** via the OpenAPI schema endpoint (minimum 30-table gate)
2. **Fetches every row** from each table using paginated HTTP Range requests
3. **Creates a compressed archive** (`backups/YYYY-MM-DD_HHmmss.json.tar.gz`) with one JSON file per table
4. **Verifies integrity** — SHA-256 checksum, tar structure, content validation, size sanity check
5. **Prunes old backups** — rolling 30-day retention window

### Automated schedule (Mac Mini)

| What | When |
|---|---|
| Full backup | Daily at 5:00 AM via crontab |
| Retention cleanup | Every run — deletes archives older than 30 days |
| Full restore test | 1st and 15th of each month |
| Alerts | [ntfy.sh](https://ntfy.sh) push notifications on failure |

### Usage

```bash
# Run a backup manually
bash scripts/backup.sh

# Run a backup with a full restore test (uses local Docker Postgres)
bash scripts/backup.sh --restore-test

# Install the backup system on a new machine
bash scripts/backup-install.sh
```

### Restore test

On the 1st and 15th of each month (or via `--restore-test`), the script:

1. Starts a local Docker Postgres container
2. Applies all `supabase/migrations/*.sql` in order
3. Truncates all tables, records baseline counts
4. Generates SQL INSERTs from the JSON backup using `jq` and loads them via `psql`
5. Compares restored row counts against the backup — any mismatch fails the test

### What gets backed up

All tables in the Supabase database — `content`, `events`, `gallery`, `products`, `settings`, `newsletter_subscribers`, `messages`, etc. Each table is saved as a separate JSON file inside the compressed archive.

### Files

| Path | Contents | Git |
|---|---|---|
| `backups/*.json.tar.gz` | Compressed JSON archives (one per backup run) | Gitignored |
| `backups/*.json.tar.gz.sha256` | SHA-256 checksums | Gitignored |
| `backups/backup.log` | Backup script output log | Gitignored |

### Credentials

The backup script reads `supabase_service_role_key` from `infra/terraform.tfvars` (gitignored). No `.env.local` or `DATABASE_URL` needed.

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

Four themes: `warm-artisan`, `soft-botanical`, `modern` (default), and `custom`. Controlled via the `data-theme` attribute on `<html>`.

- All colours defined as CSS custom properties in `app/globals.css`
- No hardcoded colour values outside `globals.css`
- Toggle available in the admin Branding editor

---

## Template Variables

Certain admin text fields support `${VARIABLE}` placeholders that are substituted at render time. This means you can write them once and they stay correct even after a business rename or URL change.

### Available variables

| Variable | Expands to | Example output |
|---|---|---|
| `${BUSINESS_NAME}` | The business name from Admin → Branding | `Purple Acorns Creations` |
| `${CONTACT_FORM}` | Full URL to the `/contact` page (uses `NEXT_PUBLIC_APP_URL`) | `https://purple-acorns-creations.vercel.app/contact` |

### Where variables are supported

| Location | Field |
|---|---|
| Admin → Branding | Announcement banner text |
| Admin → Content | Hero tagline, hero subtext, story teaser |
| Admin → Content | Our Story, Privacy Policy, Terms of Service |
| Admin → Messages | Email reply body |

### Usage examples

**Announcement banner**
```
Now booking for spring — reach out at ${CONTACT_FORM}
```

**Our Story (HTML mode)**
```html
<p>Welcome to <strong>${BUSINESS_NAME}</strong>, where every piece tells a story.</p>
<p>Have a question? <a href="${CONTACT_FORM}">Get in touch.</a></p>
```

**Our Story (Markdown mode)**
```markdown
Welcome to **${BUSINESS_NAME}**, where every piece tells a story.

Have a question? Visit ${CONTACT_FORM}.
```

**Email reply**
```
Thanks for reaching out! We'll have your order ready shortly.

— ${BUSINESS_NAME}
```

> **Note:** `${CONTACT_FORM}` in HTML `href` attributes requires `NEXT_PUBLIC_APP_URL` to be set to a full `https://` URL, otherwise the link will be stripped by the HTML sanitizer. Plain-text uses (email body, announcement text) work with any value including `http://localhost:3000`.

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
