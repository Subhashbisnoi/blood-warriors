import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Clock, CheckCircle2, AlertCircle,
  ArrowUpRight, FileText, RefreshCw, Upload, X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useBills } from '../hooks/useBills'
import type { Bill } from '../api/invoices'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)


const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function daysAgo(d: string | null) {
  if (!d) return 0
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  DRAFT:              { label: 'Draft',            color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  PENDING_APPROVER:   { label: 'Pending Approver', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  PENDING_ACCOUNTANT: { label: 'Pending Accountant',color:'#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  PENDING_FC:         { label: 'Pending FC',        color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  APPROVED:           { label: 'Approved',          color: '#059669', bg: '#f0fdf4', border: '#a7f3d0' },
  NEEDS_REVISION:     { label: 'Needs Revision',    color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

// ── Spark area chart ──────────────────────────────────────────────────────────
function SparkAreaChart({ data, labels, today, onBarClick }: { data: number[]; labels: string[]; today: number; onBarClick?: (index: number, e: React.MouseEvent) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<{ i: number; x: number; y: number } | null>(null)

  const W = 600, H = 100, PAD_T = 10, PAD_B = 24, PAD_H = 8
  const innerH = H - PAD_T - PAD_B
  const innerW = W - PAD_H * 2
  const max = Math.max(...data, 1)
  const n = data.length

  const px = (i: number) => PAD_H + (i / (n - 1)) * innerW
  const py = (v: number) => PAD_T + innerH - (v / max) * innerH

  const pts = data.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' L ')
  const linePath = `M ${pts}`
  const areaPath = `M ${px(0).toFixed(1)},${(PAD_T + innerH).toFixed(1)} L ${pts} L ${px(n - 1).toFixed(1)},${(PAD_T + innerH).toFixed(1)} Z`
  const showLabel = (i: number) => i === today || i === 0 || (i + 1) % 5 === 0

  const fmtAmt = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const raw = Math.round(((svgX - PAD_H) / innerW) * (n - 1))
    const i = Math.max(0, Math.min(n - 1, raw))
    setHovered({ i, x: px(i), y: py(data[i]) })
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {hovered && (
        <div style={{
          position: 'absolute',
          left: `${(hovered.x / W) * 100}%`,
          top: `${(hovered.y / H) * 100}%`,
          transform: hovered.x > W * 0.75 ? 'translate(-110%, -130%)' : 'translate(-50%, -130%)',
          background: '#111827', color: '#fff',
          borderRadius: 8, padding: '5px 10px',
          fontSize: 11, fontWeight: 600,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          <div style={{ color: '#9ca3af', fontSize: 10, marginBottom: 1 }}>{labels[hovered.i]}</div>
          <div>{data[hovered.i] > 0 ? fmtAmt(data[hovered.i]) : '₹0'}</div>
        </div>
      )}

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible', cursor: onBarClick ? 'pointer' : 'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={() => setHovered(null)}
        onClick={e => { if (onBarClick && hovered) onBarClick(hovered.i, e) }}>
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <line x1={PAD_H} y1={PAD_T + innerH} x2={W - PAD_H} y2={PAD_T + innerH}
          stroke="#e5e7eb" strokeWidth="1" />
        <path d={areaPath} fill="url(#spark-grad)" />
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />

        <line x1={px(today)} y1={PAD_T} x2={px(today)} y2={PAD_T + innerH}
          stroke="#3b82f6" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />

        {hovered && (
          <>
            <line x1={hovered.x} y1={PAD_T} x2={hovered.x} y2={PAD_T + innerH}
              stroke="#6b7280" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <circle cx={hovered.x} cy={hovered.y} r={5}
              fill={hovered.i === today ? '#2563eb' : '#3b82f6'}
              stroke="white" strokeWidth="2" />
          </>
        )}

        {data.map((v, i) => v > 0 && i !== hovered?.i ? (
          <circle key={i} cx={px(i)} cy={py(v)} r={i === today ? 4 : 2.5}
            fill={i === today ? '#2563eb' : '#93c5fd'} stroke="white" strokeWidth="1.5" />
        ) : null)}

        {labels.map((l, i) => showLabel(i) ? (
          <text key={i} x={px(i)} y={H - 4} textAnchor="middle"
            fontSize="9" fill={i === today ? '#374151' : '#9ca3af'}
            fontWeight={i === today ? '700' : '400'}>
            {l}
          </text>
        ) : null)}
      </svg>
    </div>
  )
}

// ── Donut ─────────────────────────────────────────────────────────────────────
function DonutChart({ slices }: { slices: { value: number; color: string; label: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  const R = 34, cx = 44, cy = 44, C = 2 * Math.PI * R
  let angle = -90
  return (
    <svg width={88} height={88} viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f3f4f6" strokeWidth={14} />
      {slices.filter(s => s.value > 0).map((seg, i) => {
        const sweep = (seg.value / total) * 360
        const dashLen = (seg.value / total) * C
        const rot = angle
        angle += sweep
        return (
          <circle key={i} cx={cx} cy={cy} r={R} fill="none"
            stroke={seg.color} strokeWidth={14}
            strokeDasharray={`${dashLen} ${C - dashLen}`}
            style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${rot}deg)` }}
          />
        )
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={14} fontWeight={800} fill="#111827">{total}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="#9ca3af">bills</text>
    </svg>
  )
}

// ── DrillDown panel ──────────────────────────────────────────────────────────
type DrillDown = {
  title: string
  subtitle: string
  bills: Bill[]
  origin: string   // "Xpx Ypx" offset from viewport center
} | null

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function calcOrigin(e: React.MouseEvent): string {
  const dx = e.clientX - window.innerWidth  / 2
  const dy = e.clientY - window.innerHeight / 2
  return `${dx.toFixed(1)}px ${dy.toFixed(1)}px`
}

function DrillDownPanel({ data, onClose, onGoToBill }: { data: NonNullable<DrillDown>; onClose: () => void; onGoToBill?: (id: string) => void }) {
  const total = data.bills.reduce((s, b) => s + (b.total_amount ?? 0), 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const [dx, dy] = data.origin.split(' ')

  const PAY_STYLE: Record<string, { color: string; bg: string }> = {
    paid:    { color: '#059669', bg: '#f0fdf4' },
    partial: { color: '#d97706', bg: '#fffbeb' },
    unpaid:  { color: '#dc2626', bg: '#fef2f2' },
  }

  return (
    <>
      <div className="db__drill-backdrop" onClick={onClose} />
      <div className="db__drill" style={{ '--dd-dx': dx, '--dd-dy': dy } as React.CSSProperties}>
        {/* Header */}
        <div style={{ padding: '20px 20px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>{data.title}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{data.subtitle}</div>
            </div>
            <button
              onClick={onClose}
              style={{ flexShrink: 0, width: 32, height: 32, border: 'none', background: '#f1f5f9', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
            >
              <X size={15} />
            </button>
          </div>
          {/* Summary */}
          <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 16px', flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Amount</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{fmt(total)}</div>
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 16px', flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bills</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{data.bills.length}</div>
            </div>
          </div>
        </div>

        {/* Bill list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 20px' }}>
          {data.bills.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', fontSize: 13, color: '#94a3b8' }}>No bills in this category</div>
          ) : data.bills.map(b => {
            const meta = STATUS_META[b.status?.toUpperCase()] ?? STATUS_META.DRAFT
            const ps = b.payment_status ?? 'unpaid'
            const pStyle = PAY_STYLE[ps] ?? PAY_STYLE.unpaid
            const dueDate = b.due_date ? new Date(b.due_date) : null
            const isOverdue = dueDate && dueDate < now && ps !== 'paid'
            const daysOvd = isOverdue ? Math.floor((now.getTime() - dueDate!.getTime()) / 86400000) : 0
            return (
              <div key={b.invoice_id} className="db__drill-bill" style={{ cursor: onGoToBill ? 'pointer' : undefined }} onClick={() => onGoToBill?.(b.invoice_id)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {b.vendor_name || 'Unknown Vendor'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>{meta.label}</span>
                      {b.status?.toUpperCase() === 'APPROVED' && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: pStyle.bg, color: pStyle.color }}>{ps.charAt(0).toUpperCase() + ps.slice(1)}</span>
                      )}
                      {isOverdue && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>{daysOvd}d overdue</span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: isOverdue ? '#dc2626' : '#111827' }}>
                      {b.total_amount != null ? fmt(b.total_amount) : '—'}
                    </div>
                    {b.outstanding_amount != null && b.outstanding_amount !== b.total_amount && (
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>o/s {fmt(b.outstanding_amount)}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 7 }}>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>Invoice: <span style={{ color: '#6b7280' }}>{fmtDate(b.created_at)}</span></span>
                  {b.due_date && <span style={{ fontSize: 11, color: '#9ca3af' }}>Due: <span style={{ color: isOverdue ? '#dc2626' : '#6b7280', fontWeight: isOverdue ? 600 : 400 }}>{fmtDate(b.due_date)}</span></span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const onGoToBills = () => navigate('/bills')
  const onGoToUpload = () => navigate('/bills/upload')
  const onGoToBill = (id: string) => navigate(`/bills?bill=${id}`)
  const { user } = useAuth()
  const { bills, loading, refresh } = useBills()
  const [refreshing, setRefreshing] = useState(false)
  const [drillDown, setDrillDown] = useState<DrillDown>(null)

  const load = (force = false) => {
    if (force) { setRefreshing(true); refresh(); setTimeout(() => setRefreshing(false), 800) }
  }

  const m = useMemo(() => {
    const up  = (s: string) => s?.toUpperCase() ?? ''
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const in7  = new Date(now); in7.setDate(in7.getDate() + 7)
    const in30 = new Date(now); in30.setDate(in30.getDate() + 30)

    const approved  = bills.filter(b => up(b.status) === 'APPROVED')
    const pending   = bills.filter(b => up(b.status).startsWith('PENDING'))
    const draft     = bills.filter(b => up(b.status) === 'DRAFT')
    const revision  = bills.filter(b => up(b.status) === 'NEEDS_REVISION')

    // Due / overdue — bills that are approved but not fully paid and have a due_date
    const unpaidApproved = approved.filter(b => (b.payment_status ?? 'unpaid') !== 'paid')
    const overdue   = unpaidApproved.filter(b => b.due_date && new Date(b.due_date) < now)
    const dueSoon   = unpaidApproved.filter(b => b.due_date && new Date(b.due_date) >= now && new Date(b.due_date) <= in7)
    const due30     = unpaidApproved.filter(b => b.due_date && new Date(b.due_date) >= now && new Date(b.due_date) <= in30)

    const overdueAmt  = overdue.reduce((s, b)  => s + ((b.outstanding_amount ?? b.total_amount) ?? 0), 0)
    const dueSoonAmt  = dueSoon.reduce((s, b)  => s + ((b.outstanding_amount ?? b.total_amount) ?? 0), 0)
    const due30Amt    = due30.reduce((s, b)    => s + ((b.outstanding_amount ?? b.total_amount) ?? 0), 0)
    const outstandingAmt = unpaidApproved.reduce((s, b) => s + ((b.outstanding_amount ?? b.total_amount) ?? 0), 0)

    // Payment breakdown
    const paid    = approved.filter(b => b.payment_status === 'paid')
    const partial = approved.filter(b => b.payment_status === 'partial')
    const unpaid  = approved.filter(b => (b.payment_status ?? 'unpaid') === 'unpaid')
    const paidAmt = paid.reduce((s, b) => s + (b.total_amount ?? 0), 0)

    const totalAmt    = bills.reduce((s, b) => s + (b.total_amount ?? 0), 0)
    const approvedAmt = approved.reduce((s, b) => s + (b.total_amount ?? 0), 0)
    const pendingAmt  = pending.reduce((s, b) => s + (b.total_amount ?? 0), 0)

    // Last 30 days daily spend (approved)
    const dailySpendMap: Record<string, number> = {}
    approved.forEach(b => {
      if (!b.created_at) return
      const d = new Date(b.created_at)
      d.setHours(0, 0, 0, 0)
      const k = d.toISOString().slice(0, 10)
      dailySpendMap[k] = (dailySpendMap[k] ?? 0) + (b.total_amount ?? 0)
    })
    const dailyDates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() - 29 + i)
      return d
    })
    const monthlyAmounts = dailyDates.map(d => dailySpendMap[d.toISOString().slice(0, 10)] ?? 0)
    const monthLabels    = dailyDates.map(d => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`)
    const thisMonth = monthlyAmounts[29]
    const lastMonth = monthlyAmounts[28]
    const mom = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null

    // Vendor breakdown
    const vendorMap: Record<string, number> = {}
    bills.forEach(b => {
      const v = b.vendor_name?.trim() || 'Unknown'
      vendorMap[v] = (vendorMap[v] ?? 0) + (b.total_amount ?? 0)
    })
    const topVendors = Object.entries(vendorMap).sort((a, b) => b[1] - a[1]).slice(0, 5)

    // Status slices for donut
    const statusCounts: Record<string, number> = {}
    bills.forEach(b => { const s = up(b.status); statusCounts[s] = (statusCounts[s] ?? 0) + 1 })
    const donutSlices = Object.entries(statusCounts).map(([s, v]) => ({
      value: v, color: STATUS_META[s]?.color ?? '#9ca3af', label: STATUS_META[s]?.label ?? s,
    }))

    // Recent bills
    const recent = [...bills]
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, 6)

    // Attention: pending + oldest first
    const attention = pending
      .sort((a, b) => daysAgo(b.created_at) - daysAgo(a.created_at))
      .slice(0, 5)

    // All overdue+due-soon sorted by how overdue they are
    const dueSortedList = [...overdue, ...dueSoon]
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 6)

    return {
      totalAmt, approvedAmt, pendingAmt, outstandingAmt, paidAmt,
      totalCount: bills.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      draftCount: draft.length,
      revisionCount: revision.length,
      paidCount: paid.length, partialCount: partial.length, unpaidCount: unpaid.length,
      overdueCount: overdue.length, overdueAmt,
      dueSoonCount: dueSoon.length, dueSoonAmt,
      due30Count: due30.length, due30Amt,
      monthlyAmounts, monthLabels, thisMonth, lastMonth, mom,
      topVendors, maxVendor: topVendors[0]?.[1] ?? 1,
      donutSlices, recent, attention, dueSortedList,
      // raw arrays for drill-down
      allBills: bills,
      approvedBills: approved,
      pendingBills: pending,
      unpaidApprovedBills: unpaidApproved,
      overdueBills: overdue,
      dueSoonBills: dueSoon,
      due30Bills: due30,
      paidBills: paid,
      dailyDates,
    }
  }, [bills])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', gap: 10, color:'#9ca3af', fontSize:14 }}>
      <RefreshCw size={16} style={{ animation:'spin 1s linear infinite' }} /> Loading…
    </div>
  )

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <div className="db">

        {/* ── Header ── */}
        <div className="db__hdr">
          <div>
            <div className="db__title">{greeting}, {user?.name?.split(' ')[0] ?? 'there'} 👋</div>
            <div className="db__sub">Here's your medical expense overview for today</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="db__btn db__btn--ghost" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw size={13} style={refreshing ? { animation:'spin 1s linear infinite' } : {}} /> Refresh
            </button>
            {onGoToUpload && (
              <button className="db__btn db__btn--primary" onClick={onGoToUpload}>
                <Upload size={13} /> Upload Bill
              </button>
            )}
          </div>
        </div>

        {/* ── Hero KPI strip ── */}
        <div className="db__hero-strip">
          {[
            {
              label:'Total Projected Spend', value:fmt(m.totalAmt), sub:`${m.totalCount} bills total`,
              grad:'linear-gradient(135deg,#1d4ed8 0%,#3b82f6 100%)',
              icon:<FileText size={20}/>,
              bills: m.allBills, title:'Total Projected Spend', subtitle:'All bills',
            },
            {
              label:'Approved', value:fmt(m.approvedAmt), sub:`${m.approvedCount} bills approved`,
              grad:'linear-gradient(135deg,#065f46 0%,#10b981 100%)',
              icon:<CheckCircle2 size={20}/>,
              bills: m.approvedBills, title:'Approved Bills', subtitle:'All approved bills',
            },
            {
              label:'Pending Approval', value:fmt(m.pendingAmt),
              sub: m.pendingCount > 0 ? `${m.pendingCount} awaiting action` : 'All clear',
              grad: m.pendingCount > 0
                ? 'linear-gradient(135deg,#92400e 0%,#f59e0b 100%)'
                : 'linear-gradient(135deg,#374151 0%,#9ca3af 100%)',
              icon:<Clock size={20}/>,
              bills: m.pendingBills, title:'Pending Approval', subtitle:'Bills awaiting approval',
            },
            {
              label:'Outstanding', value:fmt(m.outstandingAmt),
              sub:`${m.unpaidCount} unpaid · ${m.partialCount} partial`,
              grad:'linear-gradient(135deg,#4c1d95 0%,#8b5cf6 100%)',
              icon:<AlertCircle size={20}/>,
              bills: m.unpaidApprovedBills, title:'Outstanding Bills', subtitle:'Approved bills not yet fully paid',
            },
          ].map(k => (
            <div key={k.label} className="db__hero-kpi" style={{ background: k.grad, cursor: 'pointer' }}
              onClick={e => setDrillDown({ title: k.title, subtitle: k.subtitle, bills: k.bills, origin: calcOrigin(e) })}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.75)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{k.label}</div>
                <div style={{ opacity:0.6 }}>{k.icon}</div>
              </div>
              <div style={{ fontSize:28, fontWeight:800, color:'#fff', marginTop:10, letterSpacing:'-1px', lineHeight:1 }}>{k.value}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.7)', marginTop:6 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Secondary stats row ── */}
        <div className="db__stats-row">
          {[
            {
              label:'Overdue', value:fmt(m.overdueAmt), count:m.overdueCount,
              color: m.overdueCount > 0 ? '#dc2626' : '#9ca3af',
              bg: m.overdueCount > 0 ? '#fef2f2' : '#f9fafb',
              border: m.overdueCount > 0 ? '#fecaca' : '#e5e7eb',
              icon:<AlertCircle size={15}/>,
              sub: m.overdueCount > 0 ? `${m.overdueCount} past due` : 'None overdue',
              bills: m.overdueBills, title:'Overdue Bills', subtitle:'Approved unpaid bills past due date',
            },
            {
              label:'Due This Week', value:fmt(m.dueSoonAmt), count:m.dueSoonCount,
              color: m.dueSoonCount > 0 ? '#d97706' : '#9ca3af',
              bg: m.dueSoonCount > 0 ? '#fffbeb' : '#f9fafb',
              border: m.dueSoonCount > 0 ? '#fde68a' : '#e5e7eb',
              icon:<Clock size={15}/>,
              sub: m.dueSoonCount > 0 ? `${m.dueSoonCount} bills` : 'Nothing due',
              bills: m.dueSoonBills, title:'Due This Week', subtitle:'Approved unpaid bills due within 7 days',
            },
            {
              label:'Due This Month', value:fmt(m.due30Amt), count:m.due30Count,
              color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe',
              icon:<Clock size={15}/>,
              sub:`${m.due30Count} bills due`,
              bills: m.due30Bills, title:'Due This Month', subtitle:'Approved unpaid bills due within 30 days',
            },
            {
              label:'Total Paid', value:fmt(m.paidAmt), count:m.paidCount,
              color:'#059669', bg:'#f0fdf4', border:'#a7f3d0',
              icon:<CheckCircle2 size={15}/>,
              sub:`${m.paidCount} of ${m.approvedCount} paid`,
              bills: m.paidBills, title:'Total Paid', subtitle:'Approved bills fully paid',
            },
          ].map(k => (
            <div key={k.label} className="db__stat" style={{ borderColor: k.border, background: k.bg, cursor: 'pointer' }}
              onClick={e => setDrillDown({ title: k.title, subtitle: k.subtitle, bills: k.bills, origin: calcOrigin(e) })}>
              <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8 }}>
                <div style={{ color: k.color, display:'flex' }}>{k.icon}</div>
                <span style={{ fontSize:11, fontWeight:700, color: k.color, textTransform:'uppercase', letterSpacing:'0.05em' }}>{k.label}</span>
              </div>
              <div style={{ fontSize:20, fontWeight:800, color:'#111827', letterSpacing:'-0.5px' }}>{k.value}</div>
              <div style={{ fontSize:11, color:'#6b7280', marginTop:3 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Chart row ── */}
        <div className="db__row" style={{ gridTemplateColumns:'1fr 300px' }}>
          <div className="db__card">
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
              <div>
                <div className="db__card-title">Daily Spend</div>
                <div className="db__card-sub">Approved bills · last 30 days</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:24, fontWeight:800, color:'#111827', letterSpacing:'-0.8px' }}>{fmt(m.thisMonth)}</div>
                {m.mom !== null
                  ? <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'flex-end', fontSize:12, fontWeight:600, color: m.mom>0?'#dc2626':'#059669', marginTop:3 }}>
                      {m.mom>0?<TrendingUp size={12}/>:<TrendingDown size={12}/>} {Math.abs(m.mom).toFixed(1)}% vs yesterday
                    </div>
                  : <div style={{ fontSize:11, color:'#9ca3af', marginTop:3 }}>No data yesterday</div>
                }
              </div>
            </div>
            <SparkAreaChart
              data={m.monthlyAmounts}
              labels={m.monthLabels}
              today={29}
              onBarClick={(i, e) => {
                const dateKey = m.dailyDates[i].toISOString().slice(0, 10)
                const dayLabel = m.monthLabels[i]
                const dayBills = m.approvedBills.filter(b => {
                  if (!b.created_at) return false
                  return new Date(b.created_at).toISOString().slice(0, 10) === dateKey
                })
                setDrillDown({ title: `Spend on ${dayLabel}`, subtitle: 'Approved bills on this day', bills: dayBills, origin: calcOrigin(e) })
              }}
            />
          </div>

          <div className="db__card">
            <div className="db__card-title">Bill Status</div>
            <div className="db__card-sub" style={{ marginBottom:16 }}>All bills breakdown</div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
              <DonutChart slices={m.donutSlices} />
              <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:8 }}>
                {m.donutSlices.map(s => (
                  <div key={s.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', borderRadius:8, padding:'3px 4px', transition:'background 0.1s' }}
                    onClick={e => {
                      const statusKey = Object.entries(STATUS_META).find(([, v]) => v.label === s.label)?.[0]
                      const filtered = statusKey
                        ? m.allBills.filter(b => b.status?.toUpperCase() === statusKey)
                        : m.allBills.filter(b => !STATUS_META[b.status?.toUpperCase()] && (STATUS_META[b.status?.toUpperCase()]?.label ?? b.status) === s.label)
                      setDrillDown({ title: s.label, subtitle: `Bills with status: ${s.label}`, bills: filtered, origin: calcOrigin(e) })
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background='#f3f4f6')}
                    onMouseLeave={e => (e.currentTarget.style.background='')}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:9, height:9, borderRadius:3, background:s.color, flexShrink:0 }}/>
                      <span style={{ fontSize:12, color:'#4b5563', fontWeight:500 }}>{s.label}</span>
                    </div>
                    <span style={{ fontSize:12, fontWeight:700, color:'#111827', background:'#f3f4f6', padding:'1px 8px', borderRadius:6 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom row ── */}
        <div className="db__row" style={{ gridTemplateColumns:'1fr 1fr' }}>

          {/* Due & Overdue */}
          <div className="db__card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div>
                <div className="db__card-title">Due & Overdue Bills</div>
                <div className="db__card-sub">Approved bills pending payment</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {m.overdueCount > 0 && <span className="db__badge db__badge--red">{m.overdueCount} overdue</span>}
                {m.dueSoonCount > 0 && <span className="db__badge db__badge--amber">{m.dueSoonCount} due soon</span>}
              </div>
            </div>
            {m.dueSortedList.length === 0
              ? <div className="db__empty">No overdue or upcoming bills</div>
              : m.dueSortedList.map(b => {
                  const dueDate   = b.due_date ? new Date(b.due_date) : null
                  const nowDate   = new Date(); nowDate.setHours(0,0,0,0)
                  const isOverdue = dueDate && dueDate < nowDate
                  const daysLeft  = dueDate ? Math.round((dueDate.getTime() - nowDate.getTime()) / 86400000) : null
                  const outstanding = b.outstanding_amount ?? b.total_amount ?? 0
                  return (
                    <div key={b.invoice_id} className="db__row-item" onClick={e => setDrillDown({ title: b.vendor_name || 'Unknown Vendor', subtitle: `Invoice · ${fmtDate(b.created_at)}`, bills: [b], origin: calcOrigin(e) })}>
                      <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                        background: isOverdue ? '#fef2f2' : '#fffbeb', border:`1px solid ${isOverdue?'#fecaca':'#fde68a'}` }}>
                        <AlertCircle size={16} color={isOverdue ? '#dc2626' : '#d97706'} />
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {b.vendor_name || 'Unknown Vendor'}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                          <span className={`db__badge ${isOverdue?'db__badge--red':'db__badge--amber'}`} style={{ fontSize:10 }}>
                            {isOverdue ? `${Math.abs(daysLeft!)}d overdue` : daysLeft === 0 ? 'Due today' : `Due in ${daysLeft}d`}
                          </span>
                          {b.due_date && <span style={{ fontSize:10, color:'#9ca3af' }}>{new Date(b.due_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color: isOverdue ? '#dc2626' : '#111827' }}>{fmt(outstanding)}</div>
                        <div style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>outstanding</div>
                      </div>
                    </div>
                  )
                })
            }
            {m.dueSortedList.length > 0 && onGoToBills && (
              <button className="db__link-btn" onClick={onGoToBills}>View all in Bills <ArrowUpRight size={12}/></button>
            )}
          </div>

          {/* Top Vendors */}
          <div className="db__card">
            <div className="db__card-title">Top Vendors</div>
            <div className="db__card-sub" style={{ marginBottom:18 }}>By total bill amount</div>
            {m.topVendors.length === 0
              ? <div className="db__empty">No vendor data yet</div>
              : m.topVendors.map(([name, amt], i) => {
                  const COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444']
                  const pct = (amt / m.maxVendor) * 100
                  return (
                    <div key={name} style={{ marginBottom:14, cursor:'pointer', borderRadius:10, padding:'4px 4px 4px', transition:'background 0.1s' }}
                      onClick={e => setDrillDown({ title: name, subtitle: `All bills for vendor: ${name}`, bills: m.allBills.filter(b => (b.vendor_name?.trim() || 'Unknown') === name), origin: calcOrigin(e) })}
                      onMouseEnter={e => (e.currentTarget.style.background='#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background='')}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                          <div style={{ width:24, height:24, borderRadius:7, background: COLORS[i]+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color: COLORS[i], flexShrink:0 }}>{i+1}</div>
                          <span style={{ fontSize:13, fontWeight:600, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:170 }}>{name}</span>
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:'#374151', flexShrink:0, marginLeft:8 }}>{fmt(amt)}</span>
                      </div>
                      <div style={{ height:5, background:'#f3f4f6', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:99, background: COLORS[i], width:`${pct}%`, transition:'width 0.8s cubic-bezier(0.34,1.2,0.64,1)' }} />
                      </div>
                    </div>
                  )
                })
            }
          </div>
        </div>

        {/* ── Recent Bills ── */}
        <div className="db__card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div>
              <div className="db__card-title">Recent Bills</div>
              <div className="db__card-sub">Latest uploaded bills</div>
            </div>
            {onGoToBills && <button className="db__link-btn" style={{ width:'auto', marginTop:0, padding:'6px 12px' }} onClick={onGoToBills}>View all <ArrowUpRight size={12}/></button>}
          </div>
          {m.recent.length === 0
            ? <div className="db__empty">No bills yet</div>
            : (
              <table className="db__table">
                <thead>
                  <tr><th>Vendor</th><th>Date</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Payment</th></tr>
                </thead>
                <tbody>
                  {m.recent.map(b => {
                    const meta = STATUS_META[b.status?.toUpperCase()] ?? STATUS_META.DRAFT
                    const PAY_STYLE: Record<string, {color:string;bg:string}> = {
                      paid:    {color:'#059669', bg:'#f0fdf4'},
                      partial: {color:'#d97706', bg:'#fffbeb'},
                      unpaid:  {color:'#dc2626', bg:'#fef2f2'},
                    }
                    const ps = b.payment_status ?? 'unpaid'
                    const pStyle = PAY_STYLE[ps] ?? PAY_STYLE.unpaid
                    const nowD = new Date(); nowD.setHours(0,0,0,0)
                    const isOvd = b.due_date && new Date(b.due_date) < nowD && ps !== 'paid'
                    return (
                      <tr key={b.invoice_id} className="db__tr" onClick={e => setDrillDown({ title: b.vendor_name || 'Unknown Vendor', subtitle: `Invoice · ${fmtDate(b.created_at)}`, bills: [b], origin: calcOrigin(e) })}>
                        <td><span style={{ fontWeight:600, color:'#111827' }}>{b.vendor_name || '—'}</span></td>
                        <td style={{ color:'#6b7280' }}>{b.created_at ? new Date(b.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '—'}</td>
                        <td><span style={{ fontWeight:700, color:'#111827' }}>{b.total_amount != null ? fmt(b.total_amount) : '—'}</span></td>
                        <td style={{ color: isOvd?'#dc2626':'#6b7280', fontWeight: isOvd?700:400 }}>
                          {b.due_date ? new Date(b.due_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '—'}
                          {isOvd && <span style={{ fontSize:10, marginLeft:4, color:'#dc2626' }}>▲</span>}
                        </td>
                        <td><span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99, background:meta.bg, color:meta.color, border:`1px solid ${meta.border}`, whiteSpace:'nowrap' }}>{meta.label}</span></td>
                        <td><span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:99, background:pStyle.bg, color:pStyle.color }}>{ps.charAt(0).toUpperCase()+ps.slice(1)}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          }
        </div>

      </div>

      {drillDown && <DrillDownPanel data={drillDown} onClose={() => setDrillDown(null)} onGoToBill={onGoToBill} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .db {
          padding: 24px 28px 40px;
          overflow-y: auto; height: 100%; box-sizing: border-box;
          background: #f1f5f9;
          display: flex; flex-direction: column; gap: 16px;
        }

        /* header */
        .db__hdr { display:flex; align-items:flex-start; justify-content:space-between; padding-bottom:4px; }
        .db__title { font-size:24px; font-weight:800; color:#0f172a; letter-spacing:-0.5px; }
        .db__sub   { font-size:13px; color:#94a3b8; margin-top:4px; }

        .db__btn {
          display:flex; align-items:center; gap:6px; padding:8px 16px;
          border-radius:9px; font-size:13px; font-weight:600; cursor:pointer; border:none;
          transition: all 0.15s;
        }
        .db__btn--primary { background:#2563eb; color:white; box-shadow:0 1px 4px rgba(37,99,235,0.35); }
        .db__btn--primary:hover { background:#1d4ed8; }
        .db__btn--ghost { background:white; color:#374151; border:1px solid #e2e8f0; }
        .db__btn--ghost:hover { background:#f8fafc; }

        /* hero KPIs */
        .db__hero-strip {
          display:grid; grid-template-columns:repeat(4,1fr); gap:14px;
        }
        .db__hero-kpi {
          border-radius:14px; padding:20px 20px 18px;
          box-shadow:0 4px 16px rgba(0,0,0,0.10);
          transition: transform 0.15s, box-shadow 0.15s;
          cursor:default;
        }
        .db__hero-kpi:hover { transform:translateY(-2px); box-shadow:0 8px 28px rgba(0,0,0,0.14); }

        /* secondary stats */
        .db__stats-row {
          display:grid; grid-template-columns:repeat(4,1fr); gap:14px;
        }
        .db__stat {
          border-radius:12px; border:1px solid; padding:16px;
          box-shadow:0 1px 3px rgba(0,0,0,0.04);
          transition: transform 0.15s;
        }
        .db__stat:hover { transform:translateY(-1px); }

        /* layout rows */
        .db__row { display:grid; gap:14px; }

        /* cards */
        .db__card {
          background:white; border:1px solid #e2e8f0; border-radius:14px;
          padding:22px; box-shadow:0 1px 4px rgba(0,0,0,0.05);
        }
        .db__card-title { font-size:15px; font-weight:700; color:#0f172a; }
        .db__card-sub   { font-size:12px; color:#94a3b8; margin-top:3px; }

        /* badges */
        .db__badge {
          display:inline-block; font-size:11px; font-weight:700;
          padding:2px 9px; border-radius:99px; border:1px solid;
        }
        .db__badge--red   { background:#fef2f2; color:#dc2626; border-color:#fecaca; }
        .db__badge--amber { background:#fffbeb; color:#d97706; border-color:#fde68a; }
        .db__badge--green { background:#f0fdf4; color:#059669; border-color:#a7f3d0; }

        /* row items */
        .db__row-item {
          display:flex; align-items:center; gap:12px;
          padding:10px 8px; border-radius:10px; cursor:pointer;
          transition:background 0.1s; margin-bottom:2px;
        }
        .db__row-item:hover { background:#f8fafc; }

        .db__link-btn {
          display:flex; align-items:center; justify-content:center; gap:4px;
          width:100%; padding:9px; margin-top:10px;
          border:none; background:none; color:#2563eb; font-size:12px; font-weight:600;
          cursor:pointer; border-radius:8px; transition:background 0.1s;
        }
        .db__link-btn:hover { background:#eff6ff; }

        /* table */
        .db__table { width:100%; border-collapse:collapse; font-size:13px; }
        .db__table th {
          text-align:left; font-size:11px; font-weight:600; color:#94a3b8;
          text-transform:uppercase; letter-spacing:0.05em;
          padding:0 12px 12px; border-bottom:2px solid #f1f5f9;
        }
        .db__table td { padding:12px 12px; color:#374151; border-bottom:1px solid #f8fafc; }
        .db__tr { cursor:pointer; transition:background 0.1s; }
        .db__tr:hover td { background:#f8fafc; }
        .db__tr:last-child td { border-bottom:none; }

        .db__empty { text-align:center; padding:32px 0; font-size:13px; color:#94a3b8; }

        /* drill-down panel */
        .db__drill-backdrop {
          position:fixed; inset:0; background:rgba(15,23,42,0.35);
          z-index:200; animation:dd-fade-in 0.3s ease;
        }
        .db__drill {
          position:fixed; top:50%; left:50%; z-index:201;
          width:460px; max-height:82vh;
          background:white; border-radius:16px;
          box-shadow:0 24px 80px rgba(0,0,0,0.22);
          display:flex; flex-direction:column;
          transform-origin:center center;
          animation:dd-zoom-open 0.32s cubic-bezier(0.34,1.28,0.64,1) forwards;
        }
        .db__drill-bill {
          padding:12px 0; border-bottom:1px solid #f1f5f9;
        }
        .db__drill-bill:last-child { border-bottom:none; }
        @keyframes dd-fade-in {
          from { opacity:0 } to { opacity:1 }
        }
        @keyframes dd-zoom-open {
          0%   { opacity:0.6; transform:translate(calc(-50% + var(--dd-dx,0px)), calc(-50% + var(--dd-dy,0px))) scale(0.06); border-radius:50%; }
          55%  { opacity:1;   transform:translate(-50%,-50%) scale(1.02); border-radius:20px; }
          75%  { transform:translate(-50%,-50%) scale(0.98); border-radius:16px; }
          100% { transform:translate(-50%,-50%) scale(1);    border-radius:16px; }
        }

        @media (max-width:1100px) {
          .db__hero-strip, .db__stats-row { grid-template-columns:repeat(2,1fr); }
          .db__row { grid-template-columns:1fr !important; }
        }
      `}</style>
    </>
  )
}
