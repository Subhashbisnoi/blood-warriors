import { useEffect, useState } from 'react';
import { getDonorProfile, fetchRealGratitude } from '../../api/donorPortal';
import type { GratitudeMessage } from '../../api/donorPortal';

const ACCENTS = ['#1565c0', '#e65100', '#2e7d32', '#6a1b9a', '#00838f', '#c77700'];

function bgShort(bg: string) {
  return (bg ?? '').replace('Positive', '+').replace('Negative', '-').replace(' ', '').trim() || bg;
}

function GratitudeCard({ msg, index }: { msg: GratitudeMessage; index: number }) {
  const accent = msg.is_real ? '#ba1a1a' : ACCENTS[index % ACCENTS.length];
  const short = bgShort(msg.blood_group);

  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col h-full"
         style={{
           boxShadow: msg.is_real ? '0 4px 20px rgba(186,26,26,0.14)' : '0 2px 10px rgba(0,0,0,0.05)',
           border: msg.is_real ? '1.5px solid rgba(186,26,26,0.25)' : '1px solid rgba(0,0,0,0.06)',
         }}>
      {/* Top strip */}
      <div style={{ height: msg.is_real ? 3 : 2, background: `linear-gradient(90deg,${accent},${accent}44)`, flexShrink: 0 }} />

      <div className="p-lg flex flex-col gap-md flex-1">
        {/* Header */}
        <div className="flex items-start gap-md">
          <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
               style={{ background: `linear-gradient(135deg,${accent},${accent}99)` }}>
            <span className="material-symbols-outlined icon-fill" style={{ color: '#fff', fontSize: 20 }}>favorite</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-xs flex-wrap">
              <span className="text-label-lg font-bold text-on-surface leading-tight">Anonymous Patient</span>
              <span className="text-[11px] px-xs py-[1px] rounded-full font-bold"
                    style={{ background: accent + '15', color: accent }}>{short}</span>
              {msg.is_real ? (
                <span className="text-[11px] px-xs py-[1px] rounded-full font-black flex items-center gap-[2px]"
                      style={{ background: 'rgba(186,26,26,0.1)', color: '#ba1a1a', border: '1px solid rgba(186,26,26,0.2)' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize: 10 }}>verified</span>
                  Real message
                </span>
              ) : (
                <span className="text-[11px] px-xs py-[1px] rounded-full font-medium"
                      style={{ background: 'rgba(0,0,0,0.04)', color: '#888' }}>
                  Sample
                </span>
              )}
              {msg.is_real && msg.lives_saved_moment && (
                <span className="text-[11px] px-xs py-[1px] rounded-full font-bold flex items-center gap-[2px]"
                      style={{ background: 'rgba(46,125,50,0.08)', color: '#2e7d32' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize: 10 }}>favorite</span>
                  Life saved
                </span>
              )}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-[2px] flex items-center gap-[3px]">
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>location_on</span>
              {msg.city}
              <span className="mx-[2px]">·</span>
              {new Date(msg.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Quote bubble */}
        <div className="rounded-xl px-md py-sm flex-1 relative"
             style={{ background: accent + '08', border: `1px solid ${accent}18` }}>
          <span className="absolute -top-[10px] left-3 text-[28px] font-serif leading-none select-none"
                style={{ color: accent + '44' }}>"</span>
          <p className="text-body-sm text-on-surface leading-relaxed pt-2">{msg.message}</p>
        </div>
      </div>
    </div>
  );
}

export default function DonorGratitude() {
  const profile = getDonorProfile();
  const [realMsgs, setRealMsgs] = useState<GratitudeMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.hash) { setLoading(false); return; }
    fetchRealGratitude(profile.hash)
      .then(msgs => setRealMsgs(msgs))
      .catch(() => setRealMsgs([]))
      .finally(() => setLoading(false));
  }, [profile?.hash]);

  if (!profile) return null;

  // Sample messages from the login-time profile (already generated)
  const samples = (profile.gratitude_messages ?? []).filter(m => !m.is_real);

  // Real messages always first, then samples
  const all: GratitudeMessage[] = [...realMsgs, ...samples];
  const realCount = realMsgs.length;

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8f4f4]">

      {/* Hero */}
      <div className="relative overflow-hidden"
           style={{ background: 'linear-gradient(160deg,#200808 0%,#3d0c0c 55%,#1a0505 100%)', minHeight: 160 }}>
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full blur-[90px] pointer-events-none opacity-40"
             style={{ background: '#ba1a1a', transform: 'translate(40%,-40%)' }} />

        <div className="relative z-10 px-xl py-xl">
          <div className="flex items-center gap-sm mb-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: 'rgba(186,26,26,0.25)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ color: '#fca5a5', fontSize: 22 }}>favorite</span>
            </div>
            <h1 className="text-[1.45rem] font-black text-white">Gratitude Messages</h1>
          </div>

          <p className="text-[13px] mb-lg" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Words from patients whose lives you touched
          </p>

          <div className="flex gap-md flex-wrap">
            {/* Real count */}
            <div className="px-md py-sm rounded-xl flex items-center gap-sm"
                 style={{ background: 'rgba(186,26,26,0.25)', border: '1px solid rgba(186,26,26,0.4)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ color: '#fca5a5', fontSize: 16 }}>verified</span>
              <span className="text-[13px] font-bold text-white">{realCount}</span>
              <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.6)' }}>real messages</span>
            </div>
            {/* Sample count */}
            <div className="px-md py-sm rounded-xl flex items-center gap-sm"
                 style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="material-symbols-outlined" style={{ color: '#fca5a5', fontSize: 16 }}>chat_bubble</span>
              <span className="text-[13px] font-bold text-white">{samples.length}</span>
              <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>sample messages</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-xl py-xl max-w-[1200px] mx-auto">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="animate-spin material-symbols-outlined text-on-surface-variant" style={{ fontSize: 28 }}>progress_activity</span>
          </div>
        ) : all.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-lg"
                 style={{ background: 'rgba(186,26,26,0.06)', border: '1px solid rgba(186,26,26,0.12)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 32, color: '#ba1a1a' }}>favorite</span>
            </div>
            <p className="text-title-lg font-bold text-on-surface">No messages yet</p>
            <p className="text-body-md text-on-surface-variant mt-xs max-w-xs">
              Gratitude messages from patients will appear here after matches are completed.
            </p>
          </div>
        ) : (
          <>
            {/* Real messages section */}
            {realCount > 0 && (
              <div className="mb-xl">
                <div className="flex items-center gap-sm mb-md">
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize: 16, color: '#ba1a1a' }}>verified</span>
                  <h2 className="text-title-sm font-bold text-on-surface">From Patients</h2>
                  <span className="text-label-sm px-sm py-[1px] rounded-full font-bold"
                        style={{ background: 'rgba(186,26,26,0.08)', color: '#ba1a1a' }}>{realCount}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
                  {realMsgs.map((msg, i) => (
                    <GratitudeCard key={msg.id} msg={msg} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Sample messages section */}
            {samples.length > 0 && (
              <div>
                <div className="flex items-center gap-sm mb-md">
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#888' }}>chat_bubble</span>
                  <h2 className="text-title-sm font-bold text-on-surface-variant">Sample Messages</h2>
                  <span className="text-label-sm px-sm py-[1px] rounded-full font-medium"
                        style={{ background: 'rgba(0,0,0,0.05)', color: '#888' }}>{samples.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
                  {samples.map((msg, i) => (
                    <GratitudeCard key={msg.id} msg={msg} index={i} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
