import { SquareError } from 'square'

export const CARD_ERROR_MESSAGES: Record<string, string> = {
  CARD_DECLINED:                          'Your card was declined. Please try a different card.',
  CARD_DECLINED_VERIFICATION_REQUIRED:    'Your card requires verification. Please try again.',
  CARD_EXPIRED:                           'Your card has expired. Please use a different card.',
  INVALID_CARD:                           'Invalid card details. Please check and try again.',
  VERIFY_CVV_FAILURE:                     'CVV check failed. Please check your card details.',
  VERIFY_AVS_FAILURE:                     'Address verification failed. Please check your billing address.',
  INSUFFICIENT_FUNDS:                     'Insufficient funds. Please try a different card.',
  CARD_NOT_SUPPORTED:                     'This card type is not supported. Please try a different card.',
  PAYMENT_LIMIT_EXCEEDED:                 'Payment amount exceeds limit. Please contact support.',
  TEMPORARY_ERROR:                        'A temporary error occurred. Please try again.',
}

export function squarePaymentError(err: unknown): { message: string; detail: string } {
  if (err instanceof SquareError) {
    const first = (err as SquareError & { errors?: Array<{ code?: string; detail?: string }> }).errors?.[0]
    const message = (first?.code && CARD_ERROR_MESSAGES[first.code])
      ?? 'Payment failed — please try a different card.'
    return { message, detail: first ? `${first.code}: ${first.detail ?? ''}` : String(err) }
  }
  return { message: 'Payment failed — please try a different card.', detail: String(err) }
}
