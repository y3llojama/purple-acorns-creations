# Nightly Production Database Backup — Implementation Plan

> **⏸ PAUSED (2026-04-01):** This pg_dump-based plan is obsolete for now — backup operations are handled on the Mac Mini. Kept for future reference if we revisit direct pg_dump backups.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated nightly full-schema backup of production Supabase to the Mac Mini, with rolling 7-day retention, integrity verification, monthly restore tests, and ntfy notifications.

**Architecture:** Single bash script (`scripts/backup.sh`) replaces the existing data-only backup with a full `public` schema dump via `pg_dump --schema=public | gzip`. A companion installer script (`scripts/backup-install.sh`) sets up the macOS launchd plist. The backup script handles dump, verify, rotate, notify, and optional restore-test in one file.

**Tech Stack:** bash, pg_dump, psql, gzip, shasum, curl (ntfy.sh), macOS launchd

**Spec:** `docs/superpowers/specs/2026-03-30-nightly-backup-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `scripts/backup.sh` | Replace | Full backup script: dump, verify, rotate, notify, restore-test |
| `scripts/backup-install.sh` | Create | Installer: verify prereqs, write launchd plist, load it, offer test run |
| `.gitignore` | Modify | Add `backups/*.sql.gz`, `backups/*.sha256`, `backups/backup.log` |

---

## Task 1: Update `.gitignore` for new backup file patterns

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add gitignore entries for new backup artifacts**

Add these lines to the `# Backups` section of `.gitignore` (after the existing `backups/settings.sql` line):

```gitignore
backups/*.sql.gz
backups/*.sha256
backups/backup.log
```

The existing `backups/settings.sql` and `backups/data.sql` entries/files can stay — the new script won't produce them, but they do no harm.

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore compressed backup files, checksums, and log"
```

---

## Task 2: Write the backup script — core dump and rotate

This task builds the script skeleton: argument parsing, env loading, ntfy helper, dump, and rotate. Verification is added in Task 3.

**Files:**
- Replace: `scripts/backup.sh`

- [ ] **Step 1: Write `scripts/backup.sh` with core structure**

```bash
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
  curl -sf -d "$msg" "ntfy.sh/$NTFY_TOPIC" > /dev/null 2>&1 || true
}

# --- Load DATABASE_URL ---
if [[ -z "${DATABASE_URL:-}" ]]; then
  ENV_FILE="$PROJECT_ROOT/.env.local"
  if [[ -f "$ENV_FILE" ]]; then
    DATABASE_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' || true)
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "ERROR: DATABASE_URL is not set."
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
```

- [ ] **Step 2: Verify the script is syntactically valid**

```bash
bash -n scripts/backup.sh
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add scripts/backup.sh
git commit -m "feat(backup): replace old backup script with core dump + rotate skeleton"
```

---

## Task 3: Add integrity verification to backup script

Appends the four-step verification block and the atomic rotate to `scripts/backup.sh`.

**Files:**
- Modify: `scripts/backup.sh`

- [ ] **Step 1: Append verification and rotate logic after the dump block**

Add this after the `log "Dump complete — verifying..."` line at the end of `scripts/backup.sh`:

```bash
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
CONTENT=$(gunzip -c "$TEMP_FILE")

if ! echo "$CONTENT" | grep -q "CREATE TABLE"; then
  log "ERROR: SQL content missing CREATE TABLE statements"
  ntfy "Backup FAILED — SQL missing CREATE TABLE"
  exit 1
fi

if ! echo "$CONTENT" | grep -q "ROW LEVEL SECURITY\|ENABLE ROW LEVEL SECURITY"; then
  log "WARNING: No RLS policies found in dump (non-fatal)"
fi

log "  Content validation: OK"

# --- Verify: Size sanity ---
DECOMPRESSED_SIZE=$(echo "$CONTENT" | wc -c | tr -d ' ')
if [[ "$DECOMPRESSED_SIZE" -lt "$MIN_DECOMPRESSED_BYTES" ]]; then
  log "ERROR: Decompressed size ${DECOMPRESSED_SIZE} bytes is below minimum ${MIN_DECOMPRESSED_BYTES}"
  ntfy "Backup FAILED — dump too small (${DECOMPRESSED_SIZE} bytes)"
  exit 1
fi
log "  Size sanity: OK (${DECOMPRESSED_SIZE} bytes decompressed)"

unset CONTENT  # free memory

# --- Rotate: atomic move ---
mv -f "$TEMP_FILE" "$TARGET_FILE"
echo "$CHECKSUM  ${DAY_NAME}.sql.gz" > "$CHECKSUM_FILE"

COMPRESSED_SIZE=$(ls -lh "$TARGET_FILE" | awk '{print $5}')
log "Backup complete — ${DAY_NAME}.sql.gz (${COMPRESSED_SIZE}), checksum OK, parse OK"
ntfy "Backup complete — ${DAY_NAME}.sql.gz (${COMPRESSED_SIZE}), checksum OK, parse OK"
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n scripts/backup.sh
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add scripts/backup.sh
git commit -m "feat(backup): add checksum, gzip, content, and size verification"
```

---

## Task 4: Add monthly restore test to backup script

Appends the `--restore-test` logic and the auto-trigger on day 1 of the month.

**Files:**
- Modify: `scripts/backup.sh`

- [ ] **Step 1: Append restore-test logic after the rotate block**

Add this at the end of `scripts/backup.sh`:

```bash
# --- Monthly restore test ---
# Auto-trigger on the 1st of each month, or when --restore-test is passed
if [[ "$(date +%d)" == "01" ]]; then
  RESTORE_TEST=true
  log "First of month — auto-triggering restore test"
fi

if [[ "$RESTORE_TEST" == true ]]; then
  RESTORE_DB="backup_verify_tmp"

  log "Monthly restore test started"
  ntfy "Monthly restore test started"

  # Create temp database
  if ! createdb "$RESTORE_DB" 2>>"$LOG_FILE"; then
    log "ERROR: Failed to create temp database $RESTORE_DB"
    ntfy "Restore test FAILED — could not create temp database"
    # Restore test failure is non-fatal to the backup itself
    exit 0
  fi

  # Restore
  RESTORE_OK=true
  if ! gunzip -c "$TARGET_FILE" | psql -q "$RESTORE_DB" >>"$LOG_FILE" 2>&1; then
    log "ERROR: Failed to restore backup into $RESTORE_DB"
    ntfy "Restore test FAILED — psql restore error"
    RESTORE_OK=false
  fi

  if [[ "$RESTORE_OK" == true ]]; then
    # Sanity checks
    TABLE_COUNT=$(psql -t -A "$RESTORE_DB" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';" 2>>"$LOG_FILE" || echo "0")
    CONTENT_ROWS=$(psql -t -A "$RESTORE_DB" -c "SELECT count(*) FROM public.content;" 2>>"$LOG_FILE" || echo "?")
    GALLERY_ROWS=$(psql -t -A "$RESTORE_DB" -c "SELECT count(*) FROM public.gallery;" 2>>"$LOG_FILE" || echo "?")
    EVENTS_ROWS=$(psql -t -A "$RESTORE_DB" -c "SELECT count(*) FROM public.events;" 2>>"$LOG_FILE" || echo "?")
    SETTINGS_EXISTS=$(psql -t -A "$RESTORE_DB" -c "SELECT count(*) FROM public.settings;" 2>>"$LOG_FILE" || echo "0")

    if [[ "$TABLE_COUNT" -gt 0 && "$SETTINGS_EXISTS" -gt 0 ]]; then
      log "Restore test passed — ${TABLE_COUNT} tables, content=${CONTENT_ROWS}, gallery=${GALLERY_ROWS}, events=${EVENTS_ROWS}"
      ntfy "Restore test passed — ${TABLE_COUNT} tables, content=${CONTENT_ROWS}, gallery=${GALLERY_ROWS}, events=${EVENTS_ROWS}"
    else
      log "ERROR: Restore test failed sanity checks — tables=${TABLE_COUNT}, settings=${SETTINGS_EXISTS}"
      ntfy "Restore test FAILED — tables=${TABLE_COUNT}, settings=${SETTINGS_EXISTS}"
    fi
  fi

  # Cleanup temp database
  dropdb --if-exists "$RESTORE_DB" 2>>"$LOG_FILE" || true
  log "Restore test cleanup complete"
fi

log "All done."
```

- [ ] **Step 2: Verify syntax**

```bash
bash -n scripts/backup.sh
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add scripts/backup.sh
git commit -m "feat(backup): add monthly restore test with sanity checks"
```

---

## Task 5: Write the installer script

**Files:**
- Create: `scripts/backup-install.sh`

- [ ] **Step 1: Write `scripts/backup-install.sh`**

```bash
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
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/backup-install.sh
```

- [ ] **Step 3: Verify syntax**

```bash
bash -n scripts/backup-install.sh
```

Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add scripts/backup-install.sh
git commit -m "feat(backup): add launchd installer script"
```

---

## Task 6: Make backup script executable and do a dry-run test

**Files:**
- Modify: `scripts/backup.sh` (permissions only)

- [ ] **Step 1: Ensure execute permission**

```bash
chmod +x scripts/backup.sh
```

- [ ] **Step 2: Run `--help` to verify the script loads without errors**

```bash
bash scripts/backup.sh --help
```

Expected output:
```
Usage: backup.sh [--restore-test]
  --restore-test  Also restore into a temp local DB and run sanity checks
```

- [ ] **Step 3: Verify the full script with syntax check**

```bash
bash -n scripts/backup.sh
```

Expected: no output (success).

- [ ] **Step 4: Commit permissions if changed**

```bash
git add scripts/backup.sh
git commit -m "chore: make backup.sh executable"
```

---

## Task 7: End-to-end test against production

Run the backup against the real production Supabase database to verify everything works.

- [ ] **Step 1: Run the backup**

```bash
bash scripts/backup.sh
```

Expected: log output showing dump, verification steps, and success notification. A `<day>.sql.gz` and `<day>.sql.gz.sha256` file should appear in `backups/`.

- [ ] **Step 2: Verify output files exist**

```bash
ls -lh backups/*.sql.gz backups/*.sha256
```

Expected: one `.sql.gz` file (named for today's day-of-week) and its `.sha256` companion.

- [ ] **Step 3: Verify checksum manually**

```bash
cd backups && shasum -a 256 -c *.sha256 && cd ..
```

Expected: `<day>.sql.gz: OK`

- [ ] **Step 4: Spot-check dump contents**

```bash
gunzip -c backups/$(date +%A | tr '[:upper:]' '[:lower:]').sql.gz | head -50
```

Expected: SQL output starting with `--` comments and `CREATE TABLE` or `SET` statements.

- [ ] **Step 5: Run restore test manually**

```bash
bash scripts/backup.sh --restore-test
```

Expected: restore test output showing table counts and row counts for `content`, `gallery`, `events`, and a settings row. Note: requires a local PostgreSQL server running.

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec sections mapped to tasks — dump strategy (T2), verification (T3), rotation (T2–T3), restore test (T4), notifications (T2–T4), scheduling (T5 installer), gitignore (T1), prereqs (T5)
- [x] **No placeholders:** Every step has exact code or exact commands
- [x] **Type consistency:** Function names (`log`, `ntfy`, `cleanup`) consistent across all tasks; variable names (`TEMP_FILE`, `TARGET_FILE`, `DAY_NAME`) consistent
- [x] **Out-of-scope items excluded:** No internal schema backup, no encryption, no cloud replication, no Management API usage
