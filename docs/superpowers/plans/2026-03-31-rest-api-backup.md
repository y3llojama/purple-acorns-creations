# REST API Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the failing `pg_dump`-based backup with a Supabase REST API backup that pulls all public table data as JSON, with a full-fidelity monthly restore test.

**Architecture:** Bash script fetches all tables via PostgREST with service role key auth, writes per-table JSON files, tars+gzips them. Python helper runs migrations on local Docker Postgres, inserts JSON data via psycopg2 parameterized queries with FK checks disabled, then validates row counts.

**Tech Stack:** Bash, curl, jq, Python 3, psycopg2, local Docker Postgres (port 9432)

**Spec:** `docs/superpowers/specs/2026-03-31-rest-api-backup-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `scripts/backup.sh` | Rewrite | REST API data dump, verification, staleness check, ntfy |
| `scripts/backup-restore.py` | Create | Monthly restore test: run migrations, insert JSON, sanity checks |
| `scripts/backup-install.sh` | Modify | Update prerequisites, remove pgpass/DATABASE_URL setup |
| `.gitignore` | Already updated | New backup formats covered |
| `supabase/migrations/012a_*`, `012b_*`, `048a_*`, `048b_*` | Already renamed | Unique prefixes for deterministic order |

---

### Task 1: Install psycopg2

**Files:**
- None (system dependency)

- [ ] **Step 1: Install psycopg2-binary**

```bash
pip3 install psycopg2-binary
```

Expected: `Successfully installed psycopg2-binary-2.9.x`

- [ ] **Step 2: Verify import**

```bash
python3 -c "import psycopg2; print(psycopg2.__version__)"
```

Expected: prints version string (e.g., `2.9.10`)

---

### Task 2: Rewrite backup.sh — credential loading and table discovery

**Files:**
- Modify: `scripts/backup.sh` (replace lines 1–107 entirely)

- [ ] **Step 1: Write the new script header, credential loading, and table fetch**

Replace the entire contents of `scripts/backup.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
NTFY_TOPIC="pa-stats"
RESTORE_TEST=false
MIN_DECOMPRESSED_BYTES=1024
MIN_TABLE_COUNT=30
SUPABASE_URL="https://jfovputrcntthmesmjmh.supabase.co"
PAGE_SIZE=1000

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

# --- Staleness check ---
# Alert if previous backup is older than 25 hours (catches missed launchd runs)
NEWEST_BACKUP=$(find "$BACKUP_DIR" -name "*.json.tar.gz" -maxdepth 1 -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1 || true)
if [[ -n "$NEWEST_BACKUP" ]]; then
  BACKUP_AGE_SEC=$(( $(date +%s) - $(stat -f %m "$NEWEST_BACKUP") ))
  if [[ "$BACKUP_AGE_SEC" -gt 90000 ]]; then  # 25 hours
    ntfy "WARNING: Previous backup is $(( BACKUP_AGE_SEC / 3600 )) hours old — possible missed run"
  fi
fi

# --- Load service role key from terraform.tfvars ---
TFVARS_FILE="$PROJECT_ROOT/infra/terraform.tfvars"
SRK=""
if [[ -f "$TFVARS_FILE" ]]; then
  SRK=$(grep '^supabase_service_role_key' "$TFVARS_FILE" | sed 's/.*= *"//;s/".*//' || true)
fi

if [[ -z "$SRK" ]]; then
  log "ERROR: Service role key not found in $TFVARS_FILE"
  ntfy "Backup FAILED — service role key not found"
  exit 1
fi

# --- Discover tables ---
log "Fetching table list..."
TABLE_LIST_JSON=$(curl -sf "${SUPABASE_URL}/rest/v1/" -H "apikey: ${SRK}" 2>>"$LOG_FILE") || {
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SUPABASE_URL}/rest/v1/" -H "apikey: ${SRK}")
  if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
    log "ERROR: Credential failure (HTTP $HTTP_CODE) — service role key may be invalid or rotated"
  else
    log "ERROR: Failed to fetch table list (HTTP $HTTP_CODE)"
  fi
  ntfy "Backup FAILED — cannot fetch table list (HTTP ${HTTP_CODE:-?})"
  exit 1
}

# Extract table names, skip rpc/ endpoints
TABLES=$(echo "$TABLE_LIST_JSON" | jq -r '.paths | keys[] | select(startswith("rpc/") | not) | ltrimstr("/")')
TABLE_COUNT=$(echo "$TABLES" | wc -l | tr -d ' ')

if [[ "$TABLE_COUNT" -lt "$MIN_TABLE_COUNT" ]]; then
  log "ERROR: Only $TABLE_COUNT tables found (minimum $MIN_TABLE_COUNT) — possible API misconfiguration"
  ntfy "Backup FAILED — only $TABLE_COUNT tables (expected $MIN_TABLE_COUNT+)"
  exit 1
fi

log "  Found $TABLE_COUNT tables"
```

- [ ] **Step 2: Test credential loading**

```bash
bash -x scripts/backup.sh --help
```

Expected: prints usage and exits 0 (validates syntax)

```bash
# Quick test: source just the credential section
bash -c 'source <(head -80 scripts/backup.sh) && echo "SRK length: ${#SRK}"'
```

Expected: prints `SRK length: NN` where NN > 0

- [ ] **Step 3: Commit**

```bash
git add scripts/backup.sh
git commit -m "refactor(backup): replace pg_dump with REST API credential loading and table discovery"
```

---

### Task 3: Rewrite backup.sh — paginated data fetch and archive creation

**Files:**
- Modify: `scripts/backup.sh` (append after table discovery)

- [ ] **Step 1: Append the data fetch, archive, and verification sections**

Append to `scripts/backup.sh`:

```bash
# --- Determine day-of-week filename ---
DAY_NAME=$(date +%A | tr '[:upper:]' '[:lower:]')
TARGET_FILE="$BACKUP_DIR/${DAY_NAME}.json.tar.gz"
CHECKSUM_FILE="${TARGET_FILE}.sha256"
TEMP_DIR=$(mktemp -d "$BACKUP_DIR/.backup_tmp_XXXXXX")

# --- Cleanup trap ---
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# --- Fetch all tables ---
log "Backup started — target: ${DAY_NAME}.json.tar.gz ($TABLE_COUNT tables)"
ntfy "Backup started"

FAILED_TABLES=()
for TABLE in $TABLES; do
  OUTFILE="$TEMP_DIR/${TABLE}.json"
  ALL_ROWS="["
  OFFSET=0
  FIRST_PAGE=true

  while true; do
    RANGE_END=$(( OFFSET + PAGE_SIZE - 1 ))
    HTTP_CODE=$(curl -s -o "$TEMP_DIR/.page_tmp.json" -w "%{http_code}" \
      -f "${SUPABASE_URL}/rest/v1/${TABLE}?select=*&order=ctid" \
      -H "apikey: ${SRK}" \
      -H "Authorization: Bearer ${SRK}" \
      -H "Range: ${OFFSET}-${RANGE_END}" \
      -H "Range-Unit: items" \
      -H "Prefer: count=exact" 2>>"$LOG_FILE") || true

    if [[ "$HTTP_CODE" == "416" ]]; then
      # Range past end — table had exact multiple of PAGE_SIZE rows
      break
    fi

    if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "206" ]]; then
      if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]]; then
        log "ERROR: Credential failure fetching $TABLE (HTTP $HTTP_CODE)"
      else
        log "ERROR: Failed to fetch $TABLE (HTTP $HTTP_CODE)"
      fi
      FAILED_TABLES+=("$TABLE")
      break
    fi

    PAGE_DATA=$(cat "$TEMP_DIR/.page_tmp.json")
    PAGE_ROWS=$(echo "$PAGE_DATA" | jq 'length')

    # Append rows to accumulator
    if [[ "$FIRST_PAGE" == true ]]; then
      ALL_ROWS=$(echo "$PAGE_DATA" | jq -c '.')
      FIRST_PAGE=false
    else
      # Merge arrays
      ALL_ROWS=$(echo "$ALL_ROWS" "$PAGE_DATA" | jq -sc '.[0] + .[1]')
    fi

    # 200 = final page, 206 = more pages
    if [[ "$HTTP_CODE" == "200" ]]; then
      break
    fi

    OFFSET=$(( OFFSET + PAGE_SIZE ))
  done

  if [[ ! " ${FAILED_TABLES[*]:-} " =~ " ${TABLE} " ]]; then
    echo "$ALL_ROWS" > "$OUTFILE"
  fi
done

rm -f "$TEMP_DIR/.page_tmp.json"

# --- Fail if any table fetch failed ---
if [[ ${#FAILED_TABLES[@]} -gt 0 ]]; then
  log "ERROR: Failed to fetch ${#FAILED_TABLES[@]} tables: ${FAILED_TABLES[*]}"
  ntfy "Backup FAILED — ${#FAILED_TABLES[@]} tables failed: ${FAILED_TABLES[*]}"
  exit 1
fi

# --- Create archive ---
TAR_NAME="${DAY_NAME}.json.tar.gz"
(cd "$TEMP_DIR" && tar czf "$TEMP_DIR/../.backup_archive.tar.gz" *.json)
TEMP_ARCHIVE="$BACKUP_DIR/.backup_archive.tar.gz"

log "Dump complete — verifying..."

# --- Verify: Checksum ---
CHECKSUM=$(shasum -a 256 "$TEMP_ARCHIVE" | awk '{print $1}')
log "  Checksum: $CHECKSUM"

# --- Verify: Tar/gzip integrity ---
if ! tar tzf "$TEMP_ARCHIVE" > /dev/null 2>>"$LOG_FILE"; then
  log "ERROR: tar/gzip integrity check failed"
  ntfy "Backup FAILED — tar/gzip integrity check failed"
  exit 1
fi
log "  Tar/gzip integrity: OK"

# --- Verify: Content validation ---
SETTINGS_ROWS=$(cat "$TEMP_DIR/settings.json" | jq 'length')
if [[ "$SETTINGS_ROWS" -lt 1 ]]; then
  log "ERROR: settings.json is empty — backup may be incomplete"
  ntfy "Backup FAILED — settings.json empty"
  exit 1
fi

NON_EMPTY_COUNT=0
for f in "$TEMP_DIR"/*.json; do
  ROWS=$(jq 'length' "$f")
  if [[ "$ROWS" -gt 0 ]]; then
    NON_EMPTY_COUNT=$(( NON_EMPTY_COUNT + 1 ))
  fi
done
log "  Content validation: OK ($NON_EMPTY_COUNT tables with data)"

# --- Verify: Size sanity ---
ARCHIVE_SIZE=$(stat -f %z "$TEMP_ARCHIVE")
if [[ "$ARCHIVE_SIZE" -lt "$MIN_DECOMPRESSED_BYTES" ]]; then
  log "ERROR: Archive size ${ARCHIVE_SIZE} bytes is below minimum ${MIN_DECOMPRESSED_BYTES}"
  ntfy "Backup FAILED — archive too small (${ARCHIVE_SIZE} bytes)"
  exit 1
fi
log "  Size sanity: OK (${ARCHIVE_SIZE} bytes)"

# --- Rotate: atomic move ---
mv -f "$TEMP_ARCHIVE" "$TARGET_FILE"
echo "$CHECKSUM  ${TAR_NAME}" > "$CHECKSUM_FILE"

COMPRESSED_SIZE=$(ls -lh "$TARGET_FILE" | awk '{print $5}')
log "Backup complete — ${TAR_NAME} (${COMPRESSED_SIZE}), checksum OK, $NON_EMPTY_COUNT tables with data"
ntfy "Backup complete — ${TAR_NAME} (${COMPRESSED_SIZE}), $NON_EMPTY_COUNT tables with data"
```

- [ ] **Step 2: Test the full backup (without restore test)**

```bash
bash scripts/backup.sh
```

Expected output includes:
- `Found NN tables` (NN >= 30)
- `Backup started — target: tuesday.json.tar.gz`
- `Checksum: <sha256>`
- `Tar/gzip integrity: OK`
- `Content validation: OK`
- `Size sanity: OK`
- `Backup complete`

Verify the archive:
```bash
ls -lh backups/tuesday.json.tar.gz
tar tzf backups/tuesday.json.tar.gz | head -10
```

- [ ] **Step 3: Commit**

```bash
git add scripts/backup.sh
git commit -m "feat(backup): REST API data fetch with pagination, verification, and staleness check"
```

---

### Task 4: Rewrite backup.sh — restore test invocation

**Files:**
- Modify: `scripts/backup.sh` (replace the old restore test section at the bottom)

- [ ] **Step 1: Append the restore test section**

Append to `scripts/backup.sh`:

```bash
# --- Monthly restore test ---
# Auto-trigger on the 1st of each month, or when --restore-test is passed
if [[ "$(date +%d)" == "01" ]]; then
  RESTORE_TEST=true
  log "First of month — auto-triggering restore test"
fi

if [[ "$RESTORE_TEST" == true ]]; then
  RESTORE_SCRIPT="$SCRIPT_DIR/backup-restore.py"
  MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"
  RESTORE_HOST="${RESTORE_TEST_HOST:-localhost}"
  RESTORE_PORT="${RESTORE_TEST_PORT:-9432}"
  RESTORE_USER="${RESTORE_TEST_USER:-brevi}"

  log "Monthly restore test started (${RESTORE_HOST}:${RESTORE_PORT})"
  ntfy "Monthly restore test started"

  if python3 "$RESTORE_SCRIPT" \
    --backup "$TARGET_FILE" \
    --migrations "$MIGRATIONS_DIR" \
    --host "$RESTORE_HOST" \
    --port "$RESTORE_PORT" \
    --user "$RESTORE_USER" \
    2>>"$LOG_FILE"; then
    log "Restore test passed"
    ntfy "Restore test passed"
  else
    RESTORE_EXIT=$?
    if [[ "$RESTORE_EXIT" -eq 2 ]]; then
      log "Restore test skipped — Docker Postgres not reachable at ${RESTORE_HOST}:${RESTORE_PORT}"
      ntfy "Restore test skipped — Docker Postgres unreachable"
    else
      log "ERROR: Restore test failed (exit $RESTORE_EXIT)"
      ntfy "Restore test FAILED"
    fi
  fi
fi

log "All done."
```

- [ ] **Step 2: Verify script syntax**

```bash
bash -n scripts/backup.sh
```

Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add scripts/backup.sh
git commit -m "feat(backup): add restore test invocation calling backup-restore.py"
```

---

### Task 5: Create backup-restore.py

**Files:**
- Create: `scripts/backup-restore.py`

- [ ] **Step 1: Write the restore test script**

Create `scripts/backup-restore.py`:

```python
#!/usr/bin/env python3
"""Monthly restore test for REST API JSON backups.

Restores a .json.tar.gz backup into a temporary local Postgres database,
runs migrations to create the schema, inserts backed-up data, and validates
row counts.

Exit codes:
  0 = pass
  1 = fail
  2 = skipped (Docker Postgres unreachable)
"""

import argparse
import glob
import json
import os
import sys
import tarfile
import tempfile

try:
    import psycopg2
    from psycopg2.extras import Json
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip3 install psycopg2-binary", file=sys.stderr)
    sys.exit(1)


DB_NAME = "backup_verify_tmp"


def parse_args():
    parser = argparse.ArgumentParser(description="Restore test for JSON backups")
    parser.add_argument("--backup", required=True, help="Path to .json.tar.gz backup file")
    parser.add_argument("--migrations", required=True, help="Path to supabase/migrations/ directory")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", default="9432", type=int)
    parser.add_argument("--user", default="brevi")
    return parser.parse_args()


def connect(host, port, user, dbname="postgres"):
    """Connect to Postgres. Returns connection or None."""
    try:
        conn = psycopg2.connect(host=host, port=port, user=user, dbname=dbname)
        conn.autocommit = True
        return conn
    except psycopg2.OperationalError:
        return None


def create_db(conn):
    """Create the temporary test database."""
    cur = conn.cursor()
    cur.execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
    cur.execute(f"CREATE DATABASE {DB_NAME}")
    cur.close()


def drop_db(conn):
    """Drop the temporary test database."""
    cur = conn.cursor()
    cur.execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
    cur.close()


def run_migrations(conn, migrations_dir):
    """Run all migration SQL files in alphabetical order."""
    migration_files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))
    cur = conn.cursor()
    skipped = 0
    for path in migration_files:
        filename = os.path.basename(path)
        with open(path, "r") as f:
            sql = f.read()
        try:
            cur.execute(sql)
            conn.commit()
        except psycopg2.Error as e:
            conn.rollback()
            err_msg = str(e).lower()
            # pg_cron and storage extensions don't exist in local Postgres — skip
            if "cron" in err_msg or "storage" in err_msg or "schema" in err_msg:
                skipped += 1
                print(f"  SKIP {filename}: {e.diag.message_primary}", file=sys.stderr)
            else:
                print(f"  WARN {filename}: {e.diag.message_primary}", file=sys.stderr)
                skipped += 1
    cur.close()
    print(f"  Migrations: {len(migration_files)} run, {skipped} skipped")


def get_row_counts(conn):
    """Get row counts for all public tables."""
    cur = conn.cursor()
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    tables = [row[0] for row in cur.fetchall()]
    counts = {}
    for table in tables:
        try:
            cur.execute(f'SELECT count(*) FROM public."{table}"')
            counts[table] = cur.fetchone()[0]
        except psycopg2.Error:
            conn.rollback()
            counts[table] = 0
    cur.close()
    return counts


def jsonb_convert(value):
    """Convert dicts/lists to psycopg2 Json wrapper for JSONB columns."""
    if isinstance(value, (dict, list)):
        return Json(value)
    return value


def insert_data(conn, json_dir):
    """Insert JSON backup data into tables with FK checks disabled."""
    cur = conn.cursor()

    # Disable FK checks, triggers, and RLS for bulk insert
    cur.execute("SET session_replication_role = replica")

    json_files = sorted(glob.glob(os.path.join(json_dir, "*.json")))
    inserted = 0
    for path in json_files:
        table = os.path.basename(path).replace(".json", "")
        with open(path, "r") as f:
            rows = json.load(f)

        if not rows:
            continue

        columns = list(rows[0].keys())
        placeholders = ", ".join(["%s"] * len(columns))
        col_names = ", ".join([f'"{c}"' for c in columns])
        sql = f'INSERT INTO public."{table}" ({col_names}) VALUES ({placeholders})'

        row_count = 0
        for row in rows:
            values = [jsonb_convert(row.get(c)) for c in columns]
            try:
                cur.execute(sql, values)
                row_count += 1
            except psycopg2.Error as e:
                conn.rollback()
                cur.execute("SET session_replication_role = replica")
                if row_count == 0:
                    print(f"  WARN {table}: {e.diag.message_primary}", file=sys.stderr)
                    break
                # Log but continue — partial insert for this table
                continue

        if row_count > 0:
            conn.commit()
            inserted += 1

    # Re-enable FK checks
    cur.execute("SET session_replication_role = DEFAULT")
    conn.commit()
    cur.close()
    return inserted


def sanity_check(baseline, current):
    """Verify key tables gained rows beyond migration seeds."""
    key_tables = ["content", "events", "settings"]
    passed = True
    for table in key_tables:
        base = baseline.get(table, 0)
        now = current.get(table, 0)
        delta = now - base
        if delta <= 0:
            print(f"  FAIL {table}: baseline={base}, current={now}, delta={delta}")
            passed = False
        else:
            print(f"  OK   {table}: +{delta} rows (baseline={base}, current={now})")

    tables_with_data = sum(1 for v in current.values() if v > 0)
    print(f"  Tables with data: {tables_with_data}")
    return passed


def main():
    args = parse_args()

    # 1. Connectivity check
    admin_conn = connect(args.host, args.port, args.user)
    if admin_conn is None:
        print(f"Docker Postgres not reachable at {args.host}:{args.port}", file=sys.stderr)
        sys.exit(2)

    try:
        # 2. Create temp database
        print(f"Creating database {DB_NAME}...")
        create_db(admin_conn)

        # Connect to the new database
        db_conn = connect(args.host, args.port, args.user, DB_NAME)
        if db_conn is None:
            print(f"Cannot connect to {DB_NAME}", file=sys.stderr)
            sys.exit(1)
        db_conn.autocommit = False

        # 3. Run migrations
        print("Running migrations...")
        db_conn.autocommit = True
        run_migrations(db_conn, args.migrations)
        db_conn.autocommit = False

        # 4. Record baseline row counts (from migration seeds)
        baseline = get_row_counts(db_conn)

        # 5. Extract backup archive
        print("Extracting backup...")
        extract_dir = tempfile.mkdtemp()
        with tarfile.open(args.backup, "r:gz") as tar:
            tar.extractall(extract_dir)

        # 6. Insert data
        print("Inserting backup data...")
        db_conn.autocommit = True
        tables_inserted = insert_data(db_conn, extract_dir)
        print(f"  Inserted data into {tables_inserted} tables")

        # 7. Sanity checks
        print("Running sanity checks...")
        current = get_row_counts(db_conn)
        passed = sanity_check(baseline, current)

        db_conn.close()

        if passed:
            print("RESTORE TEST PASSED")
            sys.exit(0)
        else:
            print("RESTORE TEST FAILED")
            sys.exit(1)

    finally:
        # 8. Cleanup
        print(f"Dropping database {DB_NAME}...")
        admin_conn = connect(args.host, args.port, args.user)
        if admin_conn:
            drop_db(admin_conn)
            admin_conn.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/backup-restore.py
```

- [ ] **Step 3: Verify syntax**

```bash
python3 -m py_compile scripts/backup-restore.py && echo "Syntax OK"
```

Expected: `Syntax OK`

- [ ] **Step 4: Commit**

```bash
git add scripts/backup-restore.py
git commit -m "feat(backup): add Python restore test helper with psycopg2 parameterized inserts"
```

---

### Task 6: Update backup-install.sh prerequisites

**Files:**
- Modify: `scripts/backup-install.sh`

- [ ] **Step 1: Replace prerequisite check and credential setup**

In `scripts/backup-install.sh`, replace lines 14–98 (from `DB_HOST=` through `echo "  Database connection verified."`) with:

```bash
echo "Checking prerequisites..."
MISSING=()

for cmd in curl jq python3 gzip tar; do
  if ! command -v "$cmd" &>/dev/null; then
    MISSING+=("$cmd")
  fi
done

# Check psycopg2
if ! python3 -c "import psycopg2" &>/dev/null; then
  MISSING+=("psycopg2 (pip3 install psycopg2-binary)")
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
  echo "ERROR: Missing required dependencies: ${MISSING[*]}"
  echo ""
  echo "Install with:"
  echo "  brew install jq           # JSON processor"
  echo "  pip3 install psycopg2-binary  # Python Postgres driver (restore test)"
  echo "  (curl, gzip, tar, python3 are built into macOS)"
  exit 1
fi
echo "  All prerequisites found."

# Soft-check for restore test dependencies
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

# Check service role key in terraform.tfvars
TFVARS_FILE="$PROJECT_ROOT/infra/terraform.tfvars"
if [[ ! -f "$TFVARS_FILE" ]]; then
  echo "ERROR: $TFVARS_FILE not found — backup needs the service role key."
  exit 1
fi
SRK=$(grep '^supabase_service_role_key' "$TFVARS_FILE" | sed 's/.*= *"//;s/".*//' || true)
if [[ -z "$SRK" ]]; then
  echo "ERROR: supabase_service_role_key not found in $TFVARS_FILE"
  exit 1
fi
echo "  Service role key found in terraform.tfvars"

# Verify Supabase REST API connectivity
echo "  Verifying Supabase API connectivity..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://jfovputrcntthmesmjmh.supabase.co/rest/v1/" -H "apikey: ${SRK}")
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "ERROR: Supabase API returned HTTP $HTTP_CODE — check service role key."
  exit 1
fi
echo "  Supabase API connection verified."
```

- [ ] **Step 2: Update the launchd plist PATH line**

In `scripts/backup-install.sh`, update the PATH in the EnvironmentVariables section (line ~129) to include Homebrew's jq:

Replace:
```
    <string>/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
```
With:
```
    <string>/opt/homebrew/bin:/usr/local/opt/libpq/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:/usr/bin:/bin</string>
```

- [ ] **Step 3: Remove the pgpass and DATABASE_URL cleanup code**

Delete the lines that write `~/.pgpass` and remove `DATABASE_URL` from `.env.local` (the old lines 76-89). These are no longer needed since the backup uses the REST API.

- [ ] **Step 4: Update the summary output at the end**

Replace the `Creds` line in the summary:
```
echo "  Creds    : ~/.pgpass (mode 600)"
```
With:
```
echo "  Creds    : infra/terraform.tfvars (service role key)"
```

- [ ] **Step 5: Verify syntax**

```bash
bash -n scripts/backup-install.sh && echo "Syntax OK"
```

Expected: `Syntax OK`

- [ ] **Step 6: Commit**

```bash
git add scripts/backup-install.sh
git commit -m "refactor(backup): update installer for REST API prerequisites, remove pgpass setup"
```

---

### Task 7: End-to-end test — backup only

**Files:**
- None (testing)

- [ ] **Step 1: Run the full backup**

```bash
bash scripts/backup.sh
```

Expected:
- `Found NN tables` (NN >= 30)
- `Backup started`
- All verifications pass
- `Backup complete`

- [ ] **Step 2: Inspect the archive contents**

```bash
tar tzf backups/$(date +%A | tr '[:upper:]' '[:lower:]').json.tar.gz | sort
```

Expected: lists all table JSON files (content.json, events.json, settings.json, etc.)

```bash
tar xzf backups/$(date +%A | tr '[:upper:]' '[:lower:]').json.tar.gz -O settings.json | jq length
```

Expected: `1` (settings has exactly one row)

- [ ] **Step 3: Verify old SQL patterns are gone**

```bash
grep -c "pg_dump\|DATABASE_URL\|CREATE TABLE\|COPY.*FROM stdin" scripts/backup.sh
```

Expected: `0` (none of the old pg_dump patterns remain)

---

### Task 8: End-to-end test — restore test

**Files:**
- None (testing)

- [ ] **Step 1: Verify Docker Postgres is running**

```bash
psql -w -h localhost -p 9432 -U brevi -c "SELECT 1" postgres
```

Expected: returns `1`. If not, start the Docker stack first.

- [ ] **Step 2: Run backup with restore test**

```bash
bash scripts/backup.sh --restore-test
```

Expected:
- Backup completes successfully
- `Monthly restore test started`
- `Running migrations...` with some SKIPs for pg_cron/storage
- `Inserting backup data...`
- `Running sanity checks...`
- `OK content: +N rows`
- `OK events: +N rows`
- `OK settings: +N rows`
- `RESTORE TEST PASSED`
- `Restore test passed`

- [ ] **Step 3: Verify temp database was cleaned up**

```bash
psql -w -h localhost -p 9432 -U brevi -c "SELECT datname FROM pg_database WHERE datname = 'backup_verify_tmp'" postgres
```

Expected: returns 0 rows (database was dropped)

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(backup): complete REST API backup with verified restore test"
```
