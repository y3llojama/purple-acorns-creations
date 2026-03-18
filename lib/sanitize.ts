import sanitizeHtml from 'sanitize-html'

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
