#!/bin/bash
# scripts/setup.sh — run once after cloning to install deps and configure env
set -e

echo "Installing dependencies..."
npm install

if [ ! -f .env.local ]; then
  echo "Creating .env.local from .env.example..."
  cp .env.example .env.local
  echo "⚠️  Fill in .env.local with your actual Supabase URL, keys, and ADMIN_EMAILS"
fi

echo "✅ Setup complete. Run 'npm run dev' or 'bash scripts/dev.sh' to start."
