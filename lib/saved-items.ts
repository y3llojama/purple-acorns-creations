'use client'

import { useState, useEffect, useCallback } from 'react'

export interface SavedItem {
  id: string
  title: string | null
  image_url: string | null
}

const STORAGE_KEY = 'pa-saved-items'

function readFromStorage(): SavedItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedItem[]) : []
  } catch {
    return []
  }
}

function writeToStorage(items: SavedItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // quota exceeded or private mode — fail silently
  }
}

export function useSavedItems() {
  const [items, setItems] = useState<SavedItem[]>([])

  // Read on mount (avoids SSR hydration mismatch)
  useEffect(() => {
    setItems(readFromStorage())
  }, [])

  const toggle = useCallback((item: SavedItem) => {
    setItems(prev => {
      const exists = prev.some(i => i.id === item.id)
      const next = exists ? prev.filter(i => i.id !== item.id) : [...prev, item]
      writeToStorage(next)
      return next
    })
  }, [])

  const isSaved = useCallback((id: string) => items.some(i => i.id === id), [items])

  return { items, toggle, isSaved, count: items.length }
}
