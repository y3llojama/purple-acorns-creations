import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sendReply } from '@/lib/email'
import { sanitizeText } from '@/lib/sanitize'
import { clampLength, isValidUuid, isValidHttpsUrl } from '@/lib/validate'

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const messageId = String(body.message_id ?? '')
  const replyBody = sanitizeText(clampLength(String(body.body ?? ''), 5000))

  // Validate attachments: array of https URLs, max 5
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : []
  if (rawAttachments.length > 5) {
    return NextResponse.json({ error: 'Maximum 5 attachments allowed' }, { status: 400 })
  }
  const attachments: string[] = rawAttachments.map(String).filter(isValidHttpsUrl)

  if (!messageId || !isValidUuid(messageId)) {
    return NextResponse.json({ error: 'Valid message_id required' }, { status: 400 })
  }
  if (!replyBody) return NextResponse.json({ error: 'Reply body required' }, { status: 400 })

  const supabase = createServiceRoleClient()

  const { data: message, error: msgError } = await supabase
    .from('messages')
    .select('email, name')
    .eq('id', messageId)
    .single()

  if (msgError || !message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  const emailResult = await sendReply(message.email, message.name, replyBody, attachments)
  if (!emailResult?.success) {
    return NextResponse.json({ error: emailResult?.error ?? 'Failed to send reply' }, { status: 500 })
  }

  const { data: reply, error: dbError } = await supabase
    .from('message_replies')
    .insert({
      message_id: messageId,
      body: replyBody,
      direction: 'outbound',
      resend_message_id: emailResult.messageId ?? null,
      attachments,
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: 'Reply sent but failed to save record' }, { status: 500 })
  }

  await supabase.from('messages').update({ is_read: true }).eq('id', messageId)

  return NextResponse.json(reply, { status: 201 })
}

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const messageId = searchParams.get('message_id')
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10)))

  if (!messageId || !isValidUuid(messageId)) {
    return NextResponse.json({ error: 'Valid message_id required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Get total count
  const { count, error: countError } = await supabase
    .from('message_replies')
    .select('*', { count: 'exact', head: true })
    .eq('message_id', messageId)

  if (countError) return NextResponse.json({ error: 'Failed to count replies' }, { status: 500 })

  const total = count ?? 0
  const offset = (page - 1) * perPage

  const { data, error: dbError } = await supabase
    .from('message_replies')
    .select('*')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true })
    .range(offset, offset + perPage - 1)

  if (dbError) return NextResponse.json({ error: 'Failed to load replies' }, { status: 500 })
  return NextResponse.json({ data, total, page, per_page: perPage })
}
