resource "supabase_settings" "auth" {
  project_ref = local.project_ref

  auth = jsonencode({
    site_url       = var.site_url
    disable_signup = true
    jwt_exp        = 3600

    # Allow OAuth redirects from both localhost and production
    uri_allow_list = "http://localhost:3000/**,${var.site_url}/**"

    # Google OAuth provider
    external_google_enabled      = true
    external_google_client_id    = var.google_client_id
    external_google_secret       = var.google_client_secret
    external_google_redirect_uri = "https://${local.project_ref}.supabase.co/auth/v1/callback"
  })

  depends_on = [supabase_project.main]
}
