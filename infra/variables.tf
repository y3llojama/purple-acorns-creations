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
