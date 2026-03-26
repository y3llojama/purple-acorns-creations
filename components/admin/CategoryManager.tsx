'use client'
import { useState, useRef } from 'react'
import type { Category } from '@/lib/supabase/types'

interface Props {
  initialCategories: Category[]
  squareSyncEnabled: boolean
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: '14px', borderRadius: '4px',
  border: '1px solid var(--color-border)', marginBottom: '8px',
  background: 'var(--color-bg)', color: 'inherit', boxSizing: 'border-box',
}
const btnStyle: React.CSSProperties = {
  background: 'var(--color-primary)', color: 'var(--color-accent)',
  padding: '8px 16px', fontSize: '14px', border: 'none',
  borderRadius: '4px', cursor: 'pointer', minHeight: '48px',
}
const btnSmallStyle: React.CSSProperties = {
  padding: '4px 10px', fontSize: '13px', border: 'none',
  borderRadius: '4px', cursor: 'pointer', minHeight: '44px', minWidth: '44px',
}

type FlatCategory = Category & { children?: Category[] }
type EditState = { mode: 'new' } | { mode: 'edit'; category: Category }

export default function CategoryManager({ initialCategories, squareSyncEnabled }: Props) {
  const [categories, setCategories] = useState<FlatCategory[]>(initialCategories)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [syncingCategories, setSyncingCategories] = useState(false)
  const [syncCategoryMsg, setSyncCategoryMsg] = useState<string | null>(null)
  const [pushingUnsynced, setPushingUnsynced] = useState(false)
  const [pushUnsyncedMsg, setPushUnsyncedMsg] = useState<string | null>(null)
  const dragItem = useRef<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formParentId, setFormParentId] = useState('')
  const [formSortOrder, setFormSortOrder] = useState('')
  const [formVisible, setFormVisible] = useState(true)
  const [formSeoTitle, setFormSeoTitle] = useState('')
  const [formSeoDesc, setFormSeoDesc] = useState('')
  const [formSeoPermalink, setFormSeoPermalink] = useState('')

  async function reload() {
    const res = await fetch('/api/admin/categories')
    if (res.ok) setCategories(await res.json())
  }

  async function syncFromSquare() {
    setSyncingCategories(true)
    setSyncCategoryMsg(null)
    try {
      const res = await fetch('/api/admin/categories/square-sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncCategoryMsg(`Error: ${data.error ?? 'Sync failed'}`)
      } else {
        setSyncCategoryMsg(`Done — ${data.upserted} synced${data.errors?.length ? `, ${data.errors.length} error(s)` : ''}`)
        const refreshed = await fetch('/api/admin/categories').then(r => r.json()).catch(() => null)
        if (Array.isArray(refreshed)) setCategories(refreshed)
      }
    } catch (err) {
      setSyncCategoryMsg(`Error: ${String(err)}`)
    } finally {
      setSyncingCategories(false)
    }
  }

  async function pushUnsyncedToSquare() {
    setPushingUnsynced(true)
    setPushUnsyncedMsg(null)
    try {
      const res = await fetch('/api/admin/categories/push-unsynced', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setPushUnsyncedMsg(`Error: ${data.error ?? 'Push failed'}`)
      } else {
        const msg = data.pushed === 0
          ? 'All categories are already synced.'
          : `Pushed ${data.pushed}${data.errors?.length ? `, ${data.errors.length} error(s)` : ''}`
        setPushUnsyncedMsg(msg)
        const refreshed = await fetch('/api/admin/categories').then(r => r.json()).catch(() => null)
        if (Array.isArray(refreshed)) setCategories(refreshed)
      }
    } catch (err) {
      setPushUnsyncedMsg(`Error: ${String(err)}`)
    } finally {
      setPushingUnsynced(false)
    }
  }

  function openNew() {
    setEditState({ mode: 'new' })
    setFormName(''); setFormParentId(''); setFormSortOrder('')
    setFormVisible(true); setFormSeoTitle(''); setFormSeoDesc(''); setFormSeoPermalink('')
    setSaveError('')
  }

  function openEdit(cat: Category) {
    setEditState({ mode: 'edit', category: cat })
    setFormName(cat.name); setFormParentId(cat.parent_id ?? '')
    setFormSortOrder(String(cat.sort_order))
    setFormVisible(cat.online_visibility); setFormSeoTitle(cat.seo_title ?? '')
    setFormSeoDesc(cat.seo_description ?? ''); setFormSeoPermalink(cat.seo_permalink ?? '')
    setSaveError('')
  }

  function closeEdit() { setEditState(null); setSaveError('') }

  async function handleSave() {
    if (!formName.trim()) { setSaveError('Name is required.'); return }
    setSaving(true); setSaveError('')
    const payload = {
      name: formName.trim(),
      parent_id: formParentId || null,
      sort_order: formSortOrder ? Number(formSortOrder) : undefined,
      online_visibility: formVisible,
      seo_title: formSeoTitle || null,
      seo_description: formSeoDesc || null,
      seo_permalink: formSeoPermalink || null,
    }
    try {
      const isNew = editState?.mode === 'new'
      const url = isNew ? '/api/admin/categories' : `/api/admin/categories/${(editState as { mode: 'edit'; category: Category }).category.id}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSaveError(data.error ?? 'Save failed.')
      } else {
        closeEdit()
        await reload()
      }
    } catch {
      setSaveError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(cat: Category) {
    setDeleteErrors(prev => ({ ...prev, [cat.id]: '' }))
    const res = await fetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' })
    if (res.ok) {
      await reload()
    } else {
      const data = await res.json().catch(() => ({}))
      const parts: string[] = []
      if (data.productCount > 0) parts.push(`${data.productCount} product${data.productCount !== 1 ? 's' : ''}`)
      if (data.galleryCount > 0) parts.push(`${data.galleryCount} gallery item${data.galleryCount !== 1 ? 's' : ''}`)
      setDeleteErrors(prev => ({ ...prev, [cat.id]: `Cannot delete — blocked by ${parts.join(' and ')}. Reassign them first.` }))
    }
  }

  // Drag-to-reorder (only within same parent group)
  function onDragStart(id: string) { dragItem.current = id }
  async function onDrop(targetId: string) {
    if (!dragItem.current || dragItem.current === targetId) return
    const flat = categories.flatMap(c => [c, ...(c.children ?? [])])
    const dragCat = flat.find(c => c.id === dragItem.current)
    const targetCat = flat.find(c => c.id === targetId)
    if (!dragCat || !targetCat || dragCat.parent_id !== targetCat.parent_id) return

    // Swap sort_order values
    const items = [
      { id: dragCat.id, sort_order: targetCat.sort_order },
      { id: targetCat.id, sort_order: dragCat.sort_order },
    ]
    await fetch('/api/admin/categories/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    await reload()
    dragItem.current = null
  }

  const topLevel = categories.filter(c => !c.parent_id)

  function renderRow(cat: Category, isChild = false) {
    const synced = !!cat.square_category_id
    return (
      <div key={cat.id}>
        <div
          draggable
          onDragStart={() => onDragStart(cat.id)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => onDrop(cat.id)}
          style={{
            padding: isChild ? '7px 12px 7px 36px' : '9px 12px',
            background: isChild ? 'var(--color-bg)' : 'var(--color-surface)',
            borderTop: '1px solid var(--color-border)',
            borderLeft: isChild ? '3px solid var(--color-primary)' : '3px solid transparent',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}
        >
          <span style={{ color: 'var(--color-text-muted)', cursor: 'grab', fontSize: '14px' }}>⠿</span>
          {isChild && <span style={{ color: 'var(--color-text-muted)', fontSize: '12px', flexShrink: 0 }}>↳</span>}
          <span style={{ flex: 1, fontWeight: isChild ? 400 : 600 }}>{cat.name}</span>
          {'product_count' in cat && (
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', background: 'var(--color-surface)', padding: '2px 7px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
              {(cat as Category & { product_count?: number }).product_count ?? 0} products
            </span>
          )}
          {squareSyncEnabled && (
            <span style={{ fontSize: '12px', padding: '2px 7px', borderRadius: '10px', background: synced ? 'var(--color-success-bg)' : 'var(--color-surface)', color: synced ? 'var(--color-success-text)' : 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
              {synced ? '● Square' : '○ Not synced'}
            </span>
          )}
          <button style={{ ...btnSmallStyle, background: 'var(--color-primary)', color: 'var(--color-accent)' }} onClick={() => openEdit(cat)}>Edit</button>
          <button style={{ ...btnSmallStyle, background: 'var(--color-error)', color: 'var(--color-error-text)' }} onClick={() => handleDelete(cat)}>Delete</button>
        </div>
        {deleteErrors[cat.id] && (
          <div style={{ padding: '6px 12px 6px 28px', fontSize: '13px', color: 'var(--color-error)', background: 'var(--color-danger-bg)' }}>
            {deleteErrors[cat.id]}
          </div>
        )}
      </div>
    )
  }

  // Use CSS to handle mobile vs desktop layout — avoids SSR window access.
  // On desktop: the form is a fixed-width inline panel in the flex row.
  // On mobile: position:fixed makes it cover the screen (escapes the flex row).
  function renderFormFields() {
    return (
      <>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>Name *</label>
        <input style={inputStyle} value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Rings" />

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>Parent category</label>
        <select style={inputStyle} value={formParentId} onChange={e => setFormParentId(e.target.value)}>
          <option value="">— None (top-level) —</option>
          {topLevel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>Sort order</label>
        <input style={inputStyle} type="number" value={formSortOrder} onChange={e => setFormSortOrder(e.target.value)} placeholder="Auto" />


        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={formVisible} onChange={e => setFormVisible(e.target.checked)} style={{ width: '16px', height: '16px' }} />
          Visible on Square Online
        </label>

        <details style={{ marginBottom: '12px' }}>
          <summary style={{ fontSize: '13px', color: 'var(--color-primary)', cursor: 'pointer', marginBottom: '6px' }}>SEO fields</summary>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '3px' }}>Title</label>
          <input style={{ ...inputStyle, fontSize: '13px' }} value={formSeoTitle} onChange={e => setFormSeoTitle(e.target.value)} placeholder="SEO title" />
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '3px' }}>Description</label>
          <textarea style={{ ...inputStyle, fontSize: '13px', height: '60px', resize: 'vertical' }} value={formSeoDesc} onChange={e => setFormSeoDesc(e.target.value)} placeholder="SEO description" />
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '3px' }}>Permalink slug</label>
          <input style={{ ...inputStyle, fontSize: '13px' }} value={formSeoPermalink} onChange={e => setFormSeoPermalink(e.target.value)} placeholder="rings" />
        </details>
      </>
    )
  }

  const formTitle = editState?.mode === 'new' ? 'Add Category' : 'Edit Category'
  const form = editState ? (
    <div className="cat-form">
      {/* Mobile-only sticky top bar (Back + title + Save) */}
      <div className="cat-form-mobile-header">
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', minHeight: '44px' }} onClick={closeEdit}>← Back</button>
        <span style={{ fontWeight: 600 }}>{formTitle}</span>
        <button style={btnStyle} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
      {/* Form body */}
      <div className="cat-form-body">
        {/* Desktop-only title */}
        <div className="cat-form-desktop-title">{formTitle}</div>
        {renderFormFields()}
        {saveError && <p style={{ color: 'var(--color-error)', fontSize: '13px', marginBottom: '8px' }}>{saveError}</p>}
        {/* Desktop-only Save/Cancel buttons */}
        <div className="cat-form-desktop-actions">
          <button style={{ ...btnStyle, flex: 1 }} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button style={{ flex: 1, padding: '8px', fontSize: '14px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg)', cursor: 'pointer', minHeight: '48px' }} onClick={closeEdit}>Cancel</button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px' }}>
        <strong>Structure:</strong> 2 levels max (matches Square). Top-level categories are groupings — assign items to sub-categories only. Leave <em>Parent category</em> blank to create a top-level grouping.
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontWeight: 600 }}>{categories.length} categories</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {pushUnsyncedMsg && (
            <span style={{ fontSize: '13px', color: pushUnsyncedMsg.startsWith('Error') ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
              {pushUnsyncedMsg}
            </span>
          )}
          {syncCategoryMsg && (
            <span style={{ fontSize: '13px', color: syncCategoryMsg.startsWith('Error') ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
              {syncCategoryMsg}
            </span>
          )}
          {squareSyncEnabled && (
            <>
              <button
                onClick={pushUnsyncedToSquare}
                disabled={pushingUnsynced}
                title="Push categories created here → Square. Run this after adding new categories."
                style={{ ...btnStyle, background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-border)', cursor: pushingUnsynced ? 'not-allowed' : 'pointer', opacity: pushingUnsynced ? 0.7 : 1 }}
                aria-busy={pushingUnsynced}
              >
                {pushingUnsynced ? 'Pushing…' : 'Push to Square'}
              </button>
              <button
                onClick={syncFromSquare}
                disabled={syncingCategories}
                title="Pull categories from Square → here. Run this if you added categories directly in Square."
                style={{ ...btnStyle, background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-border)', cursor: syncingCategories ? 'not-allowed' : 'pointer', opacity: syncingCategories ? 0.7 : 1 }}
                aria-busy={syncingCategories}
              >
                {syncingCategories ? 'Syncing…' : 'Sync from Square'}
              </button>
            </>
          )}
          <button style={btnStyle} onClick={openNew}>+ Add Category</button>
        </div>
      </div>

      {/* flex row: list + inline form panel (form becomes position:fixed on mobile via CSS) */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {topLevel.length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', padding: '24px', textAlign: 'center' }}>No categories yet. Add one above.</p>
          )}
          {topLevel.map(parent => (
            <div key={parent.id} style={{ border: '1px solid var(--color-border)', borderRadius: '6px', marginBottom: '8px', overflow: 'hidden' }}>
              {renderRow(parent)}
              {(parent.children ?? []).map(child => renderRow(child, true))}
            </div>
          ))}
        </div>
        {form}
      </div>

      <style>{`
        .cat-form {
          width: 260px;
          border: 1px solid var(--color-border);
          border-radius: 6px;
          background: var(--color-surface);
          flex-shrink: 0;
        }
        .cat-form-mobile-header { display: none; }
        .cat-form-body { padding: 16px; }
        .cat-form-desktop-title { font-weight: 600; margin-bottom: 12px; }
        .cat-form-desktop-actions { display: flex; gap: 8px; }
        @media (max-width: 639px) {
          .cat-form {
            position: fixed;
            inset: 0;
            width: auto;
            border: none;
            border-radius: 0;
            z-index: 200;
            overflow-y: auto;
            background: var(--color-bg);
          }
          .cat-form-mobile-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-bottom: 1px solid var(--color-border);
            position: sticky;
            top: 0;
            background: var(--color-bg);
            z-index: 1;
          }
          .cat-form-desktop-title { display: none; }
          .cat-form-desktop-actions { display: none; }
        }
      `}</style>
    </div>
  )
}
