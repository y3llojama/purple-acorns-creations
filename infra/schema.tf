resource "null_resource" "schema" {
  # Re-run if the schema SQL changes or the project is recreated
  triggers = {
    schema_hash = filemd5("${path.module}/schema.sql")
    project_id  = local.project_ref
  }

  provisioner "local-exec" {
    command = "psql '${local.db_url}' -f '${path.module}/schema.sql'"
  }

  depends_on = [supabase_project.main]
}
