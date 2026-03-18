/** Template variables available in admin text fields. */
export const TEMPLATE_VARS: Record<string, string> = {
  BUSINESS_NAME: 'Your business name',
  CONTACT_FORM: 'Link to the contact form page',
}

/**
 * Replace ${VAR_NAME} placeholders in text with their runtime values.
 * Unknown variables are left as-is so they surface visibly rather than silently disappearing.
 */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\$\{([A-Z_]+)\}/g, (match, key) => vars[key] ?? match)
}

/** Build the standard variable map from settings and environment. */
export function buildVars(businessName: string): Record<string, string> {
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  return {
    BUSINESS_NAME: businessName,
    CONTACT_FORM: `${siteUrl}/contact`,
  }
}
