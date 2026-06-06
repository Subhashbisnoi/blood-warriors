import { getDonorProfile } from '../../api/donorPortal';
import type { GratitudeMessage } from '../../api/donorPortal';

const ACCENTS = ['#ba1a1a', '#1565c0', '#e65100', '#2e7d32', '#6a1b9a', '#00838f'];

function bgShort(bg: string) {
  return (bg ?? '').replace('Positive','+').replace('Negative','-').replace(' ','').trim() || bg;
}

function GratitudeCard({ msg, index }: { msg: GratitudeMessage; index: number }) {
  const accent = ACCENTS[index % ACCENTS.length];
  const initials = msg.from_patient.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const short = bgShort(msg.blood_group);

  return (
    <div className="bg-white rounded-2xl overflow-hidden flex flex-col"
         style={{ boxShadow:'0 2px 12px rgba(0,0,0,0.06)', border:'1px solid rgba(0,0,0,0.06)' }}>
      {/* Accent strip */}
      <div className="h-1 flex-shrink-0" style={{ background:`linear-gradient(90deg,${accent},${accent}44)` }} />

      <div className="p-lg flex flex-col gap-md flex-1">
        {/* Header row */}
        <div className="flex items-center gap-md">
          {/* Avatar */}
          <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-white flex-shrink-0 text-[13px]"
               style={{ background:`linear-gradient(135deg,${accent},${accent}aa)` }}>
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-xs flex-wrap">
              <span className="text-label-lg font-bold text-on-surface leading-tight">{msg.from_patient}</span>
              <span className="text-[11px] px-xs py-[1px] rounded-full font-bold"
                    style={{ background: accent+'15', color: accent }}>{short}</span>
              {msg.lives_saved_moment && (
                <span className="text-[11px] px-xs py-[1px] rounded-full font-bold flex items-center gap-[2px]"
                      style={{ background:'rgba(186,26,26,0.08)', color:'#ba1a1a' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:10 }}>favorite</span>
                  Life saved
                </span>
              )}
            </div>
            <p className="text-[11px] text-on-surface-variant mt-[2px] flex items-center gap-[3px]">
              <span className="material-symbols-outlined" style={{ fontSize:11 }}>location_on</span>
              {msg.city}
              <span className="mx-[2px]">·</span>
              {new Date(msg.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
            </p>
          </div>
        </div>

        {/* Quote */}
        <div className="rounded-xl px-md py-sm flex-1 relative"
             style={{ background: accent+'08', border:`1px solid ${accent}18` }}>
          <span className="absolute -top-[10px] left-3 text-[28px] font-serif leading-none select-none"
                style={{ color: accent+'44' }}>"</span>
          <p className="text-body-sm text-on-surface leading-relaxed pt-2">{msg.message}</p>
        </div>
      </div>
    </div>
  );
}

export default function DonorGratitude() {
  const profile = getDonorProfile();
  if (!profile) return null;

  const messages = profile.gratitude_messages ?? [];
  const lifeSavedCount = messages.filter(m => m.lives_saved_moment).length;

  return (
    <div className="flex-1 overflow-y-auto bg-[#f8f4f4]">

      {/* Hero */}
      <div className="relative overflow-hidden"
           style={{ background:'linear-gradient(160deg,#200808 0%,#3d0c0c 55%,#1a0505 100%)', minHeight:160 }}>
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full blur-[90px] pointer-events-none opacity-40"
             style={{ background:'#ba1a1a', transform:'translate(40%,-40%)' }} />

        <div className="relative z-10 px-xl py-xl">
          <div className="flex items-center gap-sm mb-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background:'rgba(186,26,26,0.25)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ color:'#fca5a5', fontSize:22 }}>favorite</span>
            </div>
            <h1 className="text-[1.45rem] font-black text-white leading-tight">Gratitude Messages</h1>
          </div>

          <p className="text-[13px] mb-lg ml-[2px]" style={{ color:'rgba(255,255,255,0.5)' }}>
            Words from patients whose lives you touched
          </p>

          <div className="flex gap-md flex-wrap">
            <div className="px-md py-sm rounded-xl flex items-center gap-sm"
                 style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.1)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ color:'#fca5a5', fontSize:16 }}>chat_bubble</span>
              <span className="text-[13px] font-bold text-white">{messages.length}</span>
              <span className="text-[12px]" style={{ color:'rgba(255,255,255,0.5)' }}>messages</span>
            </div>
            {lifeSavedCount > 0 && (
              <div className="px-md py-sm rounded-xl flex items-center gap-sm"
                   style={{ background:'rgba(186,26,26,0.2)', border:'1px solid rgba(186,26,26,0.3)' }}>
                <span className="material-symbols-outlined icon-fill" style={{ color:'#fca5a5', fontSize:16 }}>favorite</span>
                <span className="text-[13px] font-bold text-white">{lifeSavedCount}</span>
                <span className="text-[12px]" style={{ color:'rgba(255,255,255,0.5)' }}>life-saving moments</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="px-xl py-xl max-w-[1200px] mx-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-lg"
                 style={{ background:'rgba(186,26,26,0.06)', border:'1px solid rgba(186,26,26,0.12)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize:32, color:'#ba1a1a' }}>favorite</span>
            </div>
            <p className="text-title-lg font-bold text-on-surface">No messages yet</p>
            <p className="text-body-md text-on-surface-variant mt-xs max-w-xs">
              Gratitude messages from patients will appear here after matches are completed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
            {messages.map((msg, i) => (
              <GratitudeCard key={msg.id} msg={msg} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
