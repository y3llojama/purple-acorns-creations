// Client-side Square buyer verification (3DS/SCA) — browser only, no Node imports

export interface SquareCard {
  attach: (container: HTMLElement) => Promise<void>
  tokenize: () => Promise<{ status: string; token?: string; errors?: Array<{ message: string }> }>
}

export interface VerificationDetails {
  amount: string
  currencyCode: string
  intent: 'CHARGE' | 'STORE'
  billingContact: { givenName?: string; familyName?: string; countryCode?: string }
}

export interface SquarePayments {
  card: () => Promise<SquareCard>
  verifyBuyer: (sourceId: string, details: VerificationDetails) => Promise<{ token: string }>
}

declare global {
  interface Window {
    Square?: { payments: (appId: string, locationId: string) => Promise<SquarePayments> }
  }
}

export interface VerifyResult {
  verificationToken?: string
  /** true if the customer explicitly cancelled the challenge dialog */
  cancelled: boolean
  /** non-cancellation error that should be surfaced to the user */
  error?: string
}

/**
 * Runs Square buyer verification (3DS/SCA) using the Web Payments SDK.
 * Returns a verificationToken on success, or signals cancellation/error.
 */
export async function runVerifyBuyer(
  payments: SquarePayments,
  sourceId: string,
  totalAmount: number,
  buyerName: string,
  country: string,
): Promise<VerifyResult> {
  const nameParts = buyerName.trim().split(' ')
  try {
    const result = await payments.verifyBuyer(sourceId, {
      amount: totalAmount.toFixed(2),
      currencyCode: 'USD',
      intent: 'CHARGE',
      billingContact: {
        givenName: nameParts[0] ?? '',
        familyName: nameParts.slice(1).join(' ') || undefined,
        countryCode: country || 'US',
      },
    })
    return { verificationToken: result.token, cancelled: false }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('cancel')) {
      return { cancelled: true }
    }
    // Non-cancellation error — log and proceed without token; server will decide
    console.warn('[verifyBuyer] non-cancellation error, proceeding without token:', msg)
    return { cancelled: false, error: msg }
  }
}
