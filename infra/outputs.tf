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

# NOTE: The Supabase Terraform provider (v1.x) does not expose anon_key or
# service_role_key as resource attributes. After running terraform apply:
#
#   1. Go to: Supabase dashboard → Project Settings → API
#   2. Copy "anon public" key → NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
#   3. Copy "service_role" key → SUPABASE_SERVICE_ROLE_KEY in .env.local
#   4. Run: terraform output -raw database_url → DATABASE_URL in .env.local
