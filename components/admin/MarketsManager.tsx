'use client'
import { useState, useMemo } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useDiscovery } from './DiscoveryProvider'
import { isValidHttpsUrl } from '@/lib/validate'
import type { CraftFair, ArtistVenue } from '@/lib/supabase/types'

type Tab = 'fairs' | 'venues'
type SortDir = 'asc' | 'desc'

const emptyFairForm = {
  name: '', location: '', website_url: '', instagram_url: '',
  years_in_operation: '', avg_artists: '', avg_shoppers: '', typical_months: '', notes: '',
}
const emptyVenueForm = {
  name: '', location: '', website_url: '', instagram_url: '', hosting_model: '', notes: '',
}

type FairForm = typeof emptyFairForm
type VenueForm = typeof emptyVenueForm

interface Props {
  initialFairs: CraftFair[]
  initialVenues: ArtistVenue[]
}

function matches(obj: Record<string, unknown>, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return Object.values(obj).some(v => typeof v === 'string' && v.toLowerCase().includes(lower))
}

function sortRows<T extends Record<string, unknown>>(rows: T[], col: keyof T | null, dir: SortDir): T[] {
  if (!col) return rows
  return [...rows].sort((a, b) => {
    const av = a[col] ?? ''
    const bv = b[col] ?? ''
    if (av === '' && bv !== '') return 1   // nulls / empty last
    if (bv === '' && av !== '') return -1
    const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' })
    return dir === 'asc' ? cmp : -cmp
  })
}

const emptyFairFilters = { state: '', month: '' }
const emptyVenueFilters = { state: '', model: '' }

export default function MarketsManager({ initialFairs, initialVenues }: Props) {
  const [fairs, setFairs] = useState<CraftFair[]>(initialFairs)
  const [venues, setVenues] = useState<ArtistVenue[]>(initialVenues)
  const [tab, setTab] = useState<Tab>('fairs')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [fairForm, setFairForm] = useState<FairForm>(emptyFairForm)
  const [venueForm, setVenueForm] = useState<VenueForm>(emptyVenueForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; table: 'fairs' | 'venues' } | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [fairFilters, setFairFilters] = useState(emptyFairFilters)
  const [venueFilters, setVenueFilters] = useState(emptyVenueFilters)
  const { state: discoverState, startDiscovery } = useDiscovery()

  // Unique filter options derived from full (unfiltered) arrays
  const fairStates = useMemo(
    () => [...new Set(fairs.map(f => f.location.split(', ').at(-1) ?? '').filter(Boolean))].sort(),
    [fairs]
  )
  const fairMonths = useMemo(() => {
    const s = new Set<string>()
    fairs.forEach(f => {
      if (f.typical_months) f.typical_months.split(/,\s*/).forEach(m => { if (m.trim()) s.add(m.trim()) })
    })
    return [...s].sort()
  }, [fairs])
  const venueStates = useMemo(
    () => [...new Set(venues.map(v => v.location.split(', ').at(-1) ?? '').filter(Boolean))].sort(),
    [venues]
  )
  const venueModels = useMemo(
    () => [...new Set(venues.map(v => v.hosting_model ?? '').filter(Boolean))].sort(),
    [venues]
  )

  const filteredFairs = useMemo(() => fairs.filter(f => {
    if (!matches(f as unknown as Record<string, unknown>, search)) return false
    if (fairFilters.state && !(f.location.split(', ').at(-1) === fairFilters.state)) return false
    if (fairFilters.month && !(f.typical_months ?? '').toLowerCase().includes(fairFilters.month.toLowerCase())) return false
    return true
  }), [fairs, search, fairFilters])

  const filteredVenues = useMemo(() => venues.filter(v => {
    if (!matches(v as unknown as Record<string, unknown>, search)) return false
    if (venueFilters.state && !(v.location.split(', ').at(-1) === venueFilters.state)) return false
    if (venueFilters.model && v.hosting_model !== venueFilters.model) return false
    return true
  }), [venues, search, venueFilters])

  function switchTab(t: Tab) {
    setTab(t)
    setShowForm(false); setEditId(null)
    setFairForm(emptyFairForm); setVenueForm(emptyVenueForm); setStatus('idle')
    setFairFilters(emptyFairFilters); setVenueFilters(emptyVenueFilters)
  }

  function fairField(k: keyof FairForm) {
    return {
      value: fairForm[k],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setFairForm(f => ({ ...f, [k]: e.target.value })),
    }
  }
  function venueField(k: keyof VenueForm) {
    return {
      value: venueForm[k],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setVenueForm(f => ({ ...f, [k]: e.target.value })),
    }
  }

  function handleEditFair(fair: CraftFair) {
    setEditId(fair.id)
    setFairForm({
      name: fair.name, location: fair.location,
      website_url: fair.website_url ?? '', instagram_url: fair.instagram_url ?? '',
      years_in_operation: fair.years_in_operation ?? '', avg_artists: fair.avg_artists ?? '',
      avg_shoppers: fair.avg_shoppers ?? '', typical_months: fair.typical_months ?? '',
      notes: fair.notes ?? '',
    })
    setShowForm(true); setStatus('idle')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleEditVenue(venue: ArtistVenue) {
    setEditId(venue.id)
    setVenueForm({
      name: venue.name, location: venue.location,
      website_url: venue.website_url ?? '', instagram_url: venue.instagram_url ?? '',
      hosting_model: venue.hosting_model ?? '', notes: venue.notes ?? '',
    })
    setShowForm(true); setStatus('idle')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelForm() {
    setShowForm(false); setEditId(null)
    setFairForm(emptyFairForm); setVenueForm(emptyVenueForm); setStatus('idle')
  }

  async function handleSaveFair(e: React.FormEvent) {
    e.preventDefault(); setStatus('saving')
    const website_url = fairForm.website_url && isValidHttpsUrl(fairForm.website_url) ? fairForm.website_url : undefined
    const instagram_url = fairForm.instagram_url && isValidHttpsUrl(fairForm.instagram_url) ? fairForm.instagram_url : undefined
    const body = { ...fairForm, website_url, instagram_url }
    try {
      if (editId) {
        const res = await fetch('/api/admin/markets?table=fairs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...body }) })
        if (!res.ok) { setStatus('error'); return }
        setFairs(fs => fs.map(f => f.id === editId ? { ...f, ...fairForm, website_url: website_url ?? null, instagram_url: instagram_url ?? null } : f))
      } else {
        const res = await fetch('/api/admin/markets?table=fairs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { setStatus('error'); return }
        const newFair = await res.json()  // must await BEFORE setFairs — can't await inside setState callback
        setFairs(fs => [...fs, newFair])
      }
      handleCancelForm()
    } catch { setStatus('error') }
  }

  async function handleSaveVenue(e: React.FormEvent) {
    e.preventDefault(); setStatus('saving')
    const website_url = venueForm.website_url && isValidHttpsUrl(venueForm.website_url) ? venueForm.website_url : undefined
    const instagram_url = venueForm.instagram_url && isValidHttpsUrl(venueForm.instagram_url) ? venueForm.instagram_url : undefined
    const body = { ...venueForm, website_url, instagram_url }
    try {
      if (editId) {
        const res = await fetch('/api/admin/markets?table=venues', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...body }) })
        if (!res.ok) { setStatus('error'); return }
        setVenues(vs => vs.map(v => v.id === editId ? { ...v, ...venueForm, website_url: website_url ?? null, instagram_url: instagram_url ?? null } : v))
      } else {
        const res = await fetch('/api/admin/markets?table=venues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { setStatus('error'); return }
        const newVenue = await res.json()  // must await BEFORE setVenues
        setVenues(vs => [...vs, newVenue])
      }
      handleCancelForm()
    } catch { setStatus('error') }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/admin/markets?table=${deleteTarget.table}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
      if (!res.ok) { setDeleteTarget(null); return }
      if (deleteTarget.table === 'fairs') setFairs(fs => fs.filter(f => f.id !== deleteTarget.id))
      else setVenues(vs => vs.filter(v => v.id !== deleteTarget.id))
    } catch { /* keep in list */ }
    setDeleteTarget(null)
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }
  const btnPrimary: React.CSSProperties = { background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 20px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }
  const btnOutline: React.CSSProperties = { ...btnPrimary, background: 'transparent', color: 'var(--color-primary)', border: '2px solid var(--color-primary)' }
  const selectStyle: React.CSSProperties = { padding: '8px 12px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer', minHeight: '36px' }

  const hasFairFilters = fairFilters.state !== '' || fairFilters.month !== ''
  const hasVenueFilters = venueFilters.state !== '' || venueFilters.model !== ''

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', margin: 0 }}>Markets</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={startDiscovery} disabled={discoverState === 'searching'}
            style={{ ...btnOutline, opacity: discoverState === 'searching' ? 0.7 : 1, cursor: discoverState === 'searching' ? 'not-allowed' : 'pointer' }}>
            {discoverState === 'searching' ? 'Searching…' : 'Find Markets'}
          </button>
          <button onClick={() => { setShowForm(s => !s); if (showForm && editId) handleCancelForm() }} style={btnPrimary}>
            + Add New
          </button>
        </div>
      </div>

      {/* Search */}
      <input type="search" placeholder="Search all markets…" value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ ...inputStyle, marginBottom: '16px', maxWidth: '400px' }}
        aria-label="Search markets" />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--color-border)', marginBottom: '20px' }}>
        {(['fairs', 'venues'] as Tab[]).map(t => (
          <button key={t} onClick={() => switchTab(t)} style={{
            background: 'none', border: 'none',
            borderBottom: tab === t ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
            padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
            fontWeight: tab === t ? '600' : '400', marginBottom: '-2px', minHeight: '48px',
          }}>
            {t === 'fairs' ? `Craft Fairs (${fairs.length})` : `Stores & Collectives (${venues.length})`}
          </button>
        ))}
      </div>

      {/* Forms */}
      {showForm && tab === 'fairs' && (
        <form onSubmit={handleSaveFair} style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>{editId ? 'Edit Craft Fair' : 'New Craft Fair'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div><label htmlFor="fair-name" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Name *</label><input id="fair-name" required {...fairField('name')} style={inputStyle} /></div>
            <div><label htmlFor="fair-location" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Location *</label><input id="fair-location" required {...fairField('location')} placeholder="City, State" style={inputStyle} /></div>
            <div><label htmlFor="fair-website" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Website (https://...)</label><input id="fair-website" {...fairField('website_url')} placeholder="https://..." style={inputStyle} /></div>
            <div><label htmlFor="fair-ig" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Instagram (https://...)</label><input id="fair-ig" {...fairField('instagram_url')} placeholder="https://www.instagram.com/..." style={inputStyle} /></div>
            <div><label htmlFor="fair-years" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Years in Operation</label><input id="fair-years" {...fairField('years_in_operation')} placeholder="e.g. est. 2008" style={inputStyle} /></div>
            <div><label htmlFor="fair-artists" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Avg Artists</label><input id="fair-artists" {...fairField('avg_artists')} placeholder="e.g. 80–120" style={inputStyle} /></div>
            <div><label htmlFor="fair-shoppers" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Avg Shoppers</label><input id="fair-shoppers" {...fairField('avg_shoppers')} placeholder="e.g. 5,000+" style={inputStyle} /></div>
            <div><label htmlFor="fair-months" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Typical Month(s)</label><input id="fair-months" {...fairField('typical_months')} placeholder="e.g. November, December" style={inputStyle} /></div>
          </div>
          <div style={{ marginTop: '16px' }}><label htmlFor="fair-notes" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Notes</label><textarea id="fair-notes" rows={3} {...fairField('notes')} placeholder="Relationship status, application notes, etc." style={inputStyle} /></div>
          {status === 'error' && <p role="alert" style={{ color: '#c05050', marginTop: '8px' }}>Error saving. Please try again.</p>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button type="submit" disabled={status === 'saving'} style={btnPrimary}>{status === 'saving' ? 'Saving…' : 'Save Fair'}</button>
            <button type="button" onClick={handleCancelForm} style={btnOutline}>Cancel</button>
          </div>
        </form>
      )}

      {showForm && tab === 'venues' && (
        <form onSubmit={handleSaveVenue} style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>{editId ? 'Edit Store / Collective' : 'New Store / Collective'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div><label htmlFor="venue-name" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Name *</label><input id="venue-name" required {...venueField('name')} style={inputStyle} /></div>
            <div><label htmlFor="venue-location" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Location *</label><input id="venue-location" required {...venueField('location')} placeholder="City, State" style={inputStyle} /></div>
            <div><label htmlFor="venue-website" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Website (https://...)</label><input id="venue-website" {...venueField('website_url')} placeholder="https://..." style={inputStyle} /></div>
            <div><label htmlFor="venue-ig" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Instagram (https://...)</label><input id="venue-ig" {...venueField('instagram_url')} placeholder="https://www.instagram.com/..." style={inputStyle} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label htmlFor="venue-model" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Hosting Model</label><input id="venue-model" {...venueField('hosting_model')} placeholder="e.g. consignment, booth rental, pop-up" style={inputStyle} /></div>
          </div>
          <div style={{ marginTop: '16px' }}><label htmlFor="venue-notes" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Notes</label><textarea id="venue-notes" rows={3} {...venueField('notes')} placeholder="Current relationship, past experience, contact info…" style={inputStyle} /></div>
          {status === 'error' && <p role="alert" style={{ color: '#c05050', marginTop: '8px' }}>Error saving. Please try again.</p>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button type="submit" disabled={status === 'saving'} style={btnPrimary}>{status === 'saving' ? 'Saving…' : 'Save Venue'}</button>
            <button type="button" onClick={handleCancelForm} style={btnOutline}>Cancel</button>
          </div>
        </form>
      )}

      {/* Filter bars */}
      {tab === 'fairs' && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
          {fairStates.length > 0 && (
            <select value={fairFilters.state} onChange={e => setFairFilters(f => ({ ...f, state: e.target.value }))} style={selectStyle} aria-label="Filter by state">
              <option value="">All states</option>
              {fairStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {fairMonths.length > 0 && (
            <select value={fairFilters.month} onChange={e => setFairFilters(f => ({ ...f, month: e.target.value }))} style={selectStyle} aria-label="Filter by month">
              <option value="">All months</option>
              {fairMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {hasFairFilters && (
            <button onClick={() => setFairFilters(emptyFairFilters)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '13px', cursor: 'pointer', padding: '4px 8px', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
        </div>
      )}
      {tab === 'venues' && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
          {venueStates.length > 0 && (
            <select value={venueFilters.state} onChange={e => setVenueFilters(f => ({ ...f, state: e.target.value }))} style={selectStyle} aria-label="Filter by state">
              <option value="">All states</option>
              {venueStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {venueModels.length > 0 && (
            <select value={venueFilters.model} onChange={e => setVenueFilters(f => ({ ...f, model: e.target.value }))} style={selectStyle} aria-label="Filter by hosting model">
              <option value="">All models</option>
              {venueModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
          {hasVenueFilters && (
            <button onClick={() => setVenueFilters(emptyVenueFilters)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '13px', cursor: 'pointer', padding: '4px 8px', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Tables */}
      {tab === 'fairs' && <FairsTable fairs={filteredFairs} search={search} hasFilters={hasFairFilters} onEdit={handleEditFair} onDelete={id => setDeleteTarget({ id, table: 'fairs' })} />}
      {tab === 'venues' && <VenuesTable venues={filteredVenues} search={search} hasFilters={hasVenueFilters} onEdit={handleEditVenue} onDelete={id => setDeleteTarget({ id, table: 'venues' })} />}

      {deleteTarget && (
        <ConfirmDialog
          message="Delete this entry? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function LinkButtons({ website_url, instagram_url }: { website_url: string | null; instagram_url: string | null }) {
  return (
    <span style={{ display: 'flex', gap: '6px' }}>
      {website_url && isValidHttpsUrl(website_url) && <a href={website_url} target="_blank" rel="noopener noreferrer" aria-label="Website" style={{ fontSize: '13px', color: 'var(--color-primary)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '2px 8px', textDecoration: 'none' }}>web ↗</a>}
      {instagram_url && isValidHttpsUrl(instagram_url) && <a href={instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram" style={{ fontSize: '13px', color: 'var(--color-primary)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '2px 8px', textDecoration: 'none' }}>IG ↗</a>}
    </span>
  )
}

type FairSortCol = keyof Pick<CraftFair, 'name' | 'location' | 'years_in_operation' | 'avg_artists' | 'avg_shoppers' | 'typical_months' | 'notes'>
type VenueSortCol = keyof Pick<ArtistVenue, 'name' | 'location' | 'hosting_model' | 'notes'>

function SortTh({ label, col, sortCol, sortDir, onSort, style }: {
  label: string; col: string; sortCol: string | null; sortDir: SortDir; onSort: (col: string) => void; style?: React.CSSProperties
}) {
  const active = sortCol === col
  return (
    <th onClick={() => onSort(col)} style={{ padding: '8px 12px', fontWeight: '600', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}>
      {label}
      <span aria-hidden style={{ marginLeft: '4px', fontSize: '11px', opacity: active ? 1 : 0.3 }}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </th>
  )
}

function FairsTable({ fairs, search, hasFilters, onEdit, onDelete }: { fairs: CraftFair[]; search: string; hasFilters: boolean; onEdit: (f: CraftFair) => void; onDelete: (id: string) => void }) {
  const [sortCol, setSortCol] = useState<FairSortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(col: string) {
    const c = col as FairSortCol
    if (sortCol === c) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(c); setSortDir('asc') }
  }

  const sorted = useMemo(
    () => sortRows(fairs as unknown as Record<string, unknown>[], sortCol, sortDir) as unknown as CraftFair[],
    [fairs, sortCol, sortDir]
  )

  if (sorted.length === 0) return <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>{(search || hasFilters) ? 'No craft fairs match your search or filters.' : 'No craft fairs yet. Click "+ Add New" to add one.'}</p>

  const thProps = { sortCol, sortDir, onSort: handleSort }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
            <SortTh label="Name" col="name" {...thProps} />
            <SortTh label="Location" col="location" {...thProps} />
            <th style={{ padding: '8px 12px', fontWeight: '600' }}>Links</th>
            <SortTh label="Est." col="years_in_operation" {...thProps} />
            <SortTh label="Artists" col="avg_artists" {...thProps} />
            <SortTh label="Shoppers" col="avg_shoppers" {...thProps} />
            <SortTh label="Month(s)" col="typical_months" {...thProps} />
            <SortTh label="Notes" col="notes" {...thProps} />
            <th style={{ padding: '8px 12px', fontWeight: '600' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(f => (
            <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: '500', color: 'var(--color-primary)' }}>{f.name}</td>
              <td style={{ padding: '10px 12px' }}>{f.location}</td>
              <td style={{ padding: '10px 12px' }}><LinkButtons website_url={f.website_url} instagram_url={f.instagram_url} /></td>
              <td style={{ padding: '10px 12px' }}>{f.years_in_operation ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{f.avg_artists ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{f.avg_shoppers ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{f.typical_months ?? '—'}</td>
              <td style={{ padding: '10px 12px', maxWidth: '180px' }}>
                <span title={f.notes ?? undefined} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.notes ?? '—'}</span>
              </td>
              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                <button onClick={() => onEdit(f)} aria-label={`Edit ${f.name}`} style={{ background: 'none', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', padding: '6px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px', marginRight: '6px' }}>Edit</button>
                <button onClick={() => onDelete(f.id)} aria-label={`Delete ${f.name}`} style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '6px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VenuesTable({ venues, search, hasFilters, onEdit, onDelete }: { venues: ArtistVenue[]; search: string; hasFilters: boolean; onEdit: (v: ArtistVenue) => void; onDelete: (id: string) => void }) {
  const [sortCol, setSortCol] = useState<VenueSortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(col: string) {
    const c = col as VenueSortCol
    if (sortCol === c) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(c); setSortDir('asc') }
  }

  const sorted = useMemo(
    () => sortRows(venues as unknown as Record<string, unknown>[], sortCol, sortDir) as unknown as ArtistVenue[],
    [venues, sortCol, sortDir]
  )

  if (sorted.length === 0) return <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>{(search || hasFilters) ? 'No stores/collectives match your search or filters.' : 'No stores or collectives yet. Click "+ Add New" to add one.'}</p>

  const thProps = { sortCol, sortDir, onSort: handleSort }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
            <SortTh label="Name" col="name" {...thProps} />
            <SortTh label="Location" col="location" {...thProps} />
            <th style={{ padding: '8px 12px', fontWeight: '600' }}>Links</th>
            <SortTh label="Hosting Model" col="hosting_model" {...thProps} />
            <SortTh label="Notes" col="notes" {...thProps} />
            <th style={{ padding: '8px 12px', fontWeight: '600' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(v => (
            <tr key={v.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: '500', color: 'var(--color-primary)' }}>{v.name}</td>
              <td style={{ padding: '10px 12px' }}>{v.location}</td>
              <td style={{ padding: '10px 12px' }}><LinkButtons website_url={v.website_url} instagram_url={v.instagram_url} /></td>
              <td style={{ padding: '10px 12px' }}>{v.hosting_model ?? '—'}</td>
              <td style={{ padding: '10px 12px', maxWidth: '200px' }}>
                <span title={v.notes ?? undefined} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.notes ?? '—'}</span>
              </td>
              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                <button onClick={() => onEdit(v)} aria-label={`Edit ${v.name}`} style={{ background: 'none', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', padding: '6px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px', marginRight: '6px' }}>Edit</button>
                <button onClick={() => onDelete(v.id)} aria-label={`Delete ${v.name}`} style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '6px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
