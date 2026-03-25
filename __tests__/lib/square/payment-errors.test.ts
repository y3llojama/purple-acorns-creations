// Define SquareError class inside the factory to avoid TDZ with jest.mock() hoisting
jest.mock('square', () => {
  class SquareError extends Error {
    errors?: Array<{ code?: string; detail?: string }>
    constructor(errors?: Array<{ code?: string; detail?: string }>) {
      super('Square API error')
      this.errors = errors
    }
  }
  return { SquareError }
})

import { squarePaymentError, CARD_ERROR_MESSAGES } from '@/lib/square/payment-errors'

// Access the mocked SquareError constructor
type SquareErrorCtor = new (errors?: Array<{ code?: string; detail?: string }>) => Error & {
  errors?: Array<{ code?: string; detail?: string }>
}
const { SquareError } = jest.requireMock('square') as { SquareError: SquareErrorCtor }

describe('squarePaymentError', () => {
  it('maps each known Square error code to the correct message', () => {
    for (const [code, expectedMessage] of Object.entries(CARD_ERROR_MESSAGES)) {
      const err = new SquareError([{ code, detail: 'detail text' }])
      const { message, detail } = squarePaymentError(err)
      expect(message).toBe(expectedMessage)
      expect(detail).toContain(code)
    }
  })

  it('falls back to generic message for unknown Square error code', () => {
    const err = new SquareError([{ code: 'TOTALLY_UNKNOWN_CODE', detail: 'something' }])
    const { message } = squarePaymentError(err)
    expect(message).toBe('Payment failed — please try a different card.')
  })

  it('falls back to generic message when SquareError has no errors array', () => {
    const err = new SquareError(undefined)
    const { message } = squarePaymentError(err)
    expect(message).toBe('Payment failed — please try a different card.')
  })

  it('falls back to generic message for plain Error', () => {
    const err = new Error('Network error')
    const { message, detail } = squarePaymentError(err)
    expect(message).toBe('Payment failed — please try a different card.')
    expect(detail).toContain('Network error')
  })

  it('falls back to generic message for non-Error value', () => {
    const { message } = squarePaymentError('something went wrong')
    expect(message).toBe('Payment failed — please try a different card.')
  })
})
