import { useCallback, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, Link2, Cloud, FolderOpen, Info,
  CheckCircle2, Shield, Layers, Zap, FileStack,
  FileText, Settings, X, AlertCircle, Loader2
} from 'lucide-react'
import { ocrInvoice } from '../api/invoices'
import type { InvoicePayload, QueueItem } from '../api/invoices'

type FileStatus = 'pending' | 'processing' | 'done' | 'error'
interface QueueEntry {
  file: File
  status: FileStatus
  result?: InvoicePayload
  error?: string
}

const FEATURES = [
  { icon: Zap,       title: 'Smart Extraction',  desc: 'AI-powered data extraction with high accuracy' },
  { icon: Layers,    title: 'Multiple Formats',  desc: 'Supports PDF files' },
  { icon: FileStack, title: 'Bulk Processing',   desc: 'Upload multiple files and process in bulk' },
  { icon: Shield,    title: 'Secure & Private',  desc: 'Your data is secure and never shared' },
]

const TABS = [
  { label: 'Upload File',           icon: <Upload size={13} /> },
  { label: 'From URL / Drive Link', icon: <Link2 size={13} /> },
  { label: 'Google Drive',          icon: <Cloud size={13} /> },
  { label: 'Dropbox',               icon: <FolderOpen size={13} /> },
  { label: 'OneDrive',              icon: <Cloud size={13} /> },
]

const R = 52, CX = 68, CY = 68, STROKE = 13
const circ = 2 * Math.PI * R

interface Props {
  uploadQueue: QueueEntry[]
  setUploadQueue: Dispatch<SetStateAction<QueueEntry[]>>
  onReview: (items: QueueItem[], startIdx: number) => void
}

export default function UploadStep({ uploadQueue: queue, setUploadQueue: setQueue, onReview }: Props) {
  const [tab, setTab] = useState(0)

  const updateEntry = (file: File, patch: Partial<QueueEntry>) =>
    setQueue(q => q.map(e => e.file === file ? { ...e, ...patch } : e))

  const onDrop = useCallback((acc: File[]) => {
    const newEntries: QueueEntry[] = acc.map(f => ({ file: f, status: 'pending' }))
    setQueue(q => {
      const existing = new Set(q.map(e => e.file.name))
      return [...q, ...newEntries.filter(e => !existing.has(e.file.name))]
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 20, maxSize: 50 * 1024 * 1024, multiple: true,
    noClick: false,
  })

  const removeEntry = (file: File) =>
    setQueue(q => q.filter(e => e.file !== file))

  const handleProcess = async () => {
    const pending = queue.filter(e => e.status === 'pending')
    if (!pending.length) return
    pending.forEach(e => updateEntry(e.file, { status: 'processing' }))
    await Promise.all(pending.map(async ({ file }) => {
      try {
        const result = await ocrInvoice(file)
        updateEntry(file, { status: 'done', result })
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          || (err as { message?: string })?.message || 'OCR failed'
        updateEntry(file, { status: 'error', error: msg })
      }
    }))
  }

  const total           = queue.length
  const doneCount       = queue.filter(e => e.status === 'done').length
  const errorCount      = queue.filter(e => e.status === 'error').length
  const processingCount = queue.filter(e => e.status === 'processing').length
  const pendingCount    = queue.filter(e => e.status === 'pending').length
  const finishedCount   = doneCount + errorCount
  const allFinished     = total > 0 && processingCount === 0 && pendingCount === 0
  const anyProcessing   = processingCount > 0
  const progressPct     = total > 0 ? Math.round((finishedCount / total) * 100) : 0

  const stepState = (idx: number): 'done' | 'active' | 'pending' => {
    if (total === 0) return 'pending'
    if (idx === 0) return 'done'
    if (idx === 1 || idx === 2) return anyProcessing ? 'active' : allFinished ? 'done' : 'pending'
    if (idx === 3) return allFinished ? 'active' : 'pending'
    return allFinished && errorCount === 0 ? 'done' : 'pending'
  }

  const steps = [
    { icon: <Upload size={19} />,      label: 'Upload',          sub: 'Files received',            state: stepState(0) },
    { icon: <Settings size={19} />,    label: 'Processing',      sub: 'Reading & preparing',       state: stepState(1) },
    { icon: <FileText size={19} />,    label: 'Extracting Data', sub: 'AI extraction in progress', state: stepState(2) },
    { icon: <Shield size={19} />,      label: 'Validating',      sub: 'Verifying extracted data',  state: stepState(3) },
    { icon: <CheckCircle2 size={19}/>, label: 'Completed',       sub: 'Data ingested',             state: stepState(4) },
  ]

  return (
    <div className="up">
      <div className="up__body">
        <div className="up__main">
          <div className="up__heading">
            <h1>Upload Medical Bills</h1>
            <p>Upload your medical bills and let Blood Warriors AI extract the data for you.</p>
          </div>

          <div className="card">
            <div className="tabs">
              {TABS.map((t, i) => (
                <button key={i} className={`tab ${tab === i ? 'tab--on' : ''}`} onClick={() => setTab(i)}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>

            <div className="dz-wrap">
              <div {...getRootProps()} className={`dz ${isDragActive ? 'dz--over' : ''}`}>
                <input {...getInputProps()} />
                <div className="dz__icon">
                  <Upload size={28} color="#004080" strokeWidth={2} />
                </div>
                <p className="dz__text">Drag &amp; drop your files here or <span className="dz__link">click to browse</span></p>
                <p className="dz__fmt">Supports PDF · Max 50 MB per file · Multiple files allowed</p>
                <button type="button" className="dz__btn" onClick={e => { e.stopPropagation(); open() }}>
                  Choose Files
                </button>
              </div>

              <p className="dz__hint"><Info size={13} /> Drop multiple PDFs at once — OCR runs in parallel for all files.</p>

              {queue.length > 0 && (
                <div className="fq">
                  {queue.map(({ file: f, status, error, result }) => (
                    <div key={f.name} className={`fq__row fq__row--${status}`}>
                      <div className="fq__icon">
                        {status === 'processing' && <Loader2 size={13} className="spin" />}
                        {status === 'done'       && <CheckCircle2 size={13} color="#10B981" />}
                        {status === 'error'      && <AlertCircle size={13} color="#DC2626" />}
                        {status === 'pending'    && <FileText size={13} color="#737781" />}
                      </div>
                      <div className="fq__info">
                        <span className="fq__name">{f.name}</span>
                        <span className="fq__size">{(f.size/1024/1024).toFixed(2)} MB</span>
                        {error && <span className="fq__err">{error}</span>}
                      </div>
                      <div className="fq__actions">
                        {status === 'done' && result && (
                          <button className="fq__review" onClick={() => {
                            const done = queue.filter(e => e.status === 'done' && e.result)
                            const startIdx = done.findIndex(e => e.file === f)
                            onReview(done.map(e => ({ file: e.file, data: e.result! })), Math.max(0, startIdx))
                          }}>
                            Review
                          </button>
                        )}
                        {status !== 'processing' && (
                          <button className="fq__remove" onClick={() => removeEntry(f)}>
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {queue.some(e => e.status === 'pending') && (
                <button className="process-btn" onClick={handleProcess}>
                  <Zap size={15} />
                  Extract {queue.filter(e => e.status === 'pending').length} Medical Bill{queue.filter(e => e.status === 'pending').length > 1 ? 's' : ''} in Parallel
                </button>
              )}
            </div>

            <div className="pipe-section">
              <h3 className="pipe-title">Processing Pipeline</h3>
              <div className="pipe">
                {steps.map((s, i) => (
                  <div key={i} className="pipe__col">
                    <div className="pipe__step">
                      <div className={`pipe__circle pipe__circle--${s.state}`}>
                        <span className={s.state === 'active' ? 'spin-slow' : ''}>{s.icon}</span>
                      </div>
                      <div className="pipe__label">{s.label}</div>
                      <div className="pipe__sub">{s.sub}</div>
                      {s.state === 'done' && <CheckCircle2 size={14} className="pipe__check" />}
                    </div>
                    {i < steps.length - 1 && (
                      <div className={`pipe__line ${s.state === 'done' ? 'pipe__line--done' : ''}`} />
                    )}
                  </div>
                ))}
              </div>

              {total > 0 && (
                <div className="prog">
                  <div className="prog__bar"><div className="prog__fill" style={{ width: `${progressPct}%` }} /></div>
                  <div className="prog__row">
                    <span className="prog__txt">{finishedCount} of {total} file{total !== 1 ? 's' : ''} processed</span>
                    <span className="prog__pct">{progressPct}%</span>
                  </div>
                </div>
              )}

              {(() => {
                const active = queue.find(e => e.status === 'processing')
                if (!active) return null
                return (
                  <div className="cp">
                    <span className="cp__label">Currently Processing</span>
                    <div className="cp__row">
                      <div className="cp__icon"><FileText size={13} /></div>
                      <div className="cp__name">
                        <span>{active.file.name}</span>
                        <span className="cp__size">{(active.file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                      <span className="cp__status">Extracting data…</span>
                      <div className="cp__bar-wrap">
                        <div className="cp__bar"><div className="cp__fill cp__fill--indet" /></div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          <div className="features">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div className="feat" key={title}>
                <div className="feat__icon"><Icon size={17} /></div>
                <div>
                  <div className="feat__title">{title}</div>
                  <div className="feat__desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="up__side">
          <div className="card card--pad">
            <div className="sum__hdr">
              <span className="sum__title">Extraction Summary</span>
              <button className="link-btn">View Details</button>
            </div>

            <div className="sum__body">
              {(() => {
                const segs = total > 0 ? [
                  { frac: pendingCount    / total, color: '#004080' },
                  { frac: processingCount / total, color: '#93c5fd' },
                  { frac: errorCount      / total, color: '#DC2626' },
                  { frac: doneCount       / total, color: '#10B981' },
                ] : []
                let cursor = 0
                return (
                  <svg width={CX*2} height={CY*2} viewBox={`0 0 ${CX*2} ${CY*2}`} className="donut">
                    <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={STROKE} />
                    {segs.map((seg, i) => {
                      const start = cursor
                      cursor += seg.frac
                      if (seg.frac <= 0) return null
                      return (
                        <circle key={i} cx={CX} cy={CY} r={R} fill="none"
                          stroke={seg.color} strokeWidth={STROKE}
                          strokeDasharray={`${seg.frac * circ} ${circ}`}
                          strokeDashoffset={`${-start * circ}`}
                          strokeLinecap="butt"
                          transform={`rotate(-90 ${CX} ${CY})`}
                        />
                      )
                    })}
                    <text x={CX} y={CY - 8} textAnchor="middle" fontSize="22" fontWeight="800" fill="#0b1c30">
                      {total > 0 ? `${progressPct}%` : '0'}
                    </text>
                    <text x={CX} y={CY + 10} textAnchor="middle" fontSize="10" fill="#737781">
                      {total > 0 ? 'Progress' : 'No files'}
                    </text>
                  </svg>
                )
              })()}

              <div className="legend">
                <div className="legend__row"><span className="dot" style={{background:'#004080'}}/>Total<strong>{total}</strong></div>
                <div className="legend__row"><span className="dot" style={{background:'#10B981'}}/>Completed<strong>{doneCount}</strong></div>
                <div className="legend__row"><span className="dot" style={{background:'#93c5fd'}}/>Processing<strong>{processingCount}</strong></div>
                <div className="legend__row"><span className="dot" style={{background:'#DC2626'}}/>Failed<strong>{errorCount}</strong></div>
              </div>
            </div>

            <div className="quality-box">
              <Zap size={13} color="#004080" />
              <div>
                <div className="quality-box__title">
                  {allFinished && errorCount === 0 ? 'Extraction complete!' :
                   allFinished && errorCount > 0   ? `${errorCount} file${errorCount > 1 ? 's' : ''} failed` :
                   anyProcessing                   ? 'Extracting with AI…' :
                   'Upload files to begin'}
                </div>
                <div className="quality-box__sub">
                  {allFinished && errorCount === 0 ? 'All medical bills extracted successfully.' :
                   allFinished && errorCount > 0   ? 'Some files could not be extracted.' :
                   anyProcessing                   ? 'OCR extraction running in parallel.' :
                   'Drop PDFs above and click Extract.'}
                </div>
              </div>
            </div>
          </div>

          <div className="card card--pad">
            <div className="sum__hdr">
              <span className="sum__title">Recent Uploads</span>
            </div>
            <div className="ru">
              {queue.length === 0 ? (
                <div className="ru__empty">No uploads yet</div>
              ) : (
                [...queue].reverse().map(({ file: f, status }) => {
                  const isPdf = f.name.toLowerCase().endsWith('.pdf')
                  const badgeKey = status === 'done' ? 'completed' : status === 'error' ? 'failed' : status
                  const badgeLabel = status === 'done' ? 'Completed' : status === 'error' ? 'Failed' : status === 'processing' ? 'Processing' : 'Pending'
                  return (
                    <div key={f.name} className="ru__item">
                      <div className={`ru__icon ${isPdf ? 'ru__icon--pdf' : 'ru__icon--xls'}`}>
                        {isPdf ? <FileText size={13} /> : <Layers size={13} />}
                      </div>
                      <div className="ru__info">
                        <div className="ru__name">{f.name}</div>
                        <div className="ru__meta">{(f.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                      <div className="ru__right">
                        <span className={`badge badge--${badgeKey}`}>{badgeLabel}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .up { padding: 26px 28px 32px; background: #f8f9ff; height: 100%; overflow-y: auto; box-sizing: border-box; font-family: 'Inter', sans-serif; }
        .up__body { display: flex; gap: 22px; align-items: flex-start; }
        .up__main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 18px; }
        .up__side { width: 298px; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px; }
        .up__heading h1 { font-size: 21px; font-weight: 700; color: #0b1c30; font-family: 'Public Sans', sans-serif; }
        .up__heading p  { font-size: 13px; color: #737781; margin-top: 3px; }
        .card { background: white; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; }
        .card--pad { padding: 18px; }
        .tabs { display: flex; border-bottom: 1px solid #e2e8f0; padding: 0 18px; overflow-x: auto; gap: 0; }
        .tab { display: flex; align-items: center; gap: 5px; padding: 13px 13px; background: none; border: none; border-bottom: 2px solid transparent; border-radius: 0; font-size: 12.5px; font-weight: 500; color: #737781; white-space: nowrap; cursor: pointer; margin-bottom: -1px; transition: color 0.12s; font-family: 'Inter', sans-serif; }
        .tab:hover { color: #004080; }
        .tab--on { color: #004080; border-bottom-color: #004080; font-weight: 600; }
        .dz-wrap { padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 10px; }
        .dz { border: 1.5px dashed #c3c6d2; border-radius: 8px; padding: 38px 20px 34px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 7px; transition: border-color 0.15s, background 0.15s; background: white; }
        .dz:hover, .dz--over { border-color: #004080; background: #eff4ff; }
        .dz__icon { width: 62px; height: 62px; border-radius: 50%; background: #eff4ff; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
        .dz__text { font-size: 14px; color: #424750; font-weight: 500; }
        .dz__link { color: #004080; font-weight: 600; }
        .dz__fmt  { font-size: 12px; color: #737781; }
        .dz__btn  { margin-top: 4px; padding: 9px 28px; background: #004080; color: white; border: none; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px; font-family: 'Inter', sans-serif; transition: background 0.12s; }
        .dz__btn:hover:not(:disabled) { background: #002a58; }
        .dz__hint { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #737781; }
        .fq { display: flex; flex-direction: column; gap: 6px; }
        .fq__row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 4px; border: 1px solid #e2e8f0; background: #f8f9ff; }
        .fq__row--processing { border-color: #bfdbfe; background: #eff4ff; }
        .fq__row--done       { border-color: #a7f3d0; background: #f0fdf4; }
        .fq__row--error      { border-color: #fecaca; background: #fff5f5; }
        .fq__icon { flex-shrink: 0; display: flex; }
        .fq__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .fq__name { font-size: 12px; font-weight: 600; color: #0b1c30; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fq__size { font-size: 11px; color: #737781; }
        .fq__err  { font-size: 11px; color: #DC2626; }
        .fq__actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .fq__review { padding: 4px 10px; background: #004080; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; }
        .fq__review:hover { background: #002a58; }
        .fq__remove { width: 22px; height: 22px; border-radius: 4px; border: 1px solid #e2e8f0; background: white; color: #737781; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .fq__remove:hover { background: #fee2e2; color: #DC2626; border-color: #fecaca; }
        .process-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 20px; background: #004080; color: white; border: none; border-radius: 4px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; width: fit-content; }
        .process-btn:hover { background: #002a58; }
        .pipe-section { border-top: 1px solid #e2e8f0; padding: 20px 18px; }
        .pipe-title { font-size: 15px; font-weight: 700; color: #0b1c30; margin-bottom: 18px; font-family: 'Public Sans', sans-serif; }
        .pipe { display: flex; align-items: flex-start; }
        .pipe__col { display: flex; align-items: center; flex: 1; }
        .pipe__col:last-child { flex: 0; }
        .pipe__step { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 90px; }
        .pipe__circle { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #e2e8f0; background: white; color: #737781; flex-shrink: 0; transition: all 0.2s; }
        .pipe__circle--done    { background: #004080; border-color: #004080; color: white; }
        .pipe__circle--active  { border-color: #004080; color: #004080; background: white; }
        .pipe__circle--pending { border-color: #c3c6d2; color: #c3c6d2; }
        .pipe__label { font-size: 12px; font-weight: 600; color: #424750; text-align: center; font-family: 'Inter', sans-serif; }
        .pipe__sub   { font-size: 11px; color: #737781; text-align: center; max-width: 88px; }
        .pipe__check { color: #10B981; margin-top: 2px; }
        .pipe__line { flex: 1; height: 2px; background: #e2e8f0; margin: 0 4px; margin-bottom: 42px; min-width: 20px; }
        .pipe__line--done { background: #004080; }
        .prog { margin-top: 18px; display: flex; flex-direction: column; gap: 5px; }
        .prog__bar  { height: 7px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
        .prog__fill { height: 100%; background: #004080; border-radius: 99px; }
        .prog__row  { display: flex; align-items: center; font-size: 12px; color: #737781; gap: 8px; }
        .prog__pct  { font-weight: 700; color: #004080; margin-left: auto; }
        .cp { margin-top: 14px; }
        .cp__label { font-size: 12px; font-weight: 600; color: #424750; display: block; margin-bottom: 8px; }
        .cp__row { display: flex; align-items: center; gap: 10px; background: #f8f9ff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px 14px; }
        .cp__icon { width: 28px; height: 28px; border-radius: 4px; background: #fee2e2; color: #DC2626; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .cp__name { display: flex; flex-direction: column; min-width: 0; }
        .cp__name span:first-child { font-size: 12px; font-weight: 600; color: #0b1c30; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px; }
        .cp__size { font-size: 11px; color: #737781; }
        .cp__status { font-size: 11px; color: #737781; white-space: nowrap; flex-shrink: 0; }
        .cp__bar-wrap { flex: 1; min-width: 80px; }
        .cp__bar  { height: 6px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
        .cp__fill { height: 100%; background: #004080; border-radius: 99px; }
        .features { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; }
        .feat { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 14px; display: flex; align-items: flex-start; gap: 10px; }
        .feat__icon { width: 34px; height: 34px; border-radius: 4px; background: #eff4ff; color: #004080; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .feat__title { font-size: 12px; font-weight: 700; color: #0b1c30; font-family: 'Inter', sans-serif; }
        .feat__desc  { font-size: 11px; color: #737781; margin-top: 2px; line-height: 1.45; }
        .sum__hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .sum__title { font-size: 14px; font-weight: 700; color: #0b1c30; font-family: 'Public Sans', sans-serif; }
        .link-btn { background: none; border: none; color: #004080; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif; }
        .link-btn:hover { text-decoration: underline; }
        .sum__body { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
        .donut { flex-shrink: 0; }
        .legend { display: flex; flex-direction: column; gap: 7px; }
        .legend__row { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #424750; }
        .legend__row strong { margin-left: auto; padding-left: 12px; font-weight: 700; color: #0b1c30; }
        .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
        .quality-box { display: flex; align-items: flex-start; gap: 8px; background: #eff4ff; border: 1px solid #c3c6d2; border-radius: 4px; padding: 10px 12px; }
        .quality-box__title { font-size: 12px; font-weight: 700; color: #004080; }
        .quality-box__sub   { font-size: 11px; color: #424750; margin-top: 2px; line-height: 1.4; }
        .cp__fill--indet { height: 100%; background: #004080; border-radius: 99px; width: 35%; animation: indeterminate 1.4s ease-in-out infinite; }
        @keyframes indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        .ru { display: flex; flex-direction: column; }
        .ru__empty { font-size: 12px; color: #737781; padding: 12px 0; text-align: center; }
        .ru__item { display: flex; align-items: flex-start; gap: 9px; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
        .ru__item:last-child { border-bottom: none; padding-bottom: 0; }
        .ru__icon { width: 30px; height: 30px; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
        .ru__icon--pdf { background: #fee2e2; color: #DC2626; }
        .ru__icon--xls { background: #d1fae5; color: #059669; }
        .ru__info { flex: 1; min-width: 0; }
        .ru__name { font-size: 12px; font-weight: 600; color: #0b1c30; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ru__meta { font-size: 11px; color: #737781; margin-top: 2px; }
        .ru__right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
        .badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; white-space: nowrap; }
        .badge--pending    { background: #eff4ff; color: #004080; }
        .badge--completed  { background: #d1fae5; color: #065f46; }
        .badge--processing { background: #eff4ff; color: #004080; }
        .badge--failed     { background: #fee2e2; color: #991b1b; }
        .spin { animation: spin 0.7s linear infinite; }
        .spin-slow { animation: spin 1.4s linear infinite; display: flex; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1100px) { .up__body { flex-direction: column; } .up__side { width: 100%; flex-direction: row; flex-wrap: wrap; } .up__side > * { flex: 1 1 280px; } }
        @media (max-width: 800px) { .features { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 500px) { .features { grid-template-columns: 1fr; } .up { padding: 16px; } }
      `}</style>
    </div>
  )
}
