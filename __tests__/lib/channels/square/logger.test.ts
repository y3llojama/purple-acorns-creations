import { shouldLog, buildLogEntry } from '@/lib/channels/square/logger'

describe('shouldLog', () => {
  it('returns false for level none', () => {
    expect(shouldLog('none', null)).toBe(false)
  })

  it('returns false when expired', () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString()
    expect(shouldLog('basic', pastDate)).toBe(false)
  })

  it('returns true for basic with future expiry', () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    expect(shouldLog('basic', futureDate)).toBe(true)
  })

  it('returns true for full with future expiry', () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString()
    expect(shouldLog('full', futureDate)).toBe(true)
  })
})

describe('buildLogEntry', () => {
  it('omits bodies for basic level', () => {
    const entry = buildLogEntry('basic', 'POST', '/v2/catalog/object', 200, 42, { foo: 1 }, { bar: 2 })
    expect(entry.request_body).toBeNull()
    expect(entry.response_body).toBeNull()
    expect(entry.method).toBe('POST')
    expect(entry.path).toBe('/v2/catalog/object')
    expect(entry.status_code).toBe(200)
    expect(entry.duration_ms).toBe(42)
  })

  it('includes bodies for full level', () => {
    const entry = buildLogEntry('full', 'POST', '/v2/catalog/object', 200, 42, { foo: 1 }, { bar: 2 })
    expect(entry.request_body).toEqual({ foo: 1 })
    expect(entry.response_body).toEqual({ bar: 2 })
  })

  it('captures error string for non-2xx', () => {
    const entry = buildLogEntry('basic', 'POST', '/v2/catalog/object', 401, 10, null, { errors: [{ detail: 'Unauthorized' }] })
    expect(entry.error).toBe('Unauthorized')
  })
})
