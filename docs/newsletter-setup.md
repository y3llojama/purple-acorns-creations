# Newsletter Setup

This document covers everything needed to run the newsletter feature in production.

## Environment Variables

Add these to your Vercel project settings (and to `.env.local` for local development):

| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | Yes | From [resend.com](https://resend.com) dashboard |
| `NEWSLETTER_FROM_EMAIL` | Yes | Verified sender address (must be verified in Resend) |
| `NEWSLETTER_FROM_NAME` | No | Display name (default: Purple Acorns Creations) |
| `NEWSLETTER_ADMIN_EMAILS` | No | Comma-separated addresses for pre-send preview |
| `RESEND_WEBHOOK_SECRET` | Yes | From Resend → Webhooks → signing secret |
| `CRON_SECRET` | Yes | Random secret for authorising the Vercel Cron job |
| `AI_API_KEY` | No | API key for the AI provider selected in Admin → Integrations |
| `NEXT_PUBLIC_SITE_URL` | Yes | Your production domain, e.g. `https://purpleacornz.com` |

All secrets can alternatively be stored in the `settings` table via **Admin → Integrations**. Environment variables take precedence over database values when both are set.

## Database Migration

Run migration `015_newsletter.sql` against your Supabase project:

```bash
supabase db push
```

This creates:
- `newsletters` — draft/scheduled/sent newsletter records
- `newsletter_subscribers` — subscriber list with unsubscribe tokens
- `newsletter_send_log` — per-email send audit trail (supports idempotent resend)

## Resend Setup

1. Create an account at [resend.com](https://resend.com)
2. Verify your sending domain (DNS records provided in Resend dashboard)
3. Create an API key — copy to `RESEND_API_KEY`
4. **Webhooks** (optional but recommended for open/click/bounce tracking):
   - Add webhook URL: `https://yourdomain.com/api/newsletter/webhook`
   - Enable events: `email.opened`, `email.clicked`, `email.bounced`
   - Copy the signing secret to `RESEND_WEBHOOK_SECRET`

## Vercel Cron

The newsletter send is executed by a cron job defined in `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/newsletter-send", "schedule": "*/5 * * * *" }] }
```

This runs every 5 minutes and sends any newsletters whose `scheduled_at` time has passed.

To secure the cron endpoint:
1. Set `CRON_SECRET` to a random string (e.g. `openssl rand -hex 32`)
2. In Vercel → Project Settings → Cron Jobs, add the same secret as the `Authorization: Bearer <secret>` header

## AI Draft Generation

1. Go to **Admin → Integrations → AI Provider**
2. Select your provider (Claude, OpenAI, or Groq)
3. Paste your API key

Supported providers:
- **Claude** — `claude-3-haiku-20240307` (fast, cost-effective)
- **OpenAI** — `gpt-4o-mini`
- **Groq** — `llama-3.1-8b-instant`

## Workflow

1. **Admin → Newsletter → New Newsletter** — creates a draft
2. Work through the 5-step wizard:
   - **Brief** — title, teaser, tone; optionally generate AI draft
   - **Draft** — review AI-generated content; regenerate if needed
   - **Edit & Photos** — add/remove/reorder sections; pick images from gallery
   - **Preview** — email-like preview before sending
   - **Send** — pick date/time, type `SEND NEWSLETTER` to confirm, schedule
3. A preview email goes to `NEWSLETTER_ADMIN_EMAILS` immediately on scheduling
4. The cron job delivers to all active subscribers at the scheduled time

## Public Pages

- `/newsletter` — archive of all sent newsletters
- `/newsletter/[slug]` — individual newsletter page
- `/newsletter/unsubscribe?token=...` — one-click unsubscribe (link in every email)
