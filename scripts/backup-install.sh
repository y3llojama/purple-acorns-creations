#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_NAME="com.purpleacorns.backup"
PLIST_PATH="/Library/LaunchDaemons/${PLIST_NAME}.plist"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"
LOG_FILE="$PROJECT_ROOT/backups/backup.log"
RUN_AS_USER="${SUDO_USER:-$(whoami)}"

DB_HOST="db.jfovputrcntthmesmjmh.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

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

# --- Check database credentials (.pgpass → .env.local → prompt) ---
echo "Checking database credentials..."
PGPASS_FILE="$HOME/.pgpass"
DB_PASS=""

# 1. Check existing .pgpass
if [[ -f "$PGPASS_FILE" ]]; then
  DB_PASS=$(grep "^${DB_HOST}:${DB_PORT}:${DB_NAME}:${DB_USER}:" "$PGPASS_FILE" 2>/dev/null | head -1 | cut -d':' -f5 || true)
fi

# 2. Fall back to .env.local
ENV_FILE="$PROJECT_ROOT/.env.local"
if [[ -z "$DB_PASS" && -f "$ENV_FILE" ]]; then
  DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' || true)
  if [[ -n "${DATABASE_URL:-}" ]]; then
    DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
  fi
fi

# 3. Prompt if still missing
if [[ -z "$DB_PASS" ]]; then
  echo ""
  read -rsp "Enter Supabase database password: " DB_PASS
  echo ""
fi

if [[ -z "$DB_PASS" ]]; then
  echo "ERROR: No database credentials found."
  echo "  Provide via ~/.pgpass, .env.local, or enter when prompted."
  exit 1
fi

# Write/update ~/.pgpass
PGPASS_LINE="${DB_HOST}:${DB_PORT}:${DB_NAME}:${DB_USER}:${DB_PASS}"
if [[ -f "$PGPASS_FILE" ]]; then
  # Remove old entry for this host if present
  sed -i '' "\|^${DB_HOST}:${DB_PORT}:${DB_NAME}:${DB_USER}:|d" "$PGPASS_FILE"
fi
echo "$PGPASS_LINE" >> "$PGPASS_FILE"
chmod 600 "$PGPASS_FILE"
echo "  Password stored in ~/.pgpass (mode 600)"

# Remove plaintext password from .env.local if present
if [[ -f "$ENV_FILE" ]] && grep -q '^DATABASE_URL=' "$ENV_FILE"; then
  sed -i '' '/^DATABASE_URL=/d' "$ENV_FILE"
  echo "  Removed plaintext DATABASE_URL from .env.local"
fi

# Verify connection
DATABASE_URL="postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "  Verifying database connection..."
if ! psql "$DATABASE_URL" -c "SELECT 1;" &>/dev/null; then
  echo "ERROR: Cannot connect to database. Check your password."
  exit 1
fi
echo "  Database connection verified."

# --- Write launchd plist (LaunchDaemon — requires sudo) ---
echo "Installing LaunchDaemon plist..."

if [[ "$(id -u)" -ne 0 ]]; then
  echo ""
  echo "ERROR: LaunchDaemons require root. Re-run with sudo:"
  echo "  sudo bash scripts/backup-install.sh"
  exit 1
fi

HOMEDIR=$(eval echo "~${RUN_AS_USER}")

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>

  <key>UserName</key>
  <string>${RUN_AS_USER}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${BACKUP_SCRIPT}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>${HOMEDIR}</string>
  </dict>

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

chmod 644 "$PLIST_PATH"
chown root:wheel "$PLIST_PATH"

echo "  Written to $PLIST_PATH"

# --- Load plist ---
launchctl bootout system/$PLIST_NAME 2>/dev/null || true
launchctl bootstrap system "$PLIST_PATH"
echo "  Loaded into launchctl (system domain)"

echo ""
echo "=== Installation complete ==="
echo ""
echo "  Schedule : Daily at 5:00 AM"
echo "  Runs as  : $RUN_AS_USER"
echo "  Script   : $BACKUP_SCRIPT"
echo "  Log      : $LOG_FILE"
echo "  Plist    : $PLIST_PATH"
echo "  Creds    : ~${RUN_AS_USER}/.pgpass (mode 600)"
echo ""

# --- Offer test run ---
read -rp "Run a test backup now? (y/N) " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  echo ""
  bash "$BACKUP_SCRIPT"
fi
