import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ThreadView from '@/components/admin/ThreadView'
import type { Message, MessageReply } from '@/lib/supabase/types'

const msg: Message = {
  id: '1', name: 'Sarah', email: 'sarah@example.com',
  message: 'Hi, do you have wraps in size M?', is_read: true,
  created_at: '2026-03-22T10:00:00Z',
}

const outbound: MessageReply = {
  id: 'r1', message_id: '1', body: 'Yes we do!', direction: 'outbound',
  from_email: null, resend_message_id: null, attachments: [],
  created_at: '2026-03-22T11:00:00Z',
}

const inbound: MessageReply = {
  id: 'r2', message_id: '1', body: 'Great, I will take one.', direction: 'inbound',
  from_email: 'sarah@example.com', resend_message_id: null, attachments: [],
  created_at: '2026-03-22T12:00:00Z',
}

const defaultProps = {
  message: msg,
  replies: [outbound, inbound],
  total: 2, page: 1, perPage: 20,
  onPageChange: jest.fn(),
  onBack: jest.fn(),
  onDelete: jest.fn(),
  onSendReply: jest.fn(),
  isMobile: false,
  newReplyIds: new Set<string>(),
}

describe('ThreadView', () => {
  it('renders original message header', () => {
    render(<ThreadView {...defaultProps} />)
    expect(screen.getByText('Sarah')).toBeInTheDocument()
    expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
  })

  it('renders outbound reply on the right', () => {
    render(<ThreadView {...defaultProps} />)
    const bubble = screen.getByText('Yes we do!')
    expect(bubble.closest('[data-direction="outbound"]')).toBeTruthy()
  })

  it('renders inbound reply on the left', () => {
    render(<ThreadView {...defaultProps} />)
    const bubble = screen.getByText('Great, I will take one.')
    expect(bubble.closest('[data-direction="inbound"]')).toBeTruthy()
  })

  it('does not show pagination when total <= perPage', () => {
    render(<ThreadView {...defaultProps} total={2} perPage={20} />)
    expect(screen.queryByRole('button', { name: /older/i })).toBeNull()
  })

  it('shows pagination when total > perPage', () => {
    render(<ThreadView {...defaultProps} total={50} perPage={20} page={2} />)
    expect(screen.getByRole('button', { name: /older/i })).toBeInTheDocument()
  })

  it('calls onPageChange when Older clicked', () => {
    const onPageChange = jest.fn()
    render(<ThreadView {...defaultProps} total={50} perPage={20} page={2} onPageChange={onPageChange} />)
    fireEvent.click(screen.getByRole('button', { name: /older/i }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('shows send confirmation when Send Reply clicked', async () => {
    render(<ThreadView {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/type your reply/i)
    fireEvent.change(textarea, { target: { value: 'Thanks!' } })
    fireEvent.click(screen.getByRole('button', { name: /send reply/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(screen.getByText(/sarah@example.com/)).toBeInTheDocument()
  })

  it('calls onSendReply after confirming send', async () => {
    const onSendReply = jest.fn().mockResolvedValue(undefined)
    render(<ThreadView {...defaultProps} onSendReply={onSendReply} />)
    fireEvent.change(screen.getByPlaceholderText(/type your reply/i), { target: { value: 'Thanks!' } })
    fireEvent.click(screen.getByRole('button', { name: /send reply/i }))
    await waitFor(() => screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }))
    expect(onSendReply).toHaveBeenCalledWith('Thanks!', [])
  })

  it('highlights replies in newReplyIds', () => {
    render(<ThreadView {...defaultProps} newReplyIds={new Set(['r2'])} />)
    const bubble = screen.getByText('Great, I will take one.')
    expect(bubble.closest('[data-new="true"]')).toBeTruthy()
  })
})
