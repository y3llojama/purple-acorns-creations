import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('products').select('view_count').eq('id', id).single()
  if (data) {
    await supabase.from('products').update({ view_count: (data.view_count ?? 0) + 1 }).eq('id', id)
  }
  return NextResponse.json({ ok: true })
}
