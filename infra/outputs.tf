output "project_ref" {
  description = "Supabase project reference ID"
  value       = local.project_ref
}

output "supabase_url" {
  description = "Supabase project URL — use as NEXT_PUBLIC_SUPABASE_URL"
  value       = "https://${local.project_ref}.supabase.co"
}

output "database_url" {
  description = "PostgreSQL connection string — use as DATABASE_URL for backups"
  value       = local.db_url
  sensitive   = true
}

output "oauth_encryption_key" {
  description = "AES-256 encryption key for sensitive DB fields — also set as OAUTH_ENCRYPTION_KEY in Vercel (done automatically)"
  value       = random_bytes.oauth_encryption_key.base64
  sensitive   = true
}

# NOTE: The Supabase Terraform provider (v1.x) does not expose anon_key or
# service_role_key as resource attributes. After running terraform apply:
#
#   1. Go to: Supabase dashboard → Project Settings → API
#   2. Copy "anon public" key → set supabase_anon_key in terraform.tfvars, re-run apply
#   3. Copy "service_role" key → set supabase_service_role_key in terraform.tfvars, re-run apply
#   4. Run: terraform output -raw database_url → DATABASE_URL in .env.local
#   5. Run: terraform output -raw oauth_encryption_key → OAUTH_ENCRYPTION_KEY in .env.local
