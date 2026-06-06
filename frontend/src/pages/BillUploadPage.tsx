import { useState, useRef, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, RotateCcw, CheckCircle2, ChevronDown, Upload,
  Calendar, ZoomIn, ZoomOut, FileText, Paperclip,
  Send, MessageSquare, Settings, Shield, Zap, Layers,
} from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

import apiClient from '../api/client'

interface RecentBill {
  id: string; vendor_name: string | null; amount: number | null
  category: string; uploaded_at: string
}

const CATEGORIES = ['Medicines', 'Fluids/Juice', 'Logistics', 'Food', 'Equipment', 'Other']

const PIPELINE_STEPS = [
  { icon: <Upload size={16} />, name: 'Upload', desc: 'File received' },
  { icon: <Settings size={16} />, name: 'Processing', desc: 'Preparing' },
  { icon: <FileText size={16} />, name: 'Extracting Data', desc: 'AI extraction' },
  { icon: <Shield size={16} />, name: 'Validating', desc: 'Verifying data' },
  { icon: <CheckCircle2 size={16} />, name: 'Completed', desc: 'Data ingested' },
]

const FEATURES = [
  { icon: <Zap size={18} color="#2563eb" />, bg: '#dbeafe', title: 'Smart Extraction', desc: 'AI-powered data extraction with high accuracy' },
  { icon: <Layers size={18} color="#7c3aed" />, bg: '#ede9fe', title: 'Multiple Formats', desc: 'Supports PDF and image files' },
  { icon: <Upload size={18} color="#059669" />, bg: '#d1fae5', title: 'Auto-Fill Form', desc: 'Bill fields auto-filled from receipt' },
  { icon: <Shield size={18} color="#d97706" />, bg: '#fef3c7', title: 'Secure & Private', desc: 'Your data is never shared' },
]

function fmtShort(n: number | null | undefined) {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function fmtDateShort(s: string) {
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) } catch { return s }
}

// ── Landing page (screenshot 1 style) ────────────────────────────────────────

function LandingPage({ onFile, recentBills }: { onFile: (f: File) => void; recentBills: RecentBill[] }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]; if (f) onFile(f)
  }

  return (
    <div className="bu__page">
      {/* Main */}
      <div className="bu__main">
        <h1 className="bu__title">Upload Medical Bills</h1>
        <p className="bu__sub">Upload your medical receipts and let AI extract the data for you.</p>

        {/* Tabs */}
        <div className="bu__tabbar">
          <button className="bu__tab bu__tab--active">📁 Upload File</button>
        </div>

        {/* Drop zone */}
        <div
          className={`bu__zone ${drag ? 'bu__zone--drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept="image/*,.pdf" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          <div className="bu__zone-icon"><Upload size={26} color="#6b7280" /></div>
          <p className="bu__zone-text">
            Drag &amp; drop your files here or{' '}
            <span className="bu__zone-link">click to browse</span>
          </p>
          <p className="bu__zone-hint">Supports PDF · Max 50 MB per file · AI OCR auto-fills the form</p>
          <button
            className="bu__choose"
            onClick={e => { e.stopPropagation(); fileRef.current?.click() }}
          >
            Choose Files
          </button>
        </div>
        <p className="bu__info">ℹ Drop PDFs or images here — OCR runs automatically.</p>

        {/* Processing Pipeline */}
        <h2 className="bu__section-h">Processing Pipeline</h2>
        <div className="bu__pipeline">
          {PIPELINE_STEPS.map((s, i) => (
            <div key={i} className="bu__pipe-step">
              <div className="bu__pipe-icon">{s.icon}</div>
              {i < PIPELINE_STEPS.length - 1 && <div className="bu__pipe-line" />}
              <p className="bu__pipe-name">{s.name}</p>
              <p className="bu__pipe-desc">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Feature cards */}
        <div className="bu__features">
          {FEATURES.map((f, i) => (
            <div key={i} className="bu__feat">
              <div className="bu__feat-icon" style={{ background: f.bg }}>{f.icon}</div>
              <p className="bu__feat-title">{f.title}</p>
              <p className="bu__feat-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <div className="bu__aside">
        <div className="bu__sum-card">
          <div className="bu__sum-hdr">
            <span className="bu__sum-ttl">Extraction Summary</span>
            <button className="bu__sum-viewbtn">View Details</button>
          </div>
          <div className="bu__sum-body">
            <div className="bu__sum-circle">
              <span className="bu__sum-n">{recentBills.length}</span>
              <span className="bu__sum-nlbl">Total</span>
            </div>
            <div className="bu__sum-stats">
              {[
                { label: 'Total', val: recentBills.length, color: '#374151' },
                { label: 'Completed', val: recentBills.length, color: '#10b981' },
                { label: 'Processing', val: 0, color: '#3b82f6' },
                { label: 'Failed', val: 0, color: '#ef4444' },
              ].map(r => (
                <div key={r.label} className="bu__sum-row">
                  <span className="bu__sum-dot" style={{ background: r.color }} />
                  <span className="bu__sum-name">{r.label}</span>
                  <span className="bu__sum-val">{r.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bu__begin-card">
          <Zap size={16} color="#2563eb" />
          <div>
            <p className="bu__begin-title">Upload files to begin</p>
            <p className="bu__begin-sub">Drop receipt images/PDFs above and click Extract.</p>
          </div>
        </div>

        <p className="bu__recent-title">Recent Uploads</p>
        {recentBills.length === 0 ? (
          <p className="bu__recent-empty">No uploads yet</p>
        ) : (
          <div className="bu__recent-list">
            {recentBills.slice(0, 7).map(b => (
              <div key={b.id} className="bu__recent-row">
                <FileText size={12} color="#9ca3af" style={{ marginTop: 1, flexShrink: 0 }} />
                <div className="bu__recent-info">
                  <span className="bu__recent-name">{b.vendor_name || 'Unknown'}</span>
                  <span className="bu__recent-meta">{fmtShort(b.amount)} · {fmtDateShort(b.uploaded_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Review Form (screenshot 2 style) ─────────────────────────────────────────

export default function BillUploadPage() {
  const navigate = useNavigate()

  const [stage, setStage]           = useState<'idle' | 'uploading' | 'review'>('idle')
  const [file, setFile]             = useState<File | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [recentBills, setRecentBills] = useState<RecentBill[]>([])

  const [vendorName, setVendorName]   = useState('')
  const [billNumber, setBillNumber]   = useState('')
  const [billDate, setBillDate]       = useState('')
  const [amount, setAmount]           = useState('')
  const [category, setCategory]       = useState('Other')
  const [description, setDescription] = useState('')
  const [uploadedBy, setUploadedBy]   = useState('Volunteer')
  const [storedFilename, setStoredFilename]         = useState('')
  const [storedOriginalName, setStoredOriginalName] = useState('')
  const [supportingDocs, setSupportingDocs]         = useState<File[]>([])
  const [noteText, setNoteText] = useState('')
  const [notes, setNotes]       = useState<{ text: string; ts: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')

  // PDF
  const [numPages, setNumPages] = useState(0)
  const [pageNum, setPageNum]   = useState(1)
  const [zoomDelta, setZoomDelta] = useState(0)
  const [pageW, setPageW] = useState(0)
  const [pageH, setPageH] = useState(0)
  const [cH, setCH] = useState(0)
  const previewRef = useRef<HTMLDivElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = previewRef.current; if (!el) return
    const ro = new ResizeObserver(() => setCH(el.clientHeight))
    ro.observe(el); setCH(el.clientHeight)
    return () => ro.disconnect()
  }, [stage])

  useEffect(() => {
    apiClient.get('/bills', { params: { limit: 10 } })
      .then(r => setRecentBills(r.data)).catch(() => {})
  }, [])

  const pdfUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  const isPdf  = file?.type === 'application/pdf'
  const isImg  = file && !isPdf
  const fitW   = (!cH || !pageW || !pageH) ? 520 : Math.max(280, (cH / pageH) * pageW + zoomDelta)

  async function handleFile(f: File) {
    setFile(f); setError(''); setStage('uploading')
    const fd = new FormData(); fd.append('file', f)
    try {
      const r = await apiClient.post('/bills/upload-receipt', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setStoredFilename(r.data.filename); setStoredOriginalName(r.data.original_name || f.name)
    } catch { /* non-fatal */ }
    if (f.type.startsWith('image/')) {
      setOcrLoading(true)
      const ofd = new FormData(); ofd.append('file', f)
      try {
        const r = await apiClient.post('/bills/ocr', ofd, { headers: { 'Content-Type': 'multipart/form-data' } })
        const d = r.data
        if (d.vendor_name) setVendorName(d.vendor_name)
        if (d.amount)      setAmount(String(d.amount))
        if (d.bill_date)   setBillDate(d.bill_date)
        if (d.bill_number) setBillNumber(d.bill_number)
        if (d.description) setDescription(d.description)
      } catch { /* silent */ }
      finally { setOcrLoading(false) }
    }
    setStage('review')
  }

  async function handleSubmit() {
    if (!vendorName.trim() && !amount.trim()) { setError('Please enter at least a vendor name or amount.'); return }
    setSubmitting(true); setError('')
    try {
      const fd = new FormData()
      fd.append('vendor_name', vendorName); fd.append('bill_number', billNumber)
      fd.append('bill_date', billDate); fd.append('amount', amount)
      fd.append('category', category); fd.append('uploaded_by', uploadedBy)
      const fullDesc = description + (notes.length ? '\nNotes: ' + notes.map(n => n.text).join('; ') : '')
      fd.append('description', fullDesc)
      fd.append('receipt_filename', storedFilename); fd.append('receipt_original_name', storedOriginalName)
      await apiClient.post('/bills', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      navigate('/bills')
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to submit')
    } finally { setSubmitting(false) }
  }

  function addNote() {
    if (!noteText.trim()) return
    const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    setNotes(prev => [...prev, { text: noteText.trim(), ts }]); setNoteText('')
  }

  if (stage === 'idle') {
    return <><LandingPage onFile={handleFile} recentBills={recentBills} /><style>{CSS}</style></>
  }

  return (
    <div className="rv2__page">
      {/* ── Left form ── */}
      <div className="rv2__left">

        {ocrLoading && (
          <div className="rv2__ocr-bar">
            <span className="rv2__spin" /> Extracting medical bill data with AI…
          </div>
        )}

        {/* Header */}
        <div className="rv2__hdr">
          <button className="rv2__close" onClick={() => navigate('/bills')}><X size={14} /></button>
          <div style={{ flex: 1 }}>
            <h1 className="rv2__bill-id">{billNumber || 'New Medical Bill'}</h1>
            <div className="rv2__bill-type">Medical Bill</div>
            <div className="rv2__bill-meta">{billDate || 'No date'} · by {uploadedBy}</div>
          </div>
          <button className="rv2__reset" onClick={() => { setVendorName(''); setBillNumber(''); setBillDate(''); setAmount(''); setCategory('Other'); setDescription('') }}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>

        <div>
          <button className="rv2__apr-chip">
            <CheckCircle2 size={12} color="#10b981" /> Admin Approval <ChevronDown size={11} />
          </button>
        </div>

        {/* Timeline */}
        <div>
          <p className="rv2__section-lbl">Timeline</p>
          <div className="rv2__tl">
            {[
              { label: 'Bill Uploaded', sub: uploadedBy, done: true },
              { label: 'Pending Admin', sub: 'admin@bloodwarriors.in', done: false },
              { label: 'Approved', sub: '', done: false },
            ].map((s, i) => (
              <div key={i} className="rv2__tl-step">
                <div className={`rv2__tl-dot ${s.done ? 'rv2__tl-dot--done' : ''}`} />
                <div className="rv2__tl-info">
                  <span className="rv2__tl-lbl">{s.label}</span>
                  {s.sub && <span className="rv2__tl-sub">{s.sub}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div>
          <p className="rv2__amt-lbl">Bill Amount</p>
          <p className="rv2__amt">
            {amount ? `₹${parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}
          </p>
        </div>

        {/* Bill Details */}
        <div>
          <div className="rv2__sec-hdr"><span>Bill Details</span><div className="rv2__sec-line" /></div>
          <div className="rv2__grid">
            <div className="rv2__field">
              <label className="rv2__flbl">Vendor Name</label>
              <input className="rv2__finp" value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Supplier / pharmacy name" />
            </div>
            <div className="rv2__field">
              <label className="rv2__flbl">Category</label>
              <div style={{ position: 'relative' }}>
                <select className="rv2__finp rv2__fsel" value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              </div>
            </div>
            <div className="rv2__field">
              <label className="rv2__flbl">Bill Number</label>
              <input className="rv2__finp" value={billNumber} onChange={e => setBillNumber(e.target.value)} placeholder="Invoice / receipt #" />
            </div>
            <div className="rv2__field">
              <label className="rv2__flbl">Bill Date</label>
              <div style={{ position: 'relative' }}>
                <input className="rv2__finp" type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
                <Calendar size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              </div>
            </div>
            <div className="rv2__field">
              <label className="rv2__flbl">Uploaded By</label>
              <input className="rv2__finp" value={uploadedBy} onChange={e => setUploadedBy(e.target.value)} />
            </div>
            <div className="rv2__field">
              <label className="rv2__flbl">Amount (₹)</label>
              <input className="rv2__finp" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="rv2__field" style={{ marginTop: 8 }}>
            <label className="rv2__flbl">Description</label>
            <textarea className="rv2__finp rv2__fta" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What was purchased? e.g. IV Saline bags for patient BW-00142" rows={3} />
          </div>
        </div>

        {/* Supporting Documents */}
        <div>
          <div className="rv2__sec-hdr"><span>Supporting Documents</span><div className="rv2__sec-line" /></div>
          <input ref={docInputRef} type="file" multiple hidden
            onChange={e => { setSupportingDocs(prev => [...prev, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
          <button className="rv2__attach-btn" onClick={() => docInputRef.current?.click()}>
            <Paperclip size={13} /> + Attach Document
          </button>
          {supportingDocs.length > 0 && (
            <div className="rv2__attach-list">
              {supportingDocs.map((f, i) => (
                <div key={i} className="rv2__attach-row">
                  <FileText size={12} color="#6b7280" />
                  <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button className="rv2__attach-del" onClick={() => setSupportingDocs(prev => prev.filter((_,j) => j !== i))}><X size={10} /></button>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Upload receipts, doctor notes, or other supporting files.</p>
        </div>

        {/* Notes */}
        <div>
          <div className="rv2__sec-hdr"><span>Notes</span><div className="rv2__sec-line" /></div>
          {notes.length > 0 && (
            <div className="rv2__notes">
              {notes.map((n, i) => (
                <div key={i} className="rv2__note">
                  <MessageSquare size={11} color="#9ca3af" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: 12, color: '#374151' }}>{n.text}</span>
                    <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 8 }}>{n.ts}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="rv2__note-input">
            <input className="rv2__note-text" placeholder="Enter your comment" value={noteText}
              onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote() }} />
            <button className="rv2__note-send" disabled={!noteText.trim()} onClick={addNote}>
              <Send size={12} /> Enter
            </button>
          </div>
        </div>

        {error && <div className="rv2__err">{error}</div>}

        <div className="rv2__actions">
          <button className="rv2__btn rv2__btn--ghost" onClick={() => navigate('/bills')} disabled={submitting}>Cancel</button>
          <button className="rv2__btn rv2__btn--primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <><span className="rv2__spin" />Submitting…</> : <><Send size={13} />Submit for Approval</>}
          </button>
        </div>
      </div>

      {/* ── Right PDF panel ── */}
      <div className="rv2__right">
        <div className="rv2__pdf-bar">
          <span style={{ fontSize: 11, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file?.name || 'Receipt Preview'}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="rv2__pdf-ctrl" onClick={() => setZoomDelta(d => d + 60)}><ZoomIn size={14} /></button>
            <button className="rv2__pdf-ctrl" onClick={() => setZoomDelta(d => d - 60)}><ZoomOut size={14} /></button>
            <button className="rv2__pdf-ctrl" onClick={() => { setZoomDelta(0); setPageNum(1) }}><RotateCcw size={14} /></button>
          </div>
          {numPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="rv2__pdf-ctrl" disabled={pageNum <= 1} onClick={() => setPageNum(p => p-1)}>‹</button>
              <span style={{ fontSize: 11, color: '#4b5563' }}>{pageNum}/{numPages}</span>
              <button className="rv2__pdf-ctrl" disabled={pageNum >= numPages} onClick={() => setPageNum(p => p+1)}>›</button>
            </div>
          )}
        </div>
        <div className="rv2__pdf-body" ref={previewRef}>
          {isPdf && pdfUrl ? (
            <Document file={pdfUrl}
              onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPageNum(1) }}
              loading={<div className="rv2__pdf-msg"><span className="rv2__spin-dark" />Loading…</div>}
              error={<div className="rv2__pdf-msg">Could not load PDF</div>}
            >
              <Page pageNumber={pageNum} width={fitW}
                onLoadSuccess={p => { setPageW(p.originalWidth); setPageH(p.originalHeight) }}
                renderAnnotationLayer={false} renderTextLayer={false}
              />
            </Document>
          ) : isImg && pdfUrl ? (
            <img src={pdfUrl} alt="receipt" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }} />
          ) : (
            <div className="rv2__pdf-msg">
              <FileText size={36} color="#4b5563" />
              <span>Receipt Preview</span>
            </div>
          )}
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
/* Landing */
.bu__page { display: flex; height: calc(100vh - 54px); overflow: hidden; background: white; }
.bu__main { flex: 1; overflow-y: auto; padding: 28px 32px; }
.bu__title { font-size: 24px; font-weight: 800; color: #111827; margin: 0 0 6px; }
.bu__sub { color: #6b7280; font-size: 13px; margin: 0; }
.bu__tabbar { display: flex; border-bottom: 1px solid #e5e7eb; margin-top: 22px; }
.bu__tab { padding: 10px 16px; font-size: 13px; font-weight: 600; color: #6b7280; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-family: inherit; margin-bottom: -1px; }
.bu__tab--active { color: #2563eb; border-bottom-color: #2563eb; }
.bu__zone { border: 2px dashed #d1d5db; border-radius: 12px; padding: 52px 28px; text-align: center; background: #fafafa; margin-top: 18px; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.bu__zone:hover,.bu__zone--drag { border-color: #2563eb; background: #eff6ff; }
.bu__zone-icon { width: 56px; height: 56px; border-radius: 50%; border: 1.5px solid #e5e7eb; background: white; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
.bu__zone-text { font-size: 14px; color: #374151; margin: 0; }
.bu__zone-link { color: #2563eb; font-weight: 600; }
.bu__zone-hint { font-size: 12px; color: #9ca3af; margin: 6px 0 0; }
.bu__choose { margin-top: 20px; padding: 10px 28px; background: #1e3a5f; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
.bu__choose:hover { background: #1d4ed8; }
.bu__info { font-size: 12px; color: #6b7280; margin: 10px 0 0; }
.bu__section-h { font-size: 16px; font-weight: 700; color: #111827; margin: 30px 0 16px; }
.bu__pipeline { display: flex; align-items: flex-start; }
.bu__pipe-step { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; }
.bu__pipe-icon { width: 40px; height: 40px; border-radius: 50%; border: 1px solid #e5e7eb; background: white; display: flex; align-items: center; justify-content: center; color: #6b7280; position: relative; z-index: 1; flex-shrink: 0; }
.bu__pipe-line { position: absolute; top: 20px; left: 50%; right: -50%; height: 1px; background: #e5e7eb; }
.bu__pipe-name { font-size: 12px; font-weight: 600; color: #374151; margin: 8px 0 0; text-align: center; }
.bu__pipe-desc { font-size: 11px; color: #9ca3af; margin: 2px 0 0; text-align: center; }
.bu__features { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 24px; padding-bottom: 24px; }
.bu__feat { padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb; }
.bu__feat-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
.bu__feat-title { font-size: 13px; font-weight: 700; color: #111827; margin: 0; }
.bu__feat-desc { font-size: 11px; color: #6b7280; margin: 4px 0 0; line-height: 1.4; }
/* Sidebar */
.bu__aside { width: 264px; border-left: 1px solid #e5e7eb; padding: 20px 16px; overflow-y: auto; background: white; flex-shrink: 0; }
.bu__sum-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
.bu__sum-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.bu__sum-ttl { font-size: 14px; font-weight: 700; color: #111827; }
.bu__sum-viewbtn { font-size: 12px; color: #2563eb; background: none; border: none; cursor: pointer; font-family: inherit; }
.bu__sum-body { display: flex; align-items: center; gap: 14px; }
.bu__sum-circle { width: 64px; height: 64px; border-radius: 50%; border: 4px solid #e5e7eb; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
.bu__sum-n { font-size: 20px; font-weight: 800; color: #111827; line-height: 1; }
.bu__sum-nlbl { font-size: 9px; color: #9ca3af; }
.bu__sum-stats { flex: 1; display: flex; flex-direction: column; gap: 5px; }
.bu__sum-row { display: flex; align-items: center; gap: 6px; }
.bu__sum-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.bu__sum-name { font-size: 11px; color: #6b7280; flex: 1; }
.bu__sum-val { font-size: 11px; font-weight: 700; color: #374151; }
.bu__begin-card { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px; margin-bottom: 16px; display: flex; gap: 10px; align-items: flex-start; }
.bu__begin-title { font-size: 13px; font-weight: 700; color: #1d4ed8; margin: 0; }
.bu__begin-sub { font-size: 11px; color: #3b82f6; margin: 3px 0 0; }
.bu__recent-title { font-size: 13px; font-weight: 700; color: #111827; margin: 0 0 10px; }
.bu__recent-empty { font-size: 12px; color: #9ca3af; text-align: center; padding: 20px 0; }
.bu__recent-list { display: flex; flex-direction: column; gap: 6px; }
.bu__recent-row { display: flex; align-items: flex-start; gap: 7px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
.bu__recent-info { flex: 1; min-width: 0; }
.bu__recent-name { font-size: 12px; font-weight: 600; color: #374151; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bu__recent-meta { font-size: 10px; color: #9ca3af; }

/* Review */
.rv2__page { display: flex; height: calc(100vh - 54px); overflow: hidden; }
.rv2__left { flex: 1; overflow-y: auto; padding: 24px 28px; background: white; border-right: 1px solid #e5e7eb; display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.rv2__ocr-bar { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 7px; padding: 8px 12px; }
.rv2__hdr { display: flex; align-items: flex-start; gap: 12px; }
.rv2__close { width: 26px; height: 26px; border-radius: 50%; background: #f3f4f6; border: none; color: #6b7280; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; margin-top: 4px; }
.rv2__close:hover { background: #e5e7eb; }
.rv2__bill-id { font-size: 22px; font-weight: 800; color: #111827; margin: 0; }
.rv2__bill-type { font-size: 13px; font-weight: 600; color: #374151; margin-top: 2px; }
.rv2__bill-meta { font-size: 11px; color: #9ca3af; margin-top: 2px; }
.rv2__reset { display: flex; align-items: center; gap: 4px; background: none; border: none; color: #2563eb; font-size: 12px; font-weight: 600; cursor: pointer; margin-left: auto; font-family: inherit; flex-shrink: 0; }
.rv2__reset:hover { text-decoration: underline; }
.rv2__apr-chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; font-size: 12px; font-weight: 600; color: #065f46; cursor: default; font-family: inherit; }
.rv2__section-lbl { font-size: 12px; font-weight: 700; color: #374151; margin: 0 0 10px; }
.rv2__tl { display: flex; align-items: flex-start; }
.rv2__tl-step { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; gap: 4px; }
.rv2__tl-step:not(:last-child)::after { content: ''; position: absolute; top: 9px; left: 50%; right: -50%; height: 2px; background: #e5e7eb; z-index: 0; }
.rv2__tl-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #d1d5db; background: white; position: relative; z-index: 1; flex-shrink: 0; }
.rv2__tl-dot--done { background: #10b981; border-color: #10b981; }
.rv2__tl-info { text-align: center; }
.rv2__tl-lbl { font-size: 10px; font-weight: 700; color: #374151; display: block; }
.rv2__tl-sub { font-size: 9px; color: #9ca3af; display: block; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv2__amt-lbl { font-size: 11px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; margin: 0; }
.rv2__amt { font-size: 32px; font-weight: 800; color: #111827; margin: 4px 0 0; }
.rv2__sec-hdr { display: flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.6px; }
.rv2__sec-line { flex: 1; height: 1px; background: #e5e7eb; }
.rv2__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.rv2__field { display: flex; flex-direction: column; gap: 4px; }
.rv2__flbl { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
.rv2__finp { padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; color: #1f2937; background: #f9fafb; outline: none; font-family: inherit; width: 100%; box-sizing: border-box; }
.rv2__finp:focus { border-color: #2563eb; background: white; }
.rv2__fsel { appearance: none; cursor: pointer; padding-right: 28px; }
.rv2__fta { resize: vertical; min-height: 72px; }
.rv2__attach-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: 1.5px dashed #2563eb; border-radius: 7px; background: #eff6ff; color: #2563eb; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.rv2__attach-btn:hover { background: #dbeafe; }
.rv2__attach-list { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
.rv2__attach-row { display: flex; align-items: center; gap: 7px; padding: 7px 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
.rv2__attach-del { width: 20px; height: 20px; border-radius: 4px; border: 1px solid #e5e7eb; background: white; color: #9ca3af; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.rv2__attach-del:hover { background: #fee2e2; color: #ef4444; }
.rv2__notes { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.rv2__note { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 7px; }
.rv2__note-input { display: flex; align-items: center; gap: 8px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; padding: 6px 10px; }
.rv2__note-input:focus-within { border-color: #2563eb; background: white; }
.rv2__note-text { flex: 1; border: none; background: transparent; outline: none; font-size: 13px; color: #1f2937; font-family: inherit; }
.rv2__note-text::placeholder { color: #9ca3af; }
.rv2__note-send { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: 6px; background: #2563eb; color: white; border: none; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
.rv2__note-send:disabled { opacity: 0.4; cursor: not-allowed; }
.rv2__err { font-size: 12px; color: #ef4444; background: #fee2e2; padding: 8px 12px; border-radius: 6px; }
.rv2__actions { display: flex; gap: 8px; padding-top: 4px; border-top: 1px solid #e5e7eb; }
.rv2__btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 6px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
.rv2__btn--primary { background: #2563eb; color: white; flex: 1; justify-content: center; }
.rv2__btn--primary:hover:not(:disabled) { background: #1d4ed8; }
.rv2__btn--primary:disabled { opacity: 0.55; cursor: not-allowed; }
.rv2__btn--ghost { background: none; border: 1px solid #e5e7eb; color: #4b5563; }
.rv2__btn--ghost:hover { background: #f3f4f6; }
/* PDF */
.rv2__right { flex: 0 0 42%; background: #0f172a; display: flex; flex-direction: column; overflow: hidden; }
.rv2__pdf-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: white; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
.rv2__pdf-ctrl { width: 26px; height: 26px; border-radius: 5px; border: 1px solid #e5e7eb; background: white; color: #4b5563; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 15px; font-family: inherit; }
.rv2__pdf-ctrl:hover:not(:disabled) { background: #f3f4f6; }
.rv2__pdf-ctrl:disabled { opacity: 0.4; cursor: not-allowed; }
.rv2__pdf-body { flex: 1; overflow-y: auto; display: flex; align-items: flex-start; justify-content: center; padding: 16px; }
.rv2__pdf-msg { display: flex; flex-direction: column; align-items: center; gap: 10px; color: #6b7280; font-size: 13px; padding: 40px; }
/* Spinners */
.rv2__spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; animation: rv2Spin 0.7s linear infinite; display: inline-block; }
.rv2__spin-dark { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #d1d5db; border-top-color: #2563eb; animation: rv2Spin 0.7s linear infinite; display: inline-block; }
@keyframes rv2Spin { to { transform: rotate(360deg); } }
`
