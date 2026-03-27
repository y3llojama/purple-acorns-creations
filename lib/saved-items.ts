'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface SavedItem {
  product_id: string
  name: string
  price: number
  images: string[]
  availability: 'in_stock' | 'low_stock' | 'sold_out'
  added_at: string
}

const TOKEN_KEY = 'pa-list-token'
const OLD_KEY = 'pa-saved-items'
const MIGRATION_FLAG = 'pa-migration-in-progress'
const SYNC_EVENT = 'pa-saved-items-changed'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function setToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token) } catch {}
}

async function createList(): Promise<string | null> {
  const res = await fetch('/api/shop/saved-lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  if (!res.ok) return null
  const { token } = await res.json()
  setToken(token)
  return token
}

async function fetchList(token: string): Promise<{ items: SavedItem[]; slug: string | null; updatedAt: string | null }> {
  const res = await fetch('/api/shop/saved-lists/me', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) return { items: [], slug: null, updatedAt: null }
  const data = await res.json()
  return { items: data.items ?? [], slug: data.slug, updatedAt: data.updated_at }
}

async function migrateOldData(): Promise<void> {
  if (typeof window === 'undefined') return

  const migrationInProgress = localStorage.getItem(MIGRATION_FLAG)
  if (migrationInProgress) {
    localStorage.removeItem(OLD_KEY)
    localStorage.removeItem(MIGRATION_FLAG)
    return
  }

  const oldRaw = localStorage.getItem(OLD_KEY)
  if (!oldRaw) return

  let oldItems: Array<{ id: string; title: string | null; image_url: string | null }>
  try { oldItems = JSON.parse(oldRaw) } catch { localStorage.removeItem(OLD_KEY); return }
  if (!oldItems.length) { localStorage.removeItem(OLD_KEY); return }

  localStorage.setItem(MIGRATION_FLAG, 'true')

  const token = await createList()
  if (!token) { localStorage.removeItem(MIGRATION_FLAG); return }

  for (const item of oldItems) {
    await fetch('/api/shop/saved-lists/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, product_id: item.id }),
    })
  }

  localStorage.removeItem(OLD_KEY)
  localStorage.removeItem(MIGRATION_FLAG)
}

export function useSavedItems() {
  const [items, setItems] = useState<SavedItem[]>([])
  const [loading, setLoading] = useState(true)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      await migrateOldData()

      const token = getToken()
      if (token) {
        const { items: fetched } = await fetchList(token)
        if (!cancelled) {
          tokenRef.current = token
          setItems(fetched)
          setLoading(false)
        }
      } else {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    const onSync = async () => {
      const token = getToken()
      if (token) {
        const { items: fetched } = await fetchList(token)
        setItems(fetched)
      }
    }
    window.addEventListener(SYNC_EVENT, onSync)
    return () => { cancelled = true; window.removeEventListener(SYNC_EVENT, onSync) }
  }, [])

  const toggle = useCallback(async (productId: string, meta: { name: string; price: number; images: string[] }) => {
    const isCurrentlySaved = items.some(i => i.product_id === productId)

    // Optimistic update
    if (isCurrentlySaved) {
      setItems(prev => prev.filter(i => i.product_id !== productId))
    } else {
      setItems(prev => [...prev, {
        product_id: productId,
        name: meta.name,
        price: meta.price,
        images: meta.images,
        availability: 'in_stock',
        added_at: new Date().toISOString(),
      }])
    }

    let token = tokenRef.current || getToken()

    if (!token) {
      token = await createList()
      if (!token) {
        // Revert
        if (isCurrentlySaved) {
          setItems(prev => [...prev, { product_id: productId, name: meta.name, price: meta.price, images: meta.images, availability: 'in_stock', added_at: new Date().toISOString() }])
        } else {
          setItems(prev => prev.filter(i => i.product_id !== productId))
        }
        return
      }
      tokenRef.current = token
    }

    const endpoint = isCurrentlySaved
      ? '/api/shop/saved-lists/items/remove'
      : '/api/shop/saved-lists/items'

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, product_id: productId }),
    })

    if (!res.ok) {
      // Revert
      if (isCurrentlySaved) {
        setItems(prev => [...prev, { product_id: productId, name: meta.name, price: meta.price, images: meta.images, availability: 'in_stock', added_at: new Date().toISOString() }])
      } else {
        setItems(prev => prev.filter(i => i.product_id !== productId))
      }
    }

    window.dispatchEvent(new CustomEvent(SYNC_EVENT))
  }, [items])

  const isSaved = useCallback((id: string) => items.some(i => i.product_id === id), [items])

  return { items, toggle, isSaved, count: items.length, loading }
}
