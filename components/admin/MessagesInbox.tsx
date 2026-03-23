'use client'
import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import type { Message, MessageReply } from '@/lib/supabase/types'
import { useIsMobile } from '@/lib/hooks/useIsMobile'

interface Props { initialMessages: Message[] }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function MessagesInbox({ initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [selected, setSelected] = useState<string | null>(null)
  const [replies, setReplies] = useState<MessageReply[]>([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const isMobile = useIsMobile()
  const selectedMsg = messages.find(m => m.id === selected)
  const unreadCount = messages.filter(m => !m.is_read).length

  async function selectMessage(id: string) {
    setSelected(id)
    setReplyText('')
    setSendError(null)

    // Mark as read
    const msg = messages.find(m => m.id === id)
    if (msg && !msg.is_read) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m))
      fetch('/api/admin/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_read: true }),
      })
    }

    // Load replies
    const res = await fetch(`/api/admin/messages/reply?message_id=${id}`)
    if (res.ok) setReplies(await res.json())
  }

  async function handleReply() {
    if (!replyText.trim() || !selected) return
    setSending(true)
    setSendError(null)
    const res = await fetch('/api/admin/messages/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: selected, body: replyText.trim() }),
    })
    if (res.ok) {
      const reply = await res.json()
      setReplies(prev => [...prev, reply])
      setReplyText('')
    } else {
      const data = await res.json().catch(() => ({}))
      setSendError(data.error ?? 'Failed to send reply')
    }
    setSending(false)
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/admin/messages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setMessages(prev => prev.filter(m => m.id !== id))
      if (selected === id) { setSelected(null); setReplies([]) }
    }
    setDeleteId(null)
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '24px' }}>
        Messages {unreadCount > 0 && <span style={{ fontSize: '16px', color: 'var(--color-accent)' }}>({unreadCount} unread)</span>}
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: !isMobile && selected ? '1fr 2fr' : '1fr', gap: '24px' }}>
        {/* Message list — hidden on mobile when a message is open */}
        <div style={{ display: isMobile && selected ? 'none' : 'flex', flexDirection: 'column', gap: '8px' }}>
          {messages.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>No messages yet.</p>
          )}
          {messages.map(msg => (
            <button
              key={msg.id}
              onClick={() => selectMessage(msg.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '16px',
                background: selected === msg.id ? 'var(--color-primary)' : 'var(--color-surface)',
                color: selected === msg.id ? 'var(--color-accent)' : 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                cursor: 'pointer',
                minHeight: '48px',
                fontWeight: msg.is_read ? '400' : '600',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '15px' }}>
                  {!msg.is_read && <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-accent)', marginRight: '8px' }} />}
                  {msg.name}
                </span>
                <span style={{ fontSize: '12px', opacity: 0.7 }}>{timeAgo(msg.created_at)}</span>
              </div>
              <div style={{ fontSize: '13px', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {msg.message.slice(0, 80)}{msg.message.length > 80 ? '…' : ''}
              </div>
            </button>
          ))}
        </div>

        {/* Selected message detail */}
        {selectedMsg && (
          <div style={{ background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)', padding: '24px' }}>
            {isMobile && (
              <button
                onClick={() => { setSelected(null); setReplies([]) }}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '15px', cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: '6px', minHeight: '48px' }}
              >
                ← Back
              </button>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '20px', marginBottom: '4px' }}>{selectedMsg.name}</h2>
                <span style={{ color: 'var(--color-accent)', fontSize: '14px' }}>{selectedMsg.email}</span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: '12px' }}>
                  {new Date(selectedMsg.created_at).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setDeleteId(selectedMsg.id)}
                style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '8px 16px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
              >
                Delete
              </button>
            </div>

            <div style={{ padding: '16px', background: 'var(--color-bg)', borderRadius: '6px', marginBottom: '24px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {selectedMsg.message}
            </div>

            {/* Replies thread */}
            {replies.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Replies</h3>
                {replies.map(r => {
                  const isInbound = r.direction === 'inbound'
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--color-bg)',
                        borderRadius: '6px',
                        marginBottom: '8px',
                        borderLeft: `3px solid ${isInbound ? 'var(--color-border)' : 'var(--color-accent)'}`,
                      }}
                    >
                      {isInbound && (
                        <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
                          {selectedMsg?.name}
                        </p>
                      )}
                      <p style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: '0 0 4px' }}>{r.body}</p>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Reply form */}
            <div>
              <label htmlFor="reply-text" style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                Reply to {selectedMsg.name}
              </label>
              <textarea
                id="reply-text"
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Type your reply..."
                style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Variables: <code>{'${BUSINESS_NAME}'}</code> · <code>{'${CONTACT_FORM}'}</code>
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={handleReply}
                  disabled={!replyText.trim() || sending}
                  style={{
                    background: replyText.trim() ? 'var(--color-primary)' : '#ccc',
                    color: 'var(--color-accent)',
                    padding: '12px 24px',
                    fontSize: '16px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                    minHeight: '48px',
                  }}
                >
                  {sending ? 'Sending…' : 'Send Reply'}
                </button>
                {sendError && <span style={{ color: '#c05050', fontSize: '14px' }}>{sendError}</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {deleteId && (
        <ConfirmDialog
          message="Delete this message and all replies? This cannot be undone."
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
