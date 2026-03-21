import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { pullProductsFromSquare } from '@/lib/channels/square/catalog'

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  try {
    const result = await pullProductsFromSquare()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
