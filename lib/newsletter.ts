import { isValidHttpsUrl } from '@/lib/validate'
import type { NewsletterSection, NewsletterTone } from '@/lib/supabase/types'

export function generateSlug(title: string, yearMonth: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return `${yearMonth}-${slug}`
}

export function isValidNewsletterSection(section: unknown): boolean {
  if (!section || typeof section !== 'object') return false
  const s = section as Record<string, unknown>
  if (s.type === 'text') return typeof s.body === 'string'
  if (s.type === 'image') return typeof s.image_url === 'string' && isValidHttpsUrl(s.image_url as string)
  if (s.type === 'cta') return typeof s.label === 'string' && typeof s.url === 'string' && isValidHttpsUrl(s.url as string)
  return false
}

export interface AiPromptInput {
  workingOn: string; selectedChips: string[]; tone: NewsletterTone
  extra: string; upcomingEvents: Array<{ name: string; date: string; location: string }>; today: string
}

export function buildAiPrompt(input: AiPromptInput): string {
  const events = input.upcomingEvents.length
    ? input.upcomingEvents.map(e => `- ${e.name} on ${e.date} at ${e.location}`).join('\n')
    : 'No upcoming events.'
  return `You are a friendly newsletter writer for Purple Acorns Creations, a handmade jewelry and crochet business run by a mother-daughter duo in Massachusetts. Write in a warm, personal voice. Today is ${input.today}.

Write a newsletter with tone: ${input.tone}.
What we are working on: ${input.workingOn}
Key topics: ${input.selectedChips.join(', ') || 'general update'}
Additional notes: ${input.extra || 'none'}
Upcoming events:\n${events}

Return ONLY valid JSON:
{ "title": "...", "subject_line": "...", "teaser_text": "...", "sections": [{ "type": "text", "body": "<p>...</p>" }] }`
}

export function addUtmParams(url: string, slug: string): string {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', 'newsletter')
    u.searchParams.set('utm_medium', 'email')
    u.searchParams.set('utm_campaign', slug)
    return u.toString()
  } catch { return url }
}
