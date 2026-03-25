import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders message text', () => {
    render(<ConfirmDialog message="Delete this event?" onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByText('Delete this event?')).toBeInTheDocument()
  })
  it('has role="dialog" and aria-modal="true"', () => {
    render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })
  it('calls onConfirm when Delete clicked', () => {
    const onConfirm = jest.fn()
    render(<ConfirmDialog message="Delete?" onConfirm={onConfirm} onCancel={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onConfirm).toHaveBeenCalled()
  })
  it('calls onCancel when Cancel clicked', () => {
    const onCancel = jest.fn()
    render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
  it('shows "Delete" by default when confirmLabel is omitted', () => {
    render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })
  it('shows custom confirmLabel when provided', () => {
    render(<ConfirmDialog message="Send?" onConfirm={jest.fn()} onCancel={jest.fn()} confirmLabel="Send" />)
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = jest.fn()
    render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls the latest onCancel when prop changes identity before Escape', () => {
    const first = jest.fn()
    const second = jest.fn()
    const { rerender } = render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={first} />)
    rerender(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={second} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(second).toHaveBeenCalled()
    expect(first).not.toHaveBeenCalled()
  })
})
