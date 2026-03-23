/**
 * @jest-environment node
 */

// Mock Supabase service role client before importing email module
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(),
}))

// Mock the Resend SDK so no real HTTP calls are made
const mockEmailsSend = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockEmailsSend },
  })),
}))

import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendReply } from '@/lib/email'

// Helper: configure the Supabase mock to return the given settings row
function mockSettings(settings: Record<string, unknown>) {
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({
    from: () => ({
      select: () => ({
        single: jest.fn().mockResolvedValue({ data: settings, error: null }),
      }),
    }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  // Default: Resend send succeeds
  mockEmailsSend.mockResolvedValue({ data: { id: 'msg_test_123' }, error: null })
})

describe('sendReply footer — text body', () => {
  it('appends footer to text body with separator when reply_email_footer is non-empty', async () => {
    mockSettings({
      resend_api_key: 're_test_key',
      messages_from_email: 'hello@example.com',
      business_name: 'Test Shop',
      newsletter_from_name: null,
      reply_email_footer: 'Visit us at our shop',
    })

    await sendReply('customer@example.com', 'Jane', 'Your order is ready.')

    expect(mockEmailsSend).toHaveBeenCalledTimes(1)
    const sentOptions = mockEmailsSend.mock.calls[0][0]
    expect(sentOptions.text).toContain('\n\n---\n')
    expect(sentOptions.text).toContain('Visit us at our shop')
    // Footer must come after the body separator
    const separatorIndex = sentOptions.text.indexOf('\n\n---\n')
    const footerIndex = sentOptions.text.indexOf('Visit us at our shop')
    expect(footerIndex).toBeGreaterThan(separatorIndex)
  })

  it('does not include separator block when reply_email_footer is empty string', async () => {
    mockSettings({
      resend_api_key: 're_test_key',
      messages_from_email: 'hello@example.com',
      business_name: 'Test Shop',
      newsletter_from_name: null,
      reply_email_footer: '',
    })

    await sendReply('customer@example.com', 'Jane', 'Your order is ready.')

    const sentOptions = mockEmailsSend.mock.calls[0][0]
    expect(sentOptions.text).not.toContain('\n\n---\n')
  })

  it('does not include separator block when reply_email_footer is null', async () => {
    mockSettings({
      resend_api_key: 're_test_key',
      messages_from_email: 'hello@example.com',
      business_name: 'Test Shop',
      newsletter_from_name: null,
      reply_email_footer: null,
    })

    await sendReply('customer@example.com', 'Jane', 'Your order is ready.')

    const sentOptions = mockEmailsSend.mock.calls[0][0]
    expect(sentOptions.text).not.toContain('\n\n---\n')
  })
})

describe('sendReply footer — HTML body', () => {
  it('appends footer with <hr /> and <p> tag when reply_email_footer is non-empty', async () => {
    mockSettings({
      resend_api_key: 're_test_key',
      messages_from_email: 'hello@example.com',
      business_name: 'Test Shop',
      newsletter_from_name: null,
      reply_email_footer: 'Visit us at our shop',
    })

    await sendReply('customer@example.com', 'Jane', 'Your order is ready.')

    const sentOptions = mockEmailsSend.mock.calls[0][0]
    expect(sentOptions.html).toContain('<hr />')
    expect(sentOptions.html).toContain('<p style="font-size:12px;color:#888;">')
    expect(sentOptions.html).toContain('Visit us at our shop')
  })

  it('does not include <hr /> when reply_email_footer is empty string', async () => {
    mockSettings({
      resend_api_key: 're_test_key',
      messages_from_email: 'hello@example.com',
      business_name: 'Test Shop',
      newsletter_from_name: null,
      reply_email_footer: '',
    })

    await sendReply('customer@example.com', 'Jane', 'Your order is ready.')

    const sentOptions = mockEmailsSend.mock.calls[0][0]
    expect(sentOptions.html).not.toContain('<hr />')
  })

  it('does not include <hr /> when reply_email_footer is null', async () => {
    mockSettings({
      resend_api_key: 're_test_key',
      messages_from_email: 'hello@example.com',
      business_name: 'Test Shop',
      newsletter_from_name: null,
      reply_email_footer: null,
    })

    await sendReply('customer@example.com', 'Jane', 'Your order is ready.')

    const sentOptions = mockEmailsSend.mock.calls[0][0]
    expect(sentOptions.html).not.toContain('<hr />')
  })

  it('HTML-escapes dangerous characters in footer (XSS guard)', async () => {
    mockSettings({
      resend_api_key: 're_test_key',
      messages_from_email: 'hello@example.com',
      business_name: 'Test Shop',
      newsletter_from_name: null,
      reply_email_footer: '<script>alert("xss")</script>',
    })

    await sendReply('customer@example.com', 'Jane', 'Your order is ready.')

    const sentOptions = mockEmailsSend.mock.calls[0][0]
    expect(sentOptions.html).not.toContain('<script>')
    expect(sentOptions.html).toContain('&lt;script&gt;')
    expect(sentOptions.html).toContain('&quot;xss&quot;')
    expect(sentOptions.html).toContain('&lt;/script&gt;')
  })
})
