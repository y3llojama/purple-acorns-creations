import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

interface SearchResult { title: string; url: string; description?: string }

interface DiscoveredFair {
  type: 'fair'
  name: string
  location: string
  website_url?: string
  instagram_url?: string
  years_in_operation?: string
  avg_artists?: string
  avg_shoppers?: string
  typical_months?: string
}

interface DiscoveredVenue {
  type: 'venue'
  name: string
  location: string
  website_url?: string
  instagram_url?: string
  hosting_model?: string
  commission_rate?: string
  booth_fee?: string
  avg_shoppers?: string
  application_process?: string
}

interface DiscoveredMarket {
  type: 'market'
  name: string
  location: string
  website_url?: string
  instagram_url?: string
  frequency?: string
  typical_months?: string
  vendor_fee?: string
  avg_vendors?: string
  avg_shoppers?: string
  application_process?: string
}

type Discovered = DiscoveredFair | DiscoveredVenue | DiscoveredMarket

const SEARCH_QUERIES = [
  'craft fair "New England" 2026 artists vendors Massachusetts Rhode Island Connecticut',
  'art fair market 2026 Boston MA NH RI VT ME artists handmade',
  'artist collective store consignment "New England" handmade craft vendors',
  'craft market holiday 2025 2026 Massachusetts "vendor applications"',
  '"artist venue" OR "maker market" OR "pop-up market" Boston Providence Portland Maine',
  '"artisan market" OR "flea market" weekly monthly New England vendor application 2026',
]

async function tavilySearch(apiKey: string, query: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic', max_results: 15 }),
  })
  if (!res.ok) throw new Error(`Tavily error ${res.status}`)
  const data = await res.json()
  return (data?.results ?? []).map((r: { title: string; url: string; content?: string }) => ({
    title: r.title, url: r.url, description: r.content,
  }))
}

async function callAiProvider(provider: string, apiKey: string, prompt: string): Promise<string> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 3000,
        system: 'You are a data extraction tool. Output only valid JSON arrays. No prose, no markdown. Your entire response must be a single JSON array starting with [ and ending with ].',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic error ${res.status}`)
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  }
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) throw new Error(`OpenAI error ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }
  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) throw new Error(`Groq error ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }
  throw new Error(`Unsupported AI provider: ${provider}`)
}

export interface DiscoveryResult { added: number; skipped: number }
export interface DiscoveryError { error: string }

export async function runMarketsDiscovery(
  searchApiKey: string,
  aiProvider: string,
  aiApiKey: string
): Promise<DiscoveryResult | DiscoveryError> {
  let allResults: SearchResult[]
  try {
    const sets = await Promise.all(SEARCH_QUERIES.map(q => tavilySearch(searchApiKey, q)))
    const seen = new Set<string>()
    allResults = []
    for (const results of sets) {
      for (const r of results) {
        if (!seen.has(r.url)) { seen.add(r.url); allResults.push(r) }
      }
    }
  } catch (err) {
    console.error('[markets-discovery] Tavily failed:', err)
    return { error: 'Search failed. Please try again.' }
  }

  if (allResults.length === 0) return { added: 0, skipped: 0 }

  const snippets = allResults.map((r, i) => `${i + 1}) ${r.title}\nURL: ${r.url}\n${r.description ?? ''}`).join('\n\n')

  const prompt = `Extract New England arts and craft market venues from these search results. Only include venues in MA, NH, RI, VT, CT, or ME.

Classify each result as one of three types:

1. Seasonal craft fairs (application-based juried shows, specific dates):
   { "type": "fair", "name": "", "location": "city, state", "website_url": "https://...", "instagram_url": "https://...", "years_in_operation": "", "avg_artists": "", "avg_shoppers": "", "typical_months": "" }

2. Stores or collectives that host artists permanently (consignment, booth rental):
   { "type": "venue", "name": "", "location": "city, state", "website_url": "https://...", "instagram_url": "https://...", "hosting_model": "consignment|booth rental|pop-up|etc", "commission_rate": "e.g. 35%", "booth_fee": "e.g. $150/month", "avg_shoppers": "e.g. ~500/week", "application_process": "brief description" }

3. Recurring pop-up or outdoor markets (weekly/monthly markets, flea markets, artisan markets):
   { "type": "market", "name": "", "location": "city, state", "website_url": "https://...", "instagram_url": "https://...", "frequency": "weekly|monthly|bi-weekly|etc", "typical_months": "", "vendor_fee": "e.g. $50/day", "avg_vendors": "e.g. 60–80", "avg_shoppers": "e.g. 2,000+", "application_process": "brief description" }

Search results:
${snippets}

Return a single JSON array containing all found venues. Omit fields you have no data for. Return [] if nothing qualifies.`

  let rawText: string
  try {
    rawText = await callAiProvider(aiProvider, aiApiKey, prompt)
  } catch (err) {
    console.error('[markets-discovery] AI failed:', err)
    return { error: 'Extraction failed. Please try again.' }
  }

  let discovered: Discovered[]
  try {
    const end = rawText.lastIndexOf(']')
    if (end === -1) return { added: 0, skipped: 0 }
    let depth = 0, start = -1
    for (let i = end; i >= 0; i--) {
      if (rawText[i] === ']') depth++
      else if (rawText[i] === '[') { depth--; if (depth === 0) { start = i; break } }
    }
    if (start === -1) return { added: 0, skipped: 0 }
    discovered = JSON.parse(rawText.slice(start, end + 1))
    if (!Array.isArray(discovered)) throw new Error('Not an array')
  } catch (err) {
    console.error('[markets-discovery] JSON parse error:', err)
    return { error: 'Discovery failed. Please try again.' }
  }

  const supabase = createServiceRoleClient()
  let added = 0, skipped = 0

  for (const item of discovered) {
    if (typeof item.name !== 'string' || !item.name.trim()) continue
    if (typeof item.location !== 'string' || !item.location.trim()) continue

    const name = sanitizeText(clampLength(item.name.trim(), 200))
    const location = sanitizeText(clampLength(item.location.trim(), 300))
    const website_url = item.website_url && isValidHttpsUrl(item.website_url) ? item.website_url : null
    const instagram_url = item.instagram_url && isValidHttpsUrl(item.instagram_url) ? item.instagram_url : null

    if (item.type === 'fair') {
      const { data: existing } = await supabase.from('craft_fairs').select('id').ilike('name', name).maybeSingle()
      if (existing) { skipped++; continue }
      const { error: insertError } = await supabase.from('craft_fairs').insert({
        name, location, website_url, instagram_url,
        years_in_operation: item.years_in_operation ? sanitizeText(clampLength(item.years_in_operation, 100)) || null : null,
        avg_artists: item.avg_artists ? sanitizeText(clampLength(item.avg_artists, 100)) || null : null,
        avg_shoppers: item.avg_shoppers ? sanitizeText(clampLength(item.avg_shoppers, 100)) || null : null,
        typical_months: item.typical_months ? sanitizeText(clampLength(item.typical_months, 200)) || null : null,
      })
      if (insertError) { console.error('[markets-discovery] insert fair error:', insertError); continue }
      added++
    } else if (item.type === 'venue') {
      const { data: existing } = await supabase.from('artist_venues').select('id').ilike('name', name).maybeSingle()
      if (existing) { skipped++; continue }
      const { error: insertError } = await supabase.from('artist_venues').insert({
        name, location, website_url, instagram_url,
        hosting_model: item.hosting_model ? sanitizeText(clampLength(item.hosting_model, 200)) || null : null,
        commission_rate: item.commission_rate ? sanitizeText(clampLength(item.commission_rate, 100)) || null : null,
        booth_fee: item.booth_fee ? sanitizeText(clampLength(item.booth_fee, 100)) || null : null,
        avg_shoppers: item.avg_shoppers ? sanitizeText(clampLength(item.avg_shoppers, 100)) || null : null,
        application_process: item.application_process ? sanitizeText(clampLength(item.application_process, 500)) || null : null,
      })
      if (insertError) { console.error('[markets-discovery] insert venue error:', insertError); continue }
      added++
    } else if (item.type === 'market') {
      const { data: existing } = await supabase.from('recurring_markets').select('id').ilike('name', name).maybeSingle()
      if (existing) { skipped++; continue }
      const { error: insertError } = await supabase.from('recurring_markets').insert({
        name, location, website_url, instagram_url,
        frequency: item.frequency ? sanitizeText(clampLength(item.frequency, 100)) || null : null,
        typical_months: item.typical_months ? sanitizeText(clampLength(item.typical_months, 200)) || null : null,
        vendor_fee: item.vendor_fee ? sanitizeText(clampLength(item.vendor_fee, 100)) || null : null,
        avg_vendors: item.avg_vendors ? sanitizeText(clampLength(item.avg_vendors, 100)) || null : null,
        avg_shoppers: item.avg_shoppers ? sanitizeText(clampLength(item.avg_shoppers, 100)) || null : null,
        application_process: item.application_process ? sanitizeText(clampLength(item.application_process, 500)) || null : null,
      })
      if (insertError) { console.error('[markets-discovery] insert market error:', insertError); continue }
      added++
    }
  }

  return { added, skipped }
}
