describe('Admin email allowlist', () => {
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim())
  it('allows admin@example.com', () => expect(adminEmails).toContain('admin@example.com'))
  it('allows owner@example.com', () => expect(adminEmails).toContain('owner@example.com'))
  it('rejects unknown email', () => expect(adminEmails).not.toContain('attacker@gmail.com'))
})
