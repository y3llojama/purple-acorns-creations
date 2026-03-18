'use client'

import { useEffect, useState, useCallback } from 'react'

type Period = '1d' | '7d' | '30d' | 'all'

interface SummaryData {
  totalViews: number
  uniqueVisitors: number
  topPage: { path: string; views: number } | null
  topReferrer: { source: string; count: number } | null
  contactSubmissions: number
}

interface TimeseriesPoint {
  date: string
  views: number
}

interface PageEntry {
  path: string
  views: number
}

interface SourceEntry {
  source: string
  count: number
}

interface DeviceEntry {
  device: string
  count: number
  percentage: number
}

const PERIOD_LABELS: Record<Period, string> = {
  '1d': 'Today',
  '7d': '7 Days',
  '30d': '30 Days',
  all: 'All Time',
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json()
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ---- Bar Chart Components (CSS-only, no external libraries) ---- */

function HorizontalBarChart({ items }: {
  items: Array<{ label: string; value: number }>
}) {
  const maxVal = Math.max(...items.map(i => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {items.map((item, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{
            flex: '0 0 140px',
            fontSize: '14px',
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {item.label}
          </span>
          <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: '4px', height: '24px', position: 'relative' }}>
            <div style={{
              width: `${Math.max((item.value / maxVal) * 100, 2)}%`,
              height: '100%',
              background: 'var(--color-accent)',
              borderRadius: '4px',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{
            flex: '0 0 50px',
            fontSize: '14px',
            fontWeight: '600',
            color: 'var(--color-primary)',
            textAlign: 'right',
          }}>
            {formatNumber(item.value)}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', fontStyle: 'italic' }}>
          No data for this period.
        </p>
      )}
    </div>
  )
}

function VerticalBarChart({ data }: { data: TimeseriesPoint[] }) {
  const maxViews = Math.max(...data.map(d => d.views), 1)
  // Limit to last 30 bars for readability
  const visible = data.slice(-30)

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '3px',
        height: '180px',
        minWidth: `${visible.length * 28}px`,
        padding: '0 4px',
      }}>
        {visible.map((d) => {
          const pct = Math.max((d.views / maxViews) * 100, 2)
          return (
            <div key={d.date} style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              height: '100%',
              minWidth: '20px',
            }}>
              <span style={{
                fontSize: '11px',
                color: 'var(--color-text-muted)',
                marginBottom: '4px',
              }}>
                {d.views > 0 ? d.views : ''}
              </span>
              <div
                title={`${formatDate(d.date)}: ${d.views} views`}
                style={{
                  width: '100%',
                  maxWidth: '32px',
                  height: `${pct}%`,
                  background: 'var(--color-accent)',
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 0.3s ease',
                  minHeight: '2px',
                }}
              />
              <span style={{
                fontSize: '10px',
                color: 'var(--color-text-muted)',
                marginTop: '4px',
                writingMode: visible.length > 14 ? 'vertical-rl' : undefined,
                transform: visible.length > 14 ? 'rotate(180deg)' : undefined,
              }}>
                {formatDate(d.date)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---- Main Dashboard ---- */

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState<Period>('7d')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([])
  const [pages, setPages] = useState<PageEntry[]>([])
  const [sources, setSources] = useState<SourceEntry[]>([])
  const [devices, setDevices] = useState<DeviceEntry[]>([])

  const loadData = useCallback(async (p: Period) => {
    setLoading(true)
    const qs = `period=${p}`
    const [s, t, pg, src, dev] = await Promise.all([
      fetchJson<SummaryData>(`/api/admin/analytics/summary?${qs}`),
      fetchJson<TimeseriesPoint[]>(`/api/admin/analytics/timeseries?${qs}`),
      fetchJson<PageEntry[]>(`/api/admin/analytics/pages?${qs}`),
      fetchJson<SourceEntry[]>(`/api/admin/analytics/sources?${qs}`),
      fetchJson<DeviceEntry[]>(`/api/admin/analytics/devices?${qs}`),
    ])
    setSummary(s)
    setTimeseries(t ?? [])
    setPages(pg ?? [])
    setSources(src ?? [])
    setDevices(dev ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData(period)
  }, [period, loadData])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--color-primary)', margin: 0 }}>
          Analytics
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                background: period === p ? 'var(--color-primary)' : 'var(--color-surface)',
                color: period === p ? 'var(--color-accent)' : 'var(--color-text)',
                cursor: 'pointer',
                fontWeight: period === p ? '600' : '400',
                minHeight: '48px',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '16px' }}>Loading analytics...</p>
      )}

      {!loading && summary && (
        <>
          {/* Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '40px',
          }}>
            <SummaryCard label="Page Views" value={formatNumber(summary.totalViews)} />
            <SummaryCard label="Unique Visitors" value={formatNumber(summary.uniqueVisitors)} />
            <SummaryCard
              label="Top Page"
              value={summary.topPage?.path ?? '--'}
              subtitle={summary.topPage ? `${summary.topPage.views} views` : undefined}
            />
            <SummaryCard
              label="Top Referrer"
              value={summary.topReferrer?.source ?? 'Direct'}
              subtitle={summary.topReferrer ? `${summary.topReferrer.count} visits` : undefined}
            />
            <SummaryCard label="Contact Submissions" value={formatNumber(summary.contactSubmissions)} />
          </div>

          {/* Views Over Time */}
          <ChartSection title="Views Over Time">
            {timeseries.length > 0 ? (
              <VerticalBarChart data={timeseries} />
            ) : (
              <EmptyState />
            )}
          </ChartSection>

          {/* Top Pages */}
          <ChartSection title="Top Pages">
            <HorizontalBarChart items={pages.map(p => ({ label: p.path, value: p.views }))} />
          </ChartSection>

          {/* Traffic Sources */}
          <ChartSection title="Traffic Sources">
            <HorizontalBarChart items={sources.map(s => ({ label: s.source, value: s.count }))} />
          </ChartSection>

          {/* Device Breakdown */}
          <ChartSection title="Device Breakdown">
            {devices.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {devices.map((d) => (
                  <div key={d.device} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      flex: '0 0 80px',
                      fontSize: '14px',
                      color: 'var(--color-text)',
                      textTransform: 'capitalize',
                    }}>
                      {d.device}
                    </span>
                    <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: '4px', height: '24px' }}>
                      <div style={{
                        width: `${Math.max(d.percentage, 2)}%`,
                        height: '100%',
                        background: 'var(--color-accent)',
                        borderRadius: '4px',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <span style={{
                      flex: '0 0 80px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--color-primary)',
                      textAlign: 'right',
                    }}>
                      {d.percentage}% ({d.count})
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
          </ChartSection>
        </>
      )}
    </div>
  )
}

/* ---- Reusable sub-components ---- */

function SummaryCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      padding: '20px',
    }}>
      <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{
        fontSize: '24px',
        fontWeight: '600',
        color: 'var(--color-primary)',
        fontFamily: 'var(--font-display)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      padding: '24px',
      marginBottom: '24px',
    }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '20px',
        color: 'var(--color-primary)',
        marginBottom: '20px',
        fontWeight: '500',
      }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function EmptyState() {
  return (
    <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', fontStyle: 'italic' }}>
      No data for this period.
    </p>
  )
}
