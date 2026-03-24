/**
 * @jest-environment node
 *
 * Tests for the proxy.ts admin API route guard.
 * Verifies that unauthenticated requests to /api/admin/* receive 401,
 * and that OAuth callbacks are excluded from the guard.
 */

import { NextRequest } from 'next/server'

const mockGetUser = jest.fn()
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

function makeRequest(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`, { method: 'GET' })
}

describe('proxy: /api/admin/* guard', () => {
  beforeEach(() => {
    jest.resetModules()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('returns 401 for unauthenticated /api/admin/* requests', async () => {
    const { proxy } = await import('@/proxy')
    const res = await proxy(makeRequest('/api/admin/settings'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('passes through Square OAuth callback without auth check', async () => {
    const { proxy } = await import('@/proxy')
    const res = await proxy(makeRequest('/api/admin/channels/square/callback'))
    expect(res.status).not.toBe(401)
  })

  it('passes through Pinterest OAuth callback without auth check', async () => {
    const { proxy } = await import('@/proxy')
    const res = await proxy(makeRequest('/api/admin/channels/pinterest/callback'))
    expect(res.status).not.toBe(401)
  })

  it('passes through authenticated /api/admin/* requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'admin@example.com' } } })
    const { proxy } = await import('@/proxy')
    const res = await proxy(makeRequest('/api/admin/settings'))
    expect(res.status).not.toBe(401)
  })
})

describe('proxy: non-admin API routes pass through', () => {
  beforeEach(() => {
    jest.resetModules()
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('does not guard /api/shop/checkout', async () => {
    const { proxy } = await import('@/proxy')
    const res = await proxy(makeRequest('/api/shop/checkout'))
    expect(res.status).not.toBe(401)
  })

  it('does not guard /api/newsletter/subscribe', async () => {
    const { proxy } = await import('@/proxy')
    const res = await proxy(makeRequest('/api/newsletter/subscribe'))
    expect(res.status).not.toBe(401)
  })
})

describe('Admin email allowlist logic', () => {
  const parseAllowlist = (raw: string) => raw.split(',').map(e => e.trim()).filter(Boolean)

  it('parses comma-separated emails', () => {
    expect(parseAllowlist('a@example.com,b@example.com')).toEqual(['a@example.com', 'b@example.com'])
  })

  it('trims whitespace around entries', () => {
    const result = parseAllowlist('  a@example.com , b@example.com  ')
    expect(result).toContain('a@example.com')
    expect(result).toContain('b@example.com')
  })

  it('rejects emails not in the allowlist', () => {
    const allowed = parseAllowlist('admin@example.com,owner@example.com')
    expect(allowed.includes('attacker@evil.com')).toBe(false)
    expect(allowed.includes('')).toBe(false)
  })

  it('returns empty list when config is blank', () => {
    const result = parseAllowlist('')
    expect(result).toEqual([])
  })

  it('filters empty strings from trailing commas', () => {
    const result = parseAllowlist('admin@example.com,')
    expect(result).toEqual(['admin@example.com'])
  })
})
