#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Homebrew libpq is keg-only — add to PATH so psql/createdb/dropdb are found
# This is required for launchd which does not source ~/.zshrc
if [[ -d "/opt/homebrew/opt/libpq/bin" ]]; then
  export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
elif [[ -d "/usr/local/opt/libpq/bin" ]]; then
  export PATH="/usr/local/opt/libpq/bin:$PATH"
fi

BACKUP_DIR="$PROJECT_ROOT/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
NTFY_TOPIC="pa-stats"
RESTORE_TEST=false
MIN_ARCHIVE_BYTES=1024        # 1KB minimum archive size
MIN_TABLES=30                 # expected minimum table count
ROWS_PER_PAGE=1000            # PostgREST pagination size
SUPABASE_REF="jfovputrcntthmesmjmh"
API_BASE="https://${SUPABASE_REF}.supabase.co"

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

# --- Load service role key from terraform.tfvars ---
TFVARS_FILE="$PROJECT_ROOT/infra/terraform.tfvars"
SERVICE_ROLE_KEY=""
if [[ -f "$TFVARS_FILE" ]]; then
  SERVICE_ROLE_KEY=$(grep 'supabase_service_role_key' "$TFVARS_FILE" | head -1 | sed 's/.*= *"//' | sed 's/".*//' || true)
fi

if [[ -z "$SERVICE_ROLE_KEY" ]]; then
  log "ERROR: supabase_service_role_key not found in $TFVARS_FILE"
  ntfy "Backup FAILED — service role key missing"
  exit 1
fi

# --- Temp directory & cleanup trap ---
TEMP_DIR=$(mktemp -d "$BACKUP_DIR/.backup_tmp_XXXXXX")
TEMP_ARCHIVE=""

cleanup() {
  rm -rf "$TEMP_DIR"
  if [[ -n "$TEMP_ARCHIVE" ]]; then rm -f "$TEMP_ARCHIVE"; fi
}
trap cleanup EXIT

# --- Day-of-week filename ---
DAY_NAME=$(date +%A | tr '[:upper:]' '[:lower:]')
TARGET_FILE="$BACKUP_DIR/${DAY_NAME}.json.tar.gz"
CHECKSUM_FILE="${TARGET_FILE}.sha256"

# --- Staleness check ---
# Find newest *.json.tar.gz and warn if older than 25 hours
NEWEST_BACKUP=$(find "$BACKUP_DIR" -maxdepth 1 -name '*.json.tar.gz' -type f -print0 2>/dev/null \
  | xargs -0 ls -t 2>/dev/null | head -1 || true)
if [[ -n "$NEWEST_BACKUP" ]]; then
  if [[ "$(uname)" == "Darwin" ]]; then
    BACKUP_AGE_SEC=$(( $(date +%s) - $(stat -f %m "$NEWEST_BACKUP") ))
  else
    BACKUP_AGE_SEC=$(( $(date +%s) - $(stat -c %Y "$NEWEST_BACKUP") ))
  fi
  STALENESS_LIMIT=$((25 * 3600))
  if [[ "$BACKUP_AGE_SEC" -gt "$STALENESS_LIMIT" ]]; then
    HOURS_AGO=$(( BACKUP_AGE_SEC / 3600 ))
    log "WARNING: newest backup is ${HOURS_AGO}h old — possible missed run"
    ntfy "Backup WARNING — newest backup is ${HOURS_AGO}h old, possible missed run"
  fi
fi

# --- Discover tables via OpenAPI endpoint ---
log "Backup started — target: ${DAY_NAME}.json.tar.gz"
ntfy "Backup started"

OPENAPI_HTTP=$(curl -s -o "$TEMP_DIR/.openapi.json" -w "%{http_code}" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  "${API_BASE}/rest/v1/" 2>>"$LOG_FILE") || OPENAPI_HTTP="000"

if [[ "$OPENAPI_HTTP" == "401" || "$OPENAPI_HTTP" == "403" ]]; then
  log "ERROR: Credential failure (HTTP ${OPENAPI_HTTP}) — service role key may be invalid or rotated"
  ntfy "Backup FAILED — credential failure (HTTP ${OPENAPI_HTTP})"
  exit 1
elif [[ "$OPENAPI_HTTP" != "200" ]]; then
  log "ERROR: Failed to fetch OpenAPI schema (HTTP ${OPENAPI_HTTP})"
  ntfy "Backup FAILED — cannot reach Supabase REST API (HTTP ${OPENAPI_HTTP})"
  exit 1
fi
OPENAPI_JSON=$(cat "$TEMP_DIR/.openapi.json")

# Extract table names: paths that don't start with /rpc/
TABLES=$(echo "$OPENAPI_JSON" | jq -r '.paths | keys[] | select(startswith("/rpc/") | not) | ltrimstr("/")' | sort)
TABLE_COUNT=$(echo "$TABLES" | wc -l | tr -d ' ')

if [[ "$TABLE_COUNT" -lt "$MIN_TABLES" ]]; then
  log "ERROR: Only found ${TABLE_COUNT} tables (expected >= ${MIN_TABLES})"
  ntfy "Backup FAILED — only ${TABLE_COUNT} tables found"
  exit 1
fi

log "Discovered ${TABLE_COUNT} tables"

# --- Paginated data fetch ---
FETCH_FAILED=false

for TABLE in $TABLES; do
  OUTFILE="$TEMP_DIR/${TABLE}.json"
  OFFSET=0
  ALL_ROWS="[]"

  while true; do
    RANGE_START=$OFFSET
    RANGE_END=$(( OFFSET + ROWS_PER_PAGE - 1 ))

    HTTP_CODE=$(curl -s -o "$TEMP_DIR/.page_tmp.json" -w "%{http_code}" \
      -H "apikey: ${SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
      -H "Range: ${RANGE_START}-${RANGE_END}" \
      -H "Range-Unit: items" \
      -H "Prefer: count=exact" \
      "${API_BASE}/rest/v1/${TABLE}?select=*" 2>>"$LOG_FILE") || HTTP_CODE="000"

    case "$HTTP_CODE" in
      200)
        # Final page (or only page)
        PAGE_DATA=$(cat "$TEMP_DIR/.page_tmp.json")
        ALL_ROWS=$(echo "$ALL_ROWS" "$PAGE_DATA" | jq -s '.[0] + .[1]')
        break
        ;;
      206)
        # Partial content — more pages follow
        PAGE_DATA=$(cat "$TEMP_DIR/.page_tmp.json")
        ALL_ROWS=$(echo "$ALL_ROWS" "$PAGE_DATA" | jq -s '.[0] + .[1]')
        OFFSET=$(( OFFSET + ROWS_PER_PAGE ))
        ;;
      416)
        # Range not satisfiable — past end, clean stop
        break
        ;;
      401|403)
        log "ERROR: Credential failure (HTTP ${HTTP_CODE}) fetching table '${TABLE}'"
        ntfy "Backup FAILED — auth error on table ${TABLE}"
        FETCH_FAILED=true
        break
        ;;
      *)
        log "ERROR: HTTP ${HTTP_CODE} fetching table '${TABLE}'"
        ntfy "Backup FAILED — HTTP ${HTTP_CODE} on table ${TABLE}"
        FETCH_FAILED=true
        break
        ;;
    esac
  done

  if [[ "$FETCH_FAILED" == true ]]; then
    break
  fi

  echo "$ALL_ROWS" > "$OUTFILE"
  ROW_COUNT=$(jq 'length' "$OUTFILE")
  log "  ${TABLE}: ${ROW_COUNT} rows"
done

rm -f "$TEMP_DIR/.page_tmp.json"

if [[ "$FETCH_FAILED" == true ]]; then
  log "ERROR: One or more table fetches failed — aborting backup"
  exit 1
fi

# --- Archive & verification ---
TEMP_ARCHIVE="$BACKUP_DIR/.backup_tmp_archive_$$.json.tar.gz"
TEMP_DIR_BASE=$(basename "$TEMP_DIR")

tar czf "$TEMP_ARCHIVE" -C "$BACKUP_DIR" "$TEMP_DIR_BASE"

# SHA-256 checksum
CHECKSUM=$(shasum -a 256 "$TEMP_ARCHIVE" | awk '{print $1}')
log "  Checksum: $CHECKSUM"

# Tar integrity check
if ! tar tzf "$TEMP_ARCHIVE" > /dev/null 2>>"$LOG_FILE"; then
  log "ERROR: tar integrity check failed"
  ntfy "Backup FAILED — tar integrity check failed"
  exit 1
fi
log "  Archive integrity: OK"

# Content validation: settings.json must have 1+ entries
SETTINGS_COUNT=$(tar xzf "$TEMP_ARCHIVE" -O "${TEMP_DIR_BASE}/settings.json" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
if [[ "$SETTINGS_COUNT" -lt 1 ]]; then
  log "ERROR: settings.json has no entries"
  ntfy "Backup FAILED — settings.json empty"
  exit 1
fi

# At least 1 non-empty JSON file
NON_EMPTY_COUNT=0
for F in $(tar tzf "$TEMP_ARCHIVE" | grep '\.json$'); do
  COUNT=$(tar xzf "$TEMP_ARCHIVE" -O "$F" 2>/dev/null | jq 'length' 2>/dev/null || echo "0")
  if [[ "$COUNT" -gt 0 ]]; then
    NON_EMPTY_COUNT=$(( NON_EMPTY_COUNT + 1 ))
  fi
done
if [[ "$NON_EMPTY_COUNT" -lt 1 ]]; then
  log "ERROR: No non-empty JSON files in archive"
  ntfy "Backup FAILED — all JSON files empty"
  exit 1
fi
log "  Content validation: OK (${NON_EMPTY_COUNT} non-empty files, settings=${SETTINGS_COUNT} rows)"

# Size sanity
ARCHIVE_SIZE=$(wc -c < "$TEMP_ARCHIVE" | tr -d ' ')
if [[ "$ARCHIVE_SIZE" -lt "$MIN_ARCHIVE_BYTES" ]]; then
  log "ERROR: Archive size ${ARCHIVE_SIZE} bytes is below minimum ${MIN_ARCHIVE_BYTES}"
  ntfy "Backup FAILED — archive too small (${ARCHIVE_SIZE} bytes)"
  exit 1
fi
log "  Size sanity: OK (${ARCHIVE_SIZE} bytes)"

# Atomic move to final location
mv -f "$TEMP_ARCHIVE" "$TARGET_FILE"
TEMP_ARCHIVE=""  # prevent cleanup trap from removing the final file
echo "$CHECKSUM  ${DAY_NAME}.json.tar.gz" > "$CHECKSUM_FILE"

COMPRESSED_SIZE=$(ls -lh "$TARGET_FILE" | awk '{print $5}')
log "Backup complete — ${DAY_NAME}.json.tar.gz (${COMPRESSED_SIZE}), ${TABLE_COUNT} tables, checksum OK"
ntfy "Backup complete — ${DAY_NAME}.json.tar.gz (${COMPRESSED_SIZE}), ${TABLE_COUNT} tables"

# --- Monthly restore test ---
# Auto-trigger on the 1st of each month, or when --restore-test is passed
if [[ "$(date +%d)" == "01" ]]; then
  RESTORE_TEST=true
  log "First of month — auto-triggering restore test"
fi

if [[ "$RESTORE_TEST" == true ]]; then
  RESTORE_DB="backup_verify_tmp"
  RESTORE_HOST="${RESTORE_TEST_HOST:-localhost}"
  RESTORE_PORT="${RESTORE_TEST_PORT:-9432}"
  RESTORE_USER="${RESTORE_TEST_USER:-brevi}"
  RESTORE_CONN="postgresql://${RESTORE_USER}@${RESTORE_HOST}:${RESTORE_PORT}"

  log "Monthly restore test started (${RESTORE_HOST}:${RESTORE_PORT})"
  ntfy "Monthly restore test started"

  # Connectivity check — if Docker Postgres is unreachable, skip gracefully
  if ! psql -w "${RESTORE_CONN}/postgres" -c "SELECT 1" > /dev/null 2>>"$LOG_FILE"; then
    log "WARNING: Cannot reach local Postgres at ${RESTORE_HOST}:${RESTORE_PORT} — skipping restore test"
    ntfy "Restore test skipped — local Postgres unreachable"
    # Non-fatal: exit 0 so backup itself is still considered successful
    exit 0
  fi

  # Drop any leftover temp database from a previous failed run
  dropdb -w --if-exists -h "$RESTORE_HOST" -p "$RESTORE_PORT" -U "$RESTORE_USER" "$RESTORE_DB" 2>>"$LOG_FILE" || true

  # Create temp database
  if ! createdb -w -h "$RESTORE_HOST" -p "$RESTORE_PORT" -U "$RESTORE_USER" "$RESTORE_DB" 2>>"$LOG_FILE"; then
    log "ERROR: Failed to create temp database $RESTORE_DB"
    ntfy "Restore test FAILED — could not create temp database"
    exit 0
  fi

  RESTORE_URL="${RESTORE_CONN}/${RESTORE_DB}"

  # Run all migrations in alphabetical order
  MIGRATION_DIR="$PROJECT_ROOT/supabase/migrations"
  if [[ -d "$MIGRATION_DIR" ]]; then
    for MIG in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
      MIG_NAME=$(basename "$MIG")
      if ! psql -w -q "$RESTORE_URL" -v ON_ERROR_STOP=0 -f "$MIG" >>"$LOG_FILE" 2>&1; then
        # Skip known extension errors (pg_cron, storage) — they're Supabase-managed
        log "  Migration $MIG_NAME: completed with warnings (expected for pg_cron/storage extensions)"
      fi
    done
    log "  Migrations applied"
  else
    log "WARNING: No migrations directory found at $MIGRATION_DIR"
  fi

  # Truncate all public tables so backup inserts don't conflict with migration seeds
  psql -w -q "$RESTORE_URL" -c "
    SET session_replication_role = replica;
    DO \$\$ DECLARE r RECORD;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END \$\$;
    SET session_replication_role = DEFAULT;
  " >>"$LOG_FILE" 2>&1
  log "  Tables truncated (clearing migration seeds)"

  # Record baseline row counts AFTER truncate (should be 0)
  BASELINE_CONTENT=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.content;" 2>/dev/null | tr -d ' ' || echo "0")
  BASELINE_EVENTS=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.events;" 2>/dev/null | tr -d ' ' || echo "0")
  BASELINE_SETTINGS=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.settings;" 2>/dev/null | tr -d ' ' || echo "0")

  # Extract backup into a temp restore directory
  RESTORE_DATA_DIR=$(mktemp -d "$BACKUP_DIR/.restore_tmp_XXXXXX")
  tar xzf "$TARGET_FILE" -C "$RESTORE_DATA_DIR"

  # Find the extracted subdirectory
  EXTRACTED_DIR=$(find "$RESTORE_DATA_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)
  if [[ -z "$EXTRACTED_DIR" ]]; then
    EXTRACTED_DIR="$RESTORE_DATA_DIR"
  fi

  # For each table JSON, generate INSERT statements and pipe to psql
  for JSON_FILE in "$EXTRACTED_DIR"/*.json; do
    TABLE_NAME=$(basename "$JSON_FILE" .json)
    ROW_COUNT=$(jq 'length' "$JSON_FILE" 2>/dev/null || echo "0")

    if [[ "$ROW_COUNT" -eq 0 ]]; then
      continue
    fi

    # Generate INSERT statements using jq
    # Get column names from the first row
    COLUMNS=$(jq -r '.[0] | keys_unsorted | join(", ")' "$JSON_FILE" 2>/dev/null || true)
    if [[ -z "$COLUMNS" ]]; then
      continue
    fi

    # Generate VALUES for each row with proper SQL escaping
    INSERT_SQL=$(jq -r --arg tbl "$TABLE_NAME" '
      # Get column names from first row
      (.[0] | keys_unsorted) as $cols |
      # For each row, generate a VALUES clause
      .[] |
      . as $row |
      [
        $cols[] |
        . as $col |
        $row[$col] |
        if . == null then "NULL"
        elif type == "number" then tostring
        elif type == "boolean" then (if . then "TRUE" else "FALSE" end)
        elif type == "object" or type == "array" then
          # JSONB: double-encode then single-quote escape
          (tostring | gsub("'"'"'"; "'"'"''"'"'") | "'"'"'" + . + "'"'"'::jsonb")
        else
          # String: single-quote escape
          (tostring | gsub("'"'"'"; "'"'"''"'"'") | "'"'"'" + . + "'"'"'")
        end
      ] | join(", ") |
      "INSERT INTO public." + $tbl + " (" + ($cols | join(", ")) + ") VALUES (" + . + ");"
    ' "$JSON_FILE" 2>/dev/null) || {
      log "  WARNING: Failed to generate INSERTs for ${TABLE_NAME}"
      continue
    }

    # Prepend session_replication_role = replica to disable FK checks for this session
    if printf 'SET session_replication_role = replica;\n%s\n' "$INSERT_SQL" | psql -w -q "$RESTORE_URL" >>"$LOG_FILE" 2>&1; then
      log "  Loaded ${TABLE_NAME}: ${ROW_COUNT} rows"
    else
      log "  WARNING: Some errors loading ${TABLE_NAME} (${ROW_COUNT} rows attempted)"
    fi
  done

  rm -rf "$RESTORE_DATA_DIR"

  # Sanity checks: certain tables must have rows exceeding baseline
  RESTORE_PASS=true
  CURRENT_CONTENT=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.content;" 2>/dev/null | tr -d ' ' || echo "0")
  CURRENT_EVENTS=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.events;" 2>/dev/null | tr -d ' ' || echo "0")
  CURRENT_SETTINGS=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.settings;" 2>/dev/null | tr -d ' ' || echo "0")

  if [[ "$CURRENT_CONTENT" -le "$BASELINE_CONTENT" ]]; then
    log "ERROR: Restore check failed — content has ${CURRENT_CONTENT} rows (baseline was ${BASELINE_CONTENT})"
    RESTORE_PASS=false
  fi
  if [[ "$CURRENT_EVENTS" -le "$BASELINE_EVENTS" ]]; then
    log "ERROR: Restore check failed — events has ${CURRENT_EVENTS} rows (baseline was ${BASELINE_EVENTS})"
    RESTORE_PASS=false
  fi
  if [[ "$CURRENT_SETTINGS" -le "$BASELINE_SETTINGS" ]]; then
    log "ERROR: Restore check failed — settings has ${CURRENT_SETTINGS} rows (baseline was ${BASELINE_SETTINGS})"
    RESTORE_PASS=false
  fi

  # Get final counts for reporting
  CONTENT_ROWS=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.content;" 2>>"$LOG_FILE" || echo "?")
  EVENTS_ROWS=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.events;" 2>>"$LOG_FILE" || echo "?")
  SETTINGS_ROWS=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM public.settings;" 2>>"$LOG_FILE" || echo "?")
  TOTAL_TABLES=$(psql -w -t -A "$RESTORE_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>>"$LOG_FILE" || echo "0")

  # Cleanup temp database
  dropdb -w --if-exists -h "$RESTORE_HOST" -p "$RESTORE_PORT" -U "$RESTORE_USER" "$RESTORE_DB" 2>>"$LOG_FILE" || true
  log "Restore test cleanup complete"

  if [[ "$RESTORE_PASS" == true ]]; then
    log "Restore test passed — ${TOTAL_TABLES} tables, content=${CONTENT_ROWS}, events=${EVENTS_ROWS}, settings=${SETTINGS_ROWS}"
    ntfy "Restore test passed — ${TOTAL_TABLES} tables, content=${CONTENT_ROWS}, events=${EVENTS_ROWS}, settings=${SETTINGS_ROWS}"
  else
    log "ERROR: Restore test FAILED sanity checks"
    ntfy "Restore test FAILED — check logs"
  fi
fi

log "All done."
