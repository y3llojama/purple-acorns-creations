'use client'

export interface CategoryOption { id: string; name: string; slug: string }

interface Props {
  categories: CategoryOption[]
  active: string
  onChange: (categoryId: string) => void
}

export default function CategoryFilter({ categories, active, onChange }: Props) {
  return (
    <div role="group" aria-label="Filter by category" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
      <button
        key="all"
        onClick={() => onChange('')}
        aria-pressed={active === ''}
        style={{
          padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '20px',
          background: active === '' ? 'var(--color-primary)' : 'transparent',
          color: active === '' ? 'var(--color-accent)' : 'var(--color-primary)',
          cursor: 'pointer', fontSize: '14px', minHeight: '48px',
        }}
      >
        All
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          aria-pressed={active === cat.id}
          style={{
            padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '20px',
            background: active === cat.id ? 'var(--color-primary)' : 'transparent',
            color: active === cat.id ? 'var(--color-accent)' : 'var(--color-primary)',
            cursor: 'pointer', fontSize: '14px', minHeight: '48px', textTransform: 'capitalize',
          }}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
