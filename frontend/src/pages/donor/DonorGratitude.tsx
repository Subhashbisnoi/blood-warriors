import { getDonorProfile } from '../../api/donorPortal';
import type { GratitudeMessage } from '../../api/donorPortal';

const ACCENTS = ['#ba1a1a', '#1565c0', '#e65100', '#2e7d32', '#6a1b9a', '#00838f'];

function GratitudeCard({ msg, index }: { msg: GratitudeMessage; index: number }) {
  const accent = ACCENTS[index % ACCENTS.length];
  const bgShort = (msg.blood_group ?? '').replace('Positive', '+').replace('Negative', '-').replace(' ', '').trim() || msg.blood_group;
  const initials = msg.from_patient.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all"
         style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
      {/* Top accent strip */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}44)` }} />

      <div className="p-lg">
        <div className="flex items-start gap-md">
          {/* Avatar */}
          <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-white flex-shrink-0 text-[13px]"
               style={{ background: `linear-gradient(135deg, ${accent}, ${accent}aa)` }}>
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-sm mb-sm">
              <div>
                <div className="flex items-center gap-xs flex-wrap">
                  <span className="text-label-lg font-bold text-on-surface">{msg.from_patient}</span>
                  <span className="text-[11px] px-xs rounded-full font-bold"
                        style={{ background: accent + '15', color: accent }}>{bgShort}</span>
                  {msg.lives_saved_moment && (
                    <span className="text-[11px] px-xs rounded-full font-bold flex items-center gap-[2px]"
                          style={{ background: 'rgba(186,26,26,0.08)', color: '#ba1a1a' }}>
                      <span className="material-symbols-outlined icon-fill" style={{ fontSize: 10 }}>favorite</span>
                      Life saved
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-on-surface-variant mt-[2px] flex items-center gap-xs">
                  <span className="material-symbols-outlined" style={{ fontSize: 11 }}>location_on</span>
                  {msg.city} ·{' '}
                  {new Date(msg.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Message */}
            <div className="rounded-xl px-md py-sm relative"
                 style={{ background: accent + '08', border: `1px solid ${accent}18` }}>
              <span className="absolute -top-2 left-3 text-2xl font-serif leading-none" style={{ color: accent + '55' }}>"</span>
              <p className="text-body-md text-on-surface leading-relaxed pt-1">{msg.message}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DonorGratitude() {
  const profile = getDonorProfile();
  if (!profile) return null;

  const messages = profile.gratitude_messages ?? [];
  const lifeSaved = messages.filter(m => m.lives_saved_moment).length;

  return (
    <div className="flex-1 overflow-y-auto bg-background">

      {/* Hero */}
      <div className="relative overflow-hidden px-xl pt-xl pb-lg"
           style={{ background: 'linear-gradient(135deg, #1a0505 0%, #3b0a0a 50%, #1a0505 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none"
             style={{ background: 'rgba(186,26,26,0.2)', transform: 'translate(30%,-30%)' }} />
        <div className="relative z-10">
          <div className="flex items-center gap-sm mb-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={{ background: 'rgba(186,26,26,0.25)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ color: '#fca5a5', fontSize: 22 }}>mail_heart</span>
            </div>
            <h1 className="text-[1.5rem] font-black text-white">Gratitude Messages</h1>
          </div>
          <p className="text-[13px] mb-lg" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Words from patients whose lives you touched
          </p>
          <div className="flex gap-md flex-wrap">
            <div className="px-lg py-sm rounded-xl flex items-center gap-sm"
                 style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ color: '#fca5a5', fontSize: 18 }}>mail</span>
              <span className="text-white font-bold">{messages.length}</span>
              <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.55)' }}>messages</span>
            </div>
            {lifeSaved > 0 && (
              <div className="px-lg py-sm rounded-xl flex items-center gap-sm"
                   style={{ background: 'rgba(186,26,26,0.2)', border: '1px solid rgba(186,26,26,0.3)' }}>
                <span className="material-symbols-outlined icon-fill" style={{ color: '#fca5a5', fontSize: 18 }}>favorite</span>
                <span className="text-white font-bold">{lifeSaved}</span>
                <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.55)' }}>life-saving moments</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="px-xl py-xl">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-lg"
                 style={{ background: 'rgba(186,26,26,0.06)', border: '1px solid rgba(186,26,26,0.12)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#ba1a1a' }}>mail_heart</span>
            </div>
            <p className="text-title-lg font-bold text-on-surface">No messages yet</p>
            <p className="text-body-md text-on-surface-variant mt-xs max-w-xs">
              Gratitude messages from patients will appear here after matches are completed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md max-w-5xl">
            {messages.map((msg, i) => (
              <GratitudeCard key={msg.id} msg={msg} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
