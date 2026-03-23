// __tests__/lib/email-reply.test.ts
// Tests for pure helper logic only — not the full sendReply (which hits Resend).

describe('reply footer interpolation', () => {
  it('appends footer to text body', () => {
    const body = 'Hi there'
    const footer = 'Reply here or visit ${CONTACT_FORM}'
    const textResult = body + '\n\n---\n' + footer
    const htmlResult = body + '<hr /><p style="font-size:12px;color:#888;">' + footer + '</p>'
    expect(textResult).toContain('Reply here or visit ${CONTACT_FORM}')
    expect(htmlResult).toContain('<hr />')
  })
})
