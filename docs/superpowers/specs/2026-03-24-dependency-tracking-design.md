# Dependency Tracking — Design Spec

**Date:** 2026-03-24
**Status:** Approved

## Overview

A daily GitHub Actions workflow that checks all production dependencies for available updates and maintains a single consolidated GitHub Issue as the notification surface. Repo owners receive email automatically via GitHub's issue watch mechanism.

## Scope

- All packages listed under `dependencies` in `package.json` (not `devDependencies`)
- Notification channel: one GitHub Issue, updated in-place daily
- No external services, no third-party actions

## Workflow Structure

**File:** `.github/workflows/dependency-check.yml`

**Triggers:**
- `schedule`: daily at 08:00 UTC (`cron: '0 8 * * *'`)
- `workflow_dispatch`: manual trigger via GitHub UI

**Permissions:**
```yaml
permissions:
  issues: write
  contents: read
```

**Environment:**
```yaml
env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
`GH_TOKEN` must be set so the `gh` CLI can authenticate — it is not automatic.

**Job-level:** `timeout-minutes: 10` to prevent hangs on `npm ci` network failures.

**Steps:**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` — pin to Node 20 (matching project)
3. `npm ci --ignore-scripts` — fast, clean install. `--ignore-scripts` skips postinstall binaries for `sharp` and `@resvg/resvg-js`, but this is safe because the workflow only reads `npm outdated` JSON output and never executes those packages.
4. `npm outdated --json` with `continue-on-error: true` — exits 1 when outdated packages exist; output redirected to `outdated.json` via `npm outdated --json > outdated.json 2>/dev/null || true`
5. Inline Node script:
   - Reads `package.json` and extracts the keys of `dependencies` (production deps only)
   - Reads `npm outdated --json` output
   - Filters to only packages whose name is in the `dependencies` keys (excludes transitive/dev deps that may appear in the output)
   - For each package, derives severity by comparing `current` vs `latest` semver versions: if major differs → `major`; if minor differs → `minor`; otherwise → `patch`. `wanted` is displayed in the table for reference but is not used for severity.
   - Formats a markdown table; generates timestamp via `new Date().toISOString()` (UTC)
6. `gh issue list --label dependency-updates --state open --json number,title` — find existing open issue by label
   - If multiple issues match the label, use the first result (lowest number)
7. If outdated deps found:
   - Open issue found → `gh issue edit <number> --title "📦 Outdated production dependencies" --body "..." --add-label "dependency-updates,automated"` (re-asserts labels in case they were manually removed)
   - No open issue found → `gh issue create --title "📦 Outdated production dependencies" --label "dependency-updates,automated" --body "..."`
8. If all deps up to date:
   - Open issue found → two calls: `gh issue close <number>` then `gh issue comment <number> --body "✅ ..."` `✅ All production dependencies are up to date as of <timestamp>.`
   - No open issue found → no-op (do nothing)
   - Note: the workflow searches only *open* issues. If a previously-closed issue exists and new outdated deps appear, a fresh issue is created rather than re-opening the old one. This is intentional — old closed issues serve as historical record.

## Issue Format

```
Title: 📦 Outdated production dependencies

## Outdated Dependencies
Last checked: 2026-03-24T08:00:00.000Z

| Package | Current | Wanted | Latest | Severity |
|---------|---------|--------|--------|----------|
| square  | 44.0.1  | 44.0.1 | 45.1.0 | major    |

_This issue is automatically updated daily. Close it once all packages are updated._
```

**Labels:** `dependency-updates`, `automated`

The issue body is fully replaced on each run (not appended), always reflecting current state.

## Error Handling

| Scenario | Behaviour |
|---|---|
| `npm outdated` exits 1 (outdated packages exist) | `continue-on-error: true` — workflow continues normally |
| `npm ci` fails (e.g. lockfile drift) | Workflow fails visibly — no silent swallowing |
| GitHub API / `gh` CLI error | Workflow step fails loudly — visible in Actions log |
| Multiple issues share `dependency-updates` label | Use lowest-numbered open issue |
| Concurrent runs | GitHub Actions prevents overlapping scheduled runs by default |

## Files Created

```
.github/
  workflows/
    dependency-check.yml
```

No new scripts in `scripts/` — this is GitHub infrastructure, not a local dev script.

## Out of Scope

- `devDependencies` (noise, not production risk)
- Auto-creating PRs to bump versions
- Changelog links or release notes
- Slack/email notifications (GitHub issue watch covers this)
- Re-opening previously closed issues (new issues serve as fresh records)
