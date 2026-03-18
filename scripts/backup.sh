#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_OUTPUT_DIR="$PROJECT_ROOT/backups"

# --- Parse arguments ---
SETUP_CRON=false
CRON_SCHEDULE=""
OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --setup-cron)
      SETUP_CRON=true
      CRON_SCHEDULE="${2:-0 2 * * *}"
      shift 2
      ;;
    -*)
      echo "Unknown option: $1"
      echo "Usage: backup.sh [--setup-cron \"<schedule>\"] [output-dir]"
      exit 1
      ;;
    *)
      OUTPUT_DIR="$1"
      shift
      ;;
  esac
done

# --- Load DATABASE_URL ---
if [[ -z "${DATABASE_URL:-}" ]]; then
  ENV_FILE="$PROJECT_ROOT/.env.local"
  if [[ -f "$ENV_FILE" ]]; then
    DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' || true)
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "  Add DATABASE_URL=<connection-string> to .env.local, or export it before running."
  echo "  Get the connection string from: terraform output -raw database_url"
  exit 1
fi

# --- Setup cron ---
if [[ "$SETUP_CRON" == true ]]; then
  CRON_CMD="DATABASE_URL='$DATABASE_URL' '$SCRIPT_DIR/backup.sh' '$OUTPUT_DIR'"
  CRON_ENTRY="$CRON_SCHEDULE $CRON_CMD"
  echo ""
  echo "Installing cron job:"
  echo "  Schedule : $CRON_SCHEDULE"
  echo "  Output   : $OUTPUT_DIR"
  echo "  Command  : $CRON_CMD"
  echo ""
  read -rp "Confirm? (y/N) " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
  (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
  echo "Cron job installed. Verify with: crontab -l"
  exit 0
fi

# --- Run backup ---
mkdir -p "$OUTPUT_DIR"

# Use timestamped filenames when writing outside the default backups/ dir
# (so history accumulates, e.g. on iCloud Drive)
if [[ "$OUTPUT_DIR" == "$DEFAULT_OUTPUT_DIR" ]]; then
  DATA_FILE="$OUTPUT_DIR/data.sql"
  SETTINGS_FILE="$OUTPUT_DIR/settings.sql"
else
  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
  DATA_FILE="$OUTPUT_DIR/data_${TIMESTAMP}.sql"
  SETTINGS_FILE="$OUTPUT_DIR/settings_${TIMESTAMP}.sql"
fi

echo "Backing up database to $OUTPUT_DIR ..."

# Non-sensitive tables — safe to commit to git
pg_dump "$DATABASE_URL" \
  --table=content \
  --table=events \
  --table=gallery \
  --table=messages \
  --table=message_replies \
  --no-owner \
  --no-acl \
  --data-only \
  --column-inserts \
  > "$DATA_FILE"
echo "  Data     : $DATA_FILE"

# Settings table — contains API keys, gitignored
pg_dump "$DATABASE_URL" \
  --table=settings \
  --no-owner \
  --no-acl \
  --data-only \
  --column-inserts \
  > "$SETTINGS_FILE"
echo "  Settings : $SETTINGS_FILE"

echo "Done."
