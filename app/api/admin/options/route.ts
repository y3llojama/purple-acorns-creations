import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('item_options')
    .select('*, values:item_option_values(id,name,sort_order,square_option_value_id)')
    .eq('is_reusable', true)
    .order('name')
  if (dbError) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const name = sanitizeText(String(body.name ?? '').trim())
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('item_options')
    .insert({ name, display_name: name, is_reusable: true })
    .select()
    .single()
  if (dbError) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  // Insert initial values if provided
  const values = Array.isArray(body.values) ? body.values : []
  for (let i = 0; i < Math.min(values.length, 20); i++) {
    const valName = sanitizeText(String(values[i]?.name ?? values[i] ?? '').trim())
    if (valName) {
      await supabase.from('item_option_values').insert({
        option_id: data.id, name: valName, sort_order: i,
      })
    }
  }
  return NextResponse.json(data, { status: 201 })
}
