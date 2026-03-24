'use client'
import { useUnreadCount } from '@/lib/contexts/unread-count-context'

export default function DashboardMessagesBadge() {
  const { unreadCount } = useUnreadCount()
  if (unreadCount === 0) return null
  return (
    <span
      aria-label={`${unreadCount > 99 ? '99+' : unreadCount} unread messages`}
      style={{
        position: 'absolute',
        top: '-8px',
        right: '-8px',
        background: 'var(--color-danger)',
        color: 'var(--color-badge-text)',
        fontSize: '11px',
        fontWeight: '700',
        minWidth: '20px',
        height: '20px',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 5px',
        border: '2px solid var(--color-surface)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        lineHeight: 1,
      }}
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  )
}
