'use client'
import { useRouter } from 'next/navigation'

interface NewsletterRow {
  id: string; slug: string; title: string; status: string
  scheduled_at: string | null; sent_at: string | null; created_at: string
}

interface Props { newsletters: NewsletterRow[] }

export default function NewsletterList({ newsletters }: Props) {
  const router = useRouter()

  async function handleCreate() {
    const res = await fetch('/api/admin/newsletter', { method: 'POST' })
    if (!res.ok) { alert('Could not create newsletter'); return }
    const data = await res.json()
    router.push(`/admin/newsletter/${data.newsletter.id}`)
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'sent': return 'var(--color-accent)'
      case 'scheduled': return 'var(--color-primary)'
      case 'cancelled': return '#c0392b'
      default: return 'var(--color-text-muted)'
    }
  }

  function dateLabel(nl: NewsletterRow): string {
    if (nl.status === 'sent' && nl.sent_at) return `Sent ${new Date(nl.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    if (nl.status === 'scheduled' && nl.scheduled_at) return `Scheduled ${new Date(nl.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    return `Created ${new Date(nl.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', margin: 0 }}>Newsletters</h1>
        <button
          onClick={handleCreate}
          style={{ padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-bg)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, minHeight: '48px' }}
        >
          + New Newsletter
        </button>
      </div>

      {newsletters.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No newsletters yet. Create your first one!</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--color-border)' }}>
          {newsletters.map((nl) => (
            <li
              key={nl.id}
              onClick={() => router.push(`/admin/newsletter/${nl.id}`)}
              style={{ background: 'var(--color-surface)', padding: '16px 20px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}
            >
              <div>
                <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: '4px' }}>
                  {nl.title || '(untitled)'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{dateLabel(nl)}</div>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: statusColor(nl.status), textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
                {nl.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
