# Terraform + Database Backup Design

## Goal

Full infrastructure-as-code for the Supabase backend, plus an on-demand database backup script that can be scheduled via cron on any machine.

## Scope

**In scope:**
- Terraform provisioning of a Supabase project from scratch (destroy + recreate = identical project)
- Auth configuration: signups disabled, Google OAuth provider
- Database schema and RLS policies applied via `psql`
- On-demand backup script with `--setup-cron` support
- Backups: non-sensitive data committed to git, settings dumped to gitignored file

**Out of scope:**
- Vercel deployment (handled via GitHub push to main)
- Terraform remote state (local tfstate, user's responsibility to keep safe)
- Automated scheduling (script provides `--setup-cron` to install crontab entry)

## Architecture

### Terraform (`infra/`)

Two providers:
- `supabase/supabase` — project creation and auth configuration (signups, Google OAuth, JWT expiry)
- Schema applied via `null_resource` + `local-exec` running `psql` against the new project's DB

State stored locally in `infra/terraform.tfstate` (gitignored). No remote backend.

Secrets in `infra/terraform.tfvars` (gitignored). A `terraform.tfvars.example` with placeholders is committed.

### Backup Script (`scripts/backup.sh`)

Standalone bash script. Reads `DATABASE_URL` from env or `.env.local`. Two modes:
- Default: dumps to `backups/` in the project root
- `--setup-cron <schedule> [output-dir]`: installs a crontab entry

Non-sensitive tables (`content`, `events`, `gallery`, `featured_products`) → `data.sql` (committed).
Settings table → `settings.sql` (gitignored, contains API keys).

When writing to a custom output dir (e.g. iCloud), files are timestamped so history accumulates.

## Files

```
infra/
  providers.tf          # required_providers, provider config
  variables.tf          # all input variable declarations
  main.tf               # supabase_project resource
  auth.tf               # supabase_settings (signups, Google OAuth, JWT)
  schema.tf             # null_resource + local-exec to run schema.sql via psql
  schema.sql            # idempotent version of 001_initial_schema.sql
  outputs.tf            # supabase_url, anon_key, service_role_key, database_url
  terraform.tfvars.example  # placeholder values, committed to git
  .terraform.lock.hcl   # provider lock file, committed
  terraform.tfstate     # local state — gitignored
  terraform.tfvars      # secrets — gitignored

backups/
  .gitkeep              # keeps directory in git
  data.sql              # non-sensitive table dump — committed
  settings.sql          # settings dump — gitignored

scripts/
  backup.sh             # updated: on-demand backup + --setup-cron

.gitignore              # updated: add terraform and backup entries
```

## Variables

| Variable | Description |
|---|---|
| `supabase_access_token` | Supabase account access token (not project key) |
| `supabase_organization_id` | Supabase organization ID |
| `db_password` | PostgreSQL password for the new project |
| `google_client_id` | Google OAuth client ID |
| `google_client_secret` | Google OAuth client secret |
| `site_url` | Production URL (for OAuth redirect allowlist) |
| `admin_emails` | Comma-separated admin emails (written to project description for reference) |

## Outputs

| Output | Description |
|---|---|
| `supabase_url` | `https://<project-ref>.supabase.co` |
| `anon_key` | Supabase anon/public key (sensitive) |
| `service_role_key` | Supabase service role key (sensitive) |
| `database_url` | PostgreSQL connection string (sensitive) |

## Security Notes

- `terraform.tfvars` is gitignored — never committed
- `terraform.tfstate` is gitignored — contains sensitive outputs; keep it backed up separately
- `backups/settings.sql` is gitignored — contains API keys
- Run `terraform output -json` to retrieve sensitive values after apply
