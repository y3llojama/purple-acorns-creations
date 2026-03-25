/**
 * @jest-environment node
 */
import { getClientIp } from '@/lib/get-client-ip'

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://localhost/', { headers })
}

describe('getClientIp', () => {
  it('prefers x-real-ip over x-forwarded-for', () => {
    const req = makeRequest({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9, 8.8.8.8' })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('uses rightmost x-forwarded-for entry when x-real-ip absent', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' })
    expect(getClientIp(req)).toBe('3.3.3.3')
  })

  it('falls back to unknown when no headers', () => {
    const req = makeRequest({})
    expect(getClientIp(req)).toBe('unknown')
  })

  it('trims whitespace', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.1.1.1 , 2.2.2.2 ' })
    expect(getClientIp(req)).toBe('2.2.2.2')
  })

  it('returns unknown when x-real-ip is only whitespace', () => {
    const req = makeRequest({ 'x-real-ip': '   ', 'x-forwarded-for': '7.7.7.7' })
    expect(getClientIp(req)).toBe('7.7.7.7')
  })

  it('handles single x-forwarded-for entry', () => {
    const req = makeRequest({ 'x-forwarded-for': '5.5.5.5' })
    expect(getClientIp(req)).toBe('5.5.5.5')
  })
})
