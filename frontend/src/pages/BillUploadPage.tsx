import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UploadStep from './UploadStep'
import ReviewStep from './ReviewStep'
import type { QueueItem, IngestResult, UploadEntry } from '../api/invoices'
import { CheckCircle2, ArrowRight } from 'lucide-react'

type Step = 'upload' | 'review' | 'done'

export default function BillUploadPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('upload')
  const [uploadQueue, setUploadQueue] = useState<UploadEntry[]>([])
  const [reviewQueue, setReviewQueue] = useState<QueueItem[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [lastResult, setLastResult] = useState<IngestResult | null>(null)

  const handleReview = (items: QueueItem[], startIdx: number) => {
    setReviewQueue(items)
    setReviewIndex(startIdx)
    setStep('review')
  }

  const handleDone = (result: IngestResult) => {
    setLastResult(result)
    setStep('done')
  }

  const handleBackToUpload = () => {
    setStep('upload')
  }

  if (step === 'review') {
    const currentItem = reviewQueue[reviewIndex]
    return (
      <ReviewStep
        data={currentItem?.data ?? null}
        loading={false}
        error=""
        file={currentItem?.file ?? null}
        queue={reviewQueue}
        queueIndex={reviewIndex}
        onNav={i => setReviewIndex(i)}
        onBack={handleBackToUpload}
        onDone={handleDone}
      />
    )
  }

  if (step === 'done') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20, padding: 40, fontFamily: 'Inter, sans-serif' }}>
        <CheckCircle2 size={56} color="#10b981" />
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Bill Submitted Successfully!</h2>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0, textAlign: 'center', maxWidth: 400 }}>
          Your medical bill has been submitted for approval. You can track its status in the Bills page.
        </p>
        {lastResult?.invoice_id && (
          <div style={{ fontSize: 12, color: '#9ca3af', background: '#f9fafb', padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            Bill ID: <strong style={{ color: '#374151' }}>{lastResult.invoice_id}</strong>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={() => { setStep('upload'); setUploadQueue([]) }}
            style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Upload Another
          </button>
          <button
            onClick={() => navigate('/bills')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 6, border: 'none', background: '#004080', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            View Bills <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <UploadStep
      uploadQueue={uploadQueue}
      setUploadQueue={setUploadQueue}
      onReview={handleReview}
    />
  )
}
