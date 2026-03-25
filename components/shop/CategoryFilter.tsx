'use client'

export interface CategoryOption {
  id: string
  name: string
  slug: string
  parent_id: string | null
}

interface Props {
  categories: CategoryOption[]
  activeCat: string
  activeSub: string
  onCatChange: (slug: string) => void
  onSubChange: (slug: string) => void
}

const pill: React.CSSProperties = {
  padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '20px',
  background: 'transparent', color: 'var(--color-primary)',
  cursor: 'pointer', fontSize: '14px', minHeight: '48px',
}
const pillOn: React.CSSProperties = {
  background: 'var(--color-primary)', color: 'var(--color-accent)', borderColor: 'var(--color-primary)',
}

export default function CategoryFilter({ categories, activeCat, activeSub, onCatChange, onSubChange }: Props) {
  const topLevel = categories.filter(c => !c.parent_id)
  const activeParent = topLevel.find(c => c.slug === activeCat)
  const children = activeParent ? categories.filter(c => c.parent_id === activeParent.id) : []

  return (
    <div style={{ marginBottom: '24px' }}>
      <div role="group" aria-label="Filter by category" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: children.length > 0 ? '10px' : '0' }}>
        <button onClick={() => onCatChange('')} aria-pressed={!activeCat} style={{ ...pill, ...(!activeCat ? pillOn : {}) }}>
          All
        </button>
        {topLevel.map(cat => (
          <button
            key={cat.id}
            onClick={() => onCatChange(cat.slug)}
            aria-pressed={activeCat === cat.slug}
            style={{ ...pill, ...(activeCat === cat.slug ? pillOn : {}) }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {children.length > 0 && (
        <div
          role="group"
          aria-label="Filter by subcategory"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingLeft: '12px', borderLeft: '3px solid var(--color-primary)' }}
        >
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => onSubChange(child.slug === activeSub ? '' : child.slug)}
              aria-pressed={activeSub === child.slug}
              style={{ ...pill, ...(activeSub === child.slug ? pillOn : {}), fontSize: '13px' }}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
