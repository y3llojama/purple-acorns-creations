import { render, screen, fireEvent } from '@testing-library/react'
import MessageList from '@/components/admin/MessageList'
import type { Message } from '@/lib/supabase/types'

const makeMsg = (overrides: Partial<Message> = {}): Message => ({
  id: '1', name: 'Alice', email: 'alice@example.com',
  message: 'Hello', is_read: false, created_at: new Date().toISOString(),
  ...overrides,
})

describe('MessageList', () => {
  it('renders message names', () => {
    render(<MessageList messages={[makeMsg()]} selected={null} onSelect={jest.fn()} onRefresh={jest.fn()} newCount={0} onLoadNew={jest.fn()} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
  it('shows unread count', () => {
    render(<MessageList messages={[makeMsg(), makeMsg({ id: '2', is_read: true })]} selected={null} onSelect={jest.fn()} onRefresh={jest.fn()} newCount={0} onLoadNew={jest.fn()} />)
    expect(screen.getByText(/1 unread/i)).toBeInTheDocument()
  })
  it('shows "N new messages" banner when newCount > 0', () => {
    render(<MessageList messages={[]} selected={null} onSelect={jest.fn()} onRefresh={jest.fn()} newCount={3} onLoadNew={jest.fn()} />)
    expect(screen.getByText(/3 new message/i)).toBeInTheDocument()
  })
  it('calls onLoadNew when Load button clicked', () => {
    const onLoadNew = jest.fn()
    render(<MessageList messages={[]} selected={null} onSelect={jest.fn()} onRefresh={jest.fn()} newCount={2} onLoadNew={onLoadNew} />)
    fireEvent.click(screen.getByRole('button', { name: /load/i }))
    expect(onLoadNew).toHaveBeenCalled()
  })
  it('calls onRefresh when Refresh button clicked', () => {
    const onRefresh = jest.fn()
    render(<MessageList messages={[]} selected={null} onSelect={jest.fn()} onRefresh={onRefresh} newCount={0} onLoadNew={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(onRefresh).toHaveBeenCalled()
  })
  it('calls onSelect with message id on click', () => {
    const onSelect = jest.fn()
    render(<MessageList messages={[makeMsg()]} selected={null} onSelect={onSelect} onRefresh={jest.fn()} newCount={0} onLoadNew={jest.fn()} />)
    fireEvent.click(screen.getByText('Alice'))
    expect(onSelect).toHaveBeenCalledWith('1')
  })
})
