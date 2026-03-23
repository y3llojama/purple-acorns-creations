// Cloudflare Email Worker — fans out hello@purpleacornz.com to two destinations.
// Deployed via scripts/deploy-cf-worker.sh (requires CLOUDFLARE_API_TOKEN env var).
// To activate: in Cloudflare Email Routing, edit the hello@purpleacornz.com custom
// address rule and change action from "Send to an email" to "Send to a Worker",
// selecting this worker.
export default {
  async email(message, env, ctx) {
    await message.forward(env.DEST_GMAIL)
    await message.forward(env.DEST_RESEND)
  },
}
