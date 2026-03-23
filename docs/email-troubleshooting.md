# Email Troubleshooting

Issues and fixes encountered setting up Resend inbound and the Cloudflare Email Worker.

---

## Inbound replies not appearing in admin messages UI

### Cloudflare Bot Fight Mode blocking the webhook

**Symptom:** Resend webhook shows `403` or `307 - Temporary Redirect` with response body `Redirecting...`. Nothing appears in Vercel logs.

**Cause:** Cloudflare's Super Bot Fight Mode intercepts the POST before it reaches Vercel.

**Fix:** Cloudflare dashboard → Security → WAF → Custom Rules → Create Rule:
- Field: `URI Path` / Operator: `equals` / Value: `/api/webhooks/resend-inbound`
- Action: **Skip** → check **All Super Bot Fight Mode Rules**
- Place at: First

> Note: on Free/Pro plans, Super Bot Fight Mode cannot be skipped via WAF custom rules. Disable it entirely under Security → Bots if the WAF rule has no effect.

---

### Webhook URL redirecting (non-www → www)

**Symptom:** Resend shows `308 - Permanent Redirect` with `Redirecting...` response body.

**Cause:** The webhook URL was set to `https://purpleacornz.com/...` but the site redirects to `https://www.purpleacornz.com/...`.

**Fix:** Update the webhook URL in Resend → Webhooks → your webhook to use the `www` hostname:
```
https://www.purpleacornz.com/api/webhooks/resend-inbound
```

---

### Invalid signature (wrong secret)

**Symptom:** Resend webhook shows `401` with response body `{"error":"Invalid signature."}`.

**Cause 1:** `RESEND_WEBHOOK_SECRET` in Vercel doesn't match the signing secret on the general webhook.

**Fix:** Resend → Webhooks → your webhook → reveal Signing Secret → copy it → Vercel → Settings → Environment Variables → update `RESEND_WEBHOOK_SECRET`. Then redeploy.

**Cause 2:** Env var added to Vercel after the last deployment — it won't take effect until a new deploy.

**Fix:** Trigger a redeploy:
```bash
git commit --allow-empty -m "chore: trigger Vercel redeploy" && git push origin main
```

---

### Webhook signature verification always failing (wrong HMAC format)

**Symptom:** `401 Invalid signature` even with the correct secret set.

**Cause:** Resend delivers webhooks via Svix, which uses three separate headers (`svix-id`, `svix-timestamp`, `svix-signature`) and signs `{svix-id}.{svix-timestamp}.{body}` with the base64-decoded `whsec_` secret. A custom `t=,v1=` parser will never match.

**Fix:** Already resolved in `app/api/webhooks/resend-inbound/helpers.ts` — `verifyInboundHmac` now implements the Svix signature scheme correctly.

---

### Webhook returns 200 but reply doesn't appear in UI

**Symptom:** Resend shows `200 - OK`, Vercel logs show `[inbound] failed to fetch email content: { statusCode: 401, message: 'This API key is restricted to only send emails' }`.

**Cause:** The Resend API key stored in admin settings is a **sending-only** key. `resend.emails.receiving.get()` requires Full Access or a key with Emails: Read permission.

**Fix:** Resend dashboard → API Keys → create a new key with **Full access** → update it in Admin → Integrations → Resend API Key field.

---

### Cloudflare only allows one destination per custom address rule

**Symptom:** Trying to forward `hello@purpleacornz.com` to both Gmail and Resend inbound but Cloudflare only accepts one destination.

**Fix:** Use a Cloudflare Email Worker instead of a plain routing rule. The worker fans out to both destinations using `Promise.allSettled`. See `cloudflare/email-worker/index.js`.

Deploy:
```bash
cd cloudflare/email-worker
npx wrangler secret put DEST_GMAIL   # purpleacornzcreations@gmail.com
npx wrangler secret put DEST_RESEND  # hello@ieurkeueld.resend.app
CLOUDFLARE_API_TOKEN=<token> bash ../../scripts/deploy-cf-worker.sh
```

Then update the Cloudflare routing rule for `hello@purpleacornz.com` → **Send to a Worker** → `purple-acorns-email-forwarder`.

> If `wrangler secret put` fails with "Binding name already in use", the value exists as a `[vars]` entry in `wrangler.toml`. Remove the conflicting `[vars]` entries, redeploy, then set the secrets.

---

### Resend domain receiving: conflicting MX records

**Symptom:** Enabling "Enable Receiving" on `purpleacornz.com` in Resend shows `Conflicting MX records` warning and the MX record stays Pending.

**Cause:** The `@` MX record is already used by the outbound sending configuration.

**Fix:** You don't need to enable receiving on your custom domain. Emails forwarded to Resend's own inbound address (`hello@ieurkeueld.resend.app`) are received and stored by Resend automatically — `resend.emails.receiving.get(emailId)` works for those regardless of whether your domain has receiving enabled.

---

## Outbound replies

### `${BUSINESS_NAME}` / `${CONTACT_FORM}` showing literally in the admin UI

**Symptom:** The messages thread shows the raw template variable names instead of resolved values.

**Cause:** The DB stores the pre-interpolation reply body. Interpolation happens at send time (inside `sendReply`), so the email sent to the customer has the correct values — only the stored record shows the raw template.

**This is expected behaviour** — the admin can see which template variables they used. The customer always receives the resolved text.

---

## General

### Vercel deployment not picking up new code or env vars

New environment variables added in Vercel don't take effect until the next deployment. If you add or update an env var and the behaviour doesn't change, trigger a redeploy:

```bash
git commit --allow-empty -m "chore: trigger Vercel redeploy" && git push origin main
```

### Checking what's actually happening at the webhook

```bash
# Should return 401 (route is live, HMAC fails because no signature)
curl -X POST https://www.purpleacornz.com/api/webhooks/resend-inbound \
  -H "Content-Type: application/json" \
  -d '{"type":"test"}'

# If you get the Cloudflare challenge page instead, Bot Fight Mode is still blocking
```

Vercel runtime logs: Vercel dashboard → your project → Logs → filter by `/api/webhooks/resend-inbound`.
