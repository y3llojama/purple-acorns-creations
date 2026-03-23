#!/bin/bash
# Deploy the Cloudflare Email Worker.
# Requires: CLOUDFLARE_API_TOKEN env var set.
# After first deploy, edit the hello@purpleacornz.com Email Routing rule in
# Cloudflare dashboard to "Send to a Worker" → purple-acorns-email-forwarder.
set -e
cd "$(dirname "$0")/../cloudflare/email-worker"
npx wrangler deploy
