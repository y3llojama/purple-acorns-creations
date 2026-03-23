'use client'
import type { Message } from '@/lib/supabase/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface Props {
  messages: Message[]
  selected: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
  newCount: number
  onLoadNew: () => void
}

export default function MessageList({ messages, selected, onSelect, onRefresh, newCount, onLoadNew }: Props) {
  const unreadCount = messages.filter(m => !m.is_read).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* New messages banner */}
      {newCount > 0 && (
        <div style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
          <span>{newCount} new message{newCount !== 1 ? 's' : ''}</span>
          <button
            onClick={onLoadNew}
            aria-label="Load new messages"
            style={{ background: 'var(--color-accent)', color: 'var(--color-primary)', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}
          >
            Load
          </button>
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
        </span>
        <button
          onClick={onRefresh}
          aria-label="Refresh messages"
          style={{ background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Message rows */}
      {messages.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>No messages yet.</p>
      )}
      {messages.map(msg => (
        <button
          key={msg.id}
          onClick={() => onSelect(msg.id)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '16px',
            background: selected === msg.id ? 'var(--color-primary)' : 'var(--color-surface)',
            color: selected === msg.id ? 'var(--color-accent)' : 'var(--color-text)',
            border: '1px solid var(--color-border)', borderRadius: '8px', cursor: 'pointer',
            minHeight: '48px', fontWeight: msg.is_read ? '400' : '600',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {!msg.is_read && (
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-accent)', flexShrink: 0 }} aria-hidden="true" />
              )}
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
  )
}
