import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCcw, Plus, FileText } from 'lucide-react'
import apiClient from '../api/client'

interface DashData {
  pending_count: number; total_approved: number; this_month: number
  by_category: { category: string; count: number; total: number }[]
  recent_bills: {
    id: string; vendor_name: string | null; amount: number | null
    category: string; status: string; uploaded_at: string; bill_date: string | null
    uploaded_by: string
  }[]
}

const CAT_ICONS: Record<string, string> = {
  'Medicines': '💊', 'Fluids/Juice': '🧃', 'Logistics': '🚚',
  'Food': '🍱', 'Equipment': '🩺', 'Other': '📦',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '₹0'
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function fmtFull(n: number | null | undefined) {
  if (n == null) return '₹0.00'
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// ── Simple SVG line chart ────────────────────────────────────────────────────

function AreaChart({ data, color = '#3b82f6' }: { data: number[]; color?: string }) {
  if (data.length === 0) return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: 12 }}>No data yet</div>
  const W = 500, H = 80
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * W},${H - (v / max) * (H - 6) - 3}`)
  const area = `M 0,${H} L ${pts[0]} L ${pts.join(' L ')} L ${W},${H} Z`
  const line = `M ${pts.join(' L ')}`

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#aGrad)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => {
        const [x, y] = p.split(',')
        return <circle key={i} cx={x} cy={y} r="3.5" fill={color} />
      })}
    </svg>
  )
}

// ── SVG donut ────────────────────────────────────────────────────────────────

function Donut({ segs }: { segs: { val: number; color: string; label: string }[] }) {
  const total = segs.reduce((s, g) => s + g.val, 0)
  if (total === 0) return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r="38" fill="none" stroke="#e5e7eb" strokeWidth="16" />
      <circle cx="55" cy="55" r="22" fill="white" />
    </svg>
  )
  const cx = 55, cy = 55, r = 38, ri = 22
  let offset = -Math.PI / 2
  const paths = segs.filter(g => g.val > 0).map(g => {
    const angle = (g.val / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(offset), y1 = cy + r * Math.sin(offset)
    const x2 = cx + r * Math.cos(offset + angle), y2 = cy + r * Math.sin(offset + angle)
    const xi1 = cx + ri * Math.cos(offset), yi1 = cy + ri * Math.sin(offset)
    const xi2 = cx + ri * Math.cos(offset + angle), yi2 = cy + ri * Math.sin(offset + angle)
    const large = angle > Math.PI ? 1 : 0
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ri} ${ri} 0 ${large} 0 ${xi1} ${yi1} Z`
    offset += angle
    return <path key={g.label} d={d} fill={g.color} />
  })
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      {paths}
      <circle cx={cx} cy={cy} r={ri - 1} fill="white" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#111827">{total}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="8" fill="#9ca3af">bills</text>
    </svg>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function BillsDashboardPage() {
  const navigate = useNavigate()

  const [dash, setDash]         = useState<DashData | null>(null)
  const [bills, setBills]       = useState<DashData['recent_bills']>([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true)
    try {
      const [dashRes, billsRes] = await Promise.all([
        apiClient.get('/bills/dashboard'),
        apiClient.get('/bills', { params: { limit: 200 } }),
      ])
      setDash(dashRes.data)
      setBills(billsRes.data)
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: '#6b7280', fontSize: 13 }}>
        <span className="bd__spin" /> Loading dashboard…
        <style>{CSS}</style>
      </div>
    )
  }

  const totalBills  = bills.length
  const approvedBills = bills.filter(b => b.status === 'approved').length
  const pendingAmt  = bills.filter(b => b.status === 'pending').reduce((s, b) => s + (b.amount ?? 0), 0)
  const totalSpend  = bills.reduce((s, b) => s + (b.amount ?? 0), 0)

  // Category totals for secondary cards
  const catTotals = dash?.by_category.slice(0, 4) ?? []
  const topVendors = (() => {
    const map: Record<string, { count: number; total: number }> = {}
    bills.forEach(b => {
      const v = b.vendor_name || 'Unknown'
      if (!map[v]) map[v] = { count: 0, total: 0 }
      map[v].count++; map[v].total += b.amount ?? 0
    })
    return Object.entries(map).sort((a,b) => b[1].total - a[1].total).slice(0, 5)
  })()

  // Spend per category for chart (just use category totals as simple bar data)
  const chartData = catTotals.map(c => c.total)
  const recentBills = dash?.recent_bills ?? []

  // Donut segments
  const donutSegs = [
    { val: bills.filter(b => b.status === 'approved').length, color: '#10b981', label: 'Approved' },
    { val: bills.filter(b => b.status === 'pending').length,  color: '#f59e0b', label: 'Pending' },
    { val: bills.filter(b => b.status === 'rejected').length, color: '#ef4444', label: 'Rejected' },
  ]

  const CARD1 = [
    { color: '#1e3a8a', label: 'TOTAL MEDICAL SPEND', value: fmt(totalSpend), sub: `${totalBills} bills total`, icon: '📄' },
    { color: '#064e3b', label: 'APPROVED', value: fmt(dash?.total_approved ?? 0), sub: `${approvedBills} bills approved`, icon: '✅' },
    { color: '#7c2d12', label: 'PENDING APPROVAL', value: fmt(pendingAmt), sub: `${dash?.pending_count ?? 0} awaiting action`, icon: '⏳' },
    { color: '#4c1d95', label: 'THIS MONTH', value: fmt(dash?.this_month ?? 0), sub: 'Approved this month', icon: '📅' },
  ]

  const CAT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6b7280']

  return (
    <div className="bd__root">
      {/* ── Header ── */}
      <div className="bd__hdr">
        <div>
          <h1 className="bd__greeting">{greeting()}, Admin 👋</h1>
          <p className="bd__greeting-sub">Here's your medical expenses overview for today.</p>
        </div>
        <div className="bd__hdr-right">
          <button className="bd__ghost-btn" onClick={() => navigate('/bills')}>View All Bills</button>
          <button className="bd__ghost-btn" onClick={() => load(true)}>
            <RefreshCcw size={13} className={refreshing ? 'bd__spinning' : ''} /> Refresh
          </button>
          <button className="bd__primary-btn" onClick={() => navigate('/bills/upload')}>
            <Plus size={14} /> Upload Bill
          </button>
        </div>
      </div>

      <div className="bd__scroll">
        {/* ── Row 1: Main KPI cards ── */}
        <div className="bd__cards1">
          {CARD1.map((c, i) => (
            <div key={i} className="bd__kpi" style={{ background: c.color }}>
              <div className="bd__kpi-top">
                <span className="bd__kpi-label">{c.label}</span>
                <span style={{ fontSize: 20 }}>{c.icon}</span>
              </div>
              <div className="bd__kpi-value">{c.value}</div>
              <div className="bd__kpi-sub">{c.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Row 2: Category cards ── */}
        {catTotals.length > 0 && (
          <div className="bd__cards2">
            {catTotals.map((c, i) => (
              <div key={i} className="bd__cat-card">
                <div className="bd__cat-card-top">
                  <span className="bd__cat-dot" style={{ background: CAT_COLORS[i] ?? '#6b7280' }} />
                  <span className="bd__cat-card-name">{c.category.toUpperCase()}</span>
                </div>
                <div className="bd__cat-card-amt">{fmtFull(c.total)}</div>
                <div className="bd__cat-card-count">{c.count} {c.count === 1 ? 'bill' : 'bills'}</div>
              </div>
            ))}
            {/* Fill remaining slots */}
            {Array.from({ length: Math.max(0, 4 - catTotals.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="bd__cat-card bd__cat-card--empty">
                <div className="bd__cat-card-top">
                  <span className="bd__cat-dot" style={{ background: '#e5e7eb' }} />
                  <span className="bd__cat-card-name" style={{ color: '#d1d5db' }}>—</span>
                </div>
                <div className="bd__cat-card-amt" style={{ color: '#d1d5db' }}>₹0.00</div>
                <div className="bd__cat-card-count" style={{ color: '#d1d5db' }}>0 bills</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Charts row ── */}
        <div className="bd__charts-row">
          {/* Spend by category chart */}
          <div className="bd__chart-card" style={{ flex: 2 }}>
            <div className="bd__chart-hdr">
              <div>
                <div className="bd__chart-title">Medical Spend by Category</div>
                <div className="bd__chart-sub">Approved bills · all time</div>
              </div>
              <div className="bd__chart-val">{fmtFull(dash?.total_approved ?? 0)}</div>
            </div>
            <div style={{ marginTop: 8 }}>
              {catTotals.length > 0 ? (
                <AreaChart data={chartData} color="#3b82f6" />
              ) : (
                <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: 12 }}>
                  No approved bills yet
                </div>
              )}
            </div>
            {catTotals.length > 0 && (
              <div className="bd__chart-axis">
                {catTotals.map((c, i) => (
                  <span key={i} style={{ fontSize: 10, color: '#9ca3af' }}>{CAT_ICONS[c.category] || '📦'} {c.category}</span>
                ))}
              </div>
            )}
          </div>

          {/* Bill status donut */}
          <div className="bd__chart-card" style={{ flex: 1 }}>
            <div className="bd__chart-title">Bill Status</div>
            <div className="bd__chart-sub">All bills breakdown</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
              <Donut segs={donutSegs} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {donutSegs.map(s => (
                  <div key={s.label} className="bd__donut-leg">
                    <span className="bd__donut-dot" style={{ background: s.color }} />
                    <span className="bd__donut-label">{s.label}</span>
                    <span className="bd__donut-val">{s.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom row: Recent bills + Top vendors ── */}
        <div className="bd__bottom-row">
          {/* Recent bills */}
          <div className="bd__table-card" style={{ flex: 3 }}>
            <div className="bd__table-hdr">
              <span className="bd__table-title">Recent Medical Bills</span>
              <button className="bd__table-link" onClick={() => navigate('/bills')}>View All →</button>
            </div>
            {recentBills.length === 0 ? (
              <div className="bd__table-empty"><FileText size={28} color="#d1d5db" /><span>No bills yet</span></div>
            ) : (
              <table className="bd__tbl">
                <thead>
                  <tr>
                    <th className="bd__th">Vendor</th>
                    <th className="bd__th" style={{ textAlign: 'right' }}>Amount</th>
                    <th className="bd__th">Category</th>
                    <th className="bd__th">Status</th>
                    <th className="bd__th">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBills.map((b, i) => (
                    <tr key={i} className="bd__tr" onClick={() => navigate('/bills')}>
                      <td className="bd__td" style={{ fontWeight: 600 }}>{b.vendor_name || '—'}</td>
                      <td className="bd__td" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtFull(b.amount)}</td>
                      <td className="bd__td">
                        <span className="bd__cat-chip">{CAT_ICONS[b.category] || '📦'} {b.category}</span>
                      </td>
                      <td className="bd__td">
                        <span className={`bd__badge bd__badge--${b.status}`}>
                          {b.status === 'approved' ? 'Approved' : b.status === 'rejected' ? 'Rejected' : 'Pending'}
                        </span>
                      </td>
                      <td className="bd__td" style={{ color: '#9ca3af' }}>{fmtDate(b.uploaded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Top Vendors */}
          <div className="bd__table-card" style={{ flex: 2 }}>
            <div className="bd__table-hdr">
              <span className="bd__table-title">Top Vendors</span>
            </div>
            {topVendors.length === 0 ? (
              <div className="bd__table-empty"><span>No vendors yet</span></div>
            ) : (
              <div className="bd__vendor-list">
                {topVendors.map(([name, info], i) => (
                  <div key={i} className="bd__vendor-row">
                    <div className="bd__vendor-av">
                      {name.split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase() || '??'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="bd__vendor-name">{name}</div>
                      <div className="bd__vendor-count">{info.count} {info.count === 1 ? 'bill' : 'bills'}</div>
                    </div>
                    <div className="bd__vendor-amt">{fmtFull(info.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.bd__root { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: #f9fafb; }

/* Header */
.bd__hdr { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; background: white; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; gap: 12px; }
.bd__greeting { font-size: 24px; font-weight: 700; color: #111827; margin: 0; }
.bd__greeting-sub { font-size: 13px; color: #6b7280; margin: 3px 0 0; }
.bd__hdr-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.bd__ghost-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border: 1px solid #e5e7eb; border-radius: 7px; background: white; font-size: 12px; font-weight: 600; color: #374151; cursor: pointer; font-family: inherit; }
.bd__ghost-btn:hover { background: #f3f4f6; }
.bd__primary-btn { display: inline-flex; align-items: center; gap: 5px; padding: 8px 14px; border-radius: 7px; background: #2563eb; color: white; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.bd__primary-btn:hover { background: #1d4ed8; }
.bd__spinning { animation: bdSpin 0.7s linear infinite; }
@keyframes bdSpin { to { transform: rotate(360deg); } }

/* Scroll area */
.bd__scroll { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }

/* KPI cards row 1 */
.bd__cards1 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.bd__kpi { border-radius: 12px; padding: 20px; color: white; }
.bd__kpi-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px; }
.bd__kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.75; }
.bd__kpi-value { font-size: 28px; font-weight: 800; line-height: 1.1; }
.bd__kpi-sub { font-size: 12px; opacity: 0.65; margin-top: 4px; }

/* Category cards row 2 */
.bd__cards2 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.bd__cat-card { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
.bd__cat-card--empty { opacity: 0.4; }
.bd__cat-card-top { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
.bd__cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.bd__cat-card-name { font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
.bd__cat-card-amt { font-size: 18px; font-weight: 800; color: #111827; }
.bd__cat-card-count { font-size: 11px; color: #9ca3af; margin-top: 2px; }

/* Charts row */
.bd__charts-row { display: flex; gap: 12px; }
.bd__chart-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
.bd__chart-hdr { display: flex; justify-content: space-between; align-items: flex-start; }
.bd__chart-title { font-size: 15px; font-weight: 700; color: #111827; }
.bd__chart-sub { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.bd__chart-val { font-size: 13px; font-weight: 700; color: #111827; }
.bd__chart-axis { display: flex; justify-content: space-between; margin-top: 4px; }

/* Donut legend */
.bd__donut-leg { display: flex; align-items: center; gap: 7px; }
.bd__donut-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.bd__donut-label { font-size: 12px; color: #374151; flex: 1; }
.bd__donut-val { font-size: 12px; font-weight: 700; color: #111827; min-width: 20px; text-align: right; }

/* Bottom row */
.bd__bottom-row { display: flex; gap: 12px; }
.bd__table-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; min-width: 0; }
.bd__table-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.bd__table-title { font-size: 15px; font-weight: 700; color: #111827; }
.bd__table-link { font-size: 12px; color: #2563eb; background: none; border: none; cursor: pointer; font-family: inherit; }
.bd__table-link:hover { text-decoration: underline; }
.bd__table-empty { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 28px; color: #9ca3af; font-size: 13px; }
.bd__tbl { width: 100%; border-collapse: collapse; }
.bd__th { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.4px; padding: 8px 10px; text-align: left; border-bottom: 1px solid #f3f4f6; white-space: nowrap; }
.bd__tr { cursor: pointer; }
.bd__tr:hover .bd__td { background: #f9fafb; }
.bd__td { padding: 10px 10px; font-size: 12px; color: #374151; border-bottom: 1px solid #f9f9f9; vertical-align: middle; }
.bd__cat-chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 20px; background: #ede9fe; color: #5b21b6; font-size: 11px; font-weight: 600; }
.bd__badge { display: inline-flex; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.bd__badge--pending  { background: #fef3c7; color: #92400e; }
.bd__badge--approved { background: #d1fae5; color: #065f46; }
.bd__badge--rejected { background: #fee2e2; color: #991b1b; }

/* Vendors */
.bd__vendor-list { display: flex; flex-direction: column; gap: 10px; }
.bd__vendor-row { display: flex; align-items: center; gap: 10px; }
.bd__vendor-av { width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.bd__vendor-name { font-size: 13px; font-weight: 600; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bd__vendor-count { font-size: 11px; color: #9ca3af; }
.bd__vendor-amt { font-size: 13px; font-weight: 700; color: #111827; flex-shrink: 0; }

.bd__spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #e5e7eb; border-top-color: #2563eb; animation: bdSpin 0.7s linear infinite; display: inline-block; }
`
