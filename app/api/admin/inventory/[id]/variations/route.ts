import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'
import { syncProduct } from '@/lib/channels'

const SKU_REGEX = /^[a-zA-Z0-9_-]+$/
const MAX_OPTIONS = 3
const MAX_VALUES_PER_OPTION = 20
const MAX_VARIATIONS = 60

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const supabase = createServiceRoleClient()

  // Fetch product options via product_options join
  const { data: options, error: optErr } = await supabase
    .from('product_options')
    .select('*, option:item_options(id, name, values:item_option_values(id, name, sort_order))')
    .eq('product_id', id)
    .order('sort_order')

  if (optErr) return NextResponse.json({ error: 'Failed to fetch options' }, { status: 500 })

  // Fetch variations with their option values
  const { data: variations, error: varErr } = await supabase
    .from('product_variations')
    .select('*, option_values:variation_option_values(id, option_id, option_value_id)')
    .eq('product_id', id)
    .order('sort_order')

  if (varErr) return NextResponse.json({ error: 'Failed to fetch variations' }, { status: 500 })

  return NextResponse.json({ options, variations })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const options = Array.isArray(body.options) ? body.options : []
  const variations = Array.isArray(body.variations) ? body.variations : []

  // Validate limits
  if (options.length > MAX_OPTIONS) {
    return NextResponse.json({ error: `Maximum ${MAX_OPTIONS} options allowed` }, { status: 400 })
  }

  for (const opt of options) {
    const values = Array.isArray(opt.values) ? opt.values : []
    if (values.length > MAX_VALUES_PER_OPTION) {
      return NextResponse.json({ error: `Maximum ${MAX_VALUES_PER_OPTION} values per option` }, { status: 400 })
    }
  }

  if (variations.length > MAX_VARIATIONS) {
    return NextResponse.json({ error: `Maximum ${MAX_VARIATIONS} variations allowed` }, { status: 400 })
  }

  // Validate variation prices and SKUs
  for (const v of variations) {
    const price = parseFloat(String(v.price))
    if (isNaN(price) || price <= 0) {
      return NextResponse.json({ error: 'All variation prices must be greater than 0' }, { status: 400 })
    }
    if (v.sku && String(v.sku).trim() !== '') {
      const sku = String(v.sku).trim()
      if (sku.length > 100 || !SKU_REGEX.test(sku)) {
        return NextResponse.json({ error: `Invalid SKU format: ${sku}` }, { status: 400 })
      }
    }
  }

  // Sanitize option names and value names
  const cleanOptions = options.map((opt: { name?: string; values?: { name?: string }[]; [key: string]: unknown }) => ({
    ...opt,
    name: sanitizeText(String(opt.name ?? '').trim()),
    values: (Array.isArray(opt.values) ? opt.values : []).map((val: { name?: string; [key: string]: unknown }) => ({
      ...val,
      name: sanitizeText(String(val.name ?? '').trim()),
    })),
  }))

  // Build clean variations — CRITICAL: strip stock_count (amendment A1)
  const cleanVariations = variations.map((v: { stock_count?: unknown; [key: string]: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stock_count, ...rest } = v
    return {
      ...rest,
      price: parseFloat(String(v.price)),
      sku: v.sku ? String(v.sku).trim() : undefined,
    }
  })

  const supabase = createServiceRoleClient()

  const { data, error: rpcError } = await supabase.rpc('replace_product_variations', {
    p_product_id: id,
    p_options: JSON.stringify(cleanOptions),
    p_variations: JSON.stringify(cleanVariations),
  })

  if (rpcError) {
    const message = rpcError.message || 'RPC failed'
    // Map known RPC errors to status codes
    if (message.includes('not found')) return NextResponse.json({ error: message }, { status: 404 })
    if (message.includes('invalid') || message.includes('validation')) return NextResponse.json({ error: message }, { status: 400 })
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Trigger sync after success
  const { data: product } = await supabase.from('products').select('*').eq('id', id).single()
  if (product) {
    syncProduct(product).catch(console.error)
  }

  return NextResponse.json(data)
}
