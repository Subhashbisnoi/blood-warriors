import React, { useEffect, useState, useRef, memo } from 'react'
import { FileText, RefreshCw, AlertCircle, X, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight, Check, CornerDownLeft, Send, Pencil, ChevronDown } from 'lucide-react'

import { getAllCategories, addCustomCategory, syncCategoriesFromApi } from '../utils/categories'
const API_BASE = import.meta.env.VITE_API_URL ?? ''
import { Document, Page, pdfjs } from 'react-pdf'
import { fetchBills, fetchBillDetail, billAction, updateBill, updatePaymentStatus, fetchNotificationCount, invalidateDetailCache, invalidateBillsCache, bulkBillAction, fetchChainConfig, fetchDepartments, type Bill, type BillDetail, type ChainEntry, type BillAttachment } from '../api/invoices'
import { useAuth } from '../auth/AuthContext'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:      { bg: '#f3f4f6', color: '#6b7280', label: 'Draft' },
  PENDING:    { bg: '#fef3c7', color: '#d97706', label: 'Pending' },
  APPROVED:   { bg: '#d1fae5', color: '#059669', label: 'Approved' },
  PAID:       { bg: '#d1fae5', color: '#059669', label: 'Paid' },
  REJECTED:   { bg: '#fee2e2', color: '#dc2626', label: 'Rejected' },
  CANCELLED:  { bg: '#fee2e2', color: '#dc2626', label: 'Cancelled' },
}

function StatusBadge({ status, paymentStatus, statusLabel }: { status: string; paymentStatus?: string | null; statusLabel?: string | null }) {
  const key = status?.toUpperCase()
  const effectiveKey = (key === 'APPROVED' && paymentStatus === 'paid') ? 'PAID' : key
  const base = STATUS_STYLE[effectiveKey] ?? { bg: '#f3f4f6', color: '#6b7280', label: status }
  // Use chain-derived label for pending steps instead of raw status key
  const isPending = key?.startsWith('PENDING')
  const label = isPending && statusLabel ? `Pending: ${statusLabel}` : base.label
  const s = { ...base, label }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 12,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 600,
      whiteSpace: 'nowrap', verticalAlign: 'middle', cursor: 'default',
    }}>{s.label}</span>
  )
}

function fmt(val: string | null, type: 'date' | 'amount' | 'text', currency = 'INR') {
  if (!val) return <span style={{ color: '#d1d5db' }}>—</span>
  if (type === 'date') {
    return new Date(val as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  if (type === 'amount') {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(val as unknown as number)
  }
  return val
}

// ── Approval chain cache ─────────────────────────────────────────────────────
// Keyed by `${companyId}__${department}`. Populated eagerly when bills load.
const _chainCache = new Map<string, { id: number; label: string; role: string }[]>()

function chainCacheKey(companyId?: string, department?: string | null) {
  return `${companyId ?? ''}__${department ?? ''}`
}

export async function prefetchChains(companyId: string, departments: string[]) {
  const keys = ['', ...departments]  // '' = default chain
  await Promise.all(keys.map(async dept => {
    const key = chainCacheKey(companyId, dept || null)
    if (_chainCache.has(key)) return
    try {
      const steps = await fetchChainConfig(companyId, dept || undefined)
      if (steps.length > 0)
        _chainCache.set(key, steps.map((s, i) => ({ id: i + 1, label: s.label, role: s.role, assignees: s.assignees ?? [] })))
    } catch {}
  }))
}

// ── Approval chain helpers ───────────────────────────────────────────────────
function buildStatusActiveStep(steps: { id: number; label: string; role: string }[]): Record<string, number> {
  const approvalSteps = steps.filter((_, i) => i > 0)  // skip Submitted (id=1)
  const statuses = ['PENDING_APPROVER', 'PENDING_ACCOUNTANT', 'PENDING_FC']
  const map: Record<string, number> = { DRAFT: 1, NEEDS_REVISION: 1, APPROVED: 99 }
  approvalSteps.forEach((_, i) => {
    const status = statuses[i] ?? `PENDING_STEP_${i + 1}`
    map[status] = i + 2
  })
  return map
}

function stepStateFromChain(
  stepId: number, chain: ChainEntry[], status: string,
  statusActiveStep: Record<string, number>
) {
  const active = statusActiveStep[status] ?? 0
  const entries = chain.filter(c => c.step === stepId)

  if (entries.length) {
    const last = entries[entries.length - 1]
    if (last.action === 'approve' || last.action === 'approved') return 'approved'
    if (last.action === 'submit' || last.action === 'submitted') return active > stepId ? 'approved' : 'submitted'
    if (last.action === 'send_back') return active > stepId ? 'approved' : 'sent_back'
  }

  if (active > stepId) return 'approved'
  if (active === stepId) return 'pending'
  return 'idle'
}

function ApprovalStepper({ chain, status, onViewChain, companyId, department }: {
  chain: ChainEntry[]; status: string; onViewChain: () => void; companyId?: string; department?: string | null
}) {
  const cacheKey = chainCacheKey(companyId, department)
  const [apiSteps, setApiSteps] = useState<{ id: number; label: string; role: string; assignees?: string[] }[] | null>(
    _chainCache.get(cacheKey) ?? null
  )

  useEffect(() => {
    const cached = _chainCache.get(cacheKey)
    if (cached) { setApiSteps(cached); return }
    fetchChainConfig(companyId, department ?? undefined).then(steps => {
      if (steps.length > 0) {
        const mapped = steps.map((s, i) => ({ id: i + 1, label: s.label, role: s.role, assignees: s.assignees ?? [] }))
        _chainCache.set(cacheKey, mapped)
        setApiSteps(mapped)
      }
    }).catch(() => {})
  }, [cacheKey])

  // Skeleton while chain is loading
  if (!apiSteps) return (
    <div style={{ padding: '20px 0' }}>
      <style>{`
        @keyframes skel-shine {
          0%   { background-position: -400px 0 }
          100% { background-position:  400px 0 }
        }
        .skel {
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 800px 100%;
          animation: skel-shine 1.4s infinite linear;
          border-radius: 6px;
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {[1, 2, 3, 4].map((_, i) => (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 80 }}>
              <div className="skel" style={{ width: 28, height: 28, borderRadius: '50%' }} />
              <div className="skel" style={{ width: 64, height: 10 }} />
              <div className="skel" style={{ width: 48, height: 8 }} />
            </div>
            {i < 3 && <div className="skel" style={{ flex: 1, height: 3, borderRadius: 2, margin: '0 4px', marginBottom: 28 }} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  )

  const chainSteps       = apiSteps
  const statusActiveStep = buildStatusActiveStep(apiSteps)

  return (
    <div className="bm__stepper-wrap">
      <div className="bm__stepper">
        {(() => {
          // Pre-compute per-step revision info so connectors can look ahead
          const stepMeta = chainSteps.map(step => {
            const state         = stepStateFromChain(step.id, chain, status, statusActiveStep)
            const isDone        = state === 'approved' || state === 'submitted'
            const sendBackCount = chain.filter(c => c.step === step.id && c.action === 'send_back').length
            return { state, isDone, sendBackCount, hadRevision: isDone && sendBackCount > 0 }
          })

          return chainSteps.map((step, i) => {
            const { state, isDone, sendBackCount, hadRevision } = stepMeta[i]
            const isActive   = statusActiveStep[status] === step.id
            // Connector between step[i] and step[i+1] is "revised" if step[i+1] had send-backs
            const nextRevised = i < chainSteps.length - 1 && stepMeta[i + 1].hadRevision

            const actorEntry = chain.filter(c => c.step === step.id && (c.action === 'approve' || c.action === 'approved' || c.action === 'submit' || c.action === 'submitted')).slice(-1)[0]
              ?? chain.filter(c => c.step === step.id && c.action === 'send_back').slice(-1)[0]

            let dot = <span className="bm__dot bm__dot--idle" />
            if (isDone)                    dot = <span className="bm__dot bm__dot--ok"><Check size={9} strokeWidth={3} /></span>
            else if (state === 'sent_back') dot = <span className="bm__dot bm__dot--back"><CornerDownLeft size={9} strokeWidth={2.5} /></span>
            else if (isActive)             dot = <span className="bm__dot bm__dot--active" />

            return (
              <React.Fragment key={step.id}>
                <div className="bm__step">
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    {dot}
                    {hadRevision && (
                      <span title={`Sent back ${sendBackCount}×`} style={{
                        position: 'absolute', top: -4, right: -5,
                        background: '#f59e0b', color: '#fff',
                        borderRadius: '50%', width: 13, height: 13,
                        fontSize: 8, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1.5px solid #fff', lineHeight: 1,
                      }}>{sendBackCount}</span>
                    )}
                  </div>
                  <span className={`bm__step-lbl ${isActive ? 'bm__step-lbl--active' : ''} ${state === 'sent_back' ? 'bm__step-lbl--back' : ''} ${isDone ? 'bm__step-lbl--done' : ''}`}>
                    {step.label}
                  </span>
                  {actorEntry?.actor_name ? (
                    // Already acted — show who did it
                    <span className="bm__step-actor">
                      <span className="bm__step-actor-name">{actorEntry.actor_name}</span>
                      {actorEntry.actor_role && <span className="bm__step-actor-role">{actorEntry.actor_role.replace(/_/g, ' ')}</span>}
                    </span>
                  ) : (step.assignees ?? []).length > 0 && !isDone ? (
                    // Pending/idle step with specific assignees — show who will approve
                    <span className="bm__step-actor">
                      {(step.assignees ?? []).map((name, ni) => (
                        <span key={ni} className="bm__step-actor-name" style={{ color: isActive ? '#1d4ed8' : '#9ca3af' }}>
                          {name}{ni < (step.assignees ?? []).length - 1 ? ', ' : ''}
                        </span>
                      ))}
                      <span className="bm__step-actor-role" style={{ color: isActive ? '#93c5fd' : '#d1d5db' }}>
                        {step.role.replace(/_/g, ' ')}
                      </span>
                    </span>
                  ) : null}
                </div>
                {i < chainSteps.length - 1 && (
                  nextRevised && isDone ? (
                    <div style={{ flex: 1, minWidth: 12, display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, alignSelf: 'flex-start' }}>
                      {/* orange line going back (left) */}
                      <div style={{ height: 2, background: '#f59e0b', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: -1, top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '3px solid transparent', borderBottom: '3px solid transparent', borderRight: '5px solid #f59e0b' }} />
                      </div>
                      {/* green line going forward (right) */}
                      <div style={{ height: 2, background: '#10b981', position: 'relative' }}>
                        <span style={{ position: 'absolute', right: -1, top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '3px solid transparent', borderBottom: '3px solid transparent', borderLeft: '5px solid #10b981' }} />
                      </div>
                    </div>
                  ) : (
                    <div className={`bm__connector ${isDone ? 'bm__connector--done' : ''}`} />
                  )
                )}
              </React.Fragment>
            )
          })
        })()}
        {/* Done node */}
        <div className={`bm__connector ${status === 'APPROVED' ? 'bm__connector--done' : ''}`} />
        <div className="bm__step">
          <span className={`bm__dot ${status === 'APPROVED' ? 'bm__dot--ok' : 'bm__dot--idle'}`}>
            {status === 'APPROVED' && <Check size={9} strokeWidth={3} />}
          </span>
          <span className={`bm__step-lbl ${status === 'APPROVED' ? 'bm__step-lbl--done bm__step-lbl--active' : ''}`}>Done</span>
        </div>
      </div>
      {chain.length > 0 && (
        <button className="bm__view-chain" onClick={onViewChain}>
          View activity ({chain.length})
        </button>
      )}
    </div>
  )
}

// ── Stable PDF viewer — memoized so typing in comments never reloads the PDF ─
const PdfViewer = memo(function PdfViewer({
  uploadId, pageNum, pdfW, zoom, onLoaded, onError, pdfRef,
}: {
  uploadId: string
  pageNum: number
  pdfW: number
  zoom: number
  onLoaded: (n: number) => void
  onError: () => void
  pdfRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="bm__pdfbody" ref={pdfRef}>
      <Document
        file={`${API_BASE}/docs/${uploadId}`}
        onLoadSuccess={({ numPages }) => onLoaded(numPages)}
        onLoadError={onError}
        loading={<div style={{ color: '#9ca3af', fontSize: 13, marginTop: 60, textAlign: 'center' }}>Loading PDF…</div>}
        error={null}
      >
        <Page pageNumber={pageNum} width={Math.max(200, pdfW + zoom)} renderAnnotationLayer={false} renderTextLayer={false} />
      </Document>
    </div>
  )
})

// ── Full-screen modal ────────────────────────────────────────────────────────
function BillModal({ bill, origin, cachedDetail, onClose, onRefresh }: {
  bill: Bill; origin: string; cachedDetail: BillDetail | null
  onClose: () => void; onRefresh: () => void
}) {
  const { user } = useAuth()
  const [detail, setDetail]       = useState<BillDetail | null>(cachedDetail)
  const [detailErr, setDetailErr] = useState('')
  const [numPages, setNumPages]   = useState(0)
  const [pageNum, setPageNum]     = useState(1)
  const [zoom, setZoom]           = useState(0)
  const [pdfLoadErr, setPdfLoadErr] = useState(false)
  const pdfRef = useRef<HTMLDivElement>(null)
  const [pdfW, setPdfW]           = useState(0)

  // action panel
  const [comment, setComment]     = useState('')
  const [actionErr, setActionErr] = useState('')
  const [actioning, setActioning] = useState(false)

  // category tagging modal before approval
  const [showTagModal, setShowTagModal] = useState(false)
  const [tagItems, setTagItems] = useState<{id:string;item_name:string;category:string;total_amount:number|null;quantity:number|null;unit:string|null}[]>([])
  const [tagLoading, setTagLoading] = useState(false)

  const MEDICAL_CATS = ['Medicines','Logistics','Admin','IT','Food']
  const CAT_COLORS: Record<string,string> = {
    Medicines:'#dc2626',Logistics:'#d97706',Admin:'#7c3aed',IT:'#2563eb',Food:'#16a34a'
  }

  const openTagModal = async () => {
    setTagLoading(true)
    setShowTagModal(true)
    try {
      const token = localStorage.getItem('bw_token')
      const res = await fetch(`/api/inventory/bills/${bill.invoice_id}/items`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      setTagItems(data)
    } catch { setTagItems([]) }
    finally { setTagLoading(false) }
  }

  const handleTagApprove = async () => {
    // Save category tags first
    const token = localStorage.getItem('bw_token')
    await Promise.all(tagItems.map(item =>
      fetch('/api/inventory/items/category', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ item_id: item.id, category: item.category }),
      })
    ))
    setShowTagModal(false)
    await doAction('approve')
  }

  // edit mode
  const [editing, setEditing]     = useState(false)
  const [editData, setEditData]   = useState<Record<string, string>>({})
  const [editLineItems, setEditLineItems] = useState<{ line_number: number; product_name: string; hsn_code: string; quantity: string; unit: string; unit_price: string; tax_rate_percent: string; line_total: string }[]>([])
  const [saving, setSaving]       = useState(false)
  const [showChain, setShowChain] = useState(false)
  const [bmCategories, setBmCategories]         = useState<string[]>(getAllCategories)
  const [bmAddingCategory, setBmAddingCategory] = useState(false)
  useEffect(() => { syncCategoriesFromApi(user?.company_id).then(setBmCategories) }, [user?.company_id])
  const [bmNewCategory, setBmNewCategory]       = useState('')
  const [bmDepartments, setBmDepartments]       = useState<string[]>([])

  useEffect(() => {
    if (user?.company_id) fetchDepartments(user.company_id).then(setBmDepartments).catch(() => {})
  }, [user?.company_id])
  const [prioritySaving, setPrioritySaving]     = useState(false)

  // attachments
  const [uploading, setUploading]   = useState(false)
  const [previewAttach, setPreviewAttach] = useState<{ url: string; name: string; rect: DOMRect } | null>(null)
  const [expandedDiff, setExpandedDiff] = useState<number | null>(null)
  const attachInputRef = useRef<HTMLInputElement>(null)

  const handleAttachUpload = async (files: FileList | null) => {
    if (!files || !files.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('uploaded_by', user?.name ?? '')
        fd.append('company_id', user?.company_id ?? '')
        await fetch(`${API_BASE}/bills/${bill.invoice_id}/attachments`, { method: 'POST', body: fd })
      }
      reload()
    } finally {
      setUploading(false)
      if (attachInputRef.current) attachInputRef.current.value = ''
    }
  }

  const handleAttachDelete = async (attachmentId: string) => {
    await fetch(`${API_BASE}/bills/${bill.invoice_id}/attachments/${attachmentId}`, { method: 'DELETE' })
    reload()
  }

  useEffect(() => {
    setDetailErr('')
    // Always fetch fresh so any external change (email-link approval/revision) is reflected immediately.
    // cachedDetail is shown instantly as a placeholder while the request is in flight.
    invalidateDetailCache(bill.invoice_id)
    fetchBillDetail(bill.invoice_id)
      .then(setDetail)
      .catch(e => setDetailErr(e instanceof Error ? e.message : 'Failed to load'))
  }, [bill.invoice_id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const el = pdfRef.current; if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      setPdfW(prev => (prev === w ? prev : w))   // only update when width actually changes
    })
    ro.observe(el); setPdfW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const reload = () => {
    invalidateDetailCache(bill.invoice_id)
    invalidateBillsCache()
    fetchBillDetail(bill.invoice_id).then(d => { setDetail(d); onRefresh() }).catch(() => {})
  }

  const doAction = async (action: 'submit' | 'approve' | 'send_back') => {
    if (!user) return
    if (action === 'send_back' && !comment.trim()) { setActionErr('Please add a note explaining what needs to be corrected.'); return }
    setActioning(true); setActionErr('')
    try {
      await billAction(bill.invoice_id, { action, actor_role: user.role, actor_name: user.name, comment: comment || undefined })
      setComment('')
      reload()
    } catch (e: unknown) {
      setActionErr(e instanceof Error ? e.message : 'Action failed')
    } finally { setActioning(false) }
  }

  const doSaveEdit = async () => {
    if (!detail) return
    setSaving(true)
    // Only send fields that actually changed vs the loaded detail
    const orig = {
      vendor_name:     detail.vendor.name     ?? '',
      vendor_gstn:     detail.vendor.gstn     ?? '',
      invoice_date:    detail.invoice_date?.slice(0, 10) ?? '',
      due_date:        detail.due_date?.slice(0, 10)     ?? '',
      subtotal:        String(detail.subtotal        ?? ''),
      tax_amount:      String(detail.tax_amount      ?? ''),
      total_amount:    String(detail.total_amount    ?? ''),
      discount_amount: String(detail.discount_amount ?? ''),
      category:        detail.category ?? '',
      department:      detail.department ?? '',
    }
    const diff: Record<string, unknown> = {}
    if (editData.vendor_name     !== orig.vendor_name)     diff.vendor_name     = editData.vendor_name     || undefined
    if (editData.vendor_gstn     !== orig.vendor_gstn)     diff.vendor_gstn     = editData.vendor_gstn     || undefined
    if (editData.invoice_date    !== orig.invoice_date)    diff.invoice_date    = editData.invoice_date    || undefined
    if (editData.due_date        !== orig.due_date)        diff.due_date        = editData.due_date        || undefined
    if (editData.subtotal        !== orig.subtotal)        diff.subtotal        = editData.subtotal        ? parseFloat(editData.subtotal)        : undefined
    if (editData.tax_amount      !== orig.tax_amount)      diff.tax_amount      = editData.tax_amount      ? parseFloat(editData.tax_amount)      : undefined
    if (editData.total_amount    !== orig.total_amount)    diff.total_amount    = editData.total_amount    ? parseFloat(editData.total_amount)    : undefined
    if (editData.discount_amount !== orig.discount_amount) diff.discount_amount = editData.discount_amount ? parseFloat(editData.discount_amount) : undefined
    if (editData.category        !== orig.category)        diff.category        = editData.category ?? ''
    if (editData.department      !== orig.department)      diff.department      = editData.department ?? ''
    try {
      await updateBill(bill.invoice_id, { ...diff, actor_name: user?.name, actor_role: user?.role })
      setEditing(false); reload()
    } catch (e: unknown) {
      setActionErr(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const startEdit = () => {
    if (!detail) return
    setEditData({
      vendor_name:     detail.vendor.name || '',
      vendor_gstn:     detail.vendor.gstn || '',
      invoice_date:    detail.invoice_date?.slice(0, 10) || '',
      due_date:        detail.due_date?.slice(0, 10) || '',
      subtotal:        String(detail.subtotal ?? ''),
      tax_amount:      String(detail.tax_amount ?? ''),
      total_amount:    String(detail.total_amount ?? ''),
      discount_amount: String(detail.discount_amount ?? ''),
      category:        detail.category || '',
      department:      detail.department || '',
    })
    setEditLineItems(detail.line_items.map(li => ({
      line_number:       li.line_number,
      product_name:      li.product_name ?? '',
      hsn_code:          li.hsn_code ?? '',
      quantity:          li.quantity != null ? String(li.quantity) : '',
      unit:              li.unit ?? '',
      unit_price:        li.unit_price != null ? String(li.unit_price) : '',
      tax_rate_percent:  li.tax_rate_percent != null ? String(li.tax_rate_percent) : '',
      line_total:        li.line_total != null ? String(li.line_total) : '',
    })))
    setEditing(true)
  }

  const cur = detail?.currency_code || bill.currency_code || 'INR'
  const fmtAmt = (v: number | null | undefined) =>
    v != null ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v) : '—'
  const fmtDate = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  const status      = (detail?.status || bill.status)?.toUpperCase()
  const statusLabel = detail?.status_label ?? bill.status_label
  const badge       = STATUS_STYLE[status]
    ? { ...STATUS_STYLE[status], label: statusLabel ? `Pending: ${statusLabel}` : STATUS_STYLE[status].label }
    : { bg: '#f3f4f6', color: '#6b7280', label: statusLabel ? `Pending: ${statusLabel}` : status }
  const isOverdue = (detail?.due_date || bill.due_date) && new Date((detail?.due_date || bill.due_date)!) < new Date()
  const uploadId  = pdfLoadErr ? null : (detail?.upload_id || bill.upload_id)
  const role      = user?.role ?? ''

  // which actions can this role take right now?
  const canSubmit   = (status === 'DRAFT' || status === 'NEEDS_REVISION') && (role === 'member' || role === 'admin')
  const allowedRoles: string[]         = (detail?.allowed_roles     ?? bill.allowed_roles     ?? []) as string[]
  const allowedNames: string[] | null  = (detail?.allowed_usernames ?? bill.allowed_usernames ?? null) as string[] | null
  const nameOk      = !allowedNames || allowedNames.length === 0 || allowedNames.includes(user?.name ?? '') || role === 'admin'
  const canApprove  = allowedRoles.includes(role) && nameOk
  const canSendBack = canApprove
  // Editable when DRAFT/NEEDS_REVISION (member fixes) OR when sent back to an intermediate approver
  const canEdit     = (status === 'DRAFT' || status === 'NEEDS_REVISION') && (role === 'member' || role === 'admin')
                   || canApprove
  const hasAction   = canSubmit || canApprove || canSendBack

  function EField({ k, label, type = 'text' }: { k: string; label: string; type?: string }) {
    return (
      <div>
        <div className="bm__lbl">{label}</div>
        {editing && canEdit
          ? <input className="bm__input" type={type} value={editData[k] ?? ''} onChange={e => setEditData(p => ({ ...p, [k]: e.target.value }))} />
          : <div className="bm__val">{editData[k] || '—'}</div>}
      </div>
    )
  }

  function Field({ label, value, mono, wide }: { label: string; value: React.ReactNode; mono?: boolean; wide?: boolean }) {
    return (
      <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
        <div className="bm__lbl">{label}</div>
        <div className="bm__val" style={mono ? { fontFamily: 'monospace', fontSize: 12 } : {}}>{value ?? '—'}</div>
      </div>
    )
  }

  function SectionHead({ title }: { title: string }) {
    return <div style={{ gridColumn: '1 / -1' }} className="bm__section">{title}</div>
  }

  return (
    <>
    <div className="bm__overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bm__card" style={(() => { const [dx, dy] = origin.split(' '); return { '--bm-dx': dx, '--bm-dy': dy } as React.CSSProperties })()}>

        {/* ── Left: details ── */}
        <div className="bm__left">

          {/* Header */}
          <div className="bm__hdr">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ padding: '3px 12px', borderRadius: 12, background: badge.bg, color: badge.color, fontSize: 12, fontWeight: 700 }}>{badge.label}</span>
                {canEdit && !editing && <button className="bm__edit-btn" onClick={startEdit}><Pencil size={12} /> Edit</button>}
                {editing && <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>Editing…</span>}
              </div>
              <div className="bm__vendor">{detail?.vendor?.name || bill.vendor_name || 'Unknown Vendor'}</div>
              {(detail?.vendor?.gstn || bill.vendor_gstn) && <div className="bm__gstn">{detail?.vendor?.gstn || bill.vendor_gstn}</div>}
            </div>
            <button className="bm__close" onClick={onClose}><X size={18} /></button>
          </div>

          {/* Approval stepper */}
          {detail && <ApprovalStepper chain={detail.chain} status={status} onViewChain={() => setShowChain(s => !s)} companyId={user?.company_id} department={detail.department} />}

          {/* Submission note */}
          {detail && (() => {
            const submitEntry = detail.chain.find(c => (c.action === 'submit' || c.action === 'submitted') && c.comment)
            if (!submitEntry) return null
            return (
              <div className="bm__sub-note">
                <span className="bm__sub-note-label">Submission Note</span>
                <span className="bm__sub-note-text">"{submitEntry.comment}"</span>
                <span className="bm__sub-note-by">— {submitEntry.actor_name}</span>
              </div>
            )
          })()}

          {/* Full activity timeline — toggled by "View activity" */}
          {detail && showChain && detail.chain.length > 0 && (
            <div className="bm__history">
              {[...detail.chain].reverse().map((c, idx) => {
                const isSendBack    = c.action === 'send_back'
                const isApproved    = c.action === 'approve' || c.action === 'approved'
                const isPayment     = c.action?.startsWith('payment_')
                const isEdited      = c.action === 'edited'
                const isSubmit      = c.action === 'submit' || c.action === 'submitted'
                const isPriority    = c.action === 'priority_change'
                const payStatus     = c.action?.replace('payment_', '') as 'paid' | 'partial' | 'unpaid'
                const PAY_COLOR: Record<string,string> = { paid: '#059669', partial: '#d97706', unpaid: '#dc2626' }
                const PAY_BG: Record<string,string>    = { paid: '#d1fae5', partial: '#fef3c7', unpaid: '#fee2e2' }
                const dotColor   = isPriority ? '#7c3aed' : isEdited ? '#7c3aed' : isSendBack ? '#ef4444' : isApproved ? '#10b981' : isPayment ? (PAY_COLOR[payStatus] ?? '#6b7280') : '#2563eb'
                const dotBg      = isPriority ? '#ede9fe' : isEdited ? '#ede9fe' : isSendBack ? '#fee2e2' : isApproved ? '#d1fae5' : isPayment ? (PAY_BG[payStatus] ?? '#f3f4f6') : '#eff6ff'
                const verb       = isPriority ? 'changed priority' : isEdited ? 'edited bill' : isSendBack ? 'sent back' : isApproved ? 'approved' : isSubmit ? 'submitted' : isPayment ? `marked ${payStatus}` : c.action
                const diffs      = isEdited && c.comment ? c.comment.split(';').map(s => s.trim()).filter(Boolean) : []
                const isExpanded = expandedDiff === c.id
                return (
                  <div key={c.id} className="bm__tl-row">
                    <div className="bm__tl-left">
                      <div className="bm__tl-dot" style={{ background: dotBg, color: dotColor }}>
                        {isPriority ? <span style={{ fontSize: 9, fontWeight: 700 }}>P</span> : isEdited ? <Pencil size={9} /> : isSendBack ? <CornerDownLeft size={9} /> : isApproved ? <Check size={9} /> : isSubmit ? <Send size={9} /> : <span style={{ fontSize: 9 }}>₹</span>}
                      </div>
                      {idx < detail.chain.length - 1 && <div className="bm__tl-line" />}
                    </div>
                    <div className="bm__tl-body">
                      <div className="bm__tl-headline">
                        <span className="bm__tl-actor">{c.actor_name || 'System'}</span>
                        {c.actor_role && <span className="bm__tl-role">{c.actor_role.replace(/_/g, ' ')}</span>}
                        <span className="bm__tl-verb" style={{ color: dotColor }}>{verb}</span>
                      </div>
                      {isEdited && diffs.length > 0 && (
                        <button className="bm__tl-diff-toggle" onClick={() => setExpandedDiff(isExpanded ? null : c.id)}>
                          {isExpanded ? '▴ hide changes' : `▾ ${diffs.length} field${diffs.length > 1 ? 's' : ''} changed`}
                        </button>
                      )}
                      {isExpanded && (
                        <div className="bm__tl-diffs">
                          {diffs.map((d, i) => {
                            const [field, change] = d.split(':').map(s => s.trim())
                            const [oldVal, newVal] = (change ?? d).split('→').map(s => s.trim())
                            return (
                              <div key={i} className="bm__tl-diff-row">
                                <span className="bm__tl-diff-field">{field}</span>
                                <span className="bm__tl-diff-old">{oldVal}</span>
                                <span className="bm__tl-diff-arrow">→</span>
                                <span className="bm__tl-diff-new">{newVal}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {!isEdited && c.comment && <div className="bm__tl-comment">"{c.comment}"</div>}
                      <div className="bm__tl-ts">{c.created_at ? new Date(c.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="bm__scroll">
            {detailErr && <div style={{ padding: '12px 20px', color: '#ef4444', fontSize: 13 }}>{detailErr}</div>}
            {!detail && !detailErr && <div style={{ padding: '24px 20px', color: '#9ca3af', fontSize: 13 }}>Loading details…</div>}

            {detail && (
              <>
              <div className="bm__body">
                <div className="bm__hero">
                  <div className="bm__hero-lbl">Requested Amount (incl. GST)</div>
                  <div className="bm__hero-val">{fmtAmt(detail.total_amount)}</div>
                </div>

                <div className="bm__grid">
                  <SectionHead title="Vendor Details" />
                  {editing ? (
                    <>
                      <EField k="vendor_name" label="Vendor Name" /><EField k="vendor_gstn" label="Vendor GST / PAN" />
                    </>
                  ) : (
                    <>
                      <Field label="Vendor Name" value={detail.vendor.name} wide />
                      <Field label="Vendor GST / PAN" value={detail.vendor.gstn} mono />
                      <Field label="Vendor Email" value={detail.vendor.email} />
                    </>
                  )}

                  <SectionHead title="Buyer Details" />
                  <Field label="Buyer Name" value={detail.buyer.name} />
                  <Field label="Buyer GSTIN" value={detail.buyer.gstn} mono />

                  <SectionHead title="Bill Summary" />
                  <Field label="Bill Number" value={detail.bill_number || detail.id} mono wide />
                  {editing ? (
                    <>
                      <EField k="invoice_date" label="Bill Date" type="date" />
                      <EField k="due_date" label="Due Date" type="date" />
                      <EField k="subtotal" label="Subtotal" type="number" />
                      <EField k="discount_amount" label="Discount" type="number" />
                      <EField k="tax_amount" label="Tax Amount" type="number" />
                      <EField k="total_amount" label="Total Amount" type="number" />
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div className="bm__lbl">Category</div>
                        {bmAddingCategory ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input
                              className="bm__input"
                              autoFocus
                              placeholder="New category name…"
                              value={bmNewCategory}
                              onChange={e => setBmNewCategory(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const name = bmNewCategory.trim()
                                  if (name) {
                                    addCustomCategory(name)
                                    setBmCategories(getAllCategories())
                                    setEditData(p => ({ ...p, category: name }))
                                  }
                                  setBmAddingCategory(false); setBmNewCategory('')
                                } else if (e.key === 'Escape') {
                                  setBmAddingCategory(false); setBmNewCategory('')
                                }
                              }}
                              style={{ flex: 1 }}
                            />
                            <button type="button" style={{ padding: '0 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#2563eb', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                              onClick={() => {
                                const name = bmNewCategory.trim()
                                if (name) { addCustomCategory(name); setBmCategories(getAllCategories()); setEditData(p => ({ ...p, category: name })) }
                                setBmAddingCategory(false); setBmNewCategory('')
                              }}>Add</button>
                            <button type="button" style={{ padding: '0 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', fontSize: 12, cursor: 'pointer' }}
                              onClick={() => { setBmAddingCategory(false); setBmNewCategory('') }}>✕</button>
                          </div>
                        ) : (
                          <div style={{ position: 'relative' }}>
                            <select
                              className="bm__input"
                              style={{ appearance: 'none', paddingRight: 28, cursor: 'pointer' }}
                              value={editData.category ?? ''}
                              onChange={e => {
                                if (e.target.value === '__add__') { setBmAddingCategory(true) }
                                else { setEditData(p => ({ ...p, category: e.target.value })) }
                              }}
                            >
                              <option value="">Select category…</option>
                              {bmCategories.map(c => <option key={c} value={c}>{c}</option>)}
                              {user?.role === 'admin' && <option value="__add__">+ Add custom category…</option>}
                            </select>
                            <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                          </div>
                        )}
                      </div>
                      {user?.role === 'admin' && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div className="bm__lbl">Department</div>
                          <div style={{ position: 'relative' }}>
                            <select
                              className="bm__input"
                              style={{ appearance: 'none', paddingRight: 28, cursor: 'pointer' }}
                              value={editData.department ?? ''}
                              onChange={e => setEditData(p => ({ ...p, department: e.target.value }))}
                            >
                              <option value="">— No department —</option>
                              {bmDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                            <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }} />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <Field label="Bill Date" value={fmtDate(detail.invoice_date)} />
                      <Field label="Due Date" value={<span style={{ color: isOverdue ? '#ef4444' : undefined, fontWeight: isOverdue ? 600 : undefined }}>{fmtDate(detail.due_date)}</span>} />
                      {detail.payment_terms_days != null && <Field label="Payment Terms" value={`Net ${detail.payment_terms_days} days`} />}
                      <Field label="Subtotal" value={fmtAmt(detail.subtotal)} />
                      {(detail.discount_amount ?? 0) > 0 && <Field label="Discount" value={fmtAmt(detail.discount_amount)} />}
                      <Field label="Tax Amount" value={fmtAmt(detail.tax_amount)} />
                      <Field label="Total Amount" value={<strong style={{ fontSize: 15, color: '#111827' }}>{fmtAmt(detail.total_amount)}</strong>} />
                      <Field label="Amount Paid" value={fmtAmt(detail.amount_paid)} />
                      <Field label="Outstanding" value={<span style={{ color: (detail.outstanding_amount ?? 0) > 0 ? '#ef4444' : '#059669', fontWeight: 600 }}>{fmtAmt(detail.outstanding_amount)}</span>} />
                    </>
                  )}

                  {(editing ? editLineItems.length > 0 : detail.line_items.length > 0) && (
                    <>
                      <SectionHead title="Line Items" />
                      <div style={{ gridColumn: '1 / -1', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead><tr style={{ background: '#f9fafb' }}>
                            {['#', 'Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Tax%', 'Total'].map(h => (
                              <th key={h} style={{ padding: '6px 10px', fontWeight: 600, color: '#6b7280', textAlign: h === '#' ? 'center' : 'left', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {editing ? editLineItems.map((li, idx) => {
                              const upd = (k: keyof typeof li, v: string) => setEditLineItems(prev => prev.map((r, i) => i === idx ? { ...r, [k]: v } : r))
                              const liInp: React.CSSProperties = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 4, padding: '3px 6px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }
                              return (
                                <tr key={li.line_number} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={{ padding: '4px 8px', textAlign: 'center', color: '#9ca3af' }}>{li.line_number}</td>
                                  <td style={{ padding: '4px 6px', minWidth: 140 }}><input style={liInp} value={li.product_name} onChange={e => upd('product_name', e.target.value)} /></td>
                                  <td style={{ padding: '4px 6px', minWidth: 80 }}><input style={liInp} value={li.hsn_code} onChange={e => upd('hsn_code', e.target.value)} /></td>
                                  <td style={{ padding: '4px 6px', minWidth: 60 }}><input style={{ ...liInp, textAlign: 'right' }} type="number" value={li.quantity} onChange={e => upd('quantity', e.target.value)} /></td>
                                  <td style={{ padding: '4px 6px', minWidth: 50 }}><input style={liInp} value={li.unit} onChange={e => upd('unit', e.target.value)} /></td>
                                  <td style={{ padding: '4px 6px', minWidth: 80 }}><input style={{ ...liInp, textAlign: 'right' }} type="number" value={li.unit_price} onChange={e => upd('unit_price', e.target.value)} /></td>
                                  <td style={{ padding: '4px 6px', minWidth: 60 }}><input style={{ ...liInp, textAlign: 'right' }} type="number" value={li.tax_rate_percent} onChange={e => upd('tax_rate_percent', e.target.value)} /></td>
                                  <td style={{ padding: '4px 6px', minWidth: 80 }}><input style={{ ...liInp, textAlign: 'right' }} type="number" value={li.line_total} onChange={e => upd('line_total', e.target.value)} /></td>
                                </tr>
                              )
                            }) : detail.line_items.map(li => (
                              <tr key={li.line_number} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '6px 10px', textAlign: 'center', color: '#9ca3af' }}>{li.line_number}</td>
                                <td style={{ padding: '6px 10px', color: '#111827', fontWeight: 500 }}>{li.product_name || '—'}</td>
                                <td style={{ padding: '6px 10px', color: '#9ca3af', fontFamily: 'monospace', fontSize: 11 }}>{li.hsn_code || '—'}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{li.quantity ?? '—'}</td>
                                <td style={{ padding: '6px 10px' }}>{li.unit || '—'}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{li.unit_price != null ? fmtAmt(li.unit_price) : '—'}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{li.tax_rate_percent != null ? `${li.tax_rate_percent}%` : '—'}</td>
                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtAmt(li.line_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>

                {/* ── Attachments ── */}
                <div className="bm__attach-section">
                  <div className="bm__section" style={{ gridColumn: undefined, marginBottom: 10 }}>Supporting Documents</div>
                  <div className="bm__attach-list">
                    {(detail.attachments ?? []).length === 0 && (
                      <div className="bm__attach-empty">No attachments yet</div>
                    )}
                    {(detail.attachments ?? []).map((a: BillAttachment) => {
                      const url = `${API_BASE}/bills/${bill.invoice_id}/attachments/${a.id}/download`
                      const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.file_name)
                      return (
                        <div key={a.id} className="bm__attach-row">
                          <FileText size={14} style={{ color: '#6b7280', flexShrink: 0 }} />
                          <div className="bm__attach-info" style={{ cursor: isImage ? 'pointer' : 'default' }}
                            onClick={e => isImage
                              ? setPreviewAttach({ url, name: a.file_name, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })
                              : !isImage && window.open(url, '_blank')
                            }>
                            <span className="bm__attach-name" style={{ textDecoration: 'underline', color: '#2563eb', cursor: 'pointer' }}
                              onClick={e => { e.stopPropagation(); if (!isImage) window.open(url, '_blank') }}
                            >{a.file_name}</span>
                            <span className="bm__attach-meta">
                              {a.file_size ? `${(a.file_size / 1024).toFixed(0)} KB · ` : ''}
                              {a.uploaded_by || 'Unknown'} · {a.uploaded_at ? new Date(a.uploaded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                            </span>
                          </div>
                          <a href={url} download={a.file_name} className="bm__attach-dl" title="Download">↓</a>
                          <button className="bm__attach-del" onClick={() => handleAttachDelete(a.id)} title="Delete"><X size={12} /></button>
                        </div>
                      )
                    })}
                  </div>
                  <div className="bm__attach-upload">
                    <input ref={attachInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => handleAttachUpload(e.target.files)} />
                    <button className="bm__attach-btn" onClick={() => attachInputRef.current?.click()} disabled={uploading}>
                      {uploading ? 'Uploading…' : '+ Attach files'}
                    </button>
                  </div>
                </div>
              </div>

              </>
            )}
          </div>

          {/* ── Action panel (sticky footer) ── */}
          {(hasAction || editing) && (
            <div className="bm__actions">
              {actionErr && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{actionErr}</div>}

              {editing ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="bm__btn bm__btn--secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                  <button className="bm__btn bm__btn--primary" onClick={doSaveEdit} disabled={saving} style={{ flex: 1 }}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              ) : (
                <>
                  {(canSubmit || canApprove || canSendBack) && (
                    <textarea
                      className="bm__comment"
                      placeholder={
                        canSendBack ? 'Add a note (required for Send Back)…'
                        : canSubmit  ? 'Add a note to this submission (optional)…'
                        : 'Optional note…'
                      }
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      rows={2}
                    />
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {canSubmit && (
                      <button className="bm__btn bm__btn--primary" style={{ flex: 1 }} disabled={actioning} onClick={() => doAction('submit')}>
                        <Send size={13} /> {status === 'DRAFT' ? 'Submit for Approval' : 'Resubmit'}
                      </button>
                    )}
                    {canApprove && (
                      <button className="bm__btn bm__btn--approve" style={{ flex: 1 }} disabled={actioning} onClick={openTagModal}>
                        <Check size={13} /> Approve
                      </button>
                    )}
                    {canSendBack && (
                      <button className="bm__btn bm__btn--sendback" disabled={actioning} onClick={() => doAction('send_back')}>
                        <CornerDownLeft size={13} /> Send Back
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Right: PDF or No-PDF summary ── */}
        {uploadId ? (
          <div className="bm__right">
            <div className="bm__pdfbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button className="bm__pctrl" onClick={() => setZoom(z => z + 80)}><ZoomIn size={14} /></button>
                <button className="bm__pctrl" onClick={() => setZoom(z => z - 80)}><ZoomOut size={14} /></button>
                <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 4px' }} />
                <button className="bm__pctrl" onClick={() => { setZoom(0); setPageNum(1) }}><RotateCcw size={14} /></button>
              </div>
              {numPages > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>{`Page ${pageNum} of ${numPages}`}</span>}
              {numPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button className="bm__pctrl" disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)}><ChevronLeft size={14} /></button>
                  <button className="bm__pctrl" disabled={pageNum >= numPages} onClick={() => setPageNum(p => p + 1)}><ChevronRight size={14} /></button>
                </div>
              )}
            </div>
            <PdfViewer
              uploadId={uploadId}
              pageNum={pageNum}
              pdfW={pdfW}
              zoom={zoom}
              onLoaded={n => { setNumPages(n); setPageNum(1) }}
              onError={() => setPdfLoadErr(true)}
              pdfRef={pdfRef}
            />
          </div>
        ) : (
          /* ── No PDF: rich summary panel ── */
          <div className="bm__right bm__right--nopdf">
            <div style={{ padding: '28px 28px 12px', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={18} color="#9ca3af" />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>No Document Attached</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Bill entered manually</div>
                </div>
              </div>
            </div>

            <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', flex: 1 }}>

              {/* Amount card */}
              <div style={{ background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)', borderRadius: 14, padding: '20px 22px', color: '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Total Amount</div>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-1px', marginBottom: 10 }}>
                  {detail?.total_amount != null ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: detail.currency_code || 'INR', maximumFractionDigits: 0 }).format(detail.total_amount) : '—'}
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { label: 'Subtotal', val: detail?.subtotal },
                    { label: 'Tax', val: detail?.tax_amount },
                    { label: 'Discount', val: detail?.discount_amount },
                  ].map(r => r.val != null ? (
                    <div key={r.label}>
                      <div style={{ fontSize: 10, opacity: 0.65, marginBottom: 2 }}>{r.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(r.val)}
                      </div>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* Key details grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Invoice Date', val: detail?.invoice_date ? new Date(detail.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                  { label: 'Due Date', val: detail?.due_date ? new Date(detail.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' },
                  { label: 'Invoice No.', val: detail?.bill_number || '—' },
                  { label: 'Category', val: detail?.category || '—' },
                  { label: 'Department', val: detail?.department || '—' },
                  { label: 'Payment Terms', val: detail?.payment_terms_days != null ? `${detail.payment_terms_days} days` : '—' },
                  { label: 'Currency', val: detail?.currency_code || 'INR' },
                ].map(r => (
                  <div key={r.label} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', border: '1px solid #f3f4f6' }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{r.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{r.val}</div>
                  </div>
                ))}
              </div>

              {/* Vendor + Buyer */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { title: 'Vendor', name: detail?.vendor?.name, gstn: detail?.vendor?.gstn, email: detail?.vendor?.email },
                  { title: 'Buyer', name: detail?.buyer?.name, gstn: detail?.buyer?.gstn, email: null },
                ].map(p => (
                  <div key={p.title} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{p.title}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{p.name || '—'}</div>
                    {p.gstn && <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 2 }}>{p.gstn}</div>}
                    {p.email && <div style={{ fontSize: 11, color: '#6b7280' }}>{p.email}</div>}
                  </div>
                ))}
              </div>

              {/* Admin priority override */}
              {user?.role === 'admin' && detail?.status === 'APPROVED' && (
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    📌 Payment Priority
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {(['', 'p0', 'p1', 'p2', 'p3'] as const).map(val => {
                      const isAuto = val === ''
                      const meta = isAuto ? null : PRIORITY_META[val as NonNullable<PayPriority>]
                      const isSelected = (detail?.manual_priority ?? '') === val
                      return (
                        <button
                          key={val}
                          disabled={prioritySaving}
                          onClick={async () => {
                            if (isSelected) return
                            setPrioritySaving(true)
                            try {
                              const prevPriority = detail?.manual_priority || 'auto'
                              const newPriority  = val || 'auto'
                              await updateBill(detail!.invoice_id, { manual_priority: val || null, actor_name: user?.name, actor_role: user?.role })
                              // Log the priority change in the activity trail
                              await billAction(detail!.invoice_id, {
                                action: 'priority_change',
                                actor_role: user?.role ?? '',
                                actor_name: user?.name ?? '',
                                comment: `Priority changed from ${prevPriority.toUpperCase()} to ${newPriority.toUpperCase()}`,
                              }).catch(() => {})
                              invalidateDetailCache(detail!.invoice_id)
                              invalidateBillsCache(user?.company_id)
                              onRefresh?.()
                            } finally { setPrioritySaving(false) }
                          }}
                          style={{
                            padding: '4px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            cursor: isSelected ? 'default' : 'pointer',
                            border: isSelected ? '2px solid #7c3aed' : '1.5px solid #e5e7eb',
                            background: isSelected ? (meta ? meta.bg : '#f3e8ff') : '#fff',
                            color: isSelected ? (meta ? meta.color : '#7c3aed') : '#6b7280',
                            boxShadow: isSelected ? '0 0 0 2px #e9d5ff' : 'none',
                            transition: 'all 0.15s',
                            opacity: prioritySaving ? 0.5 : 1,
                          }}
                        >
                          {isAuto ? 'Auto' : meta!.label}
                        </button>
                      )
                    })}
                    {prioritySaving && <span style={{ fontSize: 11, color: '#9ca3af' }}>Saving…</span>}
                    {detail?.manual_priority && (
                      <span style={{ fontSize: 11, color: '#7c3aed', marginLeft: 4 }}>
                        Override active · <span style={{ color: '#9ca3af' }}>click Auto to reset</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Payment status */}
              {detail?.total_amount != null && (
                <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Payment Status</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                      {detail.amount_paid != null ? `₹${detail.amount_paid.toLocaleString('en-IN')} paid` : 'Unpaid'}
                    </div>
                  </div>
                  {detail.outstanding_amount != null && detail.outstanding_amount > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>Outstanding</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>₹{detail.outstanding_amount.toLocaleString('en-IN')}</div>
                    </div>
                  )}
                </div>
              )}

              {/* TDS deduction */}
              {detail?.tds_status && detail.tds_status !== 'NA' && (
                <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      TDS Deduction{detail.tds_section_code ? ` · ${detail.tds_section_code}` : ''}
                    </div>
                    {(() => {
                      const s = detail.tds_status.toUpperCase()
                      const meta = TDS_STATUS_META[s] ?? { bg: '#f3f4f6', color: '#6b7280', label: s }
                      return (
                        <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </span>
                      )
                    })()}
                  </div>
                  {detail.tds_status.toUpperCase() === 'CALCULATED' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                      {[
                        { label: 'Base Amount', val: detail.tds_base_amount != null ? `₹${Math.round(detail.tds_base_amount).toLocaleString('en-IN')}` : '—' },
                        { label: 'TDS Rate', val: detail.tds_rate != null ? `${detail.tds_rate}%` : '—' },
                        { label: 'TDS Amount', val: detail.tds_amount != null ? `₹${Math.round(detail.tds_amount).toLocaleString('en-IN')}` : '—' },
                        { label: 'Net Payable', val: detail.net_payable != null ? `₹${Math.round(detail.net_payable).toLocaleString('en-IN')}` : '—' },
                      ].map(r => (
                        <div key={r.label}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{r.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{r.val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {detail.tds_status.toUpperCase() === 'PENDING' && (
                    <div style={{ fontSize: 12, color: '#d97706' }}>TDS calculation pending — vendor category not yet assigned.</div>
                  )}
                  {detail.tds_status.toUpperCase() === 'ERROR' && (
                    <div style={{ fontSize: 12, color: '#dc2626' }}>TDS calculation failed. Check vendor category and section mapping.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Attachment image preview popover ── */}
      {previewAttach && (() => {
        const r = previewAttach.rect
        const popW = 220, popH = 180
        const top  = r.bottom + 6 + popH > window.innerHeight ? r.top - popH - 6 : r.bottom + 6
        const left = Math.min(r.left, window.innerWidth - popW - 12)
        return (
          <>
            <div onClick={() => setPreviewAttach(null)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
            <div style={{
              position: 'fixed', top, left, zIndex: 999,
              width: popW, background: '#fff',
              borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              border: '1px solid #e5e7eb', overflow: 'hidden',
            }}>
              <img
                src={previewAttach.url}
                alt={previewAttach.name}
                style={{ width: '100%', height: popH, objectFit: 'contain', display: 'block', background: '#f9fafb' }}
              />
              <div style={{ padding: '6px 10px', fontSize: 11, color: '#6b7280', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{previewAttach.name}</span>
                <a href={previewAttach.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#2563eb', textDecoration: 'none', flexShrink: 0 }}>Open ↗</a>
              </div>
            </div>
          </>
        )
      })()}
    </div>

    {/* ── Category Tagging Modal ── */}
    {showTagModal && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Tag Items Before Approving</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Assign a category to each line item from this bill</div>
            </div>
            <button onClick={() => setShowTagModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 20 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
            {tagLoading && <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>Loading items…</div>}
            {!tagLoading && tagItems.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
                No line items found for this bill.<br />
                <span style={{ fontSize: 12 }}>Approve directly — items will be created from the bill total.</span>
              </div>
            )}
            {tagItems.map((item, idx) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: idx < tagItems.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                    {item.quantity != null ? `Qty: ${item.quantity}${item.unit ? ' ' + item.unit : ''}` : ''}
                    {item.total_amount != null ? ` · ₹${item.total_amount.toLocaleString('en-IN')}` : ''}
                  </div>
                </div>
                <select
                  value={item.category || 'Other'}
                  onChange={e => setTagItems(prev => prev.map((it, i) => i === idx ? { ...it, category: e.target.value } : it))}
                  style={{ padding: '6px 10px', borderRadius: 8, border: `2px solid ${CAT_COLORS[item.category] ?? '#e5e7eb'}`, fontSize: 12, fontWeight: 600, color: CAT_COLORS[item.category] ?? '#374151', background: (CAT_COLORS[item.category] ?? '#6b7280') + '15', outline: 'none', cursor: 'pointer', minWidth: 160 }}
                >
                  {MEDICAL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowTagModal(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleTagApprove} disabled={actioning} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: actioning ? 0.6 : 1 }}>
              <Check size={14} /> {actioning ? 'Approving…' : tagItems.length > 0 ? 'Save Tags & Approve' : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ── Payment priority ─────────────────────────────────────────────────────────
// Returns a priority object based on due_date + bill value + payment_status
// Only applies to approved bills; others get null priority
//
// Base score from due date:
//   0 (P0) = overdue or due today
//   1 (P1) = due in 1–3 days
//   2 (P2) = due in 4–7 days
//   3 (P3) = due in 8+ days
//
// Value adjustment (applied to base score, clamped to 0–3):
//   High value  (> ₹50,000) → −1  (escalate — large bills need earlier attention)
//   Low value   (< ₹10,000) → +1  (de-escalate — small bills are less critical)
//   Medium value             →  0  (no change)
//
// done = paid → grey tick
export type PayPriority = 'p0' | 'p1' | 'p2' | 'p3' | 'done' | null

const PRIORITY_META: Record<NonNullable<PayPriority>, { label: string; color: string; bg: string; border: string; rank: number }> = {
  p0:   { label: 'P0', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', rank: 0 },
  p1:   { label: 'P1', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', rank: 1 },
  p2:   { label: 'P2', color: '#d97706', bg: '#fffbeb', border: '#fde68a', rank: 2 },
  p3:   { label: 'P3', color: '#059669', bg: '#f0fdf4', border: '#a7f3d0', rank: 3 },
  done: { label: '✓',  color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', rank: 4 },
}

const SCORE_TO_PRIORITY: PayPriority[] = ['p0', 'p1', 'p2', 'p3']

function getPayPriority(bill: Bill): PayPriority {
  const status = bill.status?.toUpperCase()
  if (!status || status === 'DRAFT') return null
  if (bill.payment_status === 'paid') return 'done'

  // Admin manual override takes precedence over auto-calculation
  if (bill.manual_priority && bill.manual_priority in PRIORITY_META) {
    return bill.manual_priority as PayPriority
  }

  if (!bill.due_date) return null                 // no due date → no priority yet

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days  = Math.round((new Date(bill.due_date).getTime() - today.getTime()) / 86400000)

  // Date-based score (0 = most urgent)
  let score = days <= 0 ? 0 : days <= 3 ? 1 : days <= 7 ? 2 : 3

  // Value-based adjustment
  const amount = bill.total_amount ?? 0
  if (amount > 50000)  score -= 1   // high-value bill → escalate
  else if (amount < 10000) score += 1   // low-value bill → de-escalate

  // Clamp to valid range
  score = Math.max(0, Math.min(3, score))

  return SCORE_TO_PRIORITY[score]
}

const TDS_STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  CALCULATED: { bg: '#d1fae5', color: '#059669', label: 'TDS' },
  NA:         { bg: '#f3f4f6', color: '#9ca3af', label: 'N/A' },
  PENDING:    { bg: '#fef3c7', color: '#d97706', label: '...'  },
  ERROR:      { bg: '#fee2e2', color: '#dc2626', label: 'ERR' },
}


function PriorityBadge({ bill, isAdmin, userName, userRole, companyId, onRefresh: _onRefresh }: {
  bill: Bill; isAdmin?: boolean; userName?: string; userRole?: string; companyId?: string; onRefresh?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [localPriority, setLocalPriority] = useState<string | null>(bill.manual_priority ?? null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setLocalPriority(bill.manual_priority ?? null) }, [bill.manual_priority])

  // Compute priority using localPriority (optimistic) instead of bill.manual_priority
  const effectiveBill = { ...bill, manual_priority: localPriority }
  const p = getPayPriority(effectiveBill as Bill)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handlePick = (val: string) => {
    setOpen(false)
    const prev = localPriority || 'auto'
    const next = val || 'auto'
    setLocalPriority(val || null)  // instant UI update — no waiting
    // Invalidate caches immediately so a page refresh fetches fresh data
    invalidateBillsCache(companyId)
    invalidateDetailCache(bill.invoice_id)
    // Save in background, don't block the UI
    updateBill(bill.invoice_id, { manual_priority: val || null, actor_name: userName ?? '', actor_role: userRole ?? '' })
      .then(() => {
        billAction(bill.invoice_id, {
          action: 'priority_change', actor_role: userRole ?? 'admin', actor_name: userName ?? 'Admin',
          comment: `Priority changed from ${prev.toUpperCase()} to ${next.toUpperCase()}`,
        }).catch(() => {})
      })
      .catch(() => setLocalPriority(bill.manual_priority ?? null))  // rollback on error
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days  = bill.due_date ? Math.round((new Date(bill.due_date).getTime() - today.getTime()) / 86400000) : null
  const isManual = !!localPriority && localPriority in PRIORITY_META && bill.payment_status !== 'paid'

  const isPaid = bill.payment_status === 'paid' || p === 'done'

  if (!p) {
    if (!isAdmin || isPaid) return <span style={{ color: '#d1d5db' }}>—</span>
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: '1px dashed #d1d5db', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', color: '#9ca3af', fontSize: 11 }}>
          Set
        </button>
        {open && <PriorityPicker current="" onPick={handlePick} />}
      </div>
    )
  }

  const m = PRIORITY_META[p]
  const canEdit = isAdmin && !isPaid
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
        <span
          onClick={() => canEdit && setOpen(o => !o)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center',
            fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8,
            background: m.bg, color: m.color, border: `1px solid ${m.border}`,
            whiteSpace: 'nowrap', letterSpacing: '0.02em', minWidth: 32,
            cursor: canEdit ? 'pointer' : 'default',
            opacity: 1,
          }}
        >
          {isManual && <span title="Admin override" style={{ fontSize: 10 }}>📌</span>}
          {m.label}
          {canEdit && <span style={{ fontSize: 9, marginLeft: 1 }}>▾</span>}
        </span>
        {open && <PriorityPicker current={localPriority ?? ''} onPick={handlePick} />}
      </div>
      {days !== null && p !== 'done' && (
        <span style={{ fontSize: 10, color: days <= 0 ? '#dc2626' : days <= 3 ? '#2563eb' : '#9ca3af', fontWeight: 600, paddingLeft: 2 }}>
          {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
        </span>
      )}
    </div>
  )
}

function PriorityPicker({ current, onPick }: { current: string; onPick: (v: string) => void }) {
  const options: { val: string; label: string; color: string; bg: string; border: string }[] = [
    { val: '', label: 'Auto', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
    ...(['p0','p1','p2','p3'] as const).map(v => ({ val: v, ...PRIORITY_META[v] })),
  ]
  return (
    <div style={{
      position: 'absolute', top: '110%', left: 0, zIndex: 200,
      background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      border: '1px solid #e5e7eb', padding: 6, minWidth: 100,
    }}>
      {options.map(o => (
        <button key={o.val} onClick={() => onPick(o.val)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '5px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
            background: current === o.val ? o.bg : 'transparent',
            fontWeight: current === o.val ? 700 : 500, fontSize: 12, color: o.color,
          }}
        >
          <span style={{ width: 28, textAlign: 'center', fontWeight: 800, fontSize: 11, padding: '2px 6px', borderRadius: 5, background: o.bg, border: `1px solid ${o.border}`, color: o.color }}>
            {o.val ? o.label : '~'}
          </span>
          {o.val ? o.label : 'Auto (calculated)'}
          {current === o.val && <span style={{ marginLeft: 'auto', fontSize: 10 }}>✓</span>}
        </button>
      ))}
    </div>
  )
}

// ── Payment status cell with popover ─────────────────────────────────────────
const PAY_META = {
  unpaid:  { label: 'Unpaid',   bg: '#fef2f2', color: '#dc2626', border: '#fecaca', dot: '#ef4444' },
  partial: { label: 'Partial',  bg: '#fffbeb', color: '#d97706', border: '#fde68a', dot: '#f59e0b' },
  paid:    { label: 'Paid',     bg: '#f0fdf4', color: '#059669', border: '#a7f3d0', dot: '#10b981' },
}

function PaymentCell({ bill, onUpdate }: { bill: Bill; onUpdate: (id: string, status: string, amount?: number) => Promise<void> }) {
  const [open, setOpen]       = useState(false)
  const [partialAmt, setPartialAmt] = useState('')
  const [saving, setSaving]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const ps  = (bill.payment_status ?? 'unpaid') as keyof typeof PAY_META
  const meta = PAY_META[ps] ?? PAY_META.unpaid
  const isApproved = bill.status?.toUpperCase() === 'APPROVED'

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  async function apply(status: string, amount?: number) {
    setSaving(true)
    try { await onUpdate(bill.invoice_id, status, amount) } catch { /* ignore */ }
    setSaving(false)
    setOpen(false)
    setPartialAmt('')
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const fmtInr  = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <div style={{ position: 'relative', display: 'inline-block' }} className="bp__tip-wrap">
        <button
          onClick={() => isApproved && setOpen(o => !o)}
          disabled={!isApproved}
          title={!isApproved ? 'Bill must be approved before marking payment' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px',
            borderRadius: 8, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
            ...(isApproved
              ? { border: `1px solid ${meta.border}`, background: meta.bg, color: meta.color, cursor: 'pointer' }
              : { border: '1px solid #e5e7eb', background: '#f9fafb', color: '#9ca3af', cursor: 'not-allowed' }
            ),
          }}
        >
          <span style={{
            width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
            background: isApproved ? meta.dot : '#d1d5db',
          }} />
          {meta.label}
          {ps === 'partial' && bill.amount_paid != null && (
            <span style={{ opacity: 0.7 }}>· {fmtInr(bill.amount_paid)}</span>
          )}
        </button>
        {bill.payment_updated_by && (
          <span className="bp__tip">
            by {bill.payment_updated_by}{bill.payment_updated_at ? ' · ' + fmtDate(bill.payment_updated_at) : ''}
          </span>
        )}
      </div>

      {open && isApproved && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 2000,
          background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 10, minWidth: 180,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Mark as
          </div>
          {(['unpaid', 'paid'] as const).map(s => (
            <button key={s} onClick={() => apply(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                padding: '7px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: ps === s ? PAY_META[s].bg : 'transparent',
                color: PAY_META[s].color, fontSize: 13, fontWeight: ps === s ? 700 : 500,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PAY_META[s].dot }} />
              {PAY_META[s].label}
              {saving && ps === s && <RefreshCw size={10} style={{ marginLeft: 'auto', animation: 'spin 1s linear infinite' }} />}
            </button>
          ))}

          {/* Partial paid */}
          <div style={{ borderTop: '1px solid #f3f4f6', marginTop: 6, paddingTop: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#d97706', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              Partially Paid
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <input
                type="number" min={0} placeholder="Amount paid"
                value={partialAmt}
                onChange={e => setPartialAmt(e.target.value)}
                style={{
                  flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb',
                  fontSize: 12, outline: 'none', minWidth: 0,
                }}
                onKeyDown={e => e.key === 'Enter' && partialAmt && apply('partial', parseFloat(partialAmt))}
              />
              <button
                disabled={!partialAmt || saving}
                onClick={() => apply('partial', parseFloat(partialAmt))}
                style={{
                  padding: '5px 10px', borderRadius: 6, border: 'none',
                  background: partialAmt ? '#f59e0b' : '#e5e7eb',
                  color: partialAmt ? 'white' : '#9ca3af',
                  fontSize: 12, fontWeight: 600, cursor: partialAmt ? 'pointer' : 'default',
                }}
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function BillsPage({ initialBillId, onBillOpened }: { initialBillId?: string; onBillOpened?: () => void } = {}) {
  const { user } = useAuth()
  const [bills, setBills]           = useState<Bill[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [selected, setSelected]     = useState<Bill | null>(null)
  const [origin, setOrigin]         = useState('center center')
  const [notifCount, setNotifCount] = useState(0)
  const [sortBy, setSortBy]         = useState<'default' | 'priority'>('priority')
  const [search, setSearch]               = useState('')
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [filterVendor, setFilterVendor]     = useState('')
  const [filterGstin, setFilterGstin]       = useState('')
  const [filterPayment, setFilterPayment]   = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo]     = useState('')
  const [filterDueFrom, setFilterDueFrom]   = useState('')
  const [filterDueTo, setFilterDueTo]       = useState('')
  const [filterAmtMin, setFilterAmtMin]     = useState('')
  const [filterAmtMax, setFilterAmtMax]     = useState('')
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'my_approval' | 'my_uploaded' | 'approved'>('all')

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkToast, setBulkToast]   = useState<{ succeeded: number; failed: number; action: string } | null>(null)

  // In-memory prefetch cache: invoice_id → BillDetail
  const detailCache = useRef<Map<string, BillDetail>>(new Map())

  const openBill = (bill: Bill, e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dx = cx - window.innerWidth  / 2
    const dy = cy - window.innerHeight / 2
    setOrigin(`${dx.toFixed(1)}px ${dy.toFixed(1)}px`)
    setSelected(bill)
  }

  const load = async (forceRefresh = false) => {
    setLoading(true); setError('')
    try {
      const list = await fetchBills(forceRefresh, user?.company_id, fresh => setBills(fresh), user?.role, user?.name)
      setBills(list)
      // Pre-fetch all dept chains so stepper renders instantly when a bill is opened
      if (user?.company_id) {
        const depts = [...new Set(list.map(b => b.department).filter(Boolean) as string[])]
        prefetchChains(user.company_id, depts)
      }
      // Detail pre-fetch removed — fetch on demand when user opens a bill
    }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load bills') }
    finally { setLoading(false) }
  }

  // Auto-open a bill when navigated from Vendors page
  useEffect(() => {
    if (!initialBillId || bills.length === 0) return
    const bill = bills.find(b => b.invoice_id === initialBillId)
    if (bill) {
      setOrigin('center center')
      setSelected(bill)
      onBillOpened?.()
    }
  }, [initialBillId, bills])

  // notification count + toasts for pending bills
  useEffect(() => {
    if (!user) return
    fetchNotificationCount(user.role, user.company_id).then(setNotifCount).catch(() => {})
  }, [user, bills])

  useEffect(() => { if (user !== undefined) load() }, [user?.company_id])

  useEffect(() => {
    if (!filterPanelOpen) return
    const h = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) setFilterPanelOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [filterPanelOpen])

  const filteredBills = bills.filter(b => {
    // Tab filter
    if (activeTab === 'my_approval') {
      const roleOk = (b.allowed_roles ?? []).includes(user?.role ?? '')
      const names  = b.allowed_usernames
      const nameOk = !names || names.length === 0 || names.includes(user?.name ?? '') || user?.role === 'admin'
      if (!(roleOk && nameOk)) return false
    }
    if (activeTab === 'my_uploaded') {
      const byMe = b.uploaded_by_name === user?.name || b.uploaded_by_name === user?.username
      if (!byMe) return false
    }
    if (activeTab === 'approved') {
      if (b.status?.toUpperCase() !== 'APPROVED') return false
    }
    // Members only see their own uploaded bills
    if (user?.role === 'member') {
      const byMe = b.uploaded_by_name === user?.name || b.uploaded_by_name === user?.username
      if (!byMe) return false
    }
    // Status multi-select
    if (filterStatuses.length > 0) {
      const hasPending = filterStatuses.includes('PENDING')
      const isPendingStatus = b.status === 'PENDING' || b.status?.startsWith('PENDING_')
      const directMatch = filterStatuses.includes(b.status)
      if (!(directMatch || (hasPending && isPendingStatus))) return false
    }
    // Payment
    if (filterPayment && (b.payment_status ?? 'unpaid') !== filterPayment) return false
    // Vendor name search
    if (search) {
      const q = search.toLowerCase()
      if (!(b.vendor_name?.toLowerCase().includes(q) || b.id?.toLowerCase().includes(q))) return false
    }
    // Vendor name filter
    if (filterVendor) {
      if (!b.vendor_name?.toLowerCase().includes(filterVendor.toLowerCase())) return false
    }
    // GSTIN filter
    if (filterGstin) {
      if (!b.vendor_gstn?.toLowerCase().includes(filterGstin.toLowerCase())) return false
    }
    // Bill date range
    if (filterDateFrom && b.invoice_date && b.invoice_date < filterDateFrom) return false
    if (filterDateTo   && b.invoice_date && b.invoice_date > filterDateTo)   return false
    // Due date range
    if (filterDueFrom && b.due_date && b.due_date < filterDueFrom) return false
    if (filterDueTo   && b.due_date && b.due_date > filterDueTo)   return false
    // Amount range
    if (filterAmtMin && (b.total_amount ?? 0) < parseFloat(filterAmtMin)) return false
    if (filterAmtMax && (b.total_amount ?? 0) > parseFloat(filterAmtMax)) return false
    return true
  })

  const displayBills = sortBy === 'priority'
    ? [...filteredBills].sort((a, b) => {
        const pa = getPayPriority(a)
        const pb = getPayPriority(b)
        const ra = pa ? PRIORITY_META[pa].rank : 99
        const rb = pb ? PRIORITY_META[pb].rank : 99
        if (ra !== rb) return ra - rb
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity
        return da - db
      })
    : filteredBills

  async function handlePaymentUpdate(invoiceId: string, status: string, amount?: number) {
    await updatePaymentStatus(invoiceId, {
      payment_status: status,
      ...(amount != null ? { amount_paid: amount } : {}),
      actor_name: user?.name,
      actor_role: user?.role,
    })
    invalidateBillsCache(user?.company_id)
    const now = new Date().toISOString()
    setBills(prev => prev.map(b =>
      b.invoice_id === invoiceId
        ? { ...b, payment_status: status, amount_paid: amount ?? (status === 'paid' ? b.total_amount : b.amount_paid),
            payment_updated_by: user?.name ?? null, payment_updated_at: now }
        : b
    ))
  }

  const allPageIds = displayBills.map(b => b.invoice_id)
  const allChecked = allPageIds.length > 0 && allPageIds.every(id => checkedIds.has(id))
  const someChecked = !allChecked && allPageIds.some(id => checkedIds.has(id))

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(prev => { const n = new Set(prev); allPageIds.forEach(id => n.delete(id)); return n })
    } else {
      setCheckedIds(prev => { const n = new Set(prev); allPageIds.forEach(id => n.add(id)); return n })
    }
  }

  const toggleOne = (id: string) => {
    setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const handleBulkAction = async (action: 'APPROVE' | 'PUSH_TALLY' | 'MARK_PAID') => {
    const ids = [...checkedIds]
    if (!ids.length || !user) return
    setBulkLoading(true)
    try {
      const res = await bulkBillAction({ bill_ids: ids, action, actor_name: user.name, actor_role: user.role, company_id: user.company_id })
      setBulkToast({ succeeded: res.succeeded, failed: res.failed, action })
      setCheckedIds(new Set())
      await load(true)
      setTimeout(() => setBulkToast(null), 5000)
    } catch {
      setBulkToast({ succeeded: 0, failed: ids.length, action })
      setTimeout(() => setBulkToast(null), 5000)
    } finally {
      setBulkLoading(false)
    }
  }

  const selectedBills = displayBills.filter(b => checkedIds.has(b.invoice_id))
  const approvableCount = selectedBills.filter(b => {
    const roleOk = (b.allowed_roles ?? []).includes(user?.role ?? '')
    const names  = b.allowed_usernames
    const nameOk = !names || names.length === 0 || names.includes(user?.name ?? '') || user?.role === 'admin'
    return roleOk && nameOk
  }).length
  const canBulkApprove = approvableCount > 0
  const approvedSelectedCount = selectedBills.filter(b => b.status === 'APPROVED').length
  const canBulkFinance = user?.role === 'admin' && approvedSelectedCount > 0

  return (
    <>
      <div className="bp">
        <div className="bp__header">
          {/* Left: title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <h1 className="bp__title" style={{ margin: 0 }}>Bills</h1>
            {notifCount > 0 && (
              <span className="bp__badge" title={`${notifCount} bill${notifCount > 1 ? 's' : ''} need your action`}>
                {notifCount}
              </span>
            )}
            <span className="bp__sub" style={{ margin: 0 }}>{loading ? 'Loading…' : `${filteredBills.length}${filteredBills.length !== bills.length ? ` / ${bills.length}` : ''} bill${bills.length !== 1 ? 's' : ''}`}</span>
          </div>

          {/* Right: upload + search + filters + sort + refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Upload Bill button */}
            <button
              onClick={() => window.location.href = '/bills/upload'}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Upload Bill
            </button>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search vendor, ID…"
                style={{ padding: '6px 10px 6px 28px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, width: 160, outline: 'none', background: '#f9fafb', color: '#111827' }}
              />
              <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none', fontSize: 13 }}>⌕</span>
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>}
            </div>

            {/* Filter button + panel */}
            <div ref={filterPanelRef} style={{ position: 'relative' }}>
              {(() => {
                const activeCount = [
                  filterStatuses.length > 0, filterVendor, filterGstin, filterPayment,
                  filterDateFrom || filterDateTo, filterDueFrom || filterDueTo,
                  filterAmtMin || filterAmtMax,
                ].filter(Boolean).length
                return (
                  <button
                    onClick={() => setFilterPanelOpen(o => !o)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                      borderRadius: 7, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: activeCount > 0 ? '#eff6ff' : '#f9fafb',
                      color: activeCount > 0 ? '#1d4ed8' : '#374151',
                      borderColor: activeCount > 0 ? '#bfdbfe' : '#e5e7eb',
                    }}
                  >
                    ⊞ Filters{activeCount > 0 && <span style={{ background: '#2563eb', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{activeCount}</span>}
                  </button>
                )
              })()}

              {filterPanelOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 500,
                  width: 340, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.12)', padding: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Filters</span>
                    <button onClick={() => {
                      setFilterStatuses([]); setFilterVendor(''); setFilterGstin(''); setFilterPayment('')
                      setFilterDateFrom(''); setFilterDateTo(''); setFilterDueFrom(''); setFilterDueTo('')
                      setFilterAmtMin(''); setFilterAmtMax('')
                    }} style={{ fontSize: 11, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      Clear all
                    </button>
                  </div>

                  {/* Status multi-select */}
                  <div className="bp__filter-group">
                    <div className="bp__filter-label">Status</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        { v: 'PENDING', l: 'Pending' }, { v: 'APPROVED', l: 'Approved' },
                        { v: 'REJECTED', l: 'Rejected' }, { v: 'DRAFT', l: 'Draft' },
                        { v: 'CANCELLED', l: 'Cancelled' },
                      ].map(({ v, l }) => {
                        const on = filterStatuses.includes(v)
                        return (
                          <button key={v} onClick={() => setFilterStatuses(prev => on ? prev.filter(x => x !== v) : [...prev, v])}
                            style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: on ? '#2563eb' : '#f9fafb', color: on ? '#fff' : '#6b7280', borderColor: on ? '#2563eb' : '#e5e7eb' }}>
                            {l}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Vendor */}
                  <div className="bp__filter-group">
                    <div className="bp__filter-label">Vendor</div>
                    <input value={filterVendor} onChange={e => setFilterVendor(e.target.value)} placeholder="Vendor name…"
                      style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* GSTIN */}
                  <div className="bp__filter-group">
                    <div className="bp__filter-label">GSTIN</div>
                    <input value={filterGstin} onChange={e => setFilterGstin(e.target.value)} placeholder="GST number…"
                      style={{ width: '100%', padding: '6px 9px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                  </div>

                  {/* Bill Date range */}
                  <div className="bp__filter-group">
                    <div className="bp__filter-label">Bill Date</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                        style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 11, outline: 'none' }} />
                      <span style={{ alignSelf: 'center', color: '#9ca3af', fontSize: 11 }}>–</span>
                      <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                        style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 11, outline: 'none' }} />
                    </div>
                  </div>

                  {/* Due Date range */}
                  <div className="bp__filter-group">
                    <div className="bp__filter-label">Due Date</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input type="date" value={filterDueFrom} onChange={e => setFilterDueFrom(e.target.value)}
                        style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 11, outline: 'none' }} />
                      <span style={{ alignSelf: 'center', color: '#9ca3af', fontSize: 11 }}>–</span>
                      <input type="date" value={filterDueTo} onChange={e => setFilterDueTo(e.target.value)}
                        style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 11, outline: 'none' }} />
                    </div>
                  </div>

                  {/* Amount range */}
                  <div className="bp__filter-group">
                    <div className="bp__filter-label">Bill Amount</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" min={0} value={filterAmtMin} onChange={e => setFilterAmtMin(e.target.value)} placeholder="Min ₹"
                        style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 11, outline: 'none' }} />
                      <span style={{ color: '#9ca3af', fontSize: 11 }}>–</span>
                      <input type="number" min={0} value={filterAmtMax} onChange={e => setFilterAmtMax(e.target.value)} placeholder="Max ₹"
                        style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 11, outline: 'none' }} />
                    </div>
                  </div>

                  {/* Payment status */}
                  <div className="bp__filter-group" style={{ marginBottom: 0 }}>
                    <div className="bp__filter-label">Payment Status</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[{ v: '', l: 'All' }, { v: 'unpaid', l: 'Unpaid' }, { v: 'partial', l: 'Partial' }, { v: 'paid', l: 'Paid' }].map(({ v, l }) => (
                        <button key={v} onClick={() => setFilterPayment(v)}
                          style={{ flex: 1, padding: '4px 0', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: filterPayment === v ? '#2563eb' : '#f9fafb', color: filterPayment === v ? '#fff' : '#6b7280', borderColor: filterPayment === v ? '#2563eb' : '#e5e7eb' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Active filter chips */}
            {(filterStatuses.length > 0 || filterVendor || filterGstin || filterPayment || filterDateFrom || filterDateTo || filterDueFrom || filterDueTo || filterAmtMin || filterAmtMax) && (
              <button onClick={() => {
                setFilterStatuses([]); setFilterVendor(''); setFilterGstin(''); setFilterPayment('')
                setFilterDateFrom(''); setFilterDateTo(''); setFilterDueFrom(''); setFilterDueTo('')
                setFilterAmtMin(''); setFilterAmtMax('')
              }} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}>
                ✕ Clear filters
              </button>
            )}

            <div style={{ width: 1, height: 20, background: '#e5e7eb', flexShrink: 0 }} />

            <button
              onClick={() => setSortBy(s => s === 'priority' ? 'default' : 'priority')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px',
                borderRadius: 7, border: '1px solid', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                background: sortBy === 'priority' ? '#fef3c7' : 'white',
                color:      sortBy === 'priority' ? '#92400e' : '#374151',
                borderColor: sortBy === 'priority' ? '#fde68a' : '#e5e7eb',
              }}
            >
              ⚡ {sortBy === 'priority' ? 'Sorted by Priority' : 'Sort by Priority'}
            </button>
            <button className="bp__refresh" onClick={() => load(true)} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'bp__spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 0 }}>
          {([
            { key: 'all',         label: 'All Bills' },
            { key: 'my_approval', label: 'My Approvals' },
            { key: 'my_uploaded', label: 'My Uploaded' },
            { key: 'approved',    label: 'All Approved' },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
                color: activeTab === tab.key ? '#004080' : '#6b7280',
                borderBottom: activeTab === tab.key ? '2px solid #004080' : '2px solid transparent',
                marginBottom: -2, transition: 'color 0.15s',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bp__error"><AlertCircle size={16} />{error}</div>
        )}

        <div className="bp__wrap">
          <table className="bp__table">
            <thead>
              <tr>
                <th className="bp__th-check">
                  <input type="checkbox" className="bp__chk" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked }} onChange={toggleAll} />
                </th>
                <th>Priority</th>
                <th>Vendor</th>
                <th style={{ textAlign: 'right' }}>Bill Amount</th>
                <th>Uploaded By</th>
                <th>Status</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th>ID</th>
                <th>Category</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>Loading bills…</td></tr>
              )}
              {!loading && bills.length === 0 && !error && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af' }}>No bills found. Upload and ingest invoices to see them here.</td></tr>
              )}
              {displayBills.map(bill => (
                <tr key={bill.invoice_id} className={`bp__row${checkedIds.has(bill.invoice_id) ? ' bp__row--checked' : ''}`} onClick={e => openBill(bill, e)} style={{ cursor: 'pointer' }}>
                  <td className="bp__td-check" onClick={e => { e.stopPropagation(); toggleOne(bill.invoice_id) }}>
                    <input type="checkbox" className="bp__chk" checked={checkedIds.has(bill.invoice_id)} onClick={e => e.stopPropagation()} onChange={() => toggleOne(bill.invoice_id)} />
                  </td>
                  <td onClick={e => e.stopPropagation()}><PriorityBadge bill={bill} isAdmin={user?.role === 'admin'} userName={user?.name} userRole={user?.role} companyId={user?.company_id} onRefresh={() => load(true)} /></td>
                  <td>
                    <div className="bp__vendor">{bill.vendor_name ?? <span style={{ color: '#d1d5db' }}>Unknown</span>}</div>
                    {bill.vendor_gstn && <div className="bp__gstn">{bill.vendor_gstn}</div>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {bill.total_amount != null
                      ? fmt(bill.total_amount as unknown as string, 'amount', bill.currency_code)
                      : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                  <td>
                    {bill.uploaded_by_name
                      ? <span className="bp__uploaded">
                          <span>{bill.uploaded_by_name}</span>
                          {bill.uploaded_by_role && <span className="bp__uploaded-role">{bill.uploaded_by_role.replace(/_/g, ' ')}</span>}
                        </span>
                      : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                  <td><StatusBadge status={bill.status} paymentStatus={bill.payment_status} statusLabel={bill.status_label} /></td>
                  <td>{fmt(bill.invoice_date, 'date')}</td>
                  <td>
                    {bill.due_date
                      ? <span style={{ color: new Date(bill.due_date) < new Date() ? '#ef4444' : undefined }}>{fmt(bill.due_date, 'date')}</span>
                      : <span style={{ color: '#d1d5db' }}>—</span>}
                  </td>
                  <td><span className="bp__id" title={bill.id}>{bill.id ? bill.id.slice(0, 8) + '…' : '—'}</span></td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {bill.category
                        ? <span className="bp__category">{bill.category}</span>
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                      {bill.department && (
                        <span style={{ fontSize: 11, color: '#6366f1', background: '#eef2ff', borderRadius: 4, padding: '1px 6px', display: 'inline-block', fontWeight: 500 }}>
                          {bill.department}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <PaymentCell bill={bill} onUpdate={handlePaymentUpdate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk action bar */}
      {checkedIds.size > 0 && (
        <div className="bp__bulk-bar">
          <span className="bp__bulk-count">{checkedIds.size} selected</span>
          <button className="bp__bulk-clear" onClick={() => setCheckedIds(new Set())}><X size={13} /> Clear</button>
          <div className="bp__bulk-sep" />
          {canBulkApprove && (
            <button className="bp__bulk-btn bp__bulk-btn--approve" onClick={() => handleBulkAction('APPROVE')} disabled={bulkLoading}>
              <Check size={14} /> Approve{checkedIds.size > approvableCount ? ` (${approvableCount}/${checkedIds.size})` : ''}
            </button>
          )}
          {canBulkFinance && (
            <button className="bp__bulk-btn bp__bulk-btn--tally" onClick={() => handleBulkAction('PUSH_TALLY')} disabled={bulkLoading}>
              ⬆ Push to Tally{checkedIds.size > approvedSelectedCount ? ` (${approvedSelectedCount}/${checkedIds.size})` : ''}
            </button>
          )}
          {canBulkFinance && (
            <button className="bp__bulk-btn bp__bulk-btn--paid" onClick={() => handleBulkAction('MARK_PAID')} disabled={bulkLoading}>
              <Check size={14} /> Mark as Paid{checkedIds.size > approvedSelectedCount ? ` (${approvedSelectedCount}/${checkedIds.size})` : ''}
            </button>
          )}
          {bulkLoading && <span className="bp__bulk-spinner" />}
        </div>
      )}

      {/* Result toast */}
      {bulkToast && (
        <div className={`bp__toast ${bulkToast.failed > 0 && bulkToast.succeeded === 0 ? 'bp__toast--err' : bulkToast.failed > 0 ? 'bp__toast--warn' : 'bp__toast--ok'}`}>
          {bulkToast.failed === 0
            ? <><Check size={14} /> {bulkToast.succeeded} bill{bulkToast.succeeded !== 1 ? 's' : ''} updated</>
            : <>{bulkToast.succeeded} succeeded · {bulkToast.failed} failed</>}
          <button className="bp__toast-close" onClick={() => setBulkToast(null)}><X size={12} /></button>
        </div>
      )}

      {/* Full-screen modal */}
      {selected && <BillModal bill={selected} origin={origin} cachedDetail={detailCache.current.get(selected.invoice_id) ?? null} onClose={() => setSelected(null)} onRefresh={() => { detailCache.current.delete(selected.invoice_id); load(true) }} />}

      <style>{`
        /* ── Page ── */
        .bp {
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 28px 32px 16px;
          background: #f9fafb;
          overflow: hidden;
        }
        .bp__header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px; margin-bottom: 20px; flex-shrink: 0;
        }
        .bp__title { font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 2px; }
        .bp__sub   { font-size: 13px; color: #9ca3af; margin: 0; }
        .bp__badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 20px; height: 20px; padding: 0 6px;
          border-radius: 10px; background: #ef4444; color: #fff;
          font-size: 11px; font-weight: 700;
        }

        .bp__refresh {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px; border: 1px solid #e5e7eb;
          background: #fff; font-size: 13px; font-weight: 500; color: #374151; cursor: pointer;
        }
        .bp__refresh:hover { background: #f3f4f6; }
        .bp__refresh:disabled { opacity: 0.6; cursor: not-allowed; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .bp__spin { animation: spin 0.8s linear infinite; }

        .bp__error {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 16px; background: #fee2e2; border: 1px solid #fca5a5;
          border-radius: 8px; color: #dc2626; font-size: 13px; margin-bottom: 16px; flex-shrink: 0;
        }

        .bp__wrap {
          flex: 1; overflow: auto; background: #fff;
          border: 1px solid #e5e7eb; border-radius: 10px;
        }
        .bp__table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .bp__table thead tr { background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
        .bp__table th {
          padding: 11px 14px; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;
          text-align: left; white-space: nowrap; position: sticky; top: 0; background: #f9fafb; z-index: 1;
        }
        .bp__table td { padding: 12px 14px; color: #374151; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
        .bp__row:last-child td { border-bottom: none; }
        .bp__row:hover td { background: #f9fafb; }

        .bp__vendor { font-weight: 600; color: #111827; }
        .bp__gstn   { font-size: 11px; color: #9ca3af; margin-top: 2px; font-family: monospace; }
        .bp__filter-group { margin-bottom: 12px; }
        .bp__filter-label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
        .bp__tip-wrap { position: relative; }
        .bp__tip {
          position: absolute; bottom: calc(100% + 5px); left: 50%; transform: translateX(-50%);
          background: #1f2937; color: #fff; font-size: 11px; font-weight: 500;
          padding: 4px 8px; border-radius: 6px; white-space: nowrap; pointer-events: none;
          opacity: 0; transition: opacity 0.15s ease; z-index: 9999;
        }
        .bp__tip::after {
          content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
          border: 4px solid transparent; border-top-color: #1f2937;
        }
        .bp__tip-wrap:hover .bp__tip { opacity: 1; }
        .bp__category {
          font-size: 11px; font-weight: 600; color: #6366f1;
          background: #eef2ff; padding: 2px 8px; border-radius: 20px;
          white-space: nowrap;
        }
        .bp__id {
          font-family: monospace; font-size: 12px; color: #6b7280;
          background: #f3f4f6; padding: 2px 7px; border-radius: 5px;
        }
        .bp__uploaded {
          font-size: 12px; color: #374151; max-width: 160px;
          display: flex; flex-direction: column; gap: 1px;
        }
        .bp__uploaded-role {
          font-size: 11px; color: #9ca3af; text-transform: capitalize;
        }
        .bp__doc {
          color: #6b7280; cursor: pointer; transition: color 0.12s; display: inline-flex; text-decoration: none;
        }
        .bp__doc:hover { color: #2563eb; }

        /* ── Modal overlay ── */
        @keyframes bm-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes bm-zoom-open {
          0%   {
            opacity: 0.7;
            transform: translate(var(--bm-dx, 0px), var(--bm-dy, 0px)) scale(0.028);
            border-radius: 50%;
          }
          55%  {
            opacity: 1;
            transform: translate(0, 0) scale(1.018);
            border-radius: 20px;
          }
          75%  { transform: translate(0, 0) scale(0.992); border-radius: 16px; }
          100% { transform: translate(0, 0) scale(1);     border-radius: 16px; }
        }

        .bm__overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          animation: bm-fade-in 0.35s ease;
        }
        .bm__card {
          display: flex;
          width: 100%; height: 100%;
          max-width: 1400px;
          background: #fff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 25px 60px rgba(0,0,0,0.25);
          animation: bm-zoom-open 0.65s cubic-bezier(0.34, 1.06, 0.64, 1) forwards;
          transform-origin: center center;
        }

        /* ── Details (left) ── */
        .bm__left {
          flex: 0 0 58%;
          min-width: 0;
          border-right: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          background: #fff;
        }
        .bm__hdr {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 20px 24px 16px; border-bottom: 1px solid #f3f4f6; gap: 12px; flex-shrink: 0;
        }
        .bm__vendor { font-size: 18px; font-weight: 700; color: #111827; line-height: 1.3; }
        .bm__gstn   { font-size: 12px; color: #9ca3af; font-family: monospace; margin-top: 4px; }
        .bm__close {
          background: none; border: none; cursor: pointer; color: #9ca3af;
          padding: 4px; border-radius: 6px; display: flex; flex-shrink: 0; margin-top: 2px;
        }
        .bm__close:hover { background: #f3f4f6; color: #374151; }

        .bm__scroll { flex: 1; overflow-y: auto; }
        .bm__body   { padding: 20px 24px; }

        .bm__hero { margin-bottom: 20px; }
        .bm__hero-lbl { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 6px; }
        .bm__hero-val { font-size: 32px; font-weight: 800; color: #111827; }

        .bm__grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 14px 20px;
        }

        .bm__section {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; color: #374151;
          padding: 6px 0 6px; border-bottom: 2px solid #f3f4f6;
          margin-top: 4px; grid-column: 1 / -1;
        }

        .bm__lbl {
          font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 3px;
        }
        .bm__val   { font-size: 13px; color: #374151; font-weight: 500; word-break: break-word; }
        .bm__input {
          width: 100%; padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 6px;
          font-size: 13px; color: #111827; background: #fff; outline: none;
          box-sizing: border-box;
        }
        .bm__input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }

        /* ── Approval stepper ── */
        .bm__step { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; flex-shrink: 0; }
        .bm__step-lbl { font-size: 9px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
        .bm__step-lbl--active { color: #2563eb; }
        .bm__step-lbl--back   { color: #ef4444; }
        .bm__step-actor { display: flex; flex-direction: column; align-items: center; gap: 1px; margin-top: 1px; }
        .bm__step-actor-name { font-size: 9px; color: #374151; font-weight: 600; white-space: nowrap; max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
        .bm__step-actor-role { font-size: 8px; color: #9ca3af; text-transform: capitalize; white-space: nowrap; max-width: 80px; overflow: hidden; text-overflow: ellipsis; }

        .bm__dot {
          width: 20px; height: 20px; border-radius: 50%;
          border: 2px solid #e5e7eb; background: #fff;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .bm__dot--ok     { background: #10b981; border-color: #10b981; color: #fff; }
        .bm__dot--active { background: #2563eb; border-color: #2563eb; animation: pulse-dot 1.4s ease infinite; }
        .bm__dot--back   { background: #fee2e2; border-color: #ef4444; color: #ef4444; }
        .bm__dot--idle   { background: #f9fafb; border-color: #e5e7eb; }
        @keyframes pulse-dot { 0%,100% { box-shadow: 0 0 0 0 rgba(37,99,235,0.35); } 50% { box-shadow: 0 0 0 5px rgba(37,99,235,0); } }

        .bm__connector { flex: 1; height: 2px; background: #e5e7eb; min-width: 12px; margin-top: 11px; align-self: flex-start; }
        .bm__connector--done { background: #10b981; }
        .bm__connector--revised { background: repeating-linear-gradient(90deg, #10b981 0px, #10b981 6px, #f59e0b 6px, #f59e0b 10px); }
        .bm__step-lbl--done { color: #10b981; }

        /* ── Stepper wrapper + view-chain button ── */
        .bm__stepper-wrap { display: flex; flex-direction: column; border-bottom: 1px solid #f3f4f6; flex-shrink: 0; }
        .bm__stepper { display: flex; align-items: flex-start; padding: 12px 20px 10px; gap: 0; }
        .bm__view-chain {
          align-self: flex-end; margin: 0 20px 8px; padding: 3px 10px;
          font-size: 11px; font-weight: 600; color: #2563eb;
          background: #eff6ff; border: none; border-radius: 6px; cursor: pointer;
        }
        .bm__view-chain:hover { background: #dbeafe; }

        /* ── Activity timeline (toggled panel) ── */
        .bm__history {
          padding: 12px 20px 4px; background: #f9fafb;
          border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
          max-height: 320px; overflow-y: auto;
        }

        /* ── Attachments section ── */
        .bm__sub-note {
          display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px;
          margin: 0 20px 4px; padding: 8px 12px;
          background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
          font-size: 12px;
        }
        .bm__sub-note-label { font-weight: 700; color: #92400e; white-space: nowrap; }
        .bm__sub-note-text  { color: #78350f; font-style: italic; flex: 1; }
        .bm__sub-note-by    { color: #a16207; font-size: 11px; white-space: nowrap; }

        .bm__attach-section {
          padding: 16px 20px 0;
          border-top: 1px solid #f3f4f6;
          margin-top: 4px;
        }
        .bm__attach-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
        .bm__attach-empty { font-size: 12px; color: #9ca3af; padding: 4px 0 8px; }
        .bm__attach-row {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 10px; border: 1px solid #e5e7eb; border-radius: 8px;
          background: #fafafa;
        }
        .bm__attach-info { flex: 1; min-width: 0; }
        .bm__attach-name {
          display: block; font-size: 12px; font-weight: 600; color: #111827;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .bm__attach-meta { font-size: 10px; color: #9ca3af; }
        .bm__attach-dl {
          flex-shrink: 0; width: 26px; height: 26px; display: flex; align-items: center;
          justify-content: center; border-radius: 6px; background: #eff6ff; color: #2563eb;
          font-size: 14px; font-weight: 700; text-decoration: none; transition: background 0.12s;
        }
        .bm__attach-dl:hover { background: #dbeafe; }
        .bm__attach-del {
          flex-shrink: 0; width: 26px; height: 26px; display: flex; align-items: center;
          justify-content: center; border-radius: 6px; background: #fff5f5; border: 1px solid #fee2e2;
          color: #ef4444; cursor: pointer; transition: background 0.12s;
        }
        .bm__attach-del:hover { background: #fee2e2; }
        .bm__attach-upload { padding-bottom: 16px; }
        .bm__attach-btn {
          padding: 6px 14px; border: 1.5px dashed #d1d5db; border-radius: 8px;
          background: white; color: #6b7280; font-size: 12px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: border-color 0.12s, color 0.12s;
        }
        .bm__attach-btn:hover:not(:disabled) { border-color: #2563eb; color: #2563eb; }
        .bm__attach-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Audit timeline ── */
        .bm__timeline {
          padding: 16px 20px 20px;
          border-top: 1px solid #f3f4f6;
        }
        .bm__timeline-hdr {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.05em; color: #9ca3af; margin-bottom: 14px;
        }
        .bm__tl-row { display: flex; gap: 12px; }
        .bm__tl-left {
          display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 22px;
        }
        .bm__tl-dot {
          width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .bm__tl-line { flex: 1; width: 2px; background: #f3f4f6; margin: 3px 0; min-height: 10px; }
        .bm__tl-body { flex: 1; min-width: 0; padding-bottom: 14px; }
        .bm__tl-headline {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 2px;
        }
        .bm__tl-actor { font-size: 12px; font-weight: 700; color: #111827; }
        .bm__tl-role  {
          font-size: 10px; color: #9ca3af; background: #f3f4f6; border-radius: 4px;
          padding: 1px 5px; text-transform: capitalize;
        }
        .bm__tl-verb  { font-size: 11px; font-weight: 600; }
        .bm__tl-comment {
          font-size: 11px; color: #374151; background: #f9fafb; border-left: 2px solid #e5e7eb;
          padding: 3px 8px; border-radius: 0 4px 4px 0; margin: 4px 0;
          font-style: italic;
        }
        .bm__tl-ts { font-size: 10px; color: #9ca3af; margin-top: 2px; }
        .bm__tl-diff-toggle {
          background: none; border: none; padding: 2px 0; font-size: 10px;
          color: #7c3aed; cursor: pointer; font-family: inherit; font-weight: 600;
        }
        .bm__tl-diffs {
          margin-top: 4px; display: flex; flex-direction: column; gap: 3px;
          background: #faf5ff; border-radius: 6px; padding: 6px 10px;
        }
        .bm__tl-diff-row {
          display: flex; align-items: baseline; gap: 6px; font-size: 11px; flex-wrap: wrap;
        }
        .bm__tl-diff-field { font-weight: 700; color: #374151; min-width: 70px; }
        .bm__tl-diff-old   { color: #ef4444; text-decoration: line-through; font-family: monospace; font-size: 10px; }
        .bm__tl-diff-arrow { color: #9ca3af; }
        .bm__tl-diff-new   { color: #059669; font-family: monospace; font-size: 10px; font-weight: 600; }

        /* ── Action panel ── */
        .bm__actions {
          padding: 14px 20px; border-top: 1px solid #e5e7eb; background: #fff; flex-shrink: 0;
        }
        .bm__comment {
          width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px;
          font-size: 12px; resize: none; outline: none; color: #374151; box-sizing: border-box;
        }
        .bm__comment:focus { border-color: #2563eb; }

        .bm__btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
          border: none; cursor: pointer; transition: opacity 0.12s; white-space: nowrap;
        }
        .bm__btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .bm__btn--primary  { background: #2563eb; color: #fff; }
        .bm__btn--primary:hover:not(:disabled)  { background: #1d4ed8; }
        .bm__btn--secondary { background: #f3f4f6; color: #374151; }
        .bm__btn--secondary:hover:not(:disabled) { background: #e5e7eb; }
        .bm__btn--approve  { background: #10b981; color: #fff; }
        .bm__btn--approve:hover:not(:disabled)  { background: #059669; }
        .bm__btn--sendback { background: #fee2e2; color: #ef4444; }
        .bm__btn--sendback:hover:not(:disabled) { background: #fecaca; }

        /* ── Edit button ── */
        .bm__edit-btn {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 9px; border-radius: 6px; font-size: 11px; font-weight: 600;
          border: 1px solid #e5e7eb; background: #f9fafb; color: #6b7280; cursor: pointer;
        }
        .bm__edit-btn:hover { background: #f3f4f6; color: #374151; }

        /* ── PDF (right) ── */
        .bm__right {
          flex: 1; display: flex; flex-direction: column; background: #f9fafb; min-width: 0;
        }
        .bm__right--nopdf {
          background: #fff; border-left: 1px solid #e5e7eb;
        }
        .bm__pdfbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 14px; border-bottom: 1px solid #e5e7eb; background: #fff; flex-shrink: 0;
        }
        .bm__pdfbody {
          flex: 1; overflow: auto; display: flex; justify-content: center;
          padding: 20px; align-items: flex-start;
        }
        .bm__pctrl {
          background: none; border: none; cursor: pointer; padding: 5px 7px;
          border-radius: 6px; color: #6b7280; display: flex; align-items: center;
        }
        .bm__pctrl:hover { background: #f3f4f6; color: #111827; }
        .bm__pctrl:disabled { opacity: 0.35; cursor: not-allowed; }

        /* ── Notification toasts ── */
        @keyframes nt-slide-in {
          from { opacity: 0; transform: translateX(110%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .nt__stack {
          position: fixed; bottom: 24px; right: 24px; z-index: 2000;
          display: flex; flex-direction: column; gap: 10px; pointer-events: none;
        }
        .nt__toast {
          display: flex; align-items: center; gap: 12px;
          background: #fff; border: 1px solid #e5e7eb;
          border-left: 4px solid #2563eb;
          border-radius: 10px; padding: 12px 14px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12);
          min-width: 300px; max-width: 360px;
          pointer-events: all;
          animation: nt-slide-in 0.35s cubic-bezier(0.34,1.06,0.64,1) forwards;
        }
        .nt__icon { font-size: 18px; flex-shrink: 0; }
        .nt__body { flex: 1; min-width: 0; }
        .nt__title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #2563eb; margin-bottom: 2px; }
        .nt__vendor { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nt__amount { font-size: 11px; color: #6b7280; margin-top: 1px; }
        .nt__status { text-transform: capitalize; }
        .nt__btns { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }
        .nt__view {
          padding: 4px 10px; background: #2563eb; color: #fff;
          border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;
        }
        .nt__view:hover { background: #1d4ed8; }
        .nt__dismiss {
          background: none; border: none; color: #9ca3af; cursor: pointer;
          font-size: 13px; padding: 2px 4px; border-radius: 4px; line-height: 1;
        }
        .nt__dismiss:hover { color: #374151; background: #f3f4f6; }

        /* ── Tally badge ── */
        .bp__tally-badge {
          display: inline-block; padding: 2px 8px; border-radius: 99px;
          font-size: 11px; font-weight: 600;
        }
        .bp__tally-badge--queued { background: #ede9fe; color: #6d28d9; }
        .bp__tally-badge--no     { color: #d1d5db; }

        /* ── Checkboxes ── */
        .bp__th-check, .bp__td-check {
          width: 36px; padding: 0 4px 0 8px; text-align: center;
        }
        .bp__chk { width: 15px; height: 15px; cursor: pointer; accent-color: #2563eb; }
        .bp__row--checked { background: #eff6ff !important; }

        /* ── Bulk action bar ── */
        .bp__bulk-bar {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 8px;
          background: #1e293b; color: white; border-radius: 12px;
          padding: 10px 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.25);
          z-index: 200; white-space: nowrap;
        }
        .bp__bulk-count { font-size: 13px; font-weight: 700; }
        .bp__bulk-clear {
          display: flex; align-items: center; gap: 4px;
          background: none; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px;
          color: #94a3b8; font-size: 11px; font-weight: 600; cursor: pointer;
          padding: 4px 8px; font-family: inherit; transition: color 0.12s;
        }
        .bp__bulk-clear:hover { color: white; }
        .bp__bulk-sep { width: 1px; height: 20px; background: rgba(255,255,255,0.15); }
        .bp__bulk-btn {
          display: flex; align-items: center; gap: 5px;
          border: none; border-radius: 8px; font-size: 12px; font-weight: 700;
          cursor: pointer; padding: 7px 14px; font-family: inherit;
          transition: opacity 0.15s, transform 0.1s;
        }
        .bp__bulk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .bp__bulk-btn:not(:disabled):hover { transform: translateY(-1px); }
        .bp__bulk-btn--approve { background: #10b981; color: white; }
        .bp__bulk-btn--approve:not(:disabled):hover { background: #059669; }
        .bp__bulk-btn--tally   { background: #6366f1; color: white; }
        .bp__bulk-btn--tally:not(:disabled):hover { background: #4f46e5; }
        .bp__bulk-btn--paid    { background: #2563eb; color: white; }
        .bp__bulk-btn--paid:not(:disabled):hover { background: #1d4ed8; }
        .bp__bulk-spinner {
          width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%;
          animation: bp-spin 0.7s linear infinite;
        }
        @keyframes bp-spin { to { transform: rotate(360deg); } }

        /* ── Toast ── */
        .bp__toast {
          position: fixed; bottom: 88px; left: 50%; transform: translateX(-50%);
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 600;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15); z-index: 201; white-space: nowrap;
        }
        .bp__toast--ok   { background: #d1fae5; color: #065f46; }
        .bp__toast--warn { background: #fef3c7; color: #92400e; }
        .bp__toast--err  { background: #fee2e2; color: #991b1b; }
        .bp__toast-close {
          background: none; border: none; cursor: pointer; color: inherit;
          opacity: 0.6; padding: 0 0 0 4px; display: flex; align-items: center;
        }
        .bp__toast-close:hover { opacity: 1; }
      `}</style>
    </>
  )
}
