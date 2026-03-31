#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
NTFY_TOPIC="pa-stats"
RESTORE_TEST=false
MIN_DECOMPRESSED_BYTES=1024  # 1KB minimum — catches empty/stub dumps

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --restore-test) RESTORE_TEST=true; shift ;;
    -h|--help)
      echo "Usage: backup.sh [--restore-test]"
      echo "  --restore-test  Also restore into a temp local DB and run sanity checks"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# --- Logging ---
mkdir -p "$BACKUP_DIR"

log() {
  local msg
  msg="$(date '+%Y-%m-%d %H:%M:%S') $1"
  echo "$msg" | tee -a "$LOG_FILE"
}

# --- Notifications ---
ntfy() {
  local msg="$1"
  curl -sf -d "$msg" "https://ntfy.sh/$NTFY_TOPIC" > /dev/null 2>&1 || true
}

# --- Load DATABASE_URL ---
# Password is read automatically from ~/.pgpass by pg_dump/psql
DB_HOST="db.jfovputrcntthmesmjmh.supabase.co"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres"

if [[ -z "${DATABASE_URL:-}" ]]; then
  ENV_FILE="$PROJECT_ROOT/.env.local"
  if [[ -f "$ENV_FILE" ]]; then
    DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' || true)
  fi
fi

# Fall back to passwordless URL (relies on ~/.pgpass)
if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f "$HOME/.pgpass" ]] && grep -q "^${DB_HOST}:" "$HOME/.pgpass" 2>/dev/null; then
    DATABASE_URL="postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "ERROR: DATABASE_URL is not set (checked .env.local and ~/.pgpass)."
  ntfy "Backup FAILED — DATABASE_URL not set"
  exit 1
fi

# --- Determine day-of-week filename ---
DAY_NAME=$(date +%A | tr '[:upper:]' '[:lower:]')
TARGET_FILE="$BACKUP_DIR/${DAY_NAME}.sql.gz"
CHECKSUM_FILE="${TARGET_FILE}.sha256"
TEMP_FILE="$BACKUP_DIR/.backup_tmp.sql.gz"

# --- Cleanup trap ---
cleanup() {
  rm -f "$TEMP_FILE"
}
trap cleanup EXIT

# --- Dump ---
log "Backup started — target: ${DAY_NAME}.sql.gz"
ntfy "Backup started"

if ! pg_dump "$DATABASE_URL" \
  --schema=public \
  --no-owner \
  --no-acl \
  | gzip > "$TEMP_FILE" 2>>"$LOG_FILE"; then
  log "ERROR: pg_dump failed"
  ntfy "Backup FAILED — pg_dump error"
  exit 1
fi

log "Dump complete — verifying..."

# --- Verify: Checksum ---
CHECKSUM=$(shasum -a 256 "$TEMP_FILE" | awk '{print $1}')
log "  Checksum: $CHECKSUM"

# --- Verify: Gzip integrity ---
if ! gunzip -t "$TEMP_FILE" 2>>"$LOG_FILE"; then
  log "ERROR: gzip integrity check failed"
  ntfy "Backup FAILED — gzip integrity check failed"
  exit 1
fi
log "  Gzip integrity: OK"

# --- Verify: Content validation ---
# Note: grep -q with pipefail causes false failures (SIGPIPE closes gunzip early).
# Use grep -c instead and check the count.
TABLE_COUNT=$(gunzip -c "$TEMP_FILE" | grep -c "CREATE TABLE" || true)
if [[ "$TABLE_COUNT" -eq 0 ]]; then
  log "ERROR: SQL content missing CREATE TABLE statements"
  ntfy "Backup FAILED — SQL missing CREATE TABLE"
  exit 1
fi

COPY_COUNT=$(gunzip -c "$TEMP_FILE" | grep -c "COPY .* FROM stdin" || true)
if [[ "$COPY_COUNT" -eq 0 ]]; then
  log "ERROR: SQL content missing COPY/data statements"
  ntfy "Backup FAILED — SQL missing data statements"
  exit 1
fi

RLS_COUNT=$(gunzip -c "$TEMP_FILE" | grep -c "ROW LEVEL SECURITY\|ENABLE ROW LEVEL SECURITY" || true)
if [[ "$RLS_COUNT" -eq 0 ]]; then
  log "ERROR: SQL content missing ROW LEVEL SECURITY policies"
  ntfy "Backup FAILED — SQL missing RLS policies"
  exit 1
fi

log "  Content validation: OK"

# --- Verify: Size sanity ---
DECOMPRESSED_SIZE=$(gunzip -c "$TEMP_FILE" | wc -c | tr -d ' ')
if [[ "$DECOMPRESSED_SIZE" -lt "$MIN_DECOMPRESSED_BYTES" ]]; then
  log "ERROR: Decompressed size ${DECOMPRESSED_SIZE} bytes is below minimum ${MIN_DECOMPRESSED_BYTES}"
  ntfy "Backup FAILED — dump too small (${DECOMPRESSED_SIZE} bytes)"
  exit 1
fi
log "  Size sanity: OK (${DECOMPRESSED_SIZE} bytes decompressed)"

# --- Rotate: atomic move ---
mv -f "$TEMP_FILE" "$TARGET_FILE"
echo "$CHECKSUM  ${DAY_NAME}.sql.gz" > "$CHECKSUM_FILE"

COMPRESSED_SIZE=$(ls -lh "$TARGET_FILE" | awk '{print $5}')
log "Backup complete — ${DAY_NAME}.sql.gz (${COMPRESSED_SIZE}), checksum OK, parse OK"
ntfy "Backup complete — ${DAY_NAME}.sql.gz (${COMPRESSED_SIZE}), checksum OK, parse OK"

# --- Monthly restore test ---
# Auto-trigger on the 1st of each month, or when --restore-test is passed
if [[ "$(date +%d)" == "01" ]]; then
  RESTORE_TEST=true
  log "First of month — auto-triggering restore test"
fi

if [[ "$RESTORE_TEST" == true ]]; then
  RESTORE_DB="backup_verify_tmp"
  # Use local Docker Postgres for restore test (brevi stack)
  RESTORE_HOST="${RESTORE_TEST_HOST:-localhost}"
  RESTORE_PORT="${RESTORE_TEST_PORT:-9432}"
  RESTORE_USER="${RESTORE_TEST_USER:-brevi}"
  RESTORE_CONN="postgresql://${RESTORE_USER}@${RESTORE_HOST}:${RESTORE_PORT}"

  log "Monthly restore test started (${RESTORE_HOST}:${RESTORE_PORT})"
  ntfy "Monthly restore test started"

  # Create temp database
  if ! createdb -h "$RESTORE_HOST" -p "$RESTORE_PORT" -U "$RESTORE_USER" "$RESTORE_DB" 2>>"$LOG_FILE"; then
    log "ERROR: Failed to create temp database $RESTORE_DB"
    ntfy "Restore test FAILED — could not create temp database"
    # Restore test failure is non-fatal to the backup itself
    exit 0
  fi

  # Restore
  RESTORE_OK=true
  if ! gunzip -c "$TARGET_FILE" | psql -q "${RESTORE_CONN}/${RESTORE_DB}" >>"$LOG_FILE" 2>&1; then
    log "ERROR: Failed to restore backup into $RESTORE_DB"
    ntfy "Restore test FAILED — psql restore error"
    RESTORE_OK=false
  fi

  if [[ "$RESTORE_OK" == true ]]; then
    # Sanity checks
    RESTORE_URL="${RESTORE_CONN}/${RESTORE_DB}"
    TABLE_COUNT=$(psql -t -A "$RESTORE_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>>"$LOG_FILE" || echo "0")
    CONTENT_ROWS=$(psql -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.content;" 2>>"$LOG_FILE" || echo "?")
    GALLERY_ROWS=$(psql -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.gallery;" 2>>"$LOG_FILE" || echo "?")
    EVENTS_ROWS=$(psql -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.events;" 2>>"$LOG_FILE" || echo "?")
    SETTINGS_EXISTS=$(psql -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.settings;" 2>>"$LOG_FILE" || echo "0")

    if [[ "$TABLE_COUNT" -gt 0 && "$SETTINGS_EXISTS" -gt 0 ]]; then
      log "Restore test passed — ${TABLE_COUNT} tables, content=${CONTENT_ROWS}, gallery=${GALLERY_ROWS}, events=${EVENTS_ROWS}"
      ntfy "Restore test passed — ${TABLE_COUNT} tables, content=${CONTENT_ROWS}, gallery=${GALLERY_ROWS}, events=${EVENTS_ROWS}"
    else
      log "ERROR: Restore test failed sanity checks — tables=${TABLE_COUNT}, settings=${SETTINGS_EXISTS}"
      ntfy "Restore test FAILED — tables=${TABLE_COUNT}, settings=${SETTINGS_EXISTS}"
    fi
  fi

  # Cleanup temp database
  dropdb --if-exists -h "$RESTORE_HOST" -p "$RESTORE_PORT" -U "$RESTORE_USER" "$RESTORE_DB" 2>>"$LOG_FILE" || true
  log "Restore test cleanup complete"
fi

log "All done."
