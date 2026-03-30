import { createServiceRoleClient } from '@/lib/supabase/server'

export type LogLevel = 'none' | 'basic' | 'full'

export function shouldLog(level: string | null, expiresAt: string | null): boolean {
  if (!level || level === 'none') return false
  if (!expiresAt) return false
  return new Date(expiresAt) > new Date()
}

export function buildLogEntry(
  level: string,
  method: string,
  path: string,
  statusCode: number | null,
  durationMs: number,
  requestBody: unknown,
  responseBody: unknown,
): {
  method: string
  path: string
  status_code: number | null
  error: string | null
  request_body: unknown
  response_body: unknown
  duration_ms: number
} {
  const isFull = level === 'full'
  let error: string | null = null

  if (statusCode && statusCode >= 400 && responseBody) {
    const body = responseBody as { errors?: Array<{ detail?: string }> }
    error = body.errors?.[0]?.detail ?? `HTTP ${statusCode}`
  }

  return {
    method,
    path,
    status_code: statusCode,
    error,
    request_body: isFull ? requestBody : null,
    response_body: isFull ? responseBody : null,
    duration_ms: durationMs,
  }
}

export async function writeLogEntry(entry: ReturnType<typeof buildLogEntry>): Promise<void> {
  try {
    const supabase = createServiceRoleClient()
    await supabase.from('square_api_log').insert(entry)
  } catch (err) {
    console.error('[square/logger] failed to write log entry:', err)
  }
}

export async function getLogSettings(): Promise<{ level: LogLevel; expiresAt: string | null }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('id, square_log_level, square_log_expires_at')
    .single()

  const level = (data?.square_log_level as LogLevel) ?? 'none'
  const expiresAt = data?.square_log_expires_at ?? null

  // Auto-disable if expired
  if (level !== 'none' && !shouldLog(level, expiresAt)) {
    await supabase.from('settings').update({
      square_log_level: 'none',
      square_log_expires_at: null,
    }).eq('id', data!.id)
    return { level: 'none', expiresAt: null }
  }

  return { level, expiresAt }
}

export async function cleanupOldLogs(): Promise<number> {
  const supabase = createServiceRoleClient()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('square_api_log')
    .delete()
    .lt('created_at', cutoff)
    .select('id', { count: 'exact', head: true })
  return count ?? 0
}
