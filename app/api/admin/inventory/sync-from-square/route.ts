import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { pullInventoryFromSquare } from '@/lib/channels/square/catalog'

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  void request

  try {
    const result = await pullInventoryFromSquare()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
