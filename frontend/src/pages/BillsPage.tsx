import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, RefreshCcw, Search, X, Filter, CheckCircle2,
  FileText, ExternalLink, Download, LayoutDashboard,
} from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

import apiClient from '../api/client'

interface Bill {
  id: string; bill_number: string | null; vendor_name: string | null
  bill_date: string | null; amount: number | null; category: string
  description: string | null; status: 'pending' | 'approved' | 'rejected'
  uploaded_by: string; uploaded_at: string; approved_by: string | null
  approved_at: string | null; rejection_note: string | null
  receipt_filename: string | null; receipt_original_name: string | null
  approval_log?: { action: string; actor: string; comment: string; at: string | null }[]
}

const CAT_ICONS: Record<string, string> = {
  'Medicines': '💊', 'Fluids/Juice': '🧃', 'Logistics': '🚚',
  'Food': '🍱', 'Equipment': '🩺', 'Other': '📦',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

function initials(name: string) {
  return name.split(' ').slice(0,2).map(w => w[0] || '').join('').toUpperCase() || '??'
}

// ── Full-screen Bill Modal (screenshot 4) ────────────────────────────────────

function BillModal({ bill: init, onClose, onUpdated }: {
  bill: Bill; onClose: () => void; onUpdated: () => void
}) {
  const [bill, setBill]             = useState(init)
  const [rejectNote, setRejectNote] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [working, setWorking]       = useState(false)
  const [err, setErr]               = useState('')
  const [pdfPages, setPdfPages]     = useState(0)
  const [pdfPage, setPdfPage]       = useState(1)

  useEffect(() => {
    apiClient.get(`/bills/${init.id}`).then(r => setBill(r.data)).catch(() => {})
  }, [init.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isPdf = bill.receipt_filename?.toLowerCase().endsWith('.pdf')
  const isImg = bill.receipt_filename && !isPdf
  const receiptUrl = bill.receipt_filename ? `/api/bills/receipt/${bill.receipt_filename}` : null

  async function doApprove() {
    setWorking(true); setErr('')
    try { await apiClient.post(`/bills/${bill.id}/approve`); onUpdated(); onClose() }
    catch (e: unknown) { setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed') }
    finally { setWorking(false) }
  }

  async function doReject() {
    if (!showReject) { setShowReject(true); return }
    setWorking(true); setErr('')
    try { await apiClient.post(`/bills/${bill.id}/reject`, null, { params: { note: rejectNote } }); onUpdated(); onClose() }
    catch (e: unknown) { setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed') }
    finally { setWorking(false) }
  }

  const steps = [
    { label: 'Submitted', who: bill.uploaded_by, done: true, rejected: false },
    { label: 'Pending Admin', who: 'admin@bloodwarriors.in', done: bill.status !== 'pending', rejected: false },
    { label: bill.status === 'rejected' ? 'Rejected' : 'Approved', who: bill.approved_by || '', done: bill.status === 'approved' || bill.status === 'rejected', rejected: bill.status === 'rejected' },
  ]

  return (
    <div className="bm2__overlay" onClick={e => { if (e.currentTarget === e.target) onClose() }}>
      <div className="bm2__card">

        {/* ── Left panel ── */}
        <div className="bm2__left">

          {/* Top row: status + close */}
          <div className="bm2__top-bar">
            <span className={`bm2__status-chip ${bill.status === 'approved' ? 'bm2__status-chip--approved' : bill.status === 'rejected' ? 'bm2__status-chip--rejected' : 'bm2__status-chip--pending'}`}>
              {bill.status === 'approved' ? 'Approved' : bill.status === 'rejected' ? 'Rejected' : 'Pending: Admin'}
            </span>
            <div style={{ flex: 1 }} />
            <button className="bm2__close" onClick={onClose}><X size={16} /></button>
          </div>

          {/* Vendor name */}
          <h2 className="bm2__vendor">{bill.vendor_name || '—'}</h2>
          <p className="bm2__bill-ref">{bill.bill_number || 'No reference number'}</p>

          {/* Approval stepper */}
          <div className="bm2__stepper">
            {steps.map((s, i) => (
              <div key={i} className="bm2__step">
                <div className={`bm2__step-dot ${s.done ? (s.rejected ? 'bm2__step-dot--reject' : 'bm2__step-dot--done') : (i === steps.findIndex(x => !x.done) ? 'bm2__step-dot--active' : '')}`}>
                  {s.done && !s.rejected && <CheckCircle2 size={10} color="white" />}
                  {s.rejected && <X size={10} color="white" />}
                </div>
                {i < steps.length - 1 && <div className={`bm2__step-line ${s.done ? 'bm2__step-line--done' : ''}`} />}
                <div className="bm2__step-info">
                  <span className="bm2__step-lbl">{s.label}</span>
                  <span className="bm2__step-who">{s.who}</span>
                </div>
              </div>
            ))}
          </div>

          {bill.approval_log && bill.approval_log.length > 0 && (
            <button className="bm2__activity-link">View activity ({bill.approval_log.length})</button>
          )}

          {/* Amount */}
          <div style={{ marginTop: 16 }}>
            <p className="bm2__amt-lbl">BILL AMOUNT</p>
            <p className="bm2__amt">{fmt(bill.amount)}</p>
          </div>
          <div className="bm2__divider" />

          {/* Vendor Details */}
          <div className="bm2__section-title">VENDOR DETAILS</div>
          <div className="bm2__fields">
            <div className="bm2__field">
              <span className="bm2__flbl">VENDOR NAME</span>
              <span className="bm2__fval">{bill.vendor_name || '—'}</span>
            </div>
            <div className="bm2__field">
              <span className="bm2__flbl">CATEGORY</span>
              <span className="bm2__fval">{CAT_ICONS[bill.category] || '📦'} {bill.category}</span>
            </div>
          </div>
          <div className="bm2__divider" />

          {/* Bill Summary */}
          <div className="bm2__section-title">BILL SUMMARY</div>
          <div className="bm2__fields">
            <div className="bm2__field">
              <span className="bm2__flbl">BILL NUMBER</span>
              <span className="bm2__fval">{bill.bill_number || '—'}</span>
            </div>
            <div className="bm2__field">
              <span className="bm2__flbl">BILL DATE</span>
              <span className="bm2__fval">{fmtDate(bill.bill_date)}</span>
            </div>
            <div className="bm2__field">
              <span className="bm2__flbl">UPLOADED BY</span>
              <span className="bm2__fval">{bill.uploaded_by}</span>
            </div>
            <div className="bm2__field">
              <span className="bm2__flbl">UPLOADED AT</span>
              <span className="bm2__fval">{fmtDate(bill.uploaded_at)}</span>
            </div>
          </div>

          {bill.description && (
            <>
              <div className="bm2__divider" />
              <div className="bm2__field">
                <span className="bm2__flbl">DESCRIPTION</span>
                <span className="bm2__fval" style={{ whiteSpace: 'pre-wrap', fontWeight: 400, color: '#374151' }}>{bill.description}</span>
              </div>
            </>
          )}

          {bill.rejection_note && (
            <>
              <div className="bm2__divider" />
              <div className="bm2__field">
                <span className="bm2__flbl" style={{ color: '#ef4444' }}>REJECTION NOTE</span>
                <span className="bm2__fval" style={{ color: '#ef4444' }}>{bill.rejection_note}</span>
              </div>
            </>
          )}

          {/* Attached receipt link */}
          {bill.receipt_filename && receiptUrl && (
            <>
              <div className="bm2__divider" />
              <div className="bm2__attach-row">
                <FileText size={13} color="#6b7280" />
                <span style={{ flex: 1, fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {bill.receipt_original_name || bill.receipt_filename}
                </span>
                <a href={receiptUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', display: 'flex', alignItems: 'center' }}>
                  <ExternalLink size={13} />
                </a>
              </div>
            </>
          )}

          {/* Note input + actions */}
          {bill.status === 'pending' && (
            <div className="bm2__actions">
              {showReject && (
                <textarea className="bm2__note-ta" placeholder="Add a note (required for rejection)…"
                  value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={2} />
              )}
              {err && <div style={{ fontSize: 12, color: '#ef4444', background: '#fee2e2', padding: '6px 10px', borderRadius: 5 }}>{err}</div>}
              {!showReject ? (
                <input className="bm2__note-inp" placeholder="Add a note (optional)…" />
              ) : null}
              <div className="bm2__action-row">
                {!showReject ? (
                  <>
                    <button className="bm2__btn bm2__btn--reject" onClick={doReject} disabled={working}>↩ Send Back</button>
                    <button className="bm2__btn bm2__btn--approve" onClick={doApprove} disabled={working}>
                      {working ? 'Approving…' : '✓ Approve'}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="bm2__btn bm2__btn--ghost" onClick={() => setShowReject(false)}>Cancel</button>
                    <button className="bm2__btn bm2__btn--reject" onClick={doReject} disabled={working || !rejectNote.trim()}>
                      {working ? 'Rejecting…' : 'Confirm Reject'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: PDF panel ── */}
        <div className="bm2__right">
          {/* Controls */}
          <div className="bm2__pdf-ctrls">
            <span style={{ fontSize: 11, color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Page 1 of {pdfPages || 1}
            </span>
            {pdfPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button className="bm2__pdf-btn" disabled={pdfPage <= 1} onClick={() => setPdfPage(p => p-1)}>‹</button>
                <span style={{ fontSize: 11, color: '#374151' }}>{pdfPage}/{pdfPages}</span>
                <button className="bm2__pdf-btn" disabled={pdfPage >= pdfPages} onClick={() => setPdfPage(p => p+1)}>›</button>
              </div>
            )}
            {receiptUrl && (
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="bm2__pdf-btn" style={{ textDecoration: 'none', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Download size={13} />
              </a>
            )}
          </div>

          {/* PDF body */}
          <div className="bm2__pdf-body">
            {isPdf && receiptUrl ? (
              <Document file={receiptUrl}
                onLoadSuccess={({ numPages }) => { setPdfPages(numPages); setPdfPage(1) }}
                loading={<div className="bm2__pdf-msg"><span className="bm2__spin" /></div>}
                error={<div className="bm2__pdf-msg" style={{ color: '#6b7280', fontSize: 12 }}>Could not load PDF</div>}
              >
                <Page pageNumber={pdfPage} width={380} renderAnnotationLayer={false} renderTextLayer={false} />
              </Document>
            ) : isImg && receiptUrl ? (
              <img src={receiptUrl} alt="receipt" style={{ maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }} />
            ) : (
              <div className="bm2__pdf-msg">
                <FileText size={40} color="#4b5563" />
                <span style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                  {bill.receipt_filename ? 'Loading receipt…' : 'No receipt attached'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Bills Table Page (screenshot 3) ──────────────────────────────────────────

const TABS = [
  { key: 'all', label: 'All Bills' },
  { key: 'pending', label: 'My Approvals' },
  { key: 'approved', label: 'All Approved' },
]

export default function BillsPage() {
  const navigate = useNavigate()

  const [bills, setBills]         = useState<Bill[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab]             = useState('all')
  const [search, setSearch]       = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [catFilter, setCatFilter] = useState('')
  const [selected, setSelected]   = useState<Bill | null>(null)
  const [checked, setChecked]     = useState<Set<string>>(new Set())
  const totalBills = bills.length

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true)
    try {
      const r = await apiClient.get('/bills', { params: { limit: 200 } })
      setBills(r.data)
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = bills.filter(b => {
    if (tab === 'pending'  && b.status !== 'pending')  return false
    if (tab === 'approved' && b.status !== 'approved') return false
    if (catFilter && b.category !== catFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return b.vendor_name?.toLowerCase().includes(q) ||
             b.bill_number?.toLowerCase().includes(q) ||
             b.category?.toLowerCase().includes(q) ||
             b.uploaded_by?.toLowerCase().includes(q) || false
    }
    return true
  })

  const pendingCount = bills.filter(b => b.status === 'pending').length

  async function bulkApprove() {
    const ids = [...checked].filter(id => bills.find(b => b.id === id)?.status === 'pending')
    await Promise.all(ids.map(id => apiClient.post(`/bills/${id}/approve`)))
    setChecked(new Set()); load(true)
  }

  return (
    <div className="bp2__root">
      {/* ── Header ── */}
      <div className="bp2__hdr">
        <div className="bp2__hdr-left">
          <h1 className="bp2__title">Bills</h1>
          {pendingCount > 0 && <span className="bp2__pending-badge">{pendingCount}</span>}
          <span className="bp2__count">{totalBills} bills</span>
        </div>
        <div className="bp2__hdr-right">
          <div className="bp2__search-wrap">
            <Search size={13} className="bp2__search-icon" />
            <input className="bp2__search" placeholder="Search vendor, ID…"
              value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button className="bp2__search-clr" onClick={() => setSearch('')}><X size={11} /></button>}
          </div>
          <button className={`bp2__filter-btn ${filterOpen ? 'bp2__filter-btn--on' : ''}`} onClick={() => setFilterOpen(o => !o)}>
            <Filter size={13} /> Filters
          </button>
          <button className="bp2__ghost-btn" onClick={() => navigate('/bills/dashboard')}>
            <LayoutDashboard size={13} /> Dashboard
          </button>
          <button className="bp2__ghost-btn" onClick={() => load(true)} title="Refresh">
            <RefreshCcw size={13} className={refreshing ? 'bp2__spinning' : ''} />
            Refresh
          </button>
          <button className="bp2__primary-btn" onClick={() => navigate('/bills/upload')}>
            <Plus size={14} /> Upload Bill
          </button>
        </div>
      </div>

      {/* Filter dropdown */}
      {filterOpen && (
        <div className="bp2__filter-bar">
          <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Category:</span>
          {['Medicines', 'Fluids/Juice', 'Logistics', 'Food', 'Equipment', 'Other'].map(c => (
            <button key={c} onClick={() => setCatFilter(catFilter === c ? '' : c)}
              className={`bp2__fchip ${catFilter === c ? 'bp2__fchip--on' : ''}`}>
              {CAT_ICONS[c]} {c}
            </button>
          ))}
          {catFilter && <button className="bp2__fchip bp2__fchip--clr" onClick={() => setCatFilter('')}><X size={10} /> Clear</button>}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="bp2__tabbar">
        {TABS.map(t => (
          <button key={t.key} className={`bp2__tab ${tab === t.key ? 'bp2__tab--active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'pending' && pendingCount > 0 && <span className="bp2__tab-dot">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {/* Bulk bar */}
      {checked.size > 0 && (
        <div className="bp2__bulk-bar">
          <span>{checked.size} selected</span>
          <button className="bp2__bulk-approve" onClick={bulkApprove}>✓ Approve Selected</button>
          <button className="bp2__bulk-clr" onClick={() => setChecked(new Set())}>Clear</button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bp2__table-wrap">
        {loading ? (
          <div className="bp2__loading"><span className="bp2__spin" /> Loading bills…</div>
        ) : visible.length === 0 ? (
          <div className="bp2__empty">
            <FileText size={40} color="#d1d5db" />
            <p>No bills found</p>
            {tab === 'all' && (
              <button className="bp2__primary-btn" style={{ marginTop: 8 }} onClick={() => navigate('/bills/upload')}>
                <Plus size={14} /> Upload First Bill
              </button>
            )}
          </div>
        ) : (
          <table className="bp2__table">
            <thead>
              <tr>
                <th className="bp2__th" style={{ width: 36 }}>
                  <input type="checkbox" className="bp2__chk"
                    checked={checked.size === visible.length && visible.length > 0}
                    onChange={e => setChecked(e.target.checked ? new Set(visible.map(b => b.id)) : new Set())} />
                </th>
                <th className="bp2__th">Vendor</th>
                <th className="bp2__th" style={{ textAlign: 'right' }}>Bill Amount</th>
                <th className="bp2__th">Uploaded By</th>
                <th className="bp2__th">Status</th>
                <th className="bp2__th">Invoice Date</th>
                <th className="bp2__th">ID</th>
                <th className="bp2__th">Category</th>
                <th className="bp2__th">Doc</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(bill => (
                <tr key={bill.id} className="bp2__tr" onClick={() => setSelected(bill)}>
                  <td className="bp2__td" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="bp2__chk" checked={checked.has(bill.id)}
                      onChange={e => { e.stopPropagation(); setChecked(prev => { const s = new Set(prev); s.has(bill.id) ? s.delete(bill.id) : s.add(bill.id); return s }) }} />
                  </td>
                  <td className="bp2__td">
                    <div className="bp2__vendor-cell">
                      <div className="bp2__av">{initials(bill.vendor_name || 'XX')}</div>
                      <div>
                        <div className="bp2__vname">{bill.vendor_name || '—'}</div>
                        {bill.bill_number && <div className="bp2__vref">{bill.bill_number}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="bp2__td" style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{fmt(bill.amount)}</td>
                  <td className="bp2__td bp2__td--muted">{bill.uploaded_by}</td>
                  <td className="bp2__td">
                    <span className={`bp2__badge bp2__badge--${bill.status}`}>
                      {bill.status === 'approved' ? 'Approved' : bill.status === 'rejected' ? 'Rejected' : 'Pending: Admin'}
                    </span>
                  </td>
                  <td className="bp2__td bp2__td--muted">{fmtDate(bill.bill_date)}</td>
                  <td className="bp2__td bp2__td--muted" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {bill.id.slice(0,8)}…
                  </td>
                  <td className="bp2__td">
                    <span className="bp2__cat-chip">{CAT_ICONS[bill.category] || '📦'} {bill.category}</span>
                  </td>
                  <td className="bp2__td">
                    {bill.receipt_filename
                      ? <FileText size={15} color="#2563eb" style={{ cursor: 'pointer' }} />
                      : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <BillModal
          bill={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { setSelected(null); load(true) }}
        />
      )}

      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
/* Root */
.bp2__root { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: white; }

/* Header */
.bp2__hdr { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px 0; flex-shrink: 0; gap: 12px; }
.bp2__hdr-left { display: flex; align-items: center; gap: 10px; }
.bp2__title { font-size: 22px; font-weight: 800; color: #111827; margin: 0; }
.bp2__pending-badge { background: #ef4444; color: white; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; }
.bp2__count { font-size: 13px; color: #9ca3af; font-weight: 500; }
.bp2__hdr-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.bp2__search-wrap { position: relative; }
.bp2__search-icon { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }
.bp2__search { padding: 7px 28px 7px 28px; border: 1px solid #e5e7eb; border-radius: 7px; font-size: 12px; color: #1f2937; outline: none; font-family: inherit; width: 180px; }
.bp2__search:focus { border-color: #2563eb; }
.bp2__search-clr { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #9ca3af; cursor: pointer; display: flex; padding: 2px; }
.bp2__filter-btn,.bp2__ghost-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border: 1px solid #e5e7eb; border-radius: 7px; background: white; font-size: 12px; font-weight: 600; color: #374151; cursor: pointer; font-family: inherit; white-space: nowrap; }
.bp2__filter-btn:hover,.bp2__ghost-btn:hover { background: #f3f4f6; }
.bp2__filter-btn--on { background: #eff6ff; border-color: #2563eb; color: #2563eb; }
.bp2__primary-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px; border-radius: 7px; background: #2563eb; color: white; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.bp2__primary-btn:hover { background: #1d4ed8; }
.bp2__spinning { animation: bp2Spin 0.7s linear infinite; }
@keyframes bp2Spin { to { transform: rotate(360deg); } }

/* Filter bar */
.bp2__filter-bar { display: flex; gap: 8px; align-items: center; padding: 8px 24px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; flex-shrink: 0; }
.bp2__fchip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 20px; border: 1px solid #e5e7eb; background: white; font-size: 12px; font-weight: 500; color: #374151; cursor: pointer; font-family: inherit; }
.bp2__fchip:hover { background: #f3f4f6; }
.bp2__fchip--on { background: #eff6ff; border-color: #2563eb; color: #2563eb; font-weight: 600; }
.bp2__fchip--clr { color: #ef4444; border-color: #fecaca; }

/* Tabs */
.bp2__tabbar { display: flex; border-bottom: 1px solid #e5e7eb; padding: 0 24px; margin-top: 14px; flex-shrink: 0; }
.bp2__tab { padding: 10px 14px; font-size: 13px; font-weight: 600; color: #6b7280; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-family: inherit; margin-bottom: -1px; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.bp2__tab:hover { color: #374151; }
.bp2__tab--active { color: #2563eb; border-bottom-color: #2563eb; }
.bp2__tab-dot { background: #ef4444; color: white; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 10px; }

/* Bulk bar */
.bp2__bulk-bar { display: flex; align-items: center; gap: 10px; padding: 8px 24px; background: #eff6ff; border-bottom: 1px solid #bfdbfe; font-size: 13px; font-weight: 600; color: #1d4ed8; flex-shrink: 0; }
.bp2__bulk-approve { padding: 5px 14px; border-radius: 5px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; background: #10b981; color: white; }
.bp2__bulk-approve:hover { background: #059669; }
.bp2__bulk-clr { padding: 5px 10px; border-radius: 5px; border: 1px solid #bfdbfe; background: none; color: #1d4ed8; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; margin-left: auto; }

/* Table */
.bp2__table-wrap { flex: 1; overflow-y: auto; }
.bp2__loading { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 56px; color: #6b7280; font-size: 13px; }
.bp2__empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 64px; color: #9ca3af; font-size: 13px; }
.bp2__table { width: 100%; border-collapse: collapse; }
.bp2__th { padding: 10px 16px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.4px; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap; background: white; }
.bp2__tr { cursor: pointer; }
.bp2__tr:hover .bp2__td { background: #f9fafb; }
.bp2__td { padding: 12px 16px; font-size: 13px; color: #1f2937; border-bottom: 1px solid #f3f4f6; vertical-align: middle; background: white; }
.bp2__td--muted { color: #6b7280; }
.bp2__chk { width: 14px; height: 14px; cursor: pointer; accent-color: #2563eb; }
.bp2__vendor-cell { display: flex; align-items: center; gap: 10px; }
.bp2__av { width: 30px; height: 30px; border-radius: 8px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.bp2__vname { font-size: 13px; font-weight: 600; color: #111827; }
.bp2__vref { font-size: 11px; color: #9ca3af; }
.bp2__badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
.bp2__badge--pending  { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.bp2__badge--approved { background: #d1fae5; color: #065f46; }
.bp2__badge--rejected { background: #fee2e2; color: #991b1b; }
.bp2__cat-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 20px; background: #ede9fe; color: #5b21b6; font-size: 11px; font-weight: 600; }
.bp2__spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #e5e7eb; border-top-color: #2563eb; animation: bp2Spin 0.7s linear infinite; display: inline-block; }

/* ── Full-screen modal ── */
.bm2__overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000;
  display: flex; align-items: stretch; justify-content: center;
}
.bm2__card {
  width: 100%; max-width: 1100px; display: flex;
  animation: bm2Slide 0.22s cubic-bezier(0.16,1,0.3,1) both;
}
@keyframes bm2Slide { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: none; } }

/* Left panel */
.bm2__left {
  flex: 0 0 58%; overflow-y: auto; padding: 28px 28px 32px; background: white;
  display: flex; flex-direction: column; gap: 0;
}
.bm2__top-bar { display: flex; align-items: center; margin-bottom: 18px; }
.bm2__status-chip { display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.bm2__status-chip--pending  { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.bm2__status-chip--approved { background: #d1fae5; color: #065f46; }
.bm2__status-chip--rejected { background: #fee2e2; color: #991b1b; }
.bm2__close { width: 28px; height: 28px; border-radius: 50%; background: #f3f4f6; border: none; color: #6b7280; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.bm2__close:hover { background: #e5e7eb; }
.bm2__vendor { font-size: 26px; font-weight: 800; color: #111827; margin: 0 0 4px; }
.bm2__bill-ref { font-size: 13px; color: #9ca3af; margin: 0 0 20px; }

/* Stepper */
.bm2__stepper { display: flex; align-items: flex-start; margin-bottom: 4px; }
.bm2__step { flex: 1; display: flex; align-items: flex-start; gap: 10px; position: relative; }
.bm2__step:not(:last-child) .bm2__step-line { position: absolute; left: 18px; right: 0; top: 9px; height: 2px; background: #e5e7eb; z-index: 0; }
.bm2__step-line--done { background: #10b981; }
.bm2__step-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #d1d5db; background: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative; z-index: 1; }
.bm2__step-dot--done   { background: #10b981; border-color: #10b981; }
.bm2__step-dot--reject { background: #ef4444; border-color: #ef4444; }
.bm2__step-dot--active { border-color: #3b82f6; background: #3b82f6; animation: bm2Pulse 1.8s ease-in-out infinite; }
@keyframes bm2Pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); } 50% { box-shadow: 0 0 0 5px rgba(59,130,246,0); } }
.bm2__step-info { display: flex; flex-direction: column; gap: 2px; }
.bm2__step-lbl { font-size: 10px; font-weight: 700; color: #374151; text-transform: uppercase; letter-spacing: 0.3px; }
.bm2__step-who { font-size: 10px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90px; }

.bm2__activity-link { background: none; border: none; color: #2563eb; font-size: 12px; cursor: pointer; font-family: inherit; padding: 0; margin: 6px 0; text-align: left; }
.bm2__activity-link:hover { text-decoration: underline; }

/* Amount */
.bm2__amt-lbl { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.6px; margin: 0 0 2px; }
.bm2__amt { font-size: 34px; font-weight: 800; color: #111827; margin: 0; }
.bm2__divider { height: 1px; background: #e5e7eb; margin: 16px 0; }

/* Section + fields */
.bm2__section-title { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 12px; }
.bm2__fields { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.bm2__field { display: flex; flex-direction: column; gap: 3px; }
.bm2__flbl { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
.bm2__fval { font-size: 14px; font-weight: 600; color: #111827; }
.bm2__attach-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 7px; }

/* Actions */
.bm2__actions { margin-top: auto; padding-top: 20px; display: flex; flex-direction: column; gap: 10px; }
.bm2__note-inp { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; font-family: inherit; outline: none; color: #374151; box-sizing: border-box; }
.bm2__note-inp::placeholder { color: #9ca3af; }
.bm2__note-inp:focus { border-color: #2563eb; }
.bm2__note-ta { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; font-family: inherit; outline: none; resize: none; box-sizing: border-box; }
.bm2__note-ta:focus { border-color: #ef4444; }
.bm2__action-row { display: flex; gap: 10px; }
.bm2__btn { flex: 1; padding: 12px; border-radius: 8px; border: none; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit; }
.bm2__btn--approve { background: #10b981; color: white; }
.bm2__btn--approve:hover:not(:disabled) { background: #059669; }
.bm2__btn--reject  { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.bm2__btn--reject:hover:not(:disabled) { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
.bm2__btn--ghost   { background: none; border: 1px solid #e5e7eb; color: #6b7280; }
.bm2__btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Right panel */
.bm2__right { flex: 0 0 42%; background: #0f172a; display: flex; flex-direction: column; overflow: hidden; }
.bm2__pdf-ctrls { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: white; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.bm2__pdf-btn { width: 26px; height: 26px; border-radius: 5px; border: 1px solid #e5e7eb; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; font-family: inherit; color: #374151; flex-shrink: 0; }
.bm2__pdf-btn:hover { background: #f3f4f6; }
.bm2__pdf-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bm2__pdf-body { flex: 1; overflow-y: auto; display: flex; align-items: flex-start; justify-content: center; padding: 12px; }
.bm2__pdf-msg { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px; }
.bm2__spin { width: 20px; height: 20px; border-radius: 50%; border: 3px solid #334155; border-top-color: #3b82f6; animation: bp2Spin 0.7s linear infinite; display: inline-block; }
`
