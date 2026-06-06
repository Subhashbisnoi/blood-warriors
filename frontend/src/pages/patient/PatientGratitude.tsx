import { useState } from 'react';
import { sendGratitude } from '../../api/patient';
import { getPatientProfile } from '../../api/patient';

const MAX = 400;

export default function PatientGratitude() {
  const profile = getPatientProfile();
  const [donorHash, setDonorHash] = useState('');
  const [message, setMessage]     = useState('');
  const [status, setStatus]       = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg]   = useState('');
  const [sentHash, setSentHash]   = useState('');

  async function handleSend() {
    if (donorHash.trim().length < 4 || !message.trim()) return;
    setStatus('sending'); setErrorMsg('');
    try {
      const res = await sendGratitude(donorHash.trim(), message.trim());
      setSentHash(res.donor_hash);
      setStatus('sent');
      setDonorHash(''); setMessage('');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErrorMsg(detail ?? 'Failed to send. Please check the Donor ID and try again.');
      setStatus('error');
    }
  }

  function reset() { setStatus('idle'); setErrorMsg(''); }

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8f4f4]">

      {/* Hero */}
      <div className="relative overflow-hidden px-xl py-xl"
           style={{ background: 'linear-gradient(160deg,#200808 0%,#3d0c0c 55%,#1a0505 100%)' }}>
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full blur-[80px] pointer-events-none opacity-40"
             style={{ background: '#ba1a1a', transform: 'translate(40%,-40%)' }} />
        <div className="relative z-10">
          <div className="flex items-center gap-sm mb-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: 'rgba(186,26,26,0.25)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ color: '#fca5a5', fontSize: 22 }}>favorite</span>
            </div>
            <h1 className="text-[1.45rem] font-black text-white">Send Gratitude</h1>
          </div>
          <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Thank a donor whose blood helped you or your loved one
          </p>
        </div>
      </div>

      <div className="px-xl py-xl max-w-2xl mx-auto">

        {status === 'sent' ? (
          /* ── Success state ── */
          <div className="bg-white rounded-3xl p-xl flex flex-col items-center text-center gap-lg"
               style={{ boxShadow: '0 4px 24px rgba(46,125,50,0.12)', border: '1px solid rgba(46,125,50,0.2)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
                 style={{ background: 'rgba(46,125,50,0.1)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 36, color: '#2e7d32' }}>check_circle</span>
            </div>
            <div>
              <h2 className="text-title-lg font-bold text-on-surface">Message Sent!</h2>
              <p className="text-body-md text-on-surface-variant mt-xs">
                Your gratitude has been delivered to Donor <strong>{sentHash}</strong>.
                It will appear in their portal alongside a heart badge.
              </p>
            </div>
            <button onClick={reset}
                    className="px-xl py-sm rounded-xl text-label-md font-bold text-white"
                    style={{ background: '#ba1a1a' }}>
              Send Another
            </button>
          </div>
        ) : (
          /* ── Form ── */
          <div className="bg-white rounded-3xl overflow-hidden"
               style={{ boxShadow: '0 2px 16px rgba(186,26,26,0.08)', border: '1px solid rgba(186,26,26,0.1)' }}>

            {/* Patient info strip */}
            {profile && (
              <div className="flex items-center gap-sm px-xl py-md border-b"
                   style={{ borderColor: 'rgba(186,26,26,0.08)', background: 'rgba(186,26,26,0.02)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-[11px] flex-shrink-0"
                     style={{ background: '#ba1a1a' }}>
                  {profile.blood_group.replace(' Positive','+').replace(' Negative','−')}
                </div>
                <div className="min-w-0">
                  <p className="text-label-md font-bold text-on-surface truncate">{profile.name}</p>
                  <p className="text-[11px] text-on-surface-variant">Sending as patient · identity kept private from donor</p>
                </div>
              </div>
            )}

            <div className="p-xl space-y-lg">
              {/* Donor ID */}
              <div>
                <label className="text-label-md font-bold text-on-surface block mb-sm">
                  Donor ID <span className="font-normal text-on-surface-variant">(4–8 characters)</span>
                </label>
                <div className="flex items-center gap-sm px-md py-md rounded-xl border transition-all focus-within:ring-2"
                     style={{ borderColor: 'rgba(186,26,26,0.2)' }}>
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>badge</span>
                  <input
                    type="text"
                    value={donorHash}
                    onChange={e => { setDonorHash(e.target.value.toUpperCase()); setStatus('idle'); }}
                    placeholder="e.g. E699AD93"
                    maxLength={12}
                    className="flex-1 bg-transparent text-body-md font-mono outline-none tracking-widest uppercase"
                  />
                </div>
                <p className="text-label-sm text-on-surface-variant mt-xs">
                  Ask the donor for their ID, or find it on the coordination sheet.
                </p>
              </div>

              {/* Message */}
              <div>
                <label className="text-label-md font-bold text-on-surface block mb-sm">
                  Your Message
                </label>
                <div className="relative">
                  <textarea
                    value={message}
                    onChange={e => { setMessage(e.target.value.slice(0, MAX)); setStatus('idle'); }}
                    placeholder="Share how this donation impacted your life or your loved one's life…"
                    rows={5}
                    className="w-full px-md py-md rounded-xl border text-body-md outline-none resize-none transition-all focus:ring-2"
                    style={{ borderColor: 'rgba(186,26,26,0.2)', lineHeight: 1.6 }}
                  />
                  <span className="absolute bottom-3 right-3 text-[11px] text-on-surface-variant">
                    {message.length}/{MAX}
                  </span>
                </div>
              </div>

              {/* Error */}
              {status === 'error' && (
                <div className="flex items-start gap-sm p-md rounded-xl"
                     style={{ background: 'rgba(186,26,26,0.06)', border: '1px solid rgba(186,26,26,0.2)' }}>
                  <span className="material-symbols-outlined icon-fill text-error flex-shrink-0" style={{ fontSize: 18, marginTop: 1 }}>error</span>
                  <p className="text-label-md text-error">{errorMsg}</p>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSend}
                disabled={donorHash.trim().length < 4 || !message.trim() || status === 'sending'}
                className="w-full py-md rounded-xl text-label-md font-bold text-white flex items-center justify-center gap-sm transition-opacity disabled:opacity-50"
                style={{ background: '#ba1a1a' }}>
                {status === 'sending' ? (
                  <><span className="animate-spin material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Sending…</>
                ) : (
                  <><span className="material-symbols-outlined icon-fill" style={{ fontSize: 18 }}>favorite</span> Send Gratitude Message</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Tip */}
        <div className="mt-lg flex items-start gap-sm p-md rounded-2xl"
             style={{ background: 'rgba(186,26,26,0.04)', border: '1px solid rgba(186,26,26,0.08)' }}>
          <span className="material-symbols-outlined icon-fill flex-shrink-0" style={{ fontSize: 18, color: '#ba1a1a', marginTop: 1 }}>info</span>
          <p className="text-label-sm text-on-surface-variant leading-relaxed">
            Your identity is kept private — the donor only sees "Anonymous Patient" and your blood group.
            Your message will appear instantly in their Gratitude tab marked as a real message.
          </p>
        </div>
      </div>
    </div>
  );
}
