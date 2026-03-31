#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_NAME="com.purpleacorns.backup"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"
LOG_FILE="$PROJECT_ROOT/backups/backup.log"

echo "=== Purple Acorns Backup Installer ==="
echo ""

# --- Check prerequisites ---
echo "Checking prerequisites..."
MISSING=()

for cmd in pg_dump psql createdb dropdb gzip curl; do
  if ! command -v "$cmd" &>/dev/null; then
    MISSING+=("$cmd")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
  echo "ERROR: Missing required commands: ${MISSING[*]}"
  echo ""
  echo "Install with:"
  echo "  brew install libpq    # provides pg_dump, psql, createdb, dropdb"
  echo "  (gzip and curl are built into macOS)"
  exit 1
fi
echo "  All prerequisites found."

# --- Check DATABASE_URL ---
echo "Checking DATABASE_URL..."
DATABASE_URL=""
ENV_FILE="$PROJECT_ROOT/.env.local"
if [[ -f "$ENV_FILE" ]]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' || true)
fi

if [[ -z "$DATABASE_URL" ]]; then
  echo ""
  echo "ERROR: DATABASE_URL not found in .env.local"
  echo "  Add DATABASE_URL=<supabase-connection-string> to $ENV_FILE"
  exit 1
fi
echo "  DATABASE_URL found in .env.local"

# --- Write launchd plist ---
echo "Installing launchd plist..."

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${BACKUP_SCRIPT}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>5</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>

  <key>RunAtLoad</key>
  <false/>

  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
PLIST

echo "  Written to $PLIST_PATH"

# --- Load plist ---
# Unload first if already loaded (ignore errors)
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "  Loaded into launchctl"

echo ""
echo "=== Installation complete ==="
echo ""
echo "  Schedule : Daily at 5:00 AM"
echo "  Script   : $BACKUP_SCRIPT"
echo "  Log      : $LOG_FILE"
echo "  Plist    : $PLIST_PATH"
echo ""

# --- Offer test run ---
read -rp "Run a test backup now? (y/N) " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  echo ""
  bash "$BACKUP_SCRIPT"
fi
