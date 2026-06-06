import TopBar from '../../components/layout/TopBar';
import { getDonorProfile } from '../../api/donorPortal';
import type { GratitudeMessage } from '../../api/donorPortal';

function GratitudeCard({ msg, index }: { msg: GratitudeMessage; index: number }) {
  const colors = ['#ba1a1a', '#1565c0', '#e65100', '#2e7d32', '#6a1b9a'];
  const accent = colors[index % colors.length];
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm hover:shadow-md transition-shadow"
         style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="flex items-start gap-md">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-white flex-shrink-0 text-label-lg"
             style={{ background: accent }}>
          {msg.blood_group || '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-xs mb-sm">
            <div className="flex items-center gap-xs flex-wrap">
              <span className="text-title-sm font-bold text-on-surface">{msg.from_patient}</span>
              <span className="text-label-sm px-xs rounded-full font-medium"
                    style={{ background: accent + '15', color: accent }}>{msg.blood_group}</span>
              {msg.lives_saved_moment && (
                <span className="text-label-sm px-xs rounded-full font-bold"
                      style={{ background: 'rgba(186,26,26,0.1)', color: '#ba1a1a' }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize: 11, verticalAlign: 'middle' }}>favorite</span>
                  {' '}Life saved
                </span>
              )}
            </div>
            <div className="flex items-center gap-xs text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>location_on</span>
              <span className="text-label-sm">{msg.city}</span>
              <span className="text-label-sm">·</span>
              <span className="text-label-sm">
                {new Date(msg.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>

          <blockquote className="text-body-md text-on-surface leading-relaxed italic"
                      style={{ borderLeft: 'none' }}>
            "{msg.message}"
          </blockquote>
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
    <div className="flex flex-col h-full">
      <TopBar title="Gratitude from Patients" />
      <div className="flex-1 overflow-y-auto p-xl bg-background">

        {/* Header stats */}
        <div className="flex items-center justify-between mb-xl flex-wrap gap-md">
          <div>
            <h2 className="text-headline-md font-bold text-on-surface">Gratitude Messages</h2>
            <p className="text-body-md text-on-surface-variant mt-xs">
              {messages.length} message{messages.length !== 1 ? 's' : ''} from people whose lives you touched
            </p>
          </div>
          <div className="flex items-center gap-md">
            <div className="flex items-center gap-xs px-md py-sm rounded-xl"
                 style={{ background: 'rgba(186,26,26,0.08)' }}>
              <span className="material-symbols-outlined icon-fill text-red-700" style={{ fontSize: 18 }}>favorite</span>
              <span className="text-label-md font-bold text-on-surface">{lifeSaved} life-saving moments</span>
            </div>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-[100px] text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-lg"
                 style={{ background: 'rgba(186,26,26,0.08)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#ba1a1a' }}>mail_heart</span>
            </div>
            <p className="text-title-lg font-bold text-on-surface">No messages yet</p>
            <p className="text-body-md text-on-surface-variant mt-xs">
              Gratitude messages from patients will appear here after matches are completed.
            </p>
          </div>
        ) : (
          <div className="space-y-md max-w-3xl">
            {messages.map((msg, i) => (
              <GratitudeCard key={msg.id} msg={msg} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
