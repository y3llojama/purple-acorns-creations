'use client'
import { useState, useMemo } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useDiscovery } from './DiscoveryProvider'
import { isValidHttpsUrl } from '@/lib/validate'
import type { CraftFair, ArtistVenue, RecurringMarket } from '@/lib/supabase/types'

type Tab = 'fairs' | 'venues' | 'markets'
type SortDir = 'asc' | 'desc'

const emptyFairForm = {
  name: '', location: '', website_url: '', instagram_url: '',
  years_in_operation: '', avg_artists: '', avg_shoppers: '', typical_months: '', notes: '',
}
const emptyVenueForm = {
  name: '', location: '', website_url: '', instagram_url: '',
  hosting_model: '', commission_rate: '', booth_fee: '', avg_shoppers: '', application_process: '', notes: '',
}
const emptyMarketForm = {
  name: '', location: '', website_url: '', instagram_url: '',
  frequency: '', typical_months: '', vendor_fee: '', avg_vendors: '', avg_shoppers: '', application_process: '', notes: '',
}

type FairForm = typeof emptyFairForm
type VenueForm = typeof emptyVenueForm
type MarketForm = typeof emptyMarketForm

interface Props {
  initialFairs: CraftFair[]
  initialVenues: ArtistVenue[]
  initialMarkets: RecurringMarket[]
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
    if (av === '' && bv !== '') return 1
    if (bv === '' && av !== '') return -1
    const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' })
    return dir === 'asc' ? cmp : -cmp
  })
}

const emptyFairFilters = { state: '', month: '', completeness: '' }
const emptyVenueFilters = { state: '', model: '', completeness: '' }
const emptyMarketFilters = { state: '', frequency: '', completeness: '' }

function fairCompleteness(f: CraftFair): 'complete' | 'sparse' {
  const filled = [f.years_in_operation, f.avg_artists, f.avg_shoppers, f.typical_months].filter(v => v?.trim()).length
  return filled >= 3 ? 'complete' : 'sparse'
}
function venueCompleteness(v: ArtistVenue): 'complete' | 'sparse' {
  const filled = [v.hosting_model, v.commission_rate, v.booth_fee, v.avg_shoppers, v.application_process].filter(v => v?.trim()).length
  return filled >= 3 ? 'complete' : 'sparse'
}
function marketCompleteness(m: RecurringMarket): 'complete' | 'sparse' {
  const filled = [m.frequency, m.typical_months, m.vendor_fee, m.avg_vendors, m.avg_shoppers, m.application_process].filter(v => v?.trim()).length
  return filled >= 4 ? 'complete' : 'sparse'
}

export default function MarketsManager({ initialFairs, initialVenues, initialMarkets }: Props) {
  const [fairs, setFairs] = useState<CraftFair[]>(initialFairs)
  const [venues, setVenues] = useState<ArtistVenue[]>(initialVenues)
  const [markets, setMarkets] = useState<RecurringMarket[]>(initialMarkets)
  const [tab, setTab] = useState<Tab>('fairs')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [fairForm, setFairForm] = useState<FairForm>(emptyFairForm)
  const [venueForm, setVenueForm] = useState<VenueForm>(emptyVenueForm)
  const [marketForm, setMarketForm] = useState<MarketForm>(emptyMarketForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; table: 'fairs' | 'venues' | 'markets' } | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [fairFilters, setFairFilters] = useState(emptyFairFilters)
  const [venueFilters, setVenueFilters] = useState(emptyVenueFilters)
  const [marketFilters, setMarketFilters] = useState(emptyMarketFilters)
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
  const marketStates = useMemo(
    () => [...new Set(markets.map(m => m.location.split(', ').at(-1) ?? '').filter(Boolean))].sort(),
    [markets]
  )
  const marketFrequencies = useMemo(
    () => [...new Set(markets.map(m => m.frequency ?? '').filter(Boolean))].sort(),
    [markets]
  )

  const filteredFairs = useMemo(() => fairs.filter(f => {
    if (!matches(f as unknown as Record<string, unknown>, search)) return false
    if (fairFilters.state && f.location.split(', ').at(-1) !== fairFilters.state) return false
    if (fairFilters.month && !(f.typical_months ?? '').toLowerCase().includes(fairFilters.month.toLowerCase())) return false
    if (fairFilters.completeness && fairCompleteness(f) !== fairFilters.completeness) return false
    return true
  }), [fairs, search, fairFilters])

  const filteredVenues = useMemo(() => venues.filter(v => {
    if (!matches(v as unknown as Record<string, unknown>, search)) return false
    if (venueFilters.state && v.location.split(', ').at(-1) !== venueFilters.state) return false
    if (venueFilters.model && v.hosting_model !== venueFilters.model) return false
    if (venueFilters.completeness && venueCompleteness(v) !== venueFilters.completeness) return false
    return true
  }), [venues, search, venueFilters])

  const filteredMarkets = useMemo(() => markets.filter(m => {
    if (!matches(m as unknown as Record<string, unknown>, search)) return false
    if (marketFilters.state && m.location.split(', ').at(-1) !== marketFilters.state) return false
    if (marketFilters.frequency && m.frequency !== marketFilters.frequency) return false
    if (marketFilters.completeness && marketCompleteness(m) !== marketFilters.completeness) return false
    return true
  }), [markets, search, marketFilters])

  function switchTab(t: Tab) {
    setTab(t)
    setShowForm(false); setEditId(null)
    setFairForm(emptyFairForm); setVenueForm(emptyVenueForm); setMarketForm(emptyMarketForm); setStatus('idle')
    setFairFilters(emptyFairFilters); setVenueFilters(emptyVenueFilters); setMarketFilters(emptyMarketFilters)
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
  function marketField(k: keyof MarketForm) {
    return {
      value: marketForm[k],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setMarketForm(f => ({ ...f, [k]: e.target.value })),
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
      hosting_model: venue.hosting_model ?? '',
      commission_rate: venue.commission_rate ?? '', booth_fee: venue.booth_fee ?? '',
      avg_shoppers: venue.avg_shoppers ?? '', application_process: venue.application_process ?? '',
      notes: venue.notes ?? '',
    })
    setShowForm(true); setStatus('idle')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleEditMarket(market: RecurringMarket) {
    setEditId(market.id)
    setMarketForm({
      name: market.name, location: market.location,
      website_url: market.website_url ?? '', instagram_url: market.instagram_url ?? '',
      frequency: market.frequency ?? '', typical_months: market.typical_months ?? '',
      vendor_fee: market.vendor_fee ?? '', avg_vendors: market.avg_vendors ?? '',
      avg_shoppers: market.avg_shoppers ?? '', application_process: market.application_process ?? '',
      notes: market.notes ?? '',
    })
    setShowForm(true); setStatus('idle')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelForm() {
    setShowForm(false); setEditId(null)
    setFairForm(emptyFairForm); setVenueForm(emptyVenueForm); setMarketForm(emptyMarketForm); setStatus('idle')
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
        const newFair = await res.json()
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
        const newVenue = await res.json()
        setVenues(vs => [...vs, newVenue])
      }
      handleCancelForm()
    } catch { setStatus('error') }
  }

  async function handleSaveMarket(e: React.FormEvent) {
    e.preventDefault(); setStatus('saving')
    const website_url = marketForm.website_url && isValidHttpsUrl(marketForm.website_url) ? marketForm.website_url : undefined
    const instagram_url = marketForm.instagram_url && isValidHttpsUrl(marketForm.instagram_url) ? marketForm.instagram_url : undefined
    const body = { ...marketForm, website_url, instagram_url }
    try {
      if (editId) {
        const res = await fetch('/api/admin/markets?table=markets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, ...body }) })
        if (!res.ok) { setStatus('error'); return }
        setMarkets(ms => ms.map(m => m.id === editId ? { ...m, ...marketForm, website_url: website_url ?? null, instagram_url: instagram_url ?? null } : m))
      } else {
        const res = await fetch('/api/admin/markets?table=markets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (!res.ok) { setStatus('error'); return }
        const newMarket = await res.json()
        setMarkets(ms => [...ms, newMarket])
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
      else if (deleteTarget.table === 'venues') setVenues(vs => vs.filter(v => v.id !== deleteTarget.id))
      else setMarkets(ms => ms.filter(m => m.id !== deleteTarget.id))
    } catch { /* keep in list */ }
    setDeleteTarget(null)
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }
  const btnPrimary: React.CSSProperties = { background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 20px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }
  const btnOutline: React.CSSProperties = { ...btnPrimary, background: 'transparent', color: 'var(--color-primary)', border: '2px solid var(--color-primary)' }
  const selectStyle: React.CSSProperties = { padding: '8px 12px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer', minHeight: '36px' }

  const hasFairFilters = fairFilters.state !== '' || fairFilters.month !== '' || fairFilters.completeness !== ''
  const hasVenueFilters = venueFilters.state !== '' || venueFilters.model !== '' || venueFilters.completeness !== ''
  const hasMarketFilters = marketFilters.state !== '' || marketFilters.frequency !== '' || marketFilters.completeness !== ''

  const tabLabel: Record<Tab, string> = {
    fairs: `Craft Fairs (${fairs.length})`,
    venues: `Stores & Collectives (${venues.length})`,
    markets: `Recurring Markets (${markets.length})`,
  }

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
        {(['fairs', 'venues', 'markets'] as Tab[]).map(t => (
          <button key={t} onClick={() => switchTab(t)} style={{
            background: 'none', border: 'none',
            borderBottom: tab === t ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: tab === t ? 'var(--color-primary)' : 'var(--color-text-muted)',
            padding: '10px 20px', fontSize: '16px', cursor: 'pointer',
            fontWeight: tab === t ? '600' : '400', marginBottom: '-2px', minHeight: '48px',
          }}>
            {tabLabel[t]}
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
            <div><label htmlFor="venue-model" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Hosting Model</label><input id="venue-model" {...venueField('hosting_model')} placeholder="e.g. consignment, booth rental, pop-up" style={inputStyle} /></div>
            <div><label htmlFor="venue-commission" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Commission Rate</label><input id="venue-commission" {...venueField('commission_rate')} placeholder="e.g. 35%, 40% consignment" style={inputStyle} /></div>
            <div><label htmlFor="venue-booth-fee" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Booth Fee</label><input id="venue-booth-fee" {...venueField('booth_fee')} placeholder="e.g. $150/month, $50/day" style={inputStyle} /></div>
            <div><label htmlFor="venue-shoppers" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Avg Shoppers</label><input id="venue-shoppers" {...venueField('avg_shoppers')} placeholder="e.g. ~500/week" style={inputStyle} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label htmlFor="venue-apply" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Application Process</label><input id="venue-apply" {...venueField('application_process')} placeholder="e.g. Email owner, 2-week review" style={inputStyle} /></div>
          </div>
          <div style={{ marginTop: '16px' }}><label htmlFor="venue-notes" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Notes</label><textarea id="venue-notes" rows={3} {...venueField('notes')} placeholder="Current relationship, past experience, contact info…" style={inputStyle} /></div>
          {status === 'error' && <p role="alert" style={{ color: '#c05050', marginTop: '8px' }}>Error saving. Please try again.</p>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button type="submit" disabled={status === 'saving'} style={btnPrimary}>{status === 'saving' ? 'Saving…' : 'Save Venue'}</button>
            <button type="button" onClick={handleCancelForm} style={btnOutline}>Cancel</button>
          </div>
        </form>
      )}

      {showForm && tab === 'markets' && (
        <form onSubmit={handleSaveMarket} style={{ background: 'var(--color-surface)', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>{editId ? 'Edit Recurring Market' : 'New Recurring Market'}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div><label htmlFor="market-name" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Name *</label><input id="market-name" required {...marketField('name')} style={inputStyle} /></div>
            <div><label htmlFor="market-location" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Location *</label><input id="market-location" required {...marketField('location')} placeholder="City, State" style={inputStyle} /></div>
            <div><label htmlFor="market-website" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Website (https://...)</label><input id="market-website" {...marketField('website_url')} placeholder="https://..." style={inputStyle} /></div>
            <div><label htmlFor="market-ig" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Instagram (https://...)</label><input id="market-ig" {...marketField('instagram_url')} placeholder="https://www.instagram.com/..." style={inputStyle} /></div>
            <div><label htmlFor="market-frequency" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Frequency</label><input id="market-frequency" {...marketField('frequency')} placeholder="e.g. Weekly (Sundays), Monthly" style={inputStyle} /></div>
            <div><label htmlFor="market-months" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Typical Month(s)</label><input id="market-months" {...marketField('typical_months')} placeholder="e.g. May–October, Year-round" style={inputStyle} /></div>
            <div><label htmlFor="market-fee" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Vendor Fee</label><input id="market-fee" {...marketField('vendor_fee')} placeholder="e.g. $50/day, $75/weekend" style={inputStyle} /></div>
            <div><label htmlFor="market-vendors" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Avg Vendors</label><input id="market-vendors" {...marketField('avg_vendors')} placeholder="e.g. 60–80" style={inputStyle} /></div>
            <div><label htmlFor="market-shoppers" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Avg Shoppers</label><input id="market-shoppers" {...marketField('avg_shoppers')} placeholder="e.g. 2,000+" style={inputStyle} /></div>
            <div><label htmlFor="market-apply" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Application Process</label><input id="market-apply" {...marketField('application_process')} placeholder="e.g. Online signup, rolling basis" style={inputStyle} /></div>
          </div>
          <div style={{ marginTop: '16px' }}><label htmlFor="market-notes" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Notes</label><textarea id="market-notes" rows={3} {...marketField('notes')} placeholder="Past experience, foot traffic observations…" style={inputStyle} /></div>
          {status === 'error' && <p role="alert" style={{ color: '#c05050', marginTop: '8px' }}>Error saving. Please try again.</p>}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button type="submit" disabled={status === 'saving'} style={btnPrimary}>{status === 'saving' ? 'Saving…' : 'Save Market'}</button>
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
          <select value={fairFilters.completeness} onChange={e => setFairFilters(f => ({ ...f, completeness: e.target.value }))} style={selectStyle} aria-label="Filter by completeness">
            <option value="">All info levels</option>
            <option value="complete">Info complete</option>
            <option value="sparse">Needs info</option>
          </select>
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
          <select value={venueFilters.completeness} onChange={e => setVenueFilters(f => ({ ...f, completeness: e.target.value }))} style={selectStyle} aria-label="Filter by completeness">
            <option value="">All info levels</option>
            <option value="complete">Info complete</option>
            <option value="sparse">Needs info</option>
          </select>
          {hasVenueFilters && (
            <button onClick={() => setVenueFilters(emptyVenueFilters)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '13px', cursor: 'pointer', padding: '4px 8px', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
        </div>
      )}
      {tab === 'markets' && (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
          {marketStates.length > 0 && (
            <select value={marketFilters.state} onChange={e => setMarketFilters(f => ({ ...f, state: e.target.value }))} style={selectStyle} aria-label="Filter by state">
              <option value="">All states</option>
              {marketStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {marketFrequencies.length > 0 && (
            <select value={marketFilters.frequency} onChange={e => setMarketFilters(f => ({ ...f, frequency: e.target.value }))} style={selectStyle} aria-label="Filter by frequency">
              <option value="">All frequencies</option>
              {marketFrequencies.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          <select value={marketFilters.completeness} onChange={e => setMarketFilters(f => ({ ...f, completeness: e.target.value }))} style={selectStyle} aria-label="Filter by completeness">
            <option value="">All info levels</option>
            <option value="complete">Info complete</option>
            <option value="sparse">Needs info</option>
          </select>
          {hasMarketFilters && (
            <button onClick={() => setMarketFilters(emptyMarketFilters)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '13px', cursor: 'pointer', padding: '4px 8px', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Tables */}
      {tab === 'fairs' && <FairsTable fairs={filteredFairs} search={search} hasFilters={hasFairFilters} onEdit={handleEditFair} onDelete={id => setDeleteTarget({ id, table: 'fairs' })} />}
      {tab === 'venues' && <VenuesTable venues={filteredVenues} search={search} hasFilters={hasVenueFilters} onEdit={handleEditVenue} onDelete={id => setDeleteTarget({ id, table: 'venues' })} />}
      {tab === 'markets' && <RecurringMarketsTable markets={filteredMarkets} search={search} hasFilters={hasMarketFilters} onEdit={handleEditMarket} onDelete={id => setDeleteTarget({ id, table: 'markets' })} />}

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

const actionBtnBase: React.CSSProperties = { background: 'none', padding: '6px 12px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }

type FairSortCol = keyof Pick<CraftFair, 'name' | 'location' | 'years_in_operation' | 'avg_artists' | 'avg_shoppers' | 'typical_months' | 'notes'>
type VenueSortCol = keyof Pick<ArtistVenue, 'name' | 'location' | 'hosting_model' | 'commission_rate' | 'booth_fee' | 'avg_shoppers' | 'application_process' | 'notes'>
type MarketSortCol = keyof Pick<RecurringMarket, 'name' | 'location' | 'frequency' | 'typical_months' | 'vendor_fee' | 'avg_vendors' | 'avg_shoppers' | 'application_process' | 'notes'>

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
                <button onClick={() => onEdit(f)} aria-label={`Edit ${f.name}`} style={{ ...actionBtnBase, border: '1px solid var(--color-primary)', color: 'var(--color-primary)', marginRight: '6px' }}>Edit</button>
                <button onClick={() => onDelete(f.id)} aria-label={`Delete ${f.name}`} style={{ ...actionBtnBase, border: '1px solid #c05050', color: '#c05050' }}>Delete</button>
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
            <SortTh label="Commission" col="commission_rate" {...thProps} />
            <SortTh label="Booth Fee" col="booth_fee" {...thProps} />
            <SortTh label="Shoppers" col="avg_shoppers" {...thProps} />
            <SortTh label="Application" col="application_process" {...thProps} />
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
              <td style={{ padding: '10px 12px' }}>{v.commission_rate ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{v.booth_fee ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{v.avg_shoppers ?? '—'}</td>
              <td style={{ padding: '10px 12px', maxWidth: '160px' }}>
                <span title={v.application_process ?? undefined} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.application_process ?? '—'}</span>
              </td>
              <td style={{ padding: '10px 12px', maxWidth: '160px' }}>
                <span title={v.notes ?? undefined} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.notes ?? '—'}</span>
              </td>
              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                <button onClick={() => onEdit(v)} aria-label={`Edit ${v.name}`} style={{ ...actionBtnBase, border: '1px solid var(--color-primary)', color: 'var(--color-primary)', marginRight: '6px' }}>Edit</button>
                <button onClick={() => onDelete(v.id)} aria-label={`Delete ${v.name}`} style={{ ...actionBtnBase, border: '1px solid #c05050', color: '#c05050' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecurringMarketsTable({ markets, search, hasFilters, onEdit, onDelete }: { markets: RecurringMarket[]; search: string; hasFilters: boolean; onEdit: (m: RecurringMarket) => void; onDelete: (id: string) => void }) {
  const [sortCol, setSortCol] = useState<MarketSortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  function handleSort(col: string) {
    const c = col as MarketSortCol
    if (sortCol === c) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(c); setSortDir('asc') }
  }
  const sorted = useMemo(
    () => sortRows(markets as unknown as Record<string, unknown>[], sortCol, sortDir) as unknown as RecurringMarket[],
    [markets, sortCol, sortDir]
  )
  if (sorted.length === 0) return <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>{(search || hasFilters) ? 'No recurring markets match your search or filters.' : 'No recurring markets yet. Click "+ Add New" to add one.'}</p>
  const thProps = { sortCol, sortDir, onSort: handleSort }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
            <SortTh label="Name" col="name" {...thProps} />
            <SortTh label="Location" col="location" {...thProps} />
            <th style={{ padding: '8px 12px', fontWeight: '600' }}>Links</th>
            <SortTh label="Frequency" col="frequency" {...thProps} />
            <SortTh label="Month(s)" col="typical_months" {...thProps} />
            <SortTh label="Vendor Fee" col="vendor_fee" {...thProps} />
            <SortTh label="Vendors" col="avg_vendors" {...thProps} />
            <SortTh label="Shoppers" col="avg_shoppers" {...thProps} />
            <SortTh label="Application" col="application_process" {...thProps} />
            <SortTh label="Notes" col="notes" {...thProps} />
            <th style={{ padding: '8px 12px', fontWeight: '600' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(m => (
            <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '10px 12px', fontWeight: '500', color: 'var(--color-primary)' }}>{m.name}</td>
              <td style={{ padding: '10px 12px' }}>{m.location}</td>
              <td style={{ padding: '10px 12px' }}><LinkButtons website_url={m.website_url} instagram_url={m.instagram_url} /></td>
              <td style={{ padding: '10px 12px' }}>{m.frequency ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{m.typical_months ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{m.vendor_fee ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{m.avg_vendors ?? '—'}</td>
              <td style={{ padding: '10px 12px' }}>{m.avg_shoppers ?? '—'}</td>
              <td style={{ padding: '10px 12px', maxWidth: '160px' }}>
                <span title={m.application_process ?? undefined} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.application_process ?? '—'}</span>
              </td>
              <td style={{ padding: '10px 12px', maxWidth: '160px' }}>
                <span title={m.notes ?? undefined} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.notes ?? '—'}</span>
              </td>
              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                <button onClick={() => onEdit(m)} aria-label={`Edit ${m.name}`} style={{ ...actionBtnBase, border: '1px solid var(--color-primary)', color: 'var(--color-primary)', marginRight: '6px' }}>Edit</button>
                <button onClick={() => onDelete(m.id)} aria-label={`Delete ${m.name}`} style={{ ...actionBtnBase, border: '1px solid #c05050', color: '#c05050' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
