# ── Generate secrets ─────────────────────────────────────────────────────────

resource "random_bytes" "oauth_encryption_key" {
  length = 32  # 256-bit AES key
}

# ── Vercel environment variables ──────────────────────────────────────────────
# All target both production and preview so preview deploys work correctly.
# Sensitive vars use sensitive = true so they don't appear in plan output.

locals {
  supabase_url      = "https://${local.project_ref}.supabase.co"
  env_targets       = ["production", "preview"]
}

resource "vercel_project_environment_variable" "oauth_encryption_key" {
  project_id = var.vercel_project_id
  team_id    = var.vercel_team_id
  key        = "OAUTH_ENCRYPTION_KEY"
  value      = random_bytes.oauth_encryption_key.base64
  target     = local.env_targets
  sensitive  = true
}

resource "vercel_project_environment_variable" "cron_secret" {
  project_id = var.vercel_project_id
  team_id    = var.vercel_team_id
  key        = "CRON_SECRET"
  value      = var.cron_secret
  target     = local.env_targets
  sensitive  = true
}

resource "vercel_project_environment_variable" "supabase_url" {
  project_id = var.vercel_project_id
  team_id    = var.vercel_team_id
  key        = "NEXT_PUBLIC_SUPABASE_URL"
  value      = local.supabase_url
  target     = local.env_targets
}

resource "vercel_project_environment_variable" "supabase_anon_key" {
  project_id = var.vercel_project_id
  team_id    = var.vercel_team_id
  key        = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  value      = var.supabase_anon_key
  target     = local.env_targets
  sensitive  = true
}

resource "vercel_project_environment_variable" "supabase_service_role_key" {
  project_id = var.vercel_project_id
  team_id    = var.vercel_team_id
  key        = "SUPABASE_SERVICE_ROLE_KEY"
  value      = var.supabase_service_role_key
  target     = local.env_targets
  sensitive  = true
}

resource "vercel_project_environment_variable" "admin_emails" {
  project_id = var.vercel_project_id
  team_id    = var.vercel_team_id
  key        = "ADMIN_EMAILS"
  value      = var.admin_emails
  target     = local.env_targets
  sensitive  = true
}
