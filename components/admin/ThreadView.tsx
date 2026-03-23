'use client'
import { useState, useRef } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { createClient } from '@/lib/supabase/client'
import { validateImageAttachment, isValidHttpsUrl } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'
import type { Message, MessageReply } from '@/lib/supabase/types'

interface Props {
  message: Message
  replies: MessageReply[]
  total: number
  page: number
  perPage: number
  onPageChange: (page: number) => void
  onBack: () => void
  onDelete: (id: string) => void
  onSendReply: (body: string, attachments: string[]) => Promise<void>
  isMobile: boolean
  newReplyIds: Set<string>
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function buildPageButtons(current: number, total: number): (number | '…')[] {
  if (total <= 10) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>([1, total, current, current - 1, current + 1].filter(p => p >= 1 && p <= total))
  const sorted = Array.from(set).sort((a, b) => a - b)
  const result: (number | '…')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && (p as number) - (sorted[i - 1] as number) > 1) result.push('…')
    result.push(p)
  })
  return result
}

export default function ThreadView({ message, replies, total, page, perPage, onPageChange, onBack, onDelete, onSendReply, isMobile, newReplyIds }: Props) {
  const [replyText, setReplyText] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [attachNames, setAttachNames] = useState<string[]>([])
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const totalPages = Math.ceil(total / perPage)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const validationError = validateImageAttachment(file)
    if (validationError) {
      setUploadErrors(prev => [...prev, validationError])
      return
    }
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage.from('messages').upload(path, file)
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('messages').getPublicUrl(path)
      if (!isValidHttpsUrl(data.publicUrl)) throw new Error('Invalid URL returned from storage')
      setAttachments(prev => [...prev, data.publicUrl])
      setAttachNames(prev => [...prev, file.name])
    } catch (err) {
      setUploadErrors(prev => [...prev, err instanceof Error ? err.message : 'Upload failed'])
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index))
    setAttachNames(prev => prev.filter((_, i) => i !== index))
  }

  async function doSend() {
    setSending(true)
    setSendError(null)
    try {
      await onSendReply(replyText.trim(), attachments)
      setReplyText('')
      setAttachments([])
      setAttachNames([])
      setUploadErrors([])
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
      setShowConfirm(false)
    }
  }

  return (
    <div style={{ background: 'var(--color-surface)', borderRadius: '8px', border: '1px solid var(--color-border)', padding: '24px' }}>
      {/* Mobile back button */}
      {isMobile && (
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '15px', cursor: 'pointer', padding: '0 0 16px', display: 'flex', alignItems: 'center', gap: '6px', minHeight: '48px' }}
        >
          ← Back
        </button>
      )}

      {/* Message header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', marginBottom: '4px' }}>{message.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--color-accent)' }}>{message.email}</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{formatTimestamp(message.created_at)}</span>
          </div>
        </div>
        <button
          onClick={() => setDeleteConfirm(true)}
          style={{ background: 'none', border: '1px solid #c05050', color: '#c05050', padding: '8px 16px', fontSize: '13px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
        >
          Delete
        </button>
      </div>

      {/* Original message body */}
      <div style={{ padding: '16px', background: 'var(--color-bg)', borderRadius: '6px', marginBottom: '24px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {message.message}
      </div>

      {/* Pagination — top */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Page {page} of {totalPages}</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Older"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: page > 1 ? 'pointer' : 'not-allowed', opacity: page <= 1 ? 0.4 : 1 }}
            >
              ‹ Older
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              aria-label="Newer"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '4px 10px', fontSize: '12px', cursor: page < totalPages ? 'pointer' : 'not-allowed', opacity: page >= totalPages ? 0.4 : 1 }}
            >
              Newer ›
            </button>
          </div>
        </div>
      )}

      {/* Chat bubbles */}
      {replies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          {replies.map(r => {
            const isOut = r.direction === 'outbound'
            const isNew = newReplyIds.has(r.id)
            return (
              <div
                key={r.id}
                data-direction={r.direction}
                data-new={isNew ? 'true' : undefined}
                style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}
              >
                <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isOut ? 'flex-end' : 'flex-start', gap: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {isOut ? 'You' : message.name}
                  </span>
                  <div style={{
                    background: isOut ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: isOut ? 'var(--color-accent)' : 'var(--color-text)',
                    border: isNew
                      ? '2px solid var(--color-accent)'
                      : isOut ? 'none' : '1px solid var(--color-border)',
                    borderRadius: isOut ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                    padding: '11px 15px',
                    fontSize: '14px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}>
                    <p style={{ margin: 0 }}>{r.body}</p>
                    {r.attachments.map(url => isValidHttpsUrl(url) && (
                      <img
                        key={url}
                        src={url}
                        alt=""
                        style={{ display: 'block', maxWidth: '100%', borderRadius: '6px', marginTop: '8px' }}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: '11px', color: isNew ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                    {isNew ? 'just now · new' : formatTimestamp(r.created_at)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination — bottom (numbered buttons) */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {buildPageButtons(page, totalPages).map((p, i) =>
            p === '…'
              ? <span key={`ellipsis-${i}`} style={{ padding: '4px 6px', fontSize: '13px', color: 'var(--color-text-muted)' }}>…</span>
              : (
                <button
                  key={p}
                  onClick={() => onPageChange(p as number)}
                  aria-label={`Page ${p}`}
                  style={{
                    background: p === page ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: p === page ? 'var(--color-accent)' : 'var(--color-text)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px', width: '32px', height: '32px',
                    fontSize: '13px', cursor: 'pointer', fontWeight: p === page ? '700' : '400',
                  }}
                >
                  {p}
                </button>
              )
          )}
        </div>
      )}

      {/* Reply composer */}
      <div>
        <label htmlFor="reply-text" style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
          Reply to {message.name}
        </label>
        <textarea
          id="reply-text"
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Type your reply…"
          style={{ width: '100%', padding: '12px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        />

        {/* Attachment thumbnails */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            {attachments.map((url, i) => (
              <div key={url} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                  {isValidHttpsUrl(url) && <img src={url} alt={sanitizeText(attachNames[i] ?? '')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <button
                  onClick={() => removeAttachment(i)}
                  aria-label={`Remove attachment ${attachNames[i]}`}
                  style={{ background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', width: '56px', minHeight: '48px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload errors */}
        {uploadErrors.map((err, i) => (
          <p key={i} style={{ color: '#c05050', fontSize: '13px', marginTop: '4px' }}>{err}</p>
        ))}

        {/* Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setSendError(null); setShowConfirm(true) }}
            disabled={!replyText.trim() || sending || uploading}
            style={{
              background: replyText.trim() ? 'var(--color-primary)' : '#ccc',
              color: 'var(--color-accent)', padding: '12px 24px', fontSize: '16px',
              border: 'none', borderRadius: '4px', cursor: replyText.trim() ? 'pointer' : 'not-allowed', minHeight: '48px',
            }}
          >
            {sending ? 'Sending…' : 'Send Reply'}
          </button>

          {attachments.length < 5 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: uploading ? 'wait' : 'pointer', background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '4px', padding: '12px 16px', fontSize: '14px', minHeight: '48px', boxSizing: 'border-box' }}>
              {uploading ? 'Uploading…' : '📎 Attach image'}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>
          )}
        </div>

        {sendError && <p style={{ color: '#c05050', fontSize: '14px', marginTop: '8px' }}>{sendError}</p>}
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
          Variables: <code>{'${BUSINESS_NAME}'}</code> · <code>{'${CONTACT_FORM}'}</code>
        </p>
      </div>

      {/* Send confirmation dialog */}
      {showConfirm && (
        <ConfirmDialog
          message={`This will send an email to ${message.email} and cannot be unsent.`}
          confirmLabel="Send"
          onConfirm={doSend}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          message="Delete this message and all replies? This cannot be undone."
          onConfirm={() => { onDelete(message.id); setDeleteConfirm(false) }}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
    </div>
  )
}
