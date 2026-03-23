'use client'
import { useState, useEffect } from 'react'
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
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  sort: 'newest' | 'oldest'
  onSortChange: (sort: 'newest' | 'oldest') => void
  onSearchChange: (q: string) => void
  onEmailFilterChange: (email: string) => void
  isLoading?: boolean
  total: number
}

export default function MessageList({
  messages, selected, onSelect, onRefresh, newCount, onLoadNew,
  page, totalPages, onPageChange, sort, onSortChange,
  onSearchChange, onEmailFilterChange, isLoading, total,
}: Props) {
  const unreadCount = messages.filter(m => !m.is_read).length
  const [searchDraft, setSearchDraft] = useState('')
  const [emailDraft, setEmailDraft] = useState('')

  // Debounce list search (300 ms)
  useEffect(() => {
    const t = setTimeout(() => onSearchChange(searchDraft), 300)
    return () => clearTimeout(t)
  }, [searchDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce email filter (300 ms)
  useEffect(() => {
    const t = setTimeout(() => onEmailFilterChange(emailDraft), 300)
    return () => clearTimeout(t)
  }, [emailDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  const isFiltering = !!(searchDraft || emailDraft)

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

      {/* Search input */}
      <input
        type="search"
        value={searchDraft}
        onChange={e => setSearchDraft(e.target.value)}
        placeholder="Search name, email, message…"
        aria-label="Search messages"
        style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
      />

      {/* Email filter */}
      <input
        type="text"
        value={emailDraft}
        onChange={e => setEmailDraft(e.target.value)}
        placeholder="Filter by exact email…"
        aria-label="Filter by email"
        style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', boxSizing: 'border-box' }}
      />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {isLoading
            ? 'Loading…'
            : isFiltering
              ? `${total} result${total !== 1 ? 's' : ''}`
              : unreadCount > 0 ? `${unreadCount} unread` : `${total} total`}
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={() => onSortChange(sort === 'newest' ? 'oldest' : 'newest')}
            aria-label={`Sort by ${sort === 'newest' ? 'oldest' : 'newest'} first`}
            style={{ background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
          >
            {sort === 'newest' ? '↓ Newest' : '↑ Oldest'}
          </button>
          <button
            onClick={onRefresh}
            aria-label="Refresh messages"
            style={{ background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* Message rows */}
      {!isLoading && messages.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>No messages found.</p>
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
            opacity: isLoading ? 0.5 : 1,
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
          <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {msg.email}
          </div>
        </button>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isLoading}
            style={{ background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '6px 14px', fontSize: '13px', cursor: page > 1 ? 'pointer' : 'not-allowed', opacity: page <= 1 ? 0.4 : 1, minHeight: '48px' }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || isLoading}
            style={{ background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '6px 14px', fontSize: '13px', cursor: page < totalPages ? 'pointer' : 'not-allowed', opacity: page >= totalPages ? 0.4 : 1, minHeight: '48px' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
