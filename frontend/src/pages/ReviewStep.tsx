import { useState, useRef, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  X, RotateCcw, CheckCircle2, ChevronDown,
  Calendar, ZoomIn, ZoomOut, FileText, Trash2,
  ChevronLeft, ChevronRight, Database, Paperclip, Send, MessageSquare,
} from 'lucide-react'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

import type { InvoicePayload, IngestResult, QueueItem } from '../api/invoices'
import { ingestInvoice, billAction, fetchUserDepartments, fetchDepartments, fetchChainConfig } from '../api/invoices'
import type { ChainStepAPI } from '../api/invoices'
import { getAllCategories, addCustomCategory, syncCategoriesFromApi } from '../utils/categories'

interface Props {
  data: InvoicePayload | null
  loading: boolean
  error: string
  file: File | null
  queue?: QueueItem[]
  queueIndex?: number
  onNav?: (i: number) => void
  onBack: () => void
  onDone: (result: IngestResult) => void
}

function F({ label, value, onChange, icon, type = 'text' }: {
  label: string; value: string | number | null | undefined
  onChange: (v: string) => void; icon?: React.ReactNode; type?: string
}) {
  return (
    <div className="f">
      <label className="f__lbl">{label}</label>
      <div className="f__wrap">
        <input className="f__inp" type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} />
        {icon && <span className="f__icon">{icon}</span>}
      </div>
    </div>
  )
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sec">
      <div className="sec__title">{title}</div>
      {children}
    </div>
  )
}

type LineItem = { description: string; hsn_sac: string; quantity: number | null; unit: string; rate: number | null; amount: number | null; account_id?: string | null; ledger_name?: string | null }

type LedgerAccount = { account_id: string; account_name: string; account_code: string | null; account_type: string | null }
type LedgerSuggestion = { account_id: string; account_name: string; account_code: string | null; confidence: 'high' | 'medium' | 'low' | 'none'; reason: string; uses: number }

export default function ReviewStep({ data, loading: ocrLoading, error: ocrError, file, queue = [], queueIndex = 0, onNav, onBack, onDone }: Props) {
  const { user } = useAuth()
  const [d, setD] = useState<InvoicePayload>(data ?? {})
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [dupWarning, setDupWarning]   = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkDone, setBulkDone]       = useState(0)
  const [numPages, setNumPages]         = useState(0)
  const [pageNum, setPageNum]           = useState(1)
  const [zoomDelta, setZoomDelta]       = useState(0)
  const [category, setCategory] = useState('')
  const [categories, setCategories]       = useState<string[]>(getAllCategories)
  const [addingCategory, setAddingCategory] = useState(false)
  const [userDepts, setUserDepts]          = useState<string[]>([])
  const [selectedDept, setSelectedDept]    = useState<string>(user?.department ?? '')
  useEffect(() => { syncCategoriesFromApi(user?.company_id).then(setCategories) }, [user?.company_id])
  useEffect(() => {
    if (!user?.company_id) return
    const loader = user.role === 'admin'
      ? fetchDepartments(user.company_id)
      : fetchUserDepartments(user.username, user.company_id)
    loader.then(depts => {
      setUserDepts(depts)
      setSelectedDept(depts.includes(user.department ?? '') ? (user.department ?? '') : (depts[0] ?? user.department ?? ''))
    }).catch(() => {})
  }, [user?.username, user?.company_id, user?.role])
  const [newCategoryText, setNewCategoryText] = useState('')
  const [showApprovals, setShowApprovals] = useState(false)
  const [supportingDocs, setSupportingDocs] = useState<File[]>([])
  const [noteText, setNoteText]             = useState('')
  const [notes, setNotes]                   = useState<{ text: string; ts: string }[]>([])
  const docInputRef = useRef<HTMLInputElement>(null)
  const [ledgers, setLedgers]               = useState<LedgerAccount[]>([])
  const [suggestions, setSuggestions]       = useState<Record<number, LedgerSuggestion[]>>({})
  const [ledgerOpen, setLedgerOpen]         = useState<number | null>(null)
  const [ledgerSearch, setLedgerSearch]     = useState('')
  const [ledgerAnchor, setLedgerAnchor]     = useState<{ top: number; left: number; width: number } | null>(null)
  const ledgerBtnRefs = useRef<Record<number, HTMLButtonElement | null>>({})
  const [enriching, setEnriching]           = useState(false)
  const [chainSteps, setChainSteps]         = useState<ChainStepAPI[]>([])

  useEffect(() => {
    fetchChainConfig(user?.company_id, selectedDept || undefined)
      .then(setChainSteps)
      .catch(() => setChainSteps([]))
  }, [selectedDept, user?.company_id])
  const [pageNaturalW, setPageNaturalW] = useState(0)
  const [pageNaturalH, setPageNaturalH] = useState(0)

  useEffect(() => {
    if (!data) return
    const withDue = { ...data }
    if (!withDue.due_date) {
      const computed = inferDueDate((withDue.invoice_date as string) || '', (withDue.payment_terms as string) || '')
      if (computed) withDue.due_date = computed
    }
    setD(withDue)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    // enrich-invoice not available in blood-warriors backend
    setEnriching(false)
  }, [data])

  useEffect(() => {
    if (ledgerOpen === null) return
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.rv__li-ledger-cell') && !(e.target as Element).closest('.rv__ledger-dropdown')) setLedgerOpen(null)
    }
    const onScroll = () => setLedgerOpen(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', onScroll, true)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('scroll', onScroll, true) }
  }, [ledgerOpen])

  useEffect(() => {
    // ledgers endpoint not available in blood-warriors backend
    setLedgers([])
  }, [user?.company_id])

  const fetchSuggestion = async (_idx: number, _item: LineItem) => {
    // ledger suggestions not available in blood-warriors backend
  }

  const previewRef = useRef<HTMLDivElement>(null)
  const [containerH, setContainerH] = useState(0)
  const [containerW, setContainerW] = useState(0)

  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const update = () => { setContainerH(el.clientHeight); setContainerW(el.clientWidth) }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [])

  const pdfUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  const set = (key: string, val: unknown) => setD(prev => ({ ...prev, [key]: val }))

  const inferDueDate = (billDate: string, paymentTerms: string): string => {
    if (!billDate) return ''
    let base: Date | null = null
    const ddmmyyyy = billDate.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/)
    if (ddmmyyyy) base = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}`)
    if (!base || isNaN(base.getTime())) base = new Date(billDate)
    if (!base || isNaN(base.getTime())) return ''
    let days = 30
    if (paymentTerms) {
      const lower = paymentTerms.toLowerCase().trim()
      if (/immediate|due on receipt|upon receipt|cash/.test(lower)) days = 0
      else { const m = lower.match(/(\d+)/); if (m) days = parseInt(m[1]) }
    }
    base.setDate(base.getDate() + days)
    return base.toLocaleDateString('en-GB').split('/').join('-')
  }

  const setWithDueDate = (key: 'invoice_date' | 'payment_terms', val: string) => {
    setD(prev => {
      const updated = { ...prev, [key]: val }
      if (!updated.due_date) {
        const billDate = (key === 'invoice_date' ? val : prev.invoice_date) as string
        const terms    = (key === 'payment_terms' ? val : prev.payment_terms) as string
        updated.due_date = inferDueDate(billDate || '', terms || '')
      }
      return updated
    })
  }
  const setN = (parent: string, key: string, val: unknown) =>
    setD(prev => ({ ...prev, [parent]: { ...((prev[parent] as Record<string, unknown>) ?? {}), [key]: val } }))

  const vendor     = (d.vendor       as Record<string, unknown>) ?? {}
  const buyer      = (d.buyer        as Record<string, unknown>) ?? {}
  const taxes      = (d.taxes        as Record<string, unknown>) ?? {}
  const bank       = (d.bank_details as Record<string, unknown>) ?? {}
  const lineItems  = ((d.line_items  as LineItem[]) ?? [])

  const updateLine = (i: number, key: string, val: unknown) => {
    const items = [...lineItems]
    items[i] = { ...items[i], [key]: val }
    set('line_items', items)
  }
  const addLine    = () => set('line_items', [...lineItems, { description: '', hsn_sac: '', quantity: null, unit: '', rate: null, amount: null }])
  const removeLine = (i: number) => set('line_items', lineItems.filter((_, idx) => idx !== i))

  const handleIngest = async () => {
    setLoading(true); setError(''); setDupWarning('')
    const payload = { ...d, _uploaded_by_name: user?.name, _uploaded_by_role: user?.role, _department: selectedDept || user?.department || null, _category: category || null }
    try {
      const result = await ingestInvoice(payload, user?.company_id)
      if (result.is_duplicate) {
        setDupWarning(`A bill with invoice ID "${result.duplicate_invoice_number}" has already been uploaded. The existing record has been updated.`)
        setLoading(false)
        return
      }
      if (result.invoice_id && user) {
        const noteComment = notes.map(n => n.text).join('\n') || undefined
        await billAction(result.invoice_id, { action: 'submit', actor_role: user.role, actor_name: user.name, comment: noteComment })
        const API_BASE = import.meta.env.VITE_API_URL ?? ''
        for (const f of supportingDocs) {
          const fd = new FormData()
          fd.append('file', f)
          fd.append('uploaded_by', user.name ?? '')
          fd.append('company_id', user.company_id ?? '')
          await fetch(`${API_BASE}/api/bills/${result.invoice_id}/attachments`, { method: 'POST', body: fd, headers: { 'Authorization': `Bearer ${localStorage.getItem('bw_token') ?? ''}` } })
        }
      }
      onDone(result)
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (e as { message?: string })?.message || 'Failed to send for approval')
    } finally { setLoading(false) }
  }

  const handleBulkIngest = async () => {
    if (!queue.length) return
    setBulkLoading(true); setBulkDone(0); setError('')
    try {
      await Promise.all(queue.map(async (item, i) => {
        const payload = i === queueIndex
          ? { ...d, _uploaded_by_name: user?.name, _uploaded_by_role: user?.role, _department: selectedDept || user?.department || null, _category: category || null }
          : { ...item.data, _uploaded_by_name: user?.name, _uploaded_by_role: user?.role, _department: selectedDept || user?.department || null }
        const result = await ingestInvoice(payload, user?.company_id)
        if (!result.invoice_id) throw new Error(`Bill ${i + 1}: ingest did not return an invoice ID`)
        if (!result.is_duplicate && user) {
          await billAction(result.invoice_id, { action: 'submit', actor_role: user.role, actor_name: user.name })
        } else if (result.is_duplicate && user) {
          try { await billAction(result.invoice_id, { action: 'submit', actor_role: user.role, actor_name: user.name }) } catch {}
        }
        setBulkDone(n => n + 1)
      }))
      onBack()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || (e as { message?: string })?.message || 'Bulk ingest failed')
    } finally { setBulkLoading(false) }
  }

  const fitWidth = (() => {
    if (!containerH || !pageNaturalW || !pageNaturalH) return 520
    const scaleByH = containerH / pageNaturalH
    const base = scaleByH * pageNaturalW
    return Math.max(280, base + zoomDelta)
  })()

  const total      = d.total_amount as number
  const invoiceNum = (d.invoice_number as string) || '—'
  const invoiceDate = (d.invoice_date as string) || '—'

  // suppress unused warning
  void containerW

  return (
    <div className="rv">

      {/* ── LEFT ─────────────────────────────────────────────── */}
      <div className="rv__left">

        {ocrLoading && (
          <div className="rv__skeleton">
            <div className="sk-hdr">
              <div className="sk sk-circle" />
              <div style={{ flex: 1 }}>
                <div className="sk sk-h1" />
                <div className="sk sk-h2" style={{ marginTop: 6 }} />
                <div className="sk sk-h3" style={{ marginTop: 5 }} />
              </div>
              <div className="sk sk-badge" />
            </div>
            <div className="sk sk-chip" />
            <div className="sk-sec">
              <div className="sk sk-sec-title" />
              <div className="sk-timeline">
                {[0,1,2,3].map(i => (
                  <div key={i} className="sk-tl-step">
                    <div className="sk sk-tl-dot" />
                    <div className="sk sk-tl-lbl" />
                    {i < 3 && <div className="sk-tl-line" />}
                  </div>
                ))}
              </div>
            </div>
            <div className="sk-sec">
              <div className="sk sk-amt-lbl" />
              <div className="sk sk-amt" style={{ marginTop: 5 }} />
            </div>
            <div className="sk-sec">
              <div className="sk sk-sec-title" />
              <div className="sk-g2">
                {[...Array(6)].map((_,i) => <div key={i} className="sk-field"><div className="sk sk-flbl"/><div className="sk sk-finp"/></div>)}
              </div>
            </div>
            <div className="rv__sk-ocr-label">
              <div className="rv__sk-bars">
                <span className="bar" style={{ animationDelay: '0s' }} />
                <span className="bar" style={{ animationDelay: '0.15s' }} />
                <span className="bar" style={{ animationDelay: '0.3s' }} />
                <span className="bar" style={{ animationDelay: '0.45s' }} />
                <span className="bar" style={{ animationDelay: '0.6s' }} />
              </div>
              <span>Extracting medical bill data with AI…</span>
            </div>
          </div>
        )}

        {ocrError && !ocrLoading && (
          <div className="rv__err" style={{ marginBottom: 0 }}>OCR failed: {ocrError}</div>
        )}

        {queue.length > 1 && onNav && (
          <div className="rv__nav">
            <button className="rv__nav-btn" disabled={queueIndex <= 0} onClick={() => onNav(queueIndex - 1)}>
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="rv__nav-info">{queueIndex + 1} / {queue.length}</span>
            <button className="rv__nav-btn" disabled={queueIndex >= queue.length - 1} onClick={() => onNav(queueIndex + 1)}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div className="rv__hdr" style={{ opacity: ocrLoading ? 0.35 : 1 }}>
          <button className="rv__close" onClick={onBack}><X size={15} /></button>
          <div className="rv__hdr-info">
            <h2 className="rv__num">{invoiceNum}</h2>
            <div className="rv__type">Medical Bill</div>
            <div className="rv__meta">{invoiceDate}{user?.name ? ` · by ${user.name}` : ''}</div>
          </div>
          <button className="rv__reset" onClick={() => data && setD({ ...data })}><RotateCcw size={13} /> Reset</button>
        </div>

        {enriching && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '5px 10px' }}>
            <span className="rv__spin-dark" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
            Running Recommendation...
          </div>
        )}

        <div className="rv__apr-wrap">
          <button className="rv__apr-btn" onClick={() => setShowApprovals(s => !s)}>
            <CheckCircle2 size={13} color="#10b981" /> Multi-Approval <ChevronDown size={11} />
          </button>
          {showApprovals && (
            <div className="rv__apr-pop">
              <div className="rv__apr-ttl">Approval Roles</div>
              {[
                { level: 1, role: 'Approver' },
                { level: 2, role: 'Accountant' },
                { level: 3, role: 'Finance Controller' },
              ].map(a => (
                <div key={a.level} className="rv__apr-row">
                  <CheckCircle2 size={13} color="#10b981" />
                  <span>Level {a.level}: <strong>{a.role}</strong></span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Sec title="Timeline">
          <div className="rv__tl">
            {[
              { label: 'Bill Uploaded', sub: user?.name ? `by ${user.name}` : '', done: true },
              ...chainSteps.filter(s => !s.locked).map(s => ({ label: s.label, sub: s.assignees?.join(', ') || '', done: false })),
              ...(chainSteps.filter(s => !s.locked).length === 0 ? [
                { label: 'Pending Approver', sub: '', done: false },
                { label: 'Pending Accountant', sub: '', done: false },
              ] : []),
              { label: 'Approved', sub: '', done: false },
            ].map((step, i) => (
              <div key={i} className="rv__tl-step">
                <div className={`rv__tl-dot ${step.done ? 'rv__tl-dot--done' : ''}`} />
                <div className="rv__tl-lbl">
                  <div>{step.label}</div>
                  {step.sub && <div>{step.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </Sec>

        <div>
          <div className="rv__amt-lbl">Requested Amount (incl. Tax)</div>
          <div className="rv__amt">₹{total ? total.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</div>
        </div>

        {/* Supplier Details */}
        <Sec title="Supplier Details">
          <div className="g2">
            <div className="f">
              <label className="f__lbl">Supplier Name</label>
              <div className="f__wrap f__wrap--sel">
                <input className="f__inp" value={(vendor.name as string) ?? ''} onChange={e => setN('vendor', 'name', e.target.value)} />
                <ChevronDown size={13} className="f__icon" />
              </div>
            </div>
            <div className="f">
              <label className="f__lbl">Bank Detail</label>
              <div className="f__wrap f__wrap--sel">
                <input className="f__inp" value={(bank.bank_name as string) ?? ''} onChange={e => setN('bank_details', 'bank_name', e.target.value)} />
                <ChevronDown size={13} className="f__icon" />
              </div>
            </div>
            <F label="Supplier GST/PAN"  value={vendor.gstin as string}  onChange={v => setN('vendor', 'gstin', v)} />
            <F label="Source of Supply" value={vendor.address as string || ''} onChange={v => setN('vendor', 'address', v)} />
            <F label="Supplier Phone"    value={vendor.phone as string}   onChange={v => setN('vendor', 'phone', v)} />
            <F label="Supplier Email"    value={vendor.email as string}   onChange={v => setN('vendor', 'email', v)} />
          </div>
        </Sec>

        <Sec title="Buyer Details">
          <div className="g2">
            <F label="Buyer Name"   value={buyer.name as string}   onChange={v => setN('buyer', 'name', v)} />
            <F label="Buyer GSTIN"  value={buyer.gstin as string}  onChange={v => setN('buyer', 'gstin', v)} />
            <F label="Buyer PAN"    value={buyer.pan as string}    onChange={v => setN('buyer', 'pan', v)} />
          </div>
          <F label="Buyer Address" value={buyer.address as string} onChange={v => setN('buyer', 'address', v)} />
        </Sec>

        <Sec title="Bill Summary">
          <div className="g2">
            <F label="Bill Title"  value={(d.notes as string) } onChange={v => set('notes', v)} />
            <div className="f">
              <label className="f__lbl">Category</label>
              {addingCategory ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    className="f__inp"
                    autoFocus
                    placeholder="New category name…"
                    value={newCategoryText}
                    onChange={e => setNewCategoryText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const name = newCategoryText.trim()
                        if (name) {
                          addCustomCategory(name)
                          const updated = getAllCategories()
                          setCategories(updated)
                          setCategory(name)
                        }
                        setAddingCategory(false)
                        setNewCategoryText('')
                      } else if (e.key === 'Escape') {
                        setAddingCategory(false)
                        setNewCategoryText('')
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    style={{ padding: '0 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#2563eb', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                    onClick={() => {
                      const name = newCategoryText.trim()
                      if (name) {
                        addCustomCategory(name)
                        const updated = getAllCategories()
                        setCategories(updated)
                        setCategory(name)
                      }
                      setAddingCategory(false)
                      setNewCategoryText('')
                    }}
                  >Add</button>
                  <button
                    type="button"
                    style={{ padding: '0 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', fontSize: 12, cursor: 'pointer' }}
                    onClick={() => { setAddingCategory(false); setNewCategoryText('') }}
                  >✕</button>
                </div>
              ) : (
                <div className="f__wrap f__wrap--sel">
                  <select
                    className="f__inp f__sel"
                    value={category}
                    onChange={e => {
                      if (e.target.value === '__add__') {
                        setAddingCategory(true)
                      } else {
                        setCategory(e.target.value)
                      }
                    }}
                  >
                    <option value="">Select category…</option>
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    {user?.role === 'admin' && <option value="__add__">+ Add custom category…</option>}
                  </select>
                  <ChevronDown size={13} className="f__icon" />
                </div>
              )}
            </div>
            <div className="f">
              <label className="f__lbl">Department</label>
              {userDepts.length > 1 ? (
                <div className="f__wrap f__wrap--sel">
                  <select
                    className="f__inp f__sel"
                    value={selectedDept}
                    onChange={e => setSelectedDept(e.target.value)}
                  >
                    {userDepts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <ChevronDown size={13} className="f__icon" />
                </div>
              ) : (
                <input
                  className="f__inp"
                  value={selectedDept || user?.department || '—'}
                  readOnly
                  style={{ background: '#f9fafb', color: '#6b7280', cursor: 'default' }}
                />
              )}
            </div>
            <F label="Bill Number" value={d.invoice_number as string} onChange={v => set('invoice_number', v)} />
            <F label="Bill Date"   value={d.invoice_date as string}   onChange={v => setWithDueDate('invoice_date', v as string)}  icon={<Calendar size={12} />} />
            <F label="Due Date"    value={d.due_date as string}       onChange={v => set('due_date', v)}       icon={<Calendar size={12} />} />
            <F label="Payment Terms" value={d.payment_terms as string} onChange={v => setWithDueDate('payment_terms', v as string)} />
            <F label="Amount in Words" value={d.amount_in_words as string} onChange={v => set('amount_in_words', v)} />
          </div>
          <div className="g3">
            <F label="Subtotal"     value={d.subtotal as number}     onChange={v => set('subtotal', v)}     type="number" />
            <F label="Discount"     value={d.discount as number}     onChange={v => set('discount', v)}     type="number" />
            <F label="Total Amount" value={d.total_amount as number} onChange={v => set('total_amount', v)} type="number" />
          </div>
        </Sec>

        <Sec title="Tax Breakdown">
          <div className="g3">
            <F label="Taxable Amt"  value={taxes.taxable_amount as number} onChange={v => setN('taxes','taxable_amount',v)} type="number" />
            <F label="CGST Rate %"  value={taxes.cgst_rate as number}      onChange={v => setN('taxes','cgst_rate',v)}      type="number" />
            <F label="CGST Amount"  value={taxes.cgst_amount as number}    onChange={v => setN('taxes','cgst_amount',v)}    type="number" />
            <F label="SGST Rate %"  value={taxes.sgst_rate as number}      onChange={v => setN('taxes','sgst_rate',v)}      type="number" />
            <F label="SGST Amount"  value={taxes.sgst_amount as number}    onChange={v => setN('taxes','sgst_amount',v)}    type="number" />
            <F label="IGST Rate %"  value={taxes.igst_rate as number}      onChange={v => setN('taxes','igst_rate',v)}      type="number" />
            <F label="IGST Amount"  value={taxes.igst_amount as number}    onChange={v => setN('taxes','igst_amount',v)}    type="number" />
            <F label="Cess Amount"  value={taxes.cess_amount as number}    onChange={v => setN('taxes','cess_amount',v)}    type="number" />
          </div>
        </Sec>

        <Sec title={`Line Items (${lineItems.length})`}>
          <div className="rv__li-wrap">
            <table className="rv__li-table">
              <thead>
                <tr>
                  <th className="rv__li-th rv__li-th--num rv__li-th--del">#</th>
                  <th className="rv__li-th rv__li-th--desc">Description</th>
                  <th className="rv__li-th rv__li-th--hsn">HSN/SAC</th>
                  <th className="rv__li-th rv__li-th--num rv__li-th--qty">Qty</th>
                  <th className="rv__li-th rv__li-th--unit">Unit</th>
                  <th className="rv__li-th rv__li-th--num rv__li-th--rate">Rate</th>
                  <th className="rv__li-th rv__li-th--num rv__li-th--amt">Amount</th>
                  <th className="rv__li-th rv__li-th--ldgr">Ledger</th>
                  <th className="rv__li-th rv__li-th--del" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => {
                  const sugg = suggestions[i] ?? []
                  const top  = sugg[0] ?? null
                  const isOpen = ledgerOpen === i
                  const filtered = ledgerSearch
                    ? ledgers.filter(l => l.account_name.toLowerCase().includes(ledgerSearch.toLowerCase()) || (l.account_code ?? '').toLowerCase().includes(ledgerSearch.toLowerCase()))
                    : ledgers
                  const CONF_COLOR: Record<string, string> = { high: '#059669', medium: '#d97706', low: '#6b7280', none: '#9ca3af' }

                  return (
                    <tr key={i} className="rv__li-row">
                      <td className="rv__li-td rv__li-td--num">
                        <span className="rv__line-num">{i + 1}</span>
                      </td>
                      <td className="rv__li-td rv__li-td--desc">
                        <input className="rv__li-inp" value={item.description ?? ''} onChange={e => updateLine(i,'description',e.target.value)}
                          onBlur={() => fetchSuggestion(i, { ...item, description: (document.activeElement as HTMLInputElement)?.value ?? item.description })}
                          placeholder="Description" />
                      </td>
                      <td className="rv__li-td">
                        <input className="rv__li-inp" value={item.hsn_sac ?? ''} onChange={e => updateLine(i,'hsn_sac',e.target.value)}
                          onBlur={() => fetchSuggestion(i, item)}
                          placeholder="HSN/SAC" />
                      </td>
                      <td className="rv__li-td rv__li-td--num">
                        <input className="rv__li-inp rv__li-inp--num" type="number" value={item.quantity ?? ''} onChange={e => updateLine(i,'quantity', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="—" />
                      </td>
                      <td className="rv__li-td">
                        <input className="rv__li-inp" value={item.unit ?? ''} onChange={e => updateLine(i,'unit',e.target.value)} placeholder="—" />
                      </td>
                      <td className="rv__li-td rv__li-td--num">
                        <input className="rv__li-inp rv__li-inp--num" type="number" value={item.rate ?? ''} onChange={e => updateLine(i,'rate', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="—" />
                      </td>
                      <td className="rv__li-td rv__li-td--num">
                        <input className="rv__li-inp rv__li-inp--num" type="number" value={item.amount ?? ''} onChange={e => updateLine(i,'amount', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="0.00" />
                      </td>

                      <td className="rv__li-td rv__li-ledger-cell" style={{ minWidth: 180 }}>
                        {item.account_id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#111827', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                              {item.ledger_name ?? item.account_id}
                            </span>
                            <button onClick={() => updateLine(i, 'account_id', null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, lineHeight: 1 }}>×</button>
                          </div>
                        ) : top ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <button
                              onClick={() => { updateLine(i, 'account_id', top.account_id); updateLine(i, 'ledger_name', top.account_name) }}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', textAlign: 'left' }}
                            >
                              <span style={{ fontSize: 10, fontWeight: 700, color: CONF_COLOR[top.confidence] ?? '#6b7280', textTransform: 'uppercase' }}>{top.confidence}</span>
                              <span style={{ fontSize: 11, color: '#111827', fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{top.account_name}</span>
                            </button>
                            <span style={{ fontSize: 10, color: '#9ca3af', paddingLeft: 2 }}>{top.reason}</span>
                          </div>
                        ) : null}

                        <button
                          ref={el => { ledgerBtnRefs.current[i] = el }}
                          onClick={() => {
                            if (isOpen) { setLedgerOpen(null); return }
                            const rect = ledgerBtnRefs.current[i]?.getBoundingClientRect()
                            if (rect) setLedgerAnchor({ top: rect.bottom + 4, left: rect.left, width: 260 })
                            setLedgerOpen(i); setLedgerSearch('')
                          }}
                          style={{ marginTop: item.account_id || top ? 4 : 0, fontSize: 11, color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
                        >
                          {item.account_id ? 'Change' : top ? 'Override' : '+ Pick ledger'}
                        </button>

                        {isOpen && ledgerAnchor && (
                          <div className="rv__ledger-dropdown" style={{ position: 'fixed', top: ledgerAnchor.top, left: ledgerAnchor.left, zIndex: 9999, width: ledgerAnchor.width, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8 }}>
                            <input
                              autoFocus
                              value={ledgerSearch}
                              onChange={e => setLedgerSearch(e.target.value)}
                              placeholder="Search ledger…"
                              style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, marginBottom: 6, boxSizing: 'border-box', outline: 'none' }}
                            />
                            {!ledgerSearch && sugg.length > 0 && (
                              <div style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px 4px' }}>Suggested</div>
                                {sugg.map(s => (
                                  <button key={s.account_id}
                                    onClick={() => { updateLine(i,'account_id',s.account_id); updateLine(i,'ledger_name',s.account_name); setLedgerOpen(null) }}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '6px 8px', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                    onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                  >
                                    <span style={{ fontSize: 12, color: '#111827', fontWeight: 500 }}>{s.account_name}</span>
                                    <span style={{ fontSize: 10, color: CONF_COLOR[s.confidence], fontWeight: 700, textTransform: 'uppercase' }}>{s.confidence}</span>
                                  </button>
                                ))}
                                <div style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />
                              </div>
                            )}
                            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                              {filtered.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 4px' }}>No ledgers found</div>}
                              {filtered.map(l => (
                                <button key={l.account_id}
                                  onClick={() => { updateLine(i,'account_id',l.account_id); updateLine(i,'ledger_name',l.account_name); setLedgerOpen(null) }}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '6px 8px', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                >
                                  <span style={{ fontSize: 12, color: '#111827' }}>{l.account_name}</span>
                                  {l.account_code && <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{l.account_code}</span>}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="rv__li-td rv__li-td--num">
                        <button className="rv__line-del" onClick={() => removeLine(i)}><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button className="rv__add-line" onClick={addLine}><span>+</span> Add Line Item</button>
        </Sec>

        <Sec title="Bank Details">
          <div className="g3">
            <F label="Bank Name"   value={bank.bank_name as string}   onChange={v => setN('bank_details','bank_name',v)} />
            <F label="Account No"  value={bank.account_no as string}  onChange={v => setN('bank_details','account_no',v)} />
            <F label="IFSC"        value={bank.ifsc as string}        onChange={v => setN('bank_details','ifsc',v)} />
          </div>
        </Sec>

        <Sec title="Supporting Documents">
          <input
            ref={docInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              setSupportingDocs(prev => [...prev, ...files])
              e.target.value = ''
            }}
          />
          <button className="rv__doc-upload" onClick={() => docInputRef.current?.click()}>
            <Paperclip size={14} /> + Upload Document
          </button>
          <p className="rv__doc-hint">Upload supporting documents e.g. receipts, contracts etc.</p>
          {supportingDocs.length > 0 && (
            <div className="rv__doc-list">
              {supportingDocs.map((f, i) => (
                <div key={i} className="rv__doc-row">
                  <FileText size={13} color="#6b7280" />
                  <span className="rv__doc-name">{f.name}</span>
                  <span className="rv__doc-size">{(f.size / 1024).toFixed(1)} KB</span>
                  <button className="rv__doc-del" onClick={() => setSupportingDocs(prev => prev.filter((_, idx) => idx !== i))}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Sec>

        <Sec title="Notes">
          {notes.length > 0 && (
            <div className="rv__notes-list">
              {notes.map((n, i) => (
                <div key={i} className="rv__note">
                  <MessageSquare size={12} color="#6b7280" />
                  <div className="rv__note-body">
                    <span className="rv__note-text">{n.text}</span>
                    <span className="rv__note-ts">{n.ts}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rv__note-input-wrap">
            <input
              className="rv__note-input"
              placeholder="Enter your comment"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && noteText.trim()) {
                  setNotes(prev => [...prev, { text: noteText.trim(), ts: new Date().toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) }])
                  setNoteText('')
                }
              }}
            />
            <button
              className="rv__note-send"
              disabled={!noteText.trim()}
              onClick={() => {
                if (!noteText.trim()) return
                setNotes(prev => [...prev, { text: noteText.trim(), ts: new Date().toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) }])
                setNoteText('')
              }}
            >
              <Send size={13} /> Enter
            </button>
          </div>
        </Sec>

        {dupWarning && (
          <div className="rv__warn">
            <span>⚠️</span>
            <span>{dupWarning}</span>
          </div>
        )}
        {error && <div className="rv__err">{error}</div>}

        <div className="rv__actions">
          <button className="rv__btn rv__btn--ghost" onClick={onBack} disabled={loading || bulkLoading}>Cancel</button>
          <button className="rv__btn rv__btn--primary" onClick={handleIngest} disabled={loading || bulkLoading}>
            {loading ? <><span className="rv__spin" />Sending…</> : <><Send size={14} />Send for Approval</>}
          </button>
          {queue.length > 1 && (
            <button className="rv__btn rv__btn--bulk" onClick={handleBulkIngest} disabled={loading || bulkLoading}>
              {bulkLoading
                ? <><span className="rv__spin" />Saving {bulkDone}/{queue.length}…</>
                : <><Database size={14} />Send All {queue.length} for Approval</>}
            </button>
          )}
        </div>
      </div>

      {/* ── RIGHT: PDF ───────────────────────────────────────── */}
      <div className="rv__right">
        <div className="rv__pdf-bar">
          <button className="rv__hide-btn" onClick={onBack}>Hide Bill <ChevronDown size={12} /></button>
          <div className="rv__pdf-controls">
            <button className="rv__ctrl" onClick={() => setZoomDelta(d => d + 60)}><ZoomIn size={15} /></button>
            <button className="rv__ctrl" onClick={() => setZoomDelta(d => d - 60)}><ZoomOut size={15} /></button>
            <div className="rv__ctrl-div" />
            <button className="rv__ctrl" onClick={() => { setZoomDelta(0); setPageNum(1) }}><RotateCcw size={15} /></button>
          </div>
          {numPages > 1 && (
            <div className="rv__page-nav">
              <button className="rv__ctrl" disabled={pageNum <= 1}      onClick={() => setPageNum(p => p - 1)}>‹</button>
              <span className="rv__page-info">{pageNum} / {numPages}</span>
              <button className="rv__ctrl" disabled={pageNum >= numPages} onClick={() => setPageNum(p => p + 1)}>›</button>
            </div>
          )}
        </div>

        <div className="rv__pdf-body" ref={previewRef}>
          {pdfUrl ? (
            <Document
              file={pdfUrl}
              onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNum(1) }}
              loading={<div className="rv__pdf-msg"><span className="rv__spin-dark" />Loading PDF…</div>}
              error={<div className="rv__pdf-msg"><FileText size={36} color="#9ca3af" /><span>Could not load PDF</span></div>}
            >
              <Page
                pageNumber={pageNum}
                width={fitWidth}
                onLoadSuccess={p => { setPageNaturalW(p.originalWidth); setPageNaturalH(p.originalHeight) }}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
            </Document>
          ) : (
            <div className="rv__pdf-msg">
              <FileText size={44} color="#9ca3af" />
              <span>PDF Preview</span>
              <span className="rv__pdf-sub">Upload a file to see preview here</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .rv { display: flex; height: calc(100vh - 54px); overflow: hidden; }
        .rv__left { position: relative; flex: 1 1 0%; min-width: 520px; overflow-y: auto; padding: 20px 22px 28px; border-right: 1px solid #e5e7eb; background: #fff; display: flex; flex-direction: column; gap: 18px; }
        .rv__hdr { display: flex; align-items: flex-start; gap: 10px; }
        .rv__close { width: 26px; height: 26px; border-radius: 50%; background: #f3f4f6; border: none; color: #6b7280; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 3px; cursor: pointer; }
        .rv__close:hover { background: #e5e7eb; }
        .rv__hdr-info { flex: 1; }
        .rv__num  { font-size: 22px; font-weight: 800; color: #111827; }
        .rv__type { font-size: 13px; font-weight: 600; color: #374151; margin-top: 1px; }
        .rv__meta { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .rv__reset { display: flex; align-items: center; gap: 4px; margin-left: auto; background: none; border: none; color: #2563eb; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0; font-family: inherit; }
        .rv__reset:hover { text-decoration: underline; }
        .rv__apr-wrap { position: relative; }
        .rv__apr-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 20px; background: #f3f4f6; border: 1px solid #e5e7eb; font-size: 12px; font-weight: 600; color: #374151; cursor: pointer; font-family: inherit; }
        .rv__apr-btn:hover { background: #e5e7eb; }
        .rv__apr-pop { position: absolute; top: 34px; left: 0; z-index: 30; background: #1f2937; color: white; border-radius: 10px; padding: 12px 14px; width: 300px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .rv__apr-ttl { font-size: 11px; font-weight: 700; color: #9ca3af; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .rv__apr-row { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #e5e7eb; padding: 2px 0; }
        .rv__apr-row strong { color: white; }
        .sec { display: flex; flex-direction: column; gap: 8px; }
        .sec__title { font-size: 13px; font-weight: 700; color: #1f2937; }
        .rv__tl { display: flex; align-items: flex-start; }
        .rv__tl-step { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; position: relative; }
        .rv__tl-step:not(:last-child)::after { content: ''; position: absolute; top: 9px; left: 50%; right: -50%; height: 2px; background: #e5e7eb; z-index: 0; }
        .rv__tl-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #d1d5db; background: white; position: relative; z-index: 1; flex-shrink: 0; }
        .rv__tl-dot--done   { background: #10b981; border-color: #10b981; }
        .rv__tl-dot--active { border-color: #2563eb; }
        .rv__tl-lbl { font-size: 10px; color: #6b7280; text-align: center; line-height: 1.3; }
        .rv__amt-lbl { font-size: 11px; color: #6b7280; font-weight: 500; margin-bottom: 2px; }
        .rv__amt { font-size: 26px; font-weight: 800; color: #111827; }
        .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .f { display: flex; flex-direction: column; gap: 3px; }
        .f__lbl { font-size: 10px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.4px; }
        .f__wrap { position: relative; }
        .f__inp { width: 100%; padding: 7px 9px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; color: #1f2937; background: #f9fafb; outline: none; font-family: inherit; }
        .f__inp:focus { border-color: #2563eb; background: white; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
        .f__wrap--sel .f__inp { padding-right: 24px; }
        .f__sel { appearance: none; cursor: pointer; }
        .f__icon { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }
        .rv__li-wrap { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; overflow-x: auto; }
        .rv__li-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 780px; table-layout: fixed; }
        .rv__li-th { padding: 8px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #e5e7eb; text-align: left; white-space: nowrap; }
        .rv__li-th--num { text-align: right; }
        .rv__li-th--desc { width: 30%; }
        .rv__li-th--hsn  { width: 90px; }
        .rv__li-th--qty  { width: 64px; }
        .rv__li-th--unit { width: 72px; }
        .rv__li-th--rate { width: 90px; }
        .rv__li-th--amt  { width: 100px; }
        .rv__li-th--ldgr { width: 200px; }
        .rv__li-th--del  { width: 36px; }
        .rv__li-row:not(:last-child) td { border-bottom: 1px solid #f3f4f6; }
        .rv__li-row:hover td { background: #fafafe; }
        .rv__li-td { padding: 5px 6px; vertical-align: middle; }
        .rv__li-td--num { text-align: right; }
        .rv__li-td--desc { min-width: 160px; }
        .rv__li-inp { width: 100%; padding: 5px 7px; border: 1px solid transparent; border-radius: 5px; font-size: 12px; color: #1f2937; background: transparent; outline: none; font-family: inherit; min-width: 0; box-sizing: border-box; }
        .rv__li-inp:focus { border-color: #2563eb; background: white; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
        .rv__li-inp--num { text-align: right; }
        .rv__line-num { width: 20px; height: 20px; border-radius: 50%; background: #2563eb; color: white; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
        .rv__line-del { width: 24px; height: 24px; border-radius: 5px; border: 1px solid #e5e7eb; background: none; color: #9ca3af; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
        .rv__line-del:hover { background: #fee2e2; border-color: #ef4444; color: #ef4444; }
        .rv__add-line { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border: 1px dashed #2563eb; border-radius: 6px; background: #eff6ff; color: #2563eb; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; width: fit-content; margin-top: 6px; }
        .rv__add-line:hover { background: #2563eb; color: white; }
        .rv__doc-upload { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: 1.5px dashed #2563eb; border-radius: 7px; background: #eff6ff; color: #2563eb; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.12s; }
        .rv__doc-upload:hover { background: #dbeafe; }
        .rv__doc-hint { font-size: 11px; color: #9ca3af; margin: 0; }
        .rv__doc-list { display: flex; flex-direction: column; gap: 5px; }
        .rv__doc-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
        .rv__doc-name { flex: 1; font-size: 12px; color: #374151; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rv__doc-size { font-size: 11px; color: #9ca3af; flex-shrink: 0; }
        .rv__doc-del { width: 20px; height: 20px; border-radius: 4px; border: 1px solid #e5e7eb; background: white; color: #9ca3af; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
        .rv__doc-del:hover { background: #fee2e2; color: #ef4444; border-color: #fecaca; }
        .rv__notes-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
        .rv__note { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 7px; }
        .rv__note-body { display: flex; flex-direction: column; gap: 2px; flex: 1; }
        .rv__note-text { font-size: 13px; color: #1f2937; }
        .rv__note-ts   { font-size: 10px; color: #9ca3af; }
        .rv__note-input-wrap { display: flex; align-items: center; gap: 8px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; padding: 6px 10px; transition: border-color 0.12s; }
        .rv__note-input-wrap:focus-within { border-color: #2563eb; background: white; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
        .rv__note-input { flex: 1; border: none; background: transparent; outline: none; font-size: 13px; color: #1f2937; font-family: inherit; }
        .rv__note-input::placeholder { color: #9ca3af; }
        .rv__note-send { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 6px; background: #2563eb; color: white; border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; flex-shrink: 0; transition: background 0.12s; }
        .rv__note-send:hover:not(:disabled) { background: #1d4ed8; }
        .rv__note-send:disabled { opacity: 0.4; cursor: not-allowed; }
        .rv__err { font-size: 12px; color: #ef4444; background: #fee2e2; padding: 8px 12px; border-radius: 6px; }
        .rv__warn { font-size: 12px; color: #92400e; background: #fef3c7; border: 1px solid #f59e0b; padding: 10px 14px; border-radius: 6px; display: flex; gap: 8px; align-items: flex-start; line-height: 1.5; }
        .rv__actions { display: flex; gap: 8px; padding-top: 4px; }
        .rv__btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 6px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .rv__btn--primary { background: #2563eb; color: white; }
        .rv__btn--primary:hover:not(:disabled) { background: #1d4ed8; }
        .rv__btn--primary:disabled { opacity: 0.55; cursor: not-allowed; }
        .rv__btn--ghost { background: none; border: 1px solid #e5e7eb; color: #4b5563; }
        .rv__btn--ghost:hover:not(:disabled) { background: #f3f4f6; }
        .rv__btn--bulk { background: #059669; color: white; }
        .rv__btn--bulk:hover:not(:disabled) { background: #047857; }
        .rv__btn--bulk:disabled { opacity: 0.55; cursor: not-allowed; }
        .rv__nav { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; }
        .rv__nav-btn { display: inline-flex; align-items: center; gap: 3px; padding: 5px 12px; border-radius: 5px; border: 1px solid #d1d5db; background: white; font-size: 12px; font-weight: 600; color: #374151; cursor: pointer; font-family: inherit; }
        .rv__nav-btn:hover:not(:disabled) { background: #f3f4f6; }
        .rv__nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .rv__nav-info { flex: 1; text-align: center; font-size: 12px; font-weight: 600; color: #0369a1; }
        .rv__spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; animation: rvSpin 0.7s linear infinite; display: inline-block; }
        .rv__right { flex: 0 0 auto; width: fit-content; min-width: 300px; display: flex; flex-direction: column; background: #e5e7eb; overflow: hidden; }
        .rv__pdf-bar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: white; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; min-width: 0; }
        .rv__hide-btn { display: flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 20px; border: 1px solid #d1d5db; background: white; font-size: 12px; font-weight: 600; color: #374151; cursor: pointer; font-family: inherit; }
        .rv__hide-btn:hover { background: #f3f4f6; }
        .rv__pdf-controls { display: flex; align-items: center; gap: 3px; margin-left: auto; }
        .rv__ctrl { width: 28px; height: 28px; border-radius: 5px; border: 1px solid #e5e7eb; background: none; color: #4b5563; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; font-family: inherit; }
        .rv__ctrl:hover:not(:disabled) { background: #f3f4f6; }
        .rv__ctrl:disabled { opacity: 0.4; cursor: not-allowed; }
        .rv__ctrl-div { width: 1px; height: 18px; background: #e5e7eb; margin: 0 3px; }
        .rv__page-nav { display: flex; align-items: center; gap: 4px; }
        .rv__page-info { font-size: 12px; color: #4b5563; font-weight: 500; white-space: nowrap; }
        .rv__pdf-body { flex: 1; overflow-x: auto; overflow-y: hidden; display: flex; align-items: flex-start; justify-content: flex-start; }
        .rv__pdf-body .react-pdf__Document { display: flex; flex-direction: column; gap: 0; }
        .rv__pdf-body .react-pdf__Page canvas { display: block; }
        .rv__pdf-msg { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #9ca3af; font-size: 13px; }
        .rv__pdf-sub { font-size: 11px; }
        .rv__spin-dark { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #d1d5db; border-top-color: #2563eb; animation: rvSpin 0.7s linear infinite; display: inline-block; }
        @keyframes rvSpin { to { transform: rotate(360deg); } }
        .rv__skeleton { position: absolute; inset: 0; background: white; z-index: 10; padding: 20px 22px 32px; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; }
        .sk { border-radius: 6px; background: linear-gradient(90deg, #f1f2f6 0%, #e4e6ef 40%, #eceef5 60%, #f1f2f6 100%); background-size: 300% 100%; animation: shimmer 1.6s ease-in-out infinite; }
        @keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
        .sk-hdr { display: flex; align-items: flex-start; gap: 12px; }
        .sk-circle { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; }
        .sk-h1  { height: 22px; width: 60%; border-radius: 5px; }
        .sk-h2  { height: 13px; width: 35%; border-radius: 4px; }
        .sk-h3  { height: 11px; width: 50%; border-radius: 4px; }
        .sk-badge { width: 52px; height: 22px; border-radius: 11px; flex-shrink: 0; margin-left: auto; margin-top: 3px; }
        .sk-chip { height: 26px; width: 140px; border-radius: 13px; }
        .sk-sec { display: flex; flex-direction: column; gap: 10px; }
        .sk-sec-title { height: 13px; width: 30%; border-radius: 4px; }
        .sk-timeline { display: flex; align-items: center; }
        .sk-tl-step  { display: flex; flex-direction: column; align-items: center; gap: 5px; position: relative; flex: 1; }
        .sk-tl-step:last-child { flex: 0; }
        .sk-tl-dot   { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; }
        .sk-tl-lbl   { height: 9px; width: 60px; border-radius: 4px; }
        .sk-tl-line  { position: absolute; top: 9px; left: 50%; right: -50%; height: 2px; background: #e5e7eb; z-index: 0; }
        .sk-amt-lbl { height: 11px; width: 45%; border-radius: 4px; }
        .sk-amt     { height: 28px; width: 50%; border-radius: 5px; }
        .sk-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .sk-g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .sk-field { display: flex; flex-direction: column; gap: 4px; }
        .sk-flbl  { height: 9px; width: 55%; border-radius: 3px; }
        .sk-finp  { height: 32px; border-radius: 6px; }
        .rv__sk-ocr-label { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #6b7280; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 8px; padding: 10px 14px; margin-top: 4px; }
        .rv__sk-bars { display: flex; align-items: flex-end; gap: 3px; height: 16px; flex-shrink: 0; }
        .rv__sk-bars .bar { width: 3px; border-radius: 2px; background: #2563eb; animation: barBounce 0.9s ease-in-out infinite; }
        .rv__sk-bars .bar:nth-child(1) { height: 6px; }
        .rv__sk-bars .bar:nth-child(2) { height: 10px; }
        .rv__sk-bars .bar:nth-child(3) { height: 14px; }
        .rv__sk-bars .bar:nth-child(4) { height: 10px; }
        .rv__sk-bars .bar:nth-child(5) { height: 6px; }
        @keyframes barBounce { 0%, 100% { transform: scaleY(0.4); opacity: 0.5; } 50% { transform: scaleY(1); opacity: 1; } }
      `}</style>
    </div>
  )
}
