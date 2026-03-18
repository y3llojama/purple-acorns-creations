# Terraform + Database Backup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full Supabase IaC via Terraform (destroy+recreate yields identical project) plus an on-demand backup script with optional cron setup.

**Architecture:** `supabase/supabase` provider manages the project and auth config; `null_resource` + `psql` applies the schema SQL; `scripts/backup.sh` dumps data to configurable output path with optional crontab installation.

**Tech Stack:** Terraform 1.6+, `supabase/supabase` provider ~1.0, bash, `pg_dump`/`psql`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `.gitignore` | Modify | Add terraform + backup gitignore entries |
| `infra/providers.tf` | Create | `required_providers` + provider config |
| `infra/variables.tf` | Create | All input variable declarations |
| `infra/main.tf` | Create | `supabase_project` resource |
| `infra/auth.tf` | Create | `supabase_settings` — signups disabled, Google OAuth |
| `infra/schema.tf` | Create | `null_resource` + `local-exec` to run schema via psql |
| `infra/schema.sql` | Create | Idempotent schema (IF NOT EXISTS, ON CONFLICT DO NOTHING) |
| `infra/outputs.tf` | Create | Project URL, keys, DB URL |
| `infra/terraform.tfvars.example` | Create | Placeholder values (committed) |
| `backups/.gitkeep` | Create | Keeps directory in git |
| `scripts/backup.sh` | Replace | On-demand backup + `--setup-cron` |

---

### Task 1: Update .gitignore and scaffold directories

**Files:**
- Modify: `.gitignore`
- Create: `backups/.gitkeep`
- Create: `infra/` (directory)

- [ ] **Step 1: Add terraform and backup entries to .gitignore**

Append to `.gitignore`:
```
# Terraform
infra/.terraform/
infra/terraform.tfstate
infra/terraform.tfstate.backup
infra/*.tfvars
infra/.terraform.lock.hcl

# Backups
backups/settings.sql
```

Note: `.terraform.lock.hcl` is committed (provider lock file). Do NOT gitignore it — the above pattern is wrong. Only ignore `infra/*.tfvars` (secrets) and `infra/terraform.tfstate*` and `infra/.terraform/`.

Correct additions to `.gitignore`:
```
# Terraform
infra/.terraform/
infra/terraform.tfstate
infra/terraform.tfstate.backup
infra/*.tfvars

# Backups — settings contains API keys, never commit
backups/settings.sql
```

- [ ] **Step 2: Create backups directory with .gitkeep**

```bash
mkdir -p backups
touch backups/.gitkeep
```

- [ ] **Step 3: Create infra directory**

```bash
mkdir -p infra
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore backups/.gitkeep
git commit -m "chore: scaffold infra/ and backups/, update .gitignore"
```

---

### Task 2: Terraform provider configuration

**Files:**
- Create: `infra/providers.tf`
- Create: `infra/variables.tf`
- Create: `infra/terraform.tfvars.example`

- [ ] **Step 1: Create `infra/providers.tf`**

```hcl
terraform {
  required_version = ">= 1.6"

  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
  }
}

provider "supabase" {
  access_token = var.supabase_access_token
}
```

- [ ] **Step 2: Create `infra/variables.tf`**

```hcl
variable "supabase_access_token" {
  description = "Supabase account access token — generate at Supabase dashboard > Account > Access Tokens"
  type        = string
  sensitive   = true
}

variable "supabase_organization_id" {
  description = "Supabase organization ID — found at Supabase dashboard > Organization Settings > General"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL password for the Supabase project database"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID — Google Cloud Console > APIs & Services > Credentials"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
}

variable "site_url" {
  description = "Production site URL (e.g. https://purple-acorns.vercel.app) — used for OAuth redirect allowlist"
  type        = string
  default     = "http://localhost:3000"
}
```

- [ ] **Step 3: Create `infra/terraform.tfvars.example`**

```hcl
# Copy this file to terraform.tfvars and fill in real values.
# terraform.tfvars is gitignored — never commit it.

supabase_access_token    = "sbp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
supabase_organization_id = "org_xxxxxxxxxxxxxxxxxxxx"
db_password              = "a-very-strong-password-here"
google_client_id         = "xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
google_client_secret     = "GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
site_url                 = "https://your-project.vercel.app"
```

- [ ] **Step 4: Initialize Terraform to verify providers resolve**

```bash
cd infra
terraform init
```

Expected: "Terraform has been successfully initialized!" and `.terraform.lock.hcl` created.

- [ ] **Step 5: Commit**

```bash
cd ..
git add infra/providers.tf infra/variables.tf infra/terraform.tfvars.example infra/.terraform.lock.hcl
git commit -m "feat(infra): add terraform provider config and variable declarations"
```

---

### Task 3: Supabase project resource

**Files:**
- Create: `infra/main.tf`

- [ ] **Step 1: Create `infra/main.tf`**

```hcl
resource "supabase_project" "main" {
  organization_id   = var.supabase_organization_id
  name              = "purple-acorns-creations"
  database_password = var.db_password
  region            = "us-east-1"

  lifecycle {
    # Prevent accidental destroy — must pass -target or explicit destroy
    prevent_destroy = false
  }
}

locals {
  project_ref = supabase_project.main.id
  db_url      = "postgresql://postgres:${var.db_password}@db.${local.project_ref}.supabase.co:5432/postgres"
}
```

- [ ] **Step 2: Verify plan shows only the project resource**

```bash
cd infra
# Requires terraform.tfvars to exist with real values
terraform plan
```

Expected: `Plan: 1 to add, 0 to change, 0 to destroy.` (just the project)

- [ ] **Step 3: Commit**

```bash
cd ..
git add infra/main.tf
git commit -m "feat(infra): add supabase_project resource"
```

---

### Task 4: Auth configuration

**Files:**
- Create: `infra/auth.tf`

- [ ] **Step 1: Create `infra/auth.tf`**

```hcl
resource "supabase_settings" "auth" {
  project_ref = local.project_ref

  auth = jsonencode({
    site_url       = var.site_url
    disable_signup = true
    jwt_exp        = 3600

    # Allow OAuth redirects from both localhost and production
    uri_allow_list = "http://localhost:3000/**,${var.site_url}/**"

    # Google OAuth provider
    external_google_enabled       = true
    external_google_client_id     = var.google_client_id
    external_google_secret        = var.google_client_secret
    external_google_redirect_uri  = "https://${local.project_ref}.supabase.co/auth/v1/callback"
  })

  depends_on = [supabase_project.main]
}
```

- [ ] **Step 2: Verify plan shows auth settings resource**

```bash
cd infra
terraform plan
```

Expected: `Plan: 2 to add, 0 to change, 0 to destroy.` (project + auth settings)

- [ ] **Step 3: Commit**

```bash
cd ..
git add infra/auth.tf
git commit -m "feat(infra): add auth settings — disable signup, configure Google OAuth"
```

---

### Task 5: Idempotent schema SQL + null_resource

**Files:**
- Create: `infra/schema.sql`
- Create: `infra/schema.tf`

- [ ] **Step 1: Create `infra/schema.sql`**

This is the idempotent version of `supabase/migrations/001_initial_schema.sql`.
Use `CREATE TABLE IF NOT EXISTS` and `INSERT ... ON CONFLICT DO NOTHING`:

```sql
-- Settings (single row)
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  theme text not null default 'warm-artisan' check (theme in ('warm-artisan', 'soft-botanical')),
  logo_url text,
  square_store_url text,
  contact_email text,
  mailchimp_api_key text,
  mailchimp_audience_id text,
  ai_provider text check (ai_provider in ('claude', 'openai', 'groq')),
  announcement_enabled boolean not null default false,
  announcement_text text,
  announcement_link_url text,
  announcement_link_label text,
  social_instagram text default 'purpleacornz',
  social_facebook text,
  social_tiktok text,
  social_pinterest text,
  social_x text,
  behold_widget_id text,
  updated_at timestamptz default now()
);
insert into settings (id) values (gen_random_uuid())
  on conflict do nothing;

-- Events
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  time text,
  location text not null,
  description text,
  link_url text,
  link_label text,
  created_at timestamptz default now()
);

-- Gallery
create table if not exists gallery (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  alt_text text not null,
  category text check (category in ('rings','necklaces','earrings','bracelets','crochet','other')),
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

-- Featured products
create table if not exists featured_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10,2) not null,
  description text,
  image_url text not null,
  square_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

-- Content key-value store
create table if not exists content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz default now()
);

-- Seed default content keys
insert into content (key, value) values
  ('hero_tagline', 'Handcrafted with intention, worn with joy.'),
  ('hero_subtext', 'Crochet jewelry, sterling silver, and artisan pieces made with love by a mother-daughter duo in Brooklyn, NY.'),
  ('story_teaser', 'We are Purple Acorns Creations — a mother and daughter who share a passion for making things by hand.'),
  ('story_full', '<p>Our story begins at the kitchen table...</p><p>Add your full story here via the admin panel.</p>'),
  ('privacy_policy', '<h1>Privacy Policy</h1><p>Add your privacy policy here via the admin panel.</p>'),
  ('terms_of_service', '<h1>Terms of Service</h1><p>Add your terms of service here via the admin panel.</p>')
on conflict (key) do nothing;

-- RLS
alter table settings enable row level security;
alter table events enable row level security;
alter table gallery enable row level security;
alter table featured_products enable row level security;
alter table content enable row level security;

-- Public read policies (safe tables only — settings excluded)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'events' and policyname = 'Public read events'
  ) then
    execute 'create policy "Public read events" on events for select using (true)';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'gallery' and policyname = 'Public read gallery'
  ) then
    execute 'create policy "Public read gallery" on gallery for select using (true)';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'featured_products' and policyname = 'Public read products'
  ) then
    execute 'create policy "Public read products" on featured_products for select using (true)';
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'content' and policyname = 'Public read content'
  ) then
    execute 'create policy "Public read content" on content for select using (true)';
  end if;
end $$;
```

- [ ] **Step 2: Create `infra/schema.tf`**

```hcl
resource "null_resource" "schema" {
  # Re-run if the schema SQL changes
  triggers = {
    schema_hash = filemd5("${path.module}/schema.sql")
    project_id  = local.project_ref
  }

  provisioner "local-exec" {
    command = "psql '${local.db_url}' -f '${path.module}/schema.sql'"
  }

  depends_on = [supabase_project.main]
}
```

- [ ] **Step 3: Verify plan shows schema null_resource**

```bash
cd infra
terraform plan
```

Expected: `Plan: 3 to add, 0 to change, 0 to destroy.`

- [ ] **Step 4: Commit**

```bash
cd ..
git add infra/schema.sql infra/schema.tf
git commit -m "feat(infra): add idempotent schema SQL and null_resource to apply via psql"
```

---

### Task 6: Outputs

**Files:**
- Create: `infra/outputs.tf`

- [ ] **Step 1: Create `infra/outputs.tf`**

```hcl
output "supabase_url" {
  description = "Supabase project URL — use as NEXT_PUBLIC_SUPABASE_URL"
  value       = "https://${local.project_ref}.supabase.co"
}

output "anon_key" {
  description = "Supabase anon/public key — use as NEXT_PUBLIC_SUPABASE_ANON_KEY"
  value       = supabase_project.main.anon_key
  sensitive   = true
}

output "service_role_key" {
  description = "Supabase service role key — use as SUPABASE_SERVICE_ROLE_KEY (server-only)"
  value       = supabase_project.main.service_role_key
  sensitive   = true
}

output "database_url" {
  description = "PostgreSQL connection string — use as DATABASE_URL for backups"
  value       = local.db_url
  sensitive   = true
}

output "env_local_snippet" {
  description = "Copy-paste block for .env.local"
  value       = <<-EOT
    NEXT_PUBLIC_SUPABASE_URL=https://${local.project_ref}.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabase_project.main.anon_key}
    SUPABASE_SERVICE_ROLE_KEY=${supabase_project.main.service_role_key}
    DATABASE_URL=${local.db_url}
  EOT
  sensitive   = true
}
```

- [ ] **Step 2: Commit**

```bash
git add infra/outputs.tf
git commit -m "feat(infra): add terraform outputs for env vars and connection strings"
```

---

### Task 7: Backup script

**Files:**
- Replace: `scripts/backup.sh`

- [ ] **Step 1: Write `scripts/backup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_OUTPUT_DIR="$PROJECT_ROOT/backups"

# --- Parse arguments ---
SETUP_CRON=false
CRON_SCHEDULE=""
OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --setup-cron)
      SETUP_CRON=true
      CRON_SCHEDULE="${2:-0 2 * * *}"
      shift 2
      ;;
    -*)
      echo "Unknown option: $1"
      echo "Usage: backup.sh [--setup-cron \"<schedule>\"] [output-dir]"
      exit 1
      ;;
    *)
      OUTPUT_DIR="$1"
      shift
      ;;
  esac
done

# --- Load DATABASE_URL ---
if [[ -z "${DATABASE_URL:-}" ]]; then
  ENV_FILE="$PROJECT_ROOT/.env.local"
  if [[ -f "$ENV_FILE" ]]; then
    DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' || true)
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "  Add DATABASE_URL=<connection-string> to .env.local, or export it before running."
  echo "  Get the connection string from: terraform output -raw database_url"
  exit 1
fi

# --- Setup cron ---
if [[ "$SETUP_CRON" == true ]]; then
  CRON_CMD="DATABASE_URL='$DATABASE_URL' '$SCRIPT_DIR/backup.sh' '$OUTPUT_DIR'"
  CRON_ENTRY="$CRON_SCHEDULE $CRON_CMD"
  echo ""
  echo "Installing cron job:"
  echo "  Schedule : $CRON_SCHEDULE"
  echo "  Output   : $OUTPUT_DIR"
  echo "  Command  : $CRON_CMD"
  echo ""
  read -rp "Confirm? (y/N) " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
  (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
  echo "Cron job installed. Verify with: crontab -l"
  exit 0
fi

# --- Run backup ---
mkdir -p "$OUTPUT_DIR"

# Use timestamped filenames when writing outside the default backups/ dir
# (so history accumulates, e.g. on iCloud Drive)
if [[ "$OUTPUT_DIR" == "$DEFAULT_OUTPUT_DIR" ]]; then
  DATA_FILE="$OUTPUT_DIR/data.sql"
  SETTINGS_FILE="$OUTPUT_DIR/settings.sql"
else
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  DATA_FILE="$OUTPUT_DIR/data_${TIMESTAMP}.sql"
  SETTINGS_FILE="$OUTPUT_DIR/settings_${TIMESTAMP}.sql"
fi

echo "Backing up database to $OUTPUT_DIR ..."

# Non-sensitive tables — safe to commit to git
pg_dump "$DATABASE_URL" \
  --table=content \
  --table=events \
  --table=gallery \
  --table=featured_products \
  --no-owner \
  --no-acl \
  --data-only \
  --column-inserts \
  > "$DATA_FILE"
echo "  Data     : $DATA_FILE"

# Settings table — contains API keys, gitignored
pg_dump "$DATABASE_URL" \
  --table=settings \
  --no-owner \
  --no-acl \
  --data-only \
  --column-inserts \
  > "$SETTINGS_FILE"
echo "  Settings : $SETTINGS_FILE"

echo "Done."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/backup.sh
```

- [ ] **Step 3: Test with a dry run (no real DB needed to test argument parsing)**

```bash
# Should fail with a clear error message about DATABASE_URL
./scripts/backup.sh 2>&1 | grep "DATABASE_URL"
```

Expected output: `ERROR: DATABASE_URL is not set.`

- [ ] **Step 4: Test --setup-cron argument parsing (abort at confirm prompt)**

```bash
DATABASE_URL="postgresql://test:test@localhost/test" \
  ./scripts/backup.sh --setup-cron "0 2 * * *" /tmp/test-backup <<< "n"
```

Expected: `Aborted.`

- [ ] **Step 5: Commit**

```bash
git add scripts/backup.sh backups/.gitkeep
git commit -m "feat: add database backup script with --setup-cron support"
```

---

### Task 8: Add DATABASE_URL to .env.example and .env.local

**Files:**
- Modify: `.env.example`
- Modify: `.env.local`

- [ ] **Step 1: Add DATABASE_URL to `.env.example`**

Add after `SUPABASE_SERVICE_ROLE_KEY`:
```
# PostgreSQL connection string — get from: terraform output -raw database_url
DATABASE_URL=
```

- [ ] **Step 2: Add DATABASE_URL placeholder to `.env.local`**

Add after `SUPABASE_SERVICE_ROLE_KEY`:
```
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add DATABASE_URL to .env.example for backup script"
```

---

## End-to-End Verification

After all tasks complete, verify the full flow:

```bash
# 1. Create terraform.tfvars with real credentials
cp infra/terraform.tfvars.example infra/terraform.tfvars
# (edit with real values)

# 2. Apply infrastructure
cd infra
terraform init
terraform apply
cd ..

# 3. Copy outputs to .env.local
# terraform output env_local_snippet  (sensitive — pipe to pbcopy or view carefully)

# 4. Run backup
./scripts/backup.sh

# 5. Verify backup files
ls -la backups/
# Expected: data.sql and settings.sql present

# 6. Verify data.sql is not empty
head backups/data.sql
# Expected: SQL INSERT statements for content table
```
