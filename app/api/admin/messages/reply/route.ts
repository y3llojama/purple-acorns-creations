import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sendReply } from '@/lib/email'
import { sanitizeText } from '@/lib/sanitize'
import { clampLength, isValidUuid } from '@/lib/validate'

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const messageId = String(body.message_id ?? '')
  const replyBody = sanitizeText(clampLength(String(body.body ?? ''), 5000))

  if (!messageId || !isValidUuid(messageId)) {
    return NextResponse.json({ error: 'Valid message_id required' }, { status: 400 })
  }
  if (!replyBody) return NextResponse.json({ error: 'Reply body required' }, { status: 400 })

  const supabase = createServiceRoleClient()

  // Get the original message to find the recipient
  const { data: message, error: msgError } = await supabase
    .from('messages')
    .select('email, name')
    .eq('id', messageId)
    .single()

  if (msgError || !message) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  // Send the reply email
  const emailResult = await sendReply(message.email, message.name, replyBody)
  if (!emailResult?.success) {
    return NextResponse.json({ error: emailResult?.error ?? 'Failed to send reply' }, { status: 500 })
  }

  // Save reply to database
  const { data: reply, error: dbError } = await supabase
    .from('message_replies')
    .insert({
      message_id: messageId,
      body: replyBody,
      resend_message_id: emailResult.messageId ?? null,
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: 'Reply sent but failed to save record' }, { status: 500 })
  }

  // Mark the message as read
  await supabase.from('messages').update({ is_read: true }).eq('id', messageId)

  return NextResponse.json(reply, { status: 201 })
}

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const messageId = searchParams.get('message_id')

  if (!messageId || !isValidUuid(messageId)) {
    return NextResponse.json({ error: 'Valid message_id required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('message_replies')
    .select('*')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true })

  if (dbError) return NextResponse.json({ error: 'Failed to load replies' }, { status: 500 })
  return NextResponse.json(data)
}
