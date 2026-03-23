'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import MessageList from './MessageList'
import ThreadView from './ThreadView'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import type { Message, MessageReply } from '@/lib/supabase/types'

const POLL_INTERVAL = 45_000
const REPLY_PER_PAGE = 20
const MSG_PER_PAGE = 20
const CACHE_TTL = 5 * 60 * 1000

// ── sessionStorage cache ──────────────────────────────────────────

function mkCacheKey(sort: string, page: number) {
  return `pac_msgs_${sort}_p${page}`
}

function readCache(key: string): { messages: Message[]; total: number } | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.ts > CACHE_TTL) { sessionStorage.removeItem(key); return null }
    return { messages: parsed.messages, total: parsed.total }
  } catch { return null }
}

function writeCache(key: string, messages: Message[], total: number) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ messages, total, ts: Date.now() }))
  } catch { /* quota exceeded — ignore */ }
}

function clearCache() {
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith('pac_msgs_'))
      .forEach(k => sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}

// ── Types ─────────────────────────────────────────────────────────

interface PaginatedReplies {
  data: MessageReply[]
  total: number
  page: number
  per_page: number
}

interface PaginatedMessages {
  data: Message[]
  total: number
  page: number
  per_page: number
}

interface Props {
  initialMessages: Message[]
  initialTotal: number
}

// ── Component ─────────────────────────────────────────────────────

export default function MessagesInbox({ initialMessages, initialTotal }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [searchQuery, setSearchQuery] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [selected, setSelected] = useState<string | null>(null)
  const [replies, setReplies] = useState<MessageReply[]>([])
  const [replyTotal, setReplyTotal] = useState(0)
  const [replyPage, setReplyPage] = useState(1)
  const [newMsgCount, setNewMsgCount] = useState(0)
  const [pendingMessages, setPendingMessages] = useState<Message[]>([])
  const [newReplyIds, setNewReplyIds] = useState<Set<string>>(new Set())

  const isMobile = useIsMobile()
  const knownIdsRef = useRef(new Set(initialMessages.map(m => m.id)))
  const selectedRef = useRef<string | null>(null)
  const replyPageRef = useRef(1)
  // Tracks newest created_at seen — used for incremental polling
  const newestKnownAtRef = useRef(
    initialMessages.length > 0 ? initialMessages[0].created_at : ''
  )

  // Seed sessionStorage with SSR page-1 data so re-navigation is instant
  useEffect(() => {
    if (initialMessages.length > 0) {
      writeCache(mkCacheKey('newest', 1), initialMessages, initialTotal)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep refs in sync with state for use inside intervals
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { replyPageRef.current = replyPage }, [replyPage])

  const selectedMsg = messages.find(m => m.id === selected) ?? null
  const totalPages = Math.ceil(total / MSG_PER_PAGE)

  // ── Fetch messages ────────────────────────────────────────────────
  async function fetchMessages(params: {
    page: number
    sort: 'newest' | 'oldest'
    q: string
    email: string
    forceRefresh?: boolean
  }) {
    const { page, sort, q, email, forceRefresh = false } = params
    const isFiltered = !!(q || email)
    const key = mkCacheKey(sort, page)

    if (!isFiltered && !forceRefresh) {
      const cached = readCache(key)
      if (cached) {
        setMessages(cached.messages)
        setTotal(cached.total)
        return
      }
    }

    setIsLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), sort, per_page: String(MSG_PER_PAGE) })
      if (q) qs.set('q', q)
      if (email) qs.set('email', email)
      const res = await fetch(`/api/admin/messages?${qs}`)
      if (!res.ok) return
      const paged: PaginatedMessages = await res.json()
      setMessages(paged.data)
      setTotal(paged.total)
      if (!isFiltered) writeCache(key, paged.data, paged.total)
    } finally {
      setIsLoading(false)
    }
  }

  // ── List control handlers ─────────────────────────────────────────
  function handleSortChange(newSort: 'newest' | 'oldest') {
    setSort(newSort)
    setPage(1)
    clearCache()
    fetchMessages({ page: 1, sort: newSort, q: searchQuery, email: emailFilter })
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q)
    setPage(1)
    fetchMessages({ page: 1, sort, q, email: emailFilter })
  }

  function handleEmailFilterChange(email: string) {
    setEmailFilter(email)
    setPage(1)
    fetchMessages({ page: 1, sort, q: searchQuery, email })
  }

  function handlePageChange(newPage: number) {
    setPage(newPage)
    fetchMessages({ page: newPage, sort, q: searchQuery, email: emailFilter })
  }

  // ── Reply loader ──────────────────────────────────────────────────
  const loadReplies = useCallback(async (messageId: string, page: number, highlight = false) => {
    const res = await fetch(`/api/admin/messages/reply?message_id=${messageId}&page=${page}&per_page=${REPLY_PER_PAGE}`)
    if (!res.ok) return
    const paged: PaginatedReplies = await res.json()
    if (highlight) {
      setReplies(prev => {
        const existingIds = new Set(prev.map(r => r.id))
        const freshIds = paged.data.filter(r => !existingIds.has(r.id)).map(r => r.id)
        if (freshIds.length > 0) {
          setNewReplyIds(new Set(freshIds))
          setTimeout(() => setNewReplyIds(new Set()), 5000)
        }
        return paged.data
      })
    } else {
      setReplies(paged.data)
    }
    setReplyTotal(paged.total)
    setReplyPage(paged.page)
  }, [])

  // ── Select message ────────────────────────────────────────────────
  async function selectMessage(id: string) {
    setSelected(id)
    setNewReplyIds(new Set())

    const msg = messages.find(m => m.id === id)
    if (msg && !msg.is_read) {
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m))
      fetch('/api/admin/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_read: true }),
      })
    }

    const firstRes = await fetch(`/api/admin/messages/reply?message_id=${id}&page=1&per_page=${REPLY_PER_PAGE}`)
    if (!firstRes.ok) return
    const firstPage: PaginatedReplies = await firstRes.json()
    const lastPage = Math.max(1, Math.ceil(firstPage.total / REPLY_PER_PAGE))
    await loadReplies(id, lastPage)
  }

  // ── Send reply ────────────────────────────────────────────────────
  async function handleSendReply(body: string, attachments: string[]) {
    if (!selected) return
    const res = await fetch('/api/admin/messages/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: selected, body, attachments }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Failed to send reply')
    }
    const lastPage = Math.max(1, Math.ceil((replyTotal + 1) / REPLY_PER_PAGE))
    await loadReplies(selected, lastPage)
  }

  // ── Delete message ────────────────────────────────────────────────
  async function handleDelete(id: string) {
    const res = await fetch('/api/admin/messages', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setMessages(prev => prev.filter(m => m.id !== id))
      setTotal(prev => prev - 1)
      clearCache()
      if (selected === id) { setSelected(null); setReplies([]) }
    }
  }

  // ── Polling ───────────────────────────────────────────────────────
  const pollMessages = useCallback(async () => {
    if (!newestKnownAtRef.current) return
    const res = await fetch(`/api/admin/messages?since=${encodeURIComponent(newestKnownAtRef.current)}`)
    if (!res.ok) return
    const { data: newOnes }: { data: Message[] } = await res.json()
    const genuinelyNew = newOnes.filter(m => !knownIdsRef.current.has(m.id))
    if (genuinelyNew.length > 0) {
      genuinelyNew.forEach(m => knownIdsRef.current.add(m.id))
      const newest = genuinelyNew[0].created_at
      if (newest > newestKnownAtRef.current) newestKnownAtRef.current = newest
      setPendingMessages(genuinelyNew)
      setNewMsgCount(genuinelyNew.length)
      clearCache()
    }
  }, [])

  const pollReplies = useCallback(async () => {
    const id = selectedRef.current
    if (!id) return
    await loadReplies(id, replyPageRef.current, true)
  }, [loadReplies])

  useEffect(() => {
    let msgTimer: ReturnType<typeof setInterval>
    let replyTimer: ReturnType<typeof setInterval>

    function startPolling() {
      msgTimer = setInterval(pollMessages, POLL_INTERVAL)
      replyTimer = setInterval(pollReplies, POLL_INTERVAL)
    }
    function stopPolling() {
      clearInterval(msgTimer)
      clearInterval(replyTimer)
    }

    startPolling()

    function handleVisibility() {
      stopPolling()
      if (document.visibilityState !== 'hidden') startPolling()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [pollMessages, pollReplies])

  function handleLoadNew() {
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id))
      return [...pendingMessages.filter(m => !existingIds.has(m.id)), ...prev]
    })
    setTotal(prev => prev + pendingMessages.length)
    setPendingMessages([])
    setNewMsgCount(0)
    clearCache()
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '24px' }}>
        Messages
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: !isMobile && selected ? '1fr 2fr' : '1fr', gap: '24px' }}>
        {/* Left panel */}
        <div style={{ display: isMobile && selected ? 'none' : 'block' }}>
          <MessageList
            messages={messages}
            selected={selected}
            onSelect={selectMessage}
            onRefresh={() => fetchMessages({ page, sort, q: searchQuery, email: emailFilter, forceRefresh: true })}
            newCount={newMsgCount}
            onLoadNew={handleLoadNew}
            page={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            sort={sort}
            onSortChange={handleSortChange}
            onSearchChange={handleSearchChange}
            onEmailFilterChange={handleEmailFilterChange}
            isLoading={isLoading}
            total={total}
          />
        </div>

        {/* Right panel */}
        {selectedMsg && (
          <ThreadView
            message={selectedMsg}
            replies={replies}
            total={replyTotal}
            page={replyPage}
            perPage={REPLY_PER_PAGE}
            onPageChange={page => loadReplies(selected!, page)}
            onBack={() => { setSelected(null); setReplies([]) }}
            onDelete={handleDelete}
            onSendReply={handleSendReply}
            isMobile={isMobile}
            newReplyIds={newReplyIds}
          />
        )}
      </div>
    </div>
  )
}
