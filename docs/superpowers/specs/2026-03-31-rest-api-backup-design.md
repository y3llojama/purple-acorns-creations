# REST API Backup — Design Spec

**Date:** 2026-03-31
**Status:** Approved (revised after architect, security, devops, DBA reviews)
**Replaces:** pg_dump-based backup in `scripts/backup.sh`

## Problem

The nightly backup uses `pg_dump` over a direct Postgres connection (port 5432). This connection is unreliable — the Supabase database port is blocked or intermittently unreachable, while the REST API (PostgREST) works consistently. The backup has been failing since at least 2026-03-31.

## Solution

Refactor `scripts/backup.sh` to pull all data via the Supabase REST API instead of `pg_dump`. Add a Python helper `scripts/backup-restore.py` for the monthly restore test.

## Architecture

### Backup flow (bash — `scripts/backup.sh`)

1. Read service role key from `infra/terraform.tfvars` at runtime; **fail fast** with a clear log message + ntfy alert if the file is missing, the key is absent, or the extracted value is empty
2. Fetch table list from PostgREST OpenAPI endpoint (`GET /rest/v1/`); filter out `rpc/` entries
3. **Minimum table count gate:** fail if fewer than 30 tables are returned (guards against silent data loss from API misconfiguration)
4. For each table, fetch all rows: `GET /rest/v1/{table}?select=*` with `Range` header pagination (1000 rows per request)
5. Write each table as `{table}.json` in a temp directory
6. Tar + gzip the directory → `{day-of-week}.json.tar.gz`
7. Verification pipeline:
   - SHA-256 checksum
   - Tar/gzip integrity check (`tar tzf`)
   - Content validation: at least 1 non-empty JSON file, `settings.json` has 1+ entries
   - Size sanity: minimum 1KB decompressed
8. Atomic move to final location, write checksum file
9. ntfy notification on success/failure
10. **Staleness check:** on every run, check if the previous backup is older than 25 hours; if so, send an additional ntfy alert ("missed backup detected") — catches launchd skipping jobs when the Mac is asleep

### Restore test (Python — `scripts/backup-restore.py`)

Triggered on the 1st of each month or via `--restore-test` flag. Uses `psycopg2` for all database operations.

1. **Connectivity check:** test connection to local Docker Postgres (`localhost:9432`, user `brevi`) before proceeding; log clear message and skip if unreachable
2. Create temp database `backup_verify_tmp`
3. Run all `supabase/migrations/*.sql` files in alphabetical order to create the production schema
   - **`pg_cron` handling:** wrap in try/except — migrations that call `cron.schedule()` will fail on local Postgres which lacks the `pg_cron` extension; log a warning and continue
4. **Record baseline row counts** for seeded tables (migrations may insert seed data, e.g., `settings`)
5. **Disable FK checks:** `SET session_replication_role = replica` — prevents FK violation errors from insertion order and missing `auth.users` references
6. For each `{table}.json` in the backup:
   - Parse JSON array
   - Insert using `psycopg2` **parameterized queries** (`cursor.execute(sql, values)`)
   - **JSONB columns:** use `psycopg2.extras.Json()` wrapper for dict/list values
   - **Timestamps/dates:** pass as strings — `psycopg2` handles ISO-8601 coercion
   - Skip empty tables (empty JSON arrays)
7. **Re-enable FK checks:** `SET session_replication_role = DEFAULT`
8. Sanity checks:
   - Count of tables with data > 0
   - Key tables have rows **exceeding the baseline** (not just migration seeds): `content`, `events`, `settings`
9. Drop temp database
10. Report pass/fail via ntfy

### Pagination

PostgREST returns `206 Partial Content` when more rows exist and `200 OK` on the final page. The script uses this as the termination signal:

```
Range: 0-999       → if 206, continue; if 200, done
Range: 1000-1999   → if 206, continue; if 200, done
...
```

- `206` = more pages, continue
- `200` = final page, stop
- `416 Range Not Satisfiable` = offset past end, treat as clean stop (empty table after exact multiple of 1000)
- Any other status (4xx, 5xx) = fail the entire backup

Also use `curl --fail` (`-f`) so HTTP 4xx/5xx produce non-zero exit codes.

### Authentication

- Service role key is read from `infra/terraform.tfvars` at script startup
- **Fail-fast:** if key is empty or file is missing, log error + ntfy alert and exit immediately
- **HTTP 401/403 detection:** if the OpenAPI call or any table fetch returns 401/403, log "credential failure" specifically (not just "API error")
- Passed via `apikey` and `Authorization: Bearer` headers
- Never written to disk outside of tfvars (which is gitignored)
- Key bypasses RLS to access all rows in all tables

### Consistency model

**Accepted limitation:** Unlike `pg_dump` (which uses a single repeatable-read transaction), the REST API fetches each table in a separate HTTP request. Tables are **not** guaranteed to be mutually consistent — a concurrent write could produce a backup where a parent row exists but its child doesn't, or vice versa.

**Mitigation:** This is acceptable because:
- Total data is ~18KB; writes are infrequent (admin-only CMS)
- The backup runs at 5am when no admin activity is expected
- The restore test disables FK checks, so inconsistencies won't cause restore failures
- Schema is versioned separately in `supabase/migrations/`

### What is backed up

| Backed up | Not backed up (by design) |
|---|---|
| All rows from all public tables | Schema/DDL (in `supabase/migrations/` under git) |
| All columns including encrypted fields | Supabase `auth.*` tables (user accounts) |
| | Supabase `storage.*` metadata |
| | RLS policies, functions, triggers (in migrations) |
| | RPC functions (procedures, not data) |

### What stays the same

- Day-of-week rolling filenames (7-day retention)
- SHA-256 checksum files
- ntfy notifications to `pa-stats` topic
- launchd scheduling (5am daily)
- `--restore-test` CLI flag
- Non-fatal restore test (backup succeeds even if restore test fails)

### What changes

| Before | After |
|---|---|
| `pg_dump` (direct Postgres) | REST API (HTTPS) |
| `.sql.gz` output | `.json.tar.gz` output |
| Requires `libpq`, `~/.pgpass` | Requires `curl`, `python3`, `jq`, `psycopg2` |
| `psql` restore test | Python `psycopg2`-based restore test |
| `DATABASE_URL` env var | Service role key from `terraform.tfvars` |

### File changes

| File | Action |
|---|---|
| `scripts/backup.sh` | Rewrite dump + verification sections |
| `scripts/backup-restore.py` | New — Python restore test helper (uses `psycopg2`) |
| `scripts/backup-install.sh` | Update prerequisite checks: require `curl`, `jq`, `python3`, `psycopg2`; soft-warn if `psql`/`createdb`/`dropdb` missing (restore test only) |
| `.gitignore` | Add `backups/*.json.tar.gz`, `backups/*.json.tar.gz.sha256`, `backups/*.sql`, `backups/*.json` |
| `~/.pgpass` | No longer needed for backup |

### Prerequisites before implementation

- **Renumber duplicate migrations:** `012_remove_location_from_content.sql` / `012_products_storage_bucket.sql` and `048_square_api_debug_log.sql` / `048_product_variations.sql` must have unique prefixes for deterministic replay order
- **Install `psycopg2`:** `pip3 install psycopg2-binary` (needed for restore test)

### Dependencies

- `curl` (built into macOS)
- `python3` (built into macOS)
- `jq` (install via brew if not present; script must resolve Homebrew path for launchd)
- `tar`, `gzip` (built into macOS)
- `psycopg2` (Python package — for restore test DB operations)
- `psql`, `createdb`, `dropdb` (from `libpq` — restore test only, soft dependency)

### Error handling

- **Credential missing/empty:** fail fast with clear log + ntfy alert
- **HTTP 401/403:** distinct "credential failure" error message
- **HTTP 4xx/5xx on any request:** `curl --fail` ensures non-zero exit; entire backup fails
- **Table count < 30:** fail (guards against silent API misconfiguration)
- **Network errors:** curl returns non-zero, script logs and exits
- **Pagination:** if any page request fails, entire backup fails
- **Staleness:** alert if previous backup is >25 hours old (catches missed launchd runs)
- **Restore test:** non-fatal to the backup itself, reported separately via ntfy
- **Restore test — Docker unreachable:** skip with clear log message, not a failure

### Monitoring note (future)

The `analytics_events` table is append-only and may grow to dominate backup time as row count increases. If pagination for this table exceeds 100 requests, consider excluding it from nightly backups or backing it up on a separate schedule.

### Deferred improvements (not in scope)

- Backup encryption at rest (gpg/age)
- Log rotation for `backup.log`
- macOS Keychain for service role key
- Offsite backup copy (rclone/S3)
- Extended retention (weekly/monthly snapshots)
