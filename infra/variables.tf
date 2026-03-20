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

variable "vercel_api_token" {
  description = "Vercel API token — Account Settings > Tokens > Create Token"
  type        = string
  sensitive   = true
}

variable "vercel_project_id" {
  description = "Vercel project ID — Project Settings > General > Project ID"
  type        = string
}

variable "vercel_team_id" {
  description = "Vercel team ID — only required for team/Pro accounts (leave empty for Hobby)"
  type        = string
  default     = null
}

variable "cron_secret" {
  description = "Secret token for Vercel Cron Jobs — random string, e.g. openssl rand -hex 32"
  type        = string
  sensitive   = true
}

variable "supabase_anon_key" {
  description = "Supabase anon/public key — Project Settings > API"
  type        = string
  sensitive   = true
}

variable "supabase_service_role_key" {
  description = "Supabase service role key — Project Settings > API (never expose to browser)"
  type        = string
  sensitive   = true
}

variable "admin_emails" {
  description = "Comma-separated list of admin email addresses"
  type        = string
  sensitive   = true
}
