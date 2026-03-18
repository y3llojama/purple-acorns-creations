describe('Admin email allowlist logic', () => {
  const parseAllowlist = (raw: string) => raw.split(',').map(e => e.trim()).filter(Boolean)

  it('parses comma-separated emails', () => {
    const result = parseAllowlist('a@example.com,b@example.com')
    expect(result).toEqual(['a@example.com', 'b@example.com'])
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
    // Empty config means no one is authorized
    expect(result.includes('anyone@example.com')).toBe(false)
  })

  it('ADMIN_EMAILS env contains at least one valid email', () => {
    const adminEmails = parseAllowlist(process.env.ADMIN_EMAILS ?? '')
    expect(adminEmails.length).toBeGreaterThan(0)
    expect(adminEmails.every(e => e.includes('@'))).toBe(true)
  })
})
