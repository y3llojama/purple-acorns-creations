'use client'
import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useDiscovery } from './DiscoveryProvider'
import type { Event } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props { initialEvents: Event[] }

const emptyForm = { name: '', date: '', time: '', location: '', description: '', link_url: '', link_label: '' }

export default function EventsManager({ initialEvents }: Props) {
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { state: discoverState, startDiscovery } = useDiscovery()

  function field(k: keyof typeof emptyForm) {
    return { value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value })) }
  }

  function handleEdit(ev: Event) {
    setEditId(ev.id)
    setForm({
      name: ev.name,
      date: ev.date,
      time: ev.time ?? '',
      location: ev.location,
      description: ev.description ?? '',
      link_url: ev.link_url ?? '',
      link_label: ev.link_label ?? '',
    })
    setShowForm(true)
    setStatus('idle')
    // Scroll to the top of the page so the form is visible
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelForm() {
    setShowForm(false)
    setEditId(null)
    setForm(emptyForm)
    setStatus('idle')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setStatus('saving')
    const link_url = form.link_url && isValidHttpsUrl(form.link_url) ? form.link_url : undefined
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, link_url }),
      })
      if (!res.ok) { setStatus('error'); return }
      const newEvent = await res.json()
      setEvents(ev => [...ev, newEvent])
      setForm(emptyForm)
      setShowForm(false)
      setStatus('idle')
    } catch { setStatus('error') }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    setStatus('saving')
    const link_url = form.link_url && isValidHttpsUrl(form.link_url) ? form.link_url : undefined
    try {
      const res = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, ...form, link_url }),
      })
      if (!res.ok) { setStatus('error'); return }
      setEvents(ev => ev.map(item =>
        item.id === editId
          ? { ...item, ...form, link_url: link_url ?? null, link_label: form.link_label || null, time: form.time || null, description: form.description || null }
          : item
      ))
      setForm(emptyForm)
      setEditId(null)
      setShowForm(false)
      setStatus('idle')
    } catch { setStatus('error') }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch('/api/admin/events', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) { setDeleteId(null); return }
      setEvents(ev => ev.filter(e => e.id !== id))
    } catch { /* Network error — keep item in list */ }
    setDeleteId(null)
  }

  async function toggleFeatured(ev: Event) {
    const newVal = !ev.featured
    // Optimistically update UI
    setEvents(list => list.map(e => e.id === ev.id ? { ...e, featured: newVal } : e))
    const res = await fetch('/api/admin/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ev.id, featured: newVal }),
    })
    if (!res.ok) {
      // Revert optimistic update on failure
      setEvents(list => list.map(e => e.id === ev.id ? { ...e, featured: ev.featured } : e))
    } else {
      // Reload to confirm persisted state
      const refreshed = await fetch('/api/admin/events').then(r => r.json()).catch(() => null)
      if (Array.isArray(refreshed)) setEvents(refreshed)
    }
  }


  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', margin: 0 }}>Events</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={startDiscovery}
            disabled={discoverState === 'searching'}
            style={{ background: 'transparent', color: 'var(--color-primary)', padding: '12px 20px', fontSize: '16px', border: '2px solid var(--color-primary)', borderRadius: '4px', cursor: discoverState === 'searching' ? 'not-allowed' : 'pointer', minHeight: '48px', opacity: discoverState === 'searching' ? 0.7 : 1 }}
          >
            {discoverState === 'searching' ? 'Searching…' : 'Find Events'}
          </button>
          <button
            onClick={() => { setShowForm(s => !s); if (showForm && editId) { setEditId(null); setForm(emptyForm) } }}
            style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 20px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
          >
            + Add New Event
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={editId ? handleUpdate : handleAdd} style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>{editId ? 'Edit Event' : 'New Event'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label htmlFor="event-name" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Event Name *</label>
              <input id="event-name" required {...field('name')} style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label htmlFor="event-date" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Date *</label>
              <input id="event-date" type="date" required {...field('date')} style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label htmlFor="event-time" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Time</label>
              <input id="event-time" {...field('time')} style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label htmlFor="event-location" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Location *</label>
              <input id="event-location" required {...field('location')} style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
          </div>
          <div style={{ marginTop: '16px' }}>
            <label htmlFor="event-desc" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Description</label>
            <textarea id="event-desc" rows={3} {...field('description')} style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Variables: <code>{'${BUSINESS_NAME}'}</code> · <code>{'${CONTACT_FORM}'}</code>
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
            <div>
              <label htmlFor="event-link" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Link URL (https://...)</label>
              <input id="event-link" {...field('link_url')} placeholder="https://..." style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label htmlFor="event-linklabel" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Link Label</label>
              <input id="event-linklabel" {...field('link_label')} placeholder="Learn more" style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
          </div>
          {status === 'error' && <p role="alert" style={{ color: '#c05050', marginTop: '8px' }}>Error saving event. Please try again.</p>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button type="submit" disabled={status === 'saving'} style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 24px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>
              {status === 'saving' ? 'Saving…' : 'Save Event'}
            </button>
            <button type="button" onClick={handleCancelForm} style={{ background: 'transparent', color: 'var(--color-primary)', padding: '12px 24px', fontSize: '16px', border: '2px solid var(--color-primary)', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {events.length === 0 && !showForm && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '18px' }}>No upcoming events. Click &quot;+ Add New Event&quot; to add one.</p>
      )}

      {(() => {
        const today = new Date().toISOString().slice(0, 10)
        const upcoming = [...events].filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))
        const past = [...events].filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date))
        return (
          <>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {upcoming.length === 0 && <p style={{ color: 'var(--color-text-muted)', padding: '16px 0' }}>No upcoming events.</p>}
              {upcoming.map(ev => (
          <li key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: '12px' }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '18px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {ev.name}
                {ev.featured && <span style={{ fontSize: '11px', background: 'var(--color-primary)', color: '#fff', padding: '2px 7px', borderRadius: '10px', fontWeight: 500, letterSpacing: '0.05em' }}>On homepage</span>}
              </div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
                {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                {ev.time ? ` · ${ev.time}` : ''}
                {' · '}{ev.location}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
              <button
                onClick={() => toggleFeatured(ev)}
                aria-label={ev.featured ? 'Remove from homepage' : 'Feature on homepage'}
                title={ev.featured ? 'Currently shown on homepage — click to remove' : 'Show this event on the homepage tile'}
                style={{
                  background: ev.featured ? 'var(--color-primary)' : 'none',
                  border: '1px solid var(--color-primary)',
                  color: ev.featured ? '#fff' : 'var(--color-primary)',
                  padding: '8px 12px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer', minHeight: '44px',
                }}
              >
                {ev.featured ? '★ Featured' : '☆ Feature'}
              </button>
              <button
                onClick={() => handleEdit(ev)}
                aria-label={`Edit event ${ev.name}`}
                style={{ background: 'none', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', padding: '8px 16px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer', minHeight: '44px' }}
              >
                Edit
              </button>
              <button
                onClick={() => setDeleteId(ev.id)}
                aria-label={`Delete event ${ev.name}`}
                style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '8px 16px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer', minHeight: '44px' }}
              >
                Delete
              </button>
            </div>
          </li>
              ))}
            </ul>
            {past.length > 0 && (
              <details style={{ marginTop: '24px' }}>
                <summary style={{ cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)', padding: '8px 0', userSelect: 'none' }}>
                  Past events ({past.length})
                </summary>
                <ul style={{ listStyle: 'none', padding: 0, marginTop: '8px', opacity: 0.7 }}>
                  {past.map(ev => (
                    <li key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '18px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {ev.name}
                          {ev.featured && <span style={{ fontSize: '11px', background: 'var(--color-primary)', color: '#fff', padding: '2px 7px', borderRadius: '10px', fontWeight: 500, letterSpacing: '0.05em' }}>On homepage</span>}
                        </div>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
                          {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                          {ev.time ? ` · ${ev.time}` : ''}
                          {' · '}{ev.location}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
                        <button
                          onClick={() => toggleFeatured(ev)}
                          aria-label={ev.featured ? 'Remove from homepage' : 'Feature on homepage'}
                          title={ev.featured ? 'Currently shown on homepage — click to remove' : 'Show this event on the homepage tile'}
                          style={{ background: ev.featured ? 'var(--color-primary)' : 'none', border: '1px solid var(--color-primary)', color: ev.featured ? '#fff' : 'var(--color-primary)', padding: '8px 12px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer', minHeight: '44px' }}
                        >
                          {ev.featured ? '★ Featured' : '☆ Feature'}
                        </button>
                        <button
                          onClick={() => handleEdit(ev)}
                          style={{ background: 'none', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', padding: '8px 16px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer', minHeight: '44px' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteId(ev.id)}
                          style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '8px 16px', fontSize: '14px', borderRadius: '4px', cursor: 'pointer', minHeight: '44px' }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )
      })()}

      {deleteId && (
        <ConfirmDialog
          message="Delete this event? This cannot be undone."
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
