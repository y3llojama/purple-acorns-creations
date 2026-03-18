'use client'
import { useState, useEffect, useRef } from 'react'
import { marked } from 'marked'
import { interpolate, buildVars } from '@/lib/variables'

type Format = 'html' | 'markdown'
type Tab = 'edit' | 'preview'

interface Props {
  contentKey: string
  label: string
  initialValue: string
  rows: number
  supportsMarkdown?: boolean
  initialFormat?: Format
  businessName?: string
}

// Tags the sanitizer allows — anything else will be stripped on publish.
const ALLOWED_TAGS = new Set(['h1','h2','h3','h4','p','br','strong','em','ul','ol','li','a','blockquote','hr'])

function validateHtml(html: string): string | null {
  const tags = [...html.matchAll(/<([a-z][a-z0-9]*)/gi)].map(m => m[1].toLowerCase())
  const disallowed = [...new Set(tags.filter(t => !ALLOWED_TAGS.has(t)))]
  if (disallowed.length) return `These tags will be stripped on publish: ${disallowed.join(', ')}`
  return null
}

function validateMarkdown(md: string): string | null {
  const htmlTags = [...md.matchAll(/<([a-z][a-z0-9]*)/gi)].map(m => m[1].toLowerCase())
  const disallowed = [...new Set(htmlTags.filter(t => !ALLOWED_TAGS.has(t)))]
  if (disallowed.length) return `Embedded HTML tags will be stripped on publish: ${disallowed.join(', ')}`
  return null
}

type WrapSpec = {
  html: { before: string; after: string }
  markdown: { before: string; after: string }
}

const TOOLBAR: Array<{ label: string; title: string; spec: WrapSpec } | 'sep'> = [
  {
    label: 'B', title: 'Bold',
    spec: {
      html: { before: '<strong>', after: '</strong>' },
      markdown: { before: '**', after: '**' },
    },
  },
  {
    label: 'I', title: 'Italic',
    spec: {
      html: { before: '<em>', after: '</em>' },
      markdown: { before: '_', after: '_' },
    },
  },
  'sep',
  {
    label: 'H2', title: 'Heading',
    spec: {
      html: { before: '<h2>', after: '</h2>' },
      markdown: { before: '## ', after: '' },
    },
  },
  {
    label: 'H3', title: 'Subheading',
    spec: {
      html: { before: '<h3>', after: '</h3>' },
      markdown: { before: '### ', after: '' },
    },
  },
  'sep',
  {
    label: '¶', title: 'Paragraph',
    spec: {
      html: { before: '<p>', after: '</p>' },
      markdown: { before: '\n\n', after: '\n\n' },
    },
  },
  {
    label: '≡', title: 'Bullet list item',
    spec: {
      html: { before: '<li>', after: '</li>' },
      markdown: { before: '- ', after: '' },
    },
  },
  {
    label: '❝', title: 'Blockquote',
    spec: {
      html: { before: '<blockquote>', after: '</blockquote>' },
      markdown: { before: '> ', after: '' },
    },
  },
  'sep',
  {
    label: '🔗', title: 'Link',
    spec: {
      html: { before: '<a href="URL">', after: '</a>' },
      markdown: { before: '[', after: '](URL)' },
    },
  },
]

export default function ContentEditor({
  contentKey,
  label,
  initialValue,
  rows,
  supportsMarkdown = false,
  initialFormat = 'html',
  businessName,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const [format, setFormat] = useState<Format>(initialFormat)
  const [tab, setTab] = useState<Tab>('edit')
  const [preview, setPreview] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const id = `content-${contentKey}`
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const restoreSelection = useRef<{ start: number; end: number } | null>(null)

  // Restore cursor/selection after React re-render from setValue
  useEffect(() => {
    if (!restoreSelection.current || !textareaRef.current) return
    const { start, end } = restoreSelection.current
    restoreSelection.current = null
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(start, end)
      textareaRef.current?.focus()
    })
  })

  useEffect(() => {
    if (tab !== 'preview') return
    const vars = buildVars(businessName ?? '')
    const resolved = interpolate(value, vars)
    if (format === 'markdown') {
      Promise.resolve(marked(resolved, { gfm: true, breaks: true })).then(html => setPreview(html))
    } else {
      setPreview(resolved)
    }
  }, [tab, value, format, businessName])

  const warning = tab === 'edit'
    ? (format === 'html' ? validateHtml(value) : validateMarkdown(value))
    : null

  function applyFormat(spec: WrapSpec, isLink: boolean) {
    const ta = textareaRef.current
    if (!ta) return

    const { selectionStart: ss, selectionEnd: se } = ta
    const selected = value.slice(ss, se)
    const { before, after } = spec[format]

    let insertion: string
    let newCursorStart: number
    let newCursorEnd: number

    if (isLink) {
      // Prompt for URL, substitute into the wrapper
      const url = window.prompt('URL (https://…)') ?? ''
      if (!url) return
      const b = before.replace('URL', url)
      const a = after.replace('URL', url)
      insertion = b + (selected || (format === 'html' ? 'link text' : 'link text')) + a
      newCursorStart = ss + b.length
      newCursorEnd = newCursorStart + (selected || 'link text').length
    } else if (selected) {
      insertion = before + selected + after
      newCursorStart = ss + before.length
      newCursorEnd = newCursorStart + selected.length
    } else {
      // No selection — insert placeholder and select it
      const placeholder = format === 'html' ? 'text' : 'text'
      insertion = before + placeholder + after
      newCursorStart = ss + before.length
      newCursorEnd = newCursorStart + placeholder.length
    }

    const next = value.slice(0, ss) + insertion + value.slice(se)
    restoreSelection.current = { start: newCursorStart, end: newCursorEnd }
    setValue(next)
    setStatus('idle')
  }

  async function handleSave() {
    setStatus('saving')
    try {
      const saves: Promise<Response>[] = [
        fetch('/api/admin/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: contentKey, value }),
        }),
      ]
      if (supportsMarkdown) {
        saves.push(
          fetch('/api/admin/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: `${contentKey}__format`, value: format }),
          })
        )
      }
      const results = await Promise.all(saves)
      setStatus(results.every(r => r.ok) ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
  }

  function tabStyle(active: boolean): React.CSSProperties {
    return {
      padding: '8px 16px',
      fontSize: '14px',
      fontWeight: active ? 700 : 500,
      color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
      background: 'none',
      border: 'none',
      borderBottomWidth: '2px',
      borderBottomStyle: 'solid',
      borderBottomColor: active ? 'var(--color-primary)' : 'transparent',
      marginBottom: '-1px',
      cursor: 'pointer',
      minHeight: '40px',
    }
  }

  function modeToggleStyle(active: boolean): React.CSSProperties {
    return {
      padding: '4px 10px',
      fontSize: '13px',
      fontWeight: active ? 600 : 400,
      color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
      background: active ? 'var(--color-surface)' : 'transparent',
      border: '1px solid var(--color-border)',
      cursor: 'pointer',
      minHeight: '30px',
    }
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <label
        htmlFor={tab === 'edit' ? id : undefined}
        style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '16px', color: 'var(--color-primary)' }}
      >
        {label}
      </label>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--color-border)' }}>
          <button type="button" onClick={() => setTab('edit')} style={tabStyle(tab === 'edit')}>Edit</button>
          <button type="button" onClick={() => setTab('preview')} style={tabStyle(tab === 'preview')}>Preview</button>

          {supportsMarkdown && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '4px 12px' }}>
              <button
                type="button"
                onClick={() => { setFormat('html'); setStatus('idle') }}
                style={{ ...modeToggleStyle(format === 'html'), borderRadius: '4px 0 0 4px', borderRight: 'none' }}
              >
                HTML
              </button>
              <button
                type="button"
                onClick={() => { setFormat('markdown'); setStatus('idle') }}
                style={{ ...modeToggleStyle(format === 'markdown'), borderRadius: '0 4px 4px 0' }}
              >
                Markdown
              </button>
            </div>
          )}
        </div>

        {/* Formatting toolbar — edit tab only */}
        {tab === 'edit' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            padding: '4px 8px',
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
          }}>
            {TOOLBAR.map((item, i) => {
              if (item === 'sep') {
                return <span key={i} style={{ width: '1px', height: '18px', background: 'var(--color-border)', margin: '0 4px' }} aria-hidden="true" />
              }
              const isLink = item.title === 'Link'
              return (
                <button
                  key={item.label}
                  type="button"
                  title={item.title}
                  aria-label={item.title}
                  onMouseDown={e => {
                    e.preventDefault() // keep textarea focus
                    applyFormat(item.spec, isLink)
                  }}
                  style={{
                    padding: '3px 7px',
                    fontSize: item.label.length > 1 ? '11px' : '14px',
                    fontWeight: item.label === 'B' ? 700 : item.label === 'I' ? 400 : 500,
                    fontStyle: item.label === 'I' ? 'italic' : 'normal',
                    fontFamily: 'var(--font-body)',
                    color: 'var(--color-text)',
                    background: 'transparent',
                    border: '1px solid transparent',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    minHeight: '28px',
                    lineHeight: 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Edit textarea */}
        {tab === 'edit' && (
          <textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={e => { setValue(e.target.value); setStatus('idle') }}
            rows={rows}
            spellCheck={format === 'markdown'}
            style={{
              display: 'block',
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              fontFamily: format === 'html' ? 'var(--font-mono, monospace)' : 'var(--font-body)',
              lineHeight: 1.6,
              border: 'none',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}

        {/* Preview tab — content is admin-only; public pipeline sanitizes via sanitize-html */}
        {tab === 'preview' && (
          <div
            style={{
              padding: '16px 20px',
              minHeight: `${rows * 1.6}em`,
              fontSize: '16px',
              lineHeight: '1.8',
              color: 'var(--color-text)',
              background: 'var(--color-bg)',
            }}
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        )}
      </div>

      {/* Template variable hint */}
      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '6px 0 0' }}>
        Variables: <code>{'${BUSINESS_NAME}'}</code> · <code>{'${CONTACT_FORM}'}</code>
      </p>

      {/* Validation warning */}
      {warning && (
        <p role="alert" style={{ fontSize: '13px', color: '#b45309', margin: '6px 0 0', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
          <span aria-hidden="true">⚠</span>
          {warning}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
        <button
          onClick={handleSave}
          disabled={status === 'saving'}
          style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '10px 20px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
        >
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {status === 'saved' && <span aria-live="polite" style={{ color: 'green', fontSize: '16px' }}>Saved ✓</span>}
        {status === 'error' && <span role="alert" style={{ color: '#c05050', fontSize: '16px' }}>Error saving. Please try again.</span>}
      </div>
    </div>
  )
}
