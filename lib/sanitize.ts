import sanitizeHtml from 'sanitize-html'
import { marked } from 'marked'

const CONTENT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'blockquote', 'hr'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['https', 'mailto'],
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href ?? ''
      if (!href.startsWith('https://') && !href.startsWith('mailto:')) {
        return { tagName: 'span', attribs: {} }
      }
      return {
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
      }
    },
  },
}

const TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
}

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, CONTENT_OPTIONS)
}

export function sanitizeText(input: string): string {
  return sanitizeHtml(input, TEXT_OPTIONS).trim()
}

/** Convert markdown to sanitized HTML, safe for dangerouslySetInnerHTML. */
export async function markdownToHtml(md: string): Promise<string> {
  const raw = await Promise.resolve(marked(md, { gfm: true, breaks: true }))
  return sanitizeHtml(raw, CONTENT_OPTIONS)
}

/**
 * Escape characters that have special meaning inside an HTML attribute value.
 * Use when interpolating a URL or any user-controlled string into an HTML attribute.
 */
export function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
