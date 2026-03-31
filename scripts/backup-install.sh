#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLIST_NAME="com.purpleacorns.backup"
DAEMON_PATH="/Library/LaunchDaemons/${PLIST_NAME}.plist"
STAGED_PLIST="$PROJECT_ROOT/backups/${PLIST_NAME}.plist"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"
LOG_FILE="$PROJECT_ROOT/backups/backup.log"
RUN_AS_USER="$(whoami)"
HOMEDIR="$HOME"

SUPABASE_REF="jfovputrcntthmesmjmh"

echo "=== Purple Acorns Backup Installer ==="
echo ""

# --- Check prerequisites ---
echo "Checking prerequisites..."
MISSING=()

for cmd in curl jq gzip tar; do
  if ! command -v "$cmd" &>/dev/null; then
    MISSING+=("$cmd")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
  echo "ERROR: Missing required commands: ${MISSING[*]}"
  echo ""
  echo "Install with:"
  echo "  brew install jq       # JSON processor"
  echo "  (curl, gzip, tar are built into macOS)"
  exit 1
fi
echo "  All prerequisites found."

# Soft-check for restore test dependencies (psql, createdb, dropdb)
RESTORE_WARN=()
for cmd in psql createdb dropdb; do
  if ! command -v "$cmd" &>/dev/null; then
    RESTORE_WARN+=("$cmd")
  fi
done
if [[ ${#RESTORE_WARN[@]} -gt 0 ]]; then
  echo "  WARNING: Missing ${RESTORE_WARN[*]} — monthly restore test requires these."
  echo "  Install with: brew install libpq"
fi

# --- Check service role key in terraform.tfvars ---
echo "Checking credentials..."
TFVARS_FILE="$PROJECT_ROOT/infra/terraform.tfvars"
if [[ ! -f "$TFVARS_FILE" ]]; then
  echo "ERROR: $TFVARS_FILE not found — backup needs the service role key."
  exit 1
fi
SRK=$(grep 'supabase_service_role_key' "$TFVARS_FILE" | head -1 | sed 's/.*= *"//;s/".*//' || true)
if [[ -z "$SRK" ]]; then
  echo "ERROR: supabase_service_role_key not found in $TFVARS_FILE"
  exit 1
fi
echo "  Service role key found in terraform.tfvars"

# Verify Supabase REST API connectivity
echo "  Verifying Supabase API connectivity..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "apikey: ${SRK}" \
  "https://${SUPABASE_REF}.supabase.co/rest/v1/")
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Supabase API returned HTTP $HTTP_CODE — check service role key."
  exit 1
fi
echo "  Supabase API connection verified."

# --- Stage the plist (no root needed) ---
echo "Staging LaunchDaemon plist..."
mkdir -p "$PROJECT_ROOT/backups"

cat > "$STAGED_PLIST" <<PLIST
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
    <string>/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:/usr/bin:/bin</string>
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

echo "  Staged at $STAGED_PLIST"

# --- Install daemon if running as root, otherwise print instructions ---
if [[ "$(id -u)" -eq 0 ]]; then
  cp "$STAGED_PLIST" "$DAEMON_PATH"
  chmod 644 "$DAEMON_PATH"
  chown root:wheel "$DAEMON_PATH"
  launchctl bootout system/$PLIST_NAME 2>/dev/null || true
  launchctl bootstrap system "$DAEMON_PATH"
  echo "  Installed and loaded into launchctl (system domain)"
else
  echo ""
  echo "  ┌─────────────────────────────────────────────────┐"
  echo "  │ Run these two commands as admin to finish setup: │"
  echo "  └─────────────────────────────────────────────────┘"
  echo ""
  echo "  sudo cp $STAGED_PLIST $DAEMON_PATH && sudo chown root:wheel $DAEMON_PATH && sudo chmod 644 $DAEMON_PATH"
  echo "  sudo launchctl bootstrap system $DAEMON_PATH"
  echo ""
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "  Schedule : Daily at 5:00 AM"
echo "  Runs as  : $RUN_AS_USER"
echo "  Script   : $BACKUP_SCRIPT"
echo "  Log      : $LOG_FILE"
echo "  Daemon   : $DAEMON_PATH"
echo "  Creds    : infra/terraform.tfvars (service role key)"
echo ""
echo "  Test manually:  bash $BACKUP_SCRIPT"
echo "  Test via daemon: sudo launchctl kickstart system/$PLIST_NAME"
echo ""
