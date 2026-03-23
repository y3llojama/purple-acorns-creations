'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import MessageList from './MessageList'
import ThreadView from './ThreadView'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import type { Message, MessageReply } from '@/lib/supabase/types'

const POLL_INTERVAL = 45_000
const PER_PAGE = 20

interface PaginatedReplies {
  data: MessageReply[]
  total: number
  page: number
  per_page: number
}

interface Props { initialMessages: Message[] }

export default function MessagesInbox({ initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
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

  // Keep refs in sync with state for use inside intervals
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { replyPageRef.current = replyPage }, [replyPage])

  const selectedMsg = messages.find(m => m.id === selected) ?? null

  // ── Reply loader ──────────────────────────────────────────────────
  const loadReplies = useCallback(async (messageId: string, page: number, highlight = false) => {
    const res = await fetch(`/api/admin/messages/reply?message_id=${messageId}&page=${page}&per_page=${PER_PAGE}`)
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

    // Load the last page (most recent activity)
    const firstRes = await fetch(`/api/admin/messages/reply?message_id=${id}&page=1&per_page=${PER_PAGE}`)
    if (!firstRes.ok) return
    const firstPage: PaginatedReplies = await firstRes.json()
    const lastPage = Math.max(1, Math.ceil(firstPage.total / PER_PAGE))
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
    const lastPage = Math.max(1, Math.ceil((replyTotal + 1) / PER_PAGE))
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
      if (selected === id) { setSelected(null); setReplies([]) }
    }
  }

  // ── Polling ───────────────────────────────────────────────────────
  const pollMessages = useCallback(async () => {
    const res = await fetch('/api/admin/messages')
    if (!res.ok) return
    const fresh: Message[] = await res.json()
    const newOnes = fresh.filter(m => !knownIdsRef.current.has(m.id))
    if (newOnes.length > 0) {
      newOnes.forEach(m => knownIdsRef.current.add(m.id))
      setPendingMessages(newOnes)
      setNewMsgCount(newOnes.length)
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
      const merged = [...pendingMessages.filter(m => !existingIds.has(m.id)), ...prev]
      return merged
    })
    setPendingMessages([])
    setNewMsgCount(0)
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
            onRefresh={pollMessages}
            newCount={newMsgCount}
            onLoadNew={handleLoadNew}
          />
        </div>

        {/* Right panel */}
        {selectedMsg && (
          <ThreadView
            message={selectedMsg}
            replies={replies}
            total={replyTotal}
            page={replyPage}
            perPage={PER_PAGE}
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
