resource "supabase_project" "main" {
  organization_id   = var.supabase_organization_id
  name              = "purple-acorns-creations"
  database_password = var.db_password
  region            = "us-east-1"
}

locals {
  project_ref = supabase_project.main.id
  db_url      = "postgresql://postgres:${var.db_password}@db.${local.project_ref}.supabase.co:5432/postgres"
}
