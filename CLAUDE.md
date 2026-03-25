# Purple Acorns Creations — CLAUDE.md

## Automation

- **Write repeated actions as scripts** in `scripts/` folder, not inline bash
- Available scripts: `scripts/dev.sh`, `scripts/test.sh`, `scripts/build.sh`, `scripts/setup.sh`, `scripts/check-auth.sh`
- **Parallelize independent operations** — dispatch tasks, reviews, and subagents in parallel wherever files don't overlap

## Git

- Author: `y3llojama <y3llojama@gmail.com>`
- Worktrees live in `.worktrees/` (gitignored)
- Commit often; one logical change per commit

## Stack

- Next.js 15 App Router, TypeScript — no Tailwind
- Supabase: PostgreSQL + Auth + Storage
- Jest for tests (`scripts/test.sh` to run)

## Security — Critical Rules

### Authentication
- **Always use `getUser()`, never `getSession()`** for server-side auth — `getSession()` does not verify the JWT
- Three-layer admin auth: Supabase pre-registration + disabled new-user signups + `ADMIN_EMAILS` env var allowlist
- `requireAdminSession()` in `lib/auth.ts` — call this on all admin API routes

### Input sanitization
- Use `sanitizeContent(html)` (from `lib/sanitize.ts`) before injecting any HTML into the DOM
- Use `sanitizeText(str)` for plain-text fields displayed as HTML
- Never skip sanitize-html — even for trusted DB content rendered as HTML

### URL validation
- Use `isValidHttpsUrl(url)` before using any external URL as an `href` or `src`
- All external links: `rel="noopener noreferrer" target="_blank"`

### CORS
- CORS is handled at runtime in `lib/cors.ts` — not in `next.config.js`
- Do not add `Access-Control-Allow-Origin: 'same-origin'` to response headers — that value is invalid

### Rate limiting
- Apply in-memory rate limiting (60s window per IP) to all public API routes

### Security headers
- CSP, X-Frame-Options, etc. are set in `next.config.js` — do not duplicate

## Supabase Patterns

- Server-side: service role client (`lib/supabase/server.ts`)
- Browser: anon client (`lib/supabase/client.ts`)
- `cookies()` in Next.js 15 must be awaited: `const cookieStore = await cookies()`
- Settings table has exactly one row — update with no `.eq()` filter
- No public `SELECT` granted on `settings` table (see `supabase/migrations/001_initial_schema.sql`)

## Next.js Patterns

- `'use client'` components must be in separate files — cannot `export const metadata` from a client component
- Derive data from a single Supabase query in layouts — no double queries
- `middleware.ts` runs in Edge Runtime — copy Set-Cookie headers from `signOut()` to redirect response manually
- Public pages live in `app/(public)/` route group — Header/Footer/AnnouncementBanner render only there, admin routes are outside it

## Theming

- CSS custom properties only — four themes: `warm-artisan`, `soft-botanical`, `modern`, and `custom`
- `modern` is the default theme (fallback when settings are absent)
- `custom` has no CSS block in `globals.css` — it falls back to `modern` styling, with `deriveCustomThemeVars()` injecting overrides as inline CSS vars on `<html>` when `custom_primary` and `custom_accent` are set
- Theme toggled via `data-theme` attribute on `<html>`
- No hardcoded colour values outside `globals.css`

## Accessibility

- 48px minimum touch targets throughout
- No duplicate ARIA roles — `<header>` has implicit `banner` role, don't add `role="banner"` again
- `ConfirmDialog` must have a focus trap (Tab cycle) and restore focus on close

## Testing

- Jest config: `moduleNameMapper` for `@/` paths, `setupFiles` for env vars (not `setupFilesAfterFramework`)
- Inject test env vars via `setupFiles: ['jest.setup.env.js']` — `testEnvironmentOptions.env` is ignored by jsdom
- `ADMIN_EMAILS` must be set in test env for middleware tests to pass
- `testPathIgnorePatterns` must include `'<rootDir>/.worktrees/'` — worktrees have their own node_modules, causing duplicate React hook errors if discovered

## Known Gotchas

- Tailwind may be installed by `create-next-app` even with `--tailwind=false` — uninstall if present
- Never commit real admin emails to `.env.example` — use placeholders
- `sessionStorage` written on dismiss must also be read on mount (lazy `useState` initializer)
- Check `res.ok` after every `fetch` — don't silently swallow DB or API errors
- When two parallel subagents touch the same file (e.g. `app/page.tsx`), unstage the conflicting file before the second agent commits
