#!/bin/bash
# scripts/check-auth.sh — remind dev to test auth flow after deploy
echo "Auth smoke test checklist:"
echo "  [ ] /admin redirects unauthenticated users to /admin/login"
echo "  [ ] Authorized Google account reaches /admin"
echo "  [ ] Unauthorized Google account shows error and stays on login page"
echo "  [ ] Sign out button works"
