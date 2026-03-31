# Nightly Production Database Backup — Design Spec

## Goal

Automated nightly backup of the production Supabase database to the Mac Mini, with rolling 7-day retention, integrity verification, and zero risk of data loss.

## Scope

**In scope:**
- Full `public` schema dump (schema + data + RLS policies) via `pg_dump`
- Rolling 7-day window — files named by day-of-week, day 8 overwrites day 1
- Nightly integrity verification: SHA-256 checksum + SQL parse validation
- Monthly full restore test into a temporary local Postgres database
- ntfy notifications on start, stop, and error
- macOS `launchd` scheduling at 5am ET daily
- Installer script for the launchd plist

**Out of scope:**
- Supabase internal schemas (`auth`, `storage`, `supabase_migrations`, `extensions`, `realtime`, `pgsodium`, `vault`, `graphql`, `graphql_public`)
- Backup file encryption (FileVault covers at-rest encryption on the Mac Mini)
- Off-site / cloud backup replication
- Supabase Management API (Free plan — no access)

## Architecture

### Backup Script (`scripts/backup.sh`)

Single bash script with two modes:

1. **Default (nightly):** dump → verify checksum + parse → rotate into day-of-week slot
2. **`--restore-test`:** also restores into a temporary local Postgres DB and runs sanity checks

#### Dump strategy

```
pg_dump "$DATABASE_URL" \
  --schema=public \
  --no-owner \
  --no-acl \
  | gzip > "$TEMP_FILE"
```

Excludes all Supabase internal schemas by targeting only `--schema=public`. Captures:
- All table definitions (CREATE TABLE, indexes, constraints)
- All row data
- All RLS policies
- All functions/triggers in the public schema

#### Rolling 7-day rotation

Files named by lowercase day-of-week:

```
backups/
  monday.sql.gz       # overwritten each Monday
  monday.sql.gz.sha256
  tuesday.sql.gz
  tuesday.sql.gz.sha256
  ...
  sunday.sql.gz
  sunday.sql.gz.sha256
```

#### Zero data loss guarantee

The script never overwrites the existing day-of-week file until the new backup is fully verified:

1. Dump to a temp file (`backups/.backup_tmp.sql.gz`)
2. Generate SHA-256 checksum of the temp file
3. Decompress and run SQL parse validation (`psql -f` against `/dev/null`)
4. Only on success: atomically move temp file → day-of-week file, write checksum file
5. On failure: temp file is deleted, existing day-of-week backup is preserved, error notification sent

#### Nightly integrity verification

After every dump (no DB connection needed):

1. **Checksum:** `shasum -a 256` of the gzipped file, stored in `<day>.sql.gz.sha256`
2. **Gzip integrity:** `gunzip -t` — verifies the archive is not corrupted or truncated
3. **Content validation:** decompress and check that the SQL contains expected markers (`CREATE TABLE`, `INSERT INTO`, `ROW LEVEL SECURITY`)
4. **Size sanity:** verify the decompressed size is above a minimum threshold (catches empty or suspiciously small dumps)

#### Monthly restore test (`--restore-test`)

Runs automatically on the 1st of each month (script checks `date +%d == 01`), also runnable manually:

1. `createdb backup_verify_tmp`
2. `gunzip -c <latest>.sql.gz | psql backup_verify_tmp`
3. Sanity checks:
   - Count tables in public schema (expect > 0)
   - Count rows in key tables (`content`, `gallery`, `events`)
   - Verify settings row exists
4. `dropdb backup_verify_tmp`
5. Report pass/fail via ntfy

If the restore test fails, it sends an error notification but does NOT affect the backup files.

### Notifications

Three `curl` calls to `ntfy.sh/pa-stats`:

| Event | Message |
|---|---|
| **start** | `Backup started` |
| **stop** | `Backup complete — <day>.sql.gz (<size>), checksum OK, parse OK` |
| **error** | `Backup FAILED — <error context>` |

For monthly restore test, additional notifications:
| Event | Message |
|---|---|
| **start** | `Monthly restore test started` |
| **stop** | `Restore test passed — <table count> tables, <row counts>` |
| **error** | `Restore test FAILED — <error context>` |

Implementation:
```bash
ntfy() {
  local msg="$1"
  curl -sf -d "$msg" ntfy.sh/pa-stats > /dev/null 2>&1 || true
}
```

The `|| true` ensures a ntfy delivery failure never aborts the backup itself.

### Scheduling

macOS `launchd` plist installed at `~/Library/LaunchAgents/com.purpleacorns.backup.plist`.

Key properties:
- `StartCalendarInterval`: hour=5, minute=0 (5am ET — assumes Mac Mini system clock is ET)
- `StandardOutPath` / `StandardErrorPath`: `backups/backup.log` (rotated by the script)
- `RunAtLoad`: false (don't run on login, only on schedule)
- `KeepAlive`: false (run once, not a daemon)

`launchd` advantages over cron on macOS:
- Runs missed jobs after wake-from-sleep
- Better integration with macOS power management
- Native log integration

### Installer Script (`scripts/backup-install.sh`)

Interactive script that:
1. Verifies prerequisites: `pg_dump`, `psql`, `createdb`, `dropdb`, `gzip`, `curl`
2. Checks `DATABASE_URL` is set (in env or `.env.local`)
3. Writes the launchd plist to `~/Library/LaunchAgents/`
4. Loads it with `launchctl load`
5. Offers to run a test backup immediately

## Files

| File | Action | Purpose |
|---|---|---|
| `scripts/backup.sh` | Replace | New full-dump backup script |
| `scripts/backup-install.sh` | Create | Installs launchd plist + verifies prereqs |
| `.gitignore` | Modify | Add `backups/*.sql.gz`, `backups/*.sha256`, `backups/backup.log` |

## Prerequisites (Mac Mini)

- `pg_dump` and `psql` — via Postgres.app or `brew install libpq`
- `createdb` / `dropdb` — for monthly restore test (same install as above)
- `gzip` / `gunzip` — built into macOS
- `curl` — built into macOS
- `DATABASE_URL` in `.env.local` — Supabase PostgreSQL connection string
- FileVault enabled — for at-rest encryption of backup files

## Security Notes

- Backup files contain the full `public` schema including the `settings` table (which has API keys like Resend, Square credentials). These files are gitignored.
- The `auth` schema is excluded — no password hashes or OAuth tokens in backups.
- Encrypted fields (OAuth tokens via AES-256-GCM) remain as ciphertext in the dump.
- FileVault provides at-rest encryption on the Mac Mini's disk.
- The ntfy topic (`pa-stats`) sends notification text only — no backup data.
- `DATABASE_URL` contains the DB password — the launchd plist references the script which reads it from `.env.local`, never embedding the password in the plist itself.
