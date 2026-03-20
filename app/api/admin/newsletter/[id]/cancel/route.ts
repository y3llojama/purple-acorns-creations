import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: RouteContext) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const supabase = createServiceRoleClient()

  const { data: newsletter, error: fetchError } = await supabase
    .from('newsletters')
    .select('status')
    .eq('id', id)
    .single()

  if (fetchError || !newsletter) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (newsletter.status === 'sent') return NextResponse.json({ error: 'Cannot cancel a sent newsletter.' }, { status: 400 })

  const { error: updateError } = await supabase
    .from('newsletters')
    .update({ status: 'cancelled', scheduled_at: null })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
