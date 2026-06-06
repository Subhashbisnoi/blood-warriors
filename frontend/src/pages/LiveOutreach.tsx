import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import TopBar from '../components/layout/TopBar';
import { getOutreach } from '../api/outreach';
import { listMatches } from '../api/match';
import { useWebSocket } from '../hooks/useWebSocket';
import type { OutreachSession, OutreachEvent } from '../types';

function eventStyle(type: string) {
  if (type === 'confirmed') return { dot: 'bg-[#10b981]', ring: 'ring-[#10b981]/20', label: 'Confirmed', color: 'text-[#10b981]', badge: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20' };
  if (type === 'declined') return { dot: 'bg-error', ring: '', label: 'Declined', color: 'text-error', badge: '' };
  if (type === 'no_response') return { dot: 'bg-[#f59e0b] animate-pulse', ring: '', label: 'No Response', color: 'text-[#f59e0b]', badge: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20' };
  if (type === 'escalated') return { dot: 'bg-error animate-pulse', ring: '', label: 'Escalated', color: 'text-error', badge: 'bg-error/10 text-error border-error/20' };
  return { dot: 'bg-[#10b981]', ring: 'ring-4 ring-[#10b981]/20', label: 'WhatsApp Sent', color: 'text-[#10b981]', badge: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20' };
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function LiveOutreach() {
  const { matchId: paramMatchId } = useParams();
  const [matchId, setMatchId] = useState(paramMatchId ?? '');
  const [session, setSession] = useState<OutreachSession | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback((id: string) => {
    if (!id) return;
    setLoading(true);
    getOutreach(id)
      .then(setSession)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (paramMatchId) {
      setMatchId(paramMatchId);
      load(paramMatchId);
    } else {
      listMatches(undefined, 1)
        .then((matches: { match_id: string }[]) => {
          if (matches?.[0]?.match_id) {
            setMatchId(matches[0].match_id);
            load(matches[0].match_id);
          }
        })
        .catch(console.error);
    }
  }, [paramMatchId, load]);

  useWebSocket(useCallback((data: unknown) => {
    const ev = data as { type?: string; match_id?: string };
    if (ev?.type === 'outreach_event' && ev?.match_id === matchId) {
      load(matchId);
    }
  }, [matchId, load]));

  const events: OutreachEvent[] = session?.events ?? [];
  const step = events.length;
  const isConfirmed = session?.status === 'confirmed';
  const isEscalated = session?.status === 'escalated';

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Live Outreach Log" />
      <div className="flex-1 overflow-y-auto p-xl bg-background">
        <div className="mb-xl flex flex-col md:flex-row md:items-end justify-between gap-md">
          <div>
            <h2 className="text-headline-lg text-on-background">Live Outreach Log</h2>
            <p className="text-body-md text-secondary mt-xs">
              Monitoring automated communications
              {matchId ? ` for Match ${matchId.slice(0, 8).toUpperCase()}` : ''}
            </p>
          </div>
          <div className="flex gap-sm items-center flex-wrap">
            {!paramMatchId && (
              <>
                <input
                  value={matchId}
                  onChange={e => setMatchId(e.target.value)}
                  placeholder="Paste match ID…"
                  className="px-md py-sm rounded-lg border border-outline-variant text-label-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary w-48"
                />
                <button
                  onClick={() => load(matchId)}
                  className="px-md py-sm rounded-lg bg-primary-container text-on-primary text-label-md hover:bg-primary transition-colors"
                >
                  Load
                </button>
              </>
            )}
            <button className="px-md py-sm rounded-lg border border-outline-variant text-on-surface text-label-md hover:bg-surface-container transition-colors flex items-center gap-xs">
              <span className="material-symbols-outlined text-[18px]">pause</span>
              Pause Outreach
            </button>
          </div>
        </div>

        {isConfirmed && (
          <div className="mb-lg bg-[#D1FAE5] border border-[#34d399] rounded-xl p-md flex items-center gap-md">
            <span className="material-symbols-outlined text-[#065f46] text-[32px]">check_circle</span>
            <div>
              <p className="text-label-md font-bold text-[#065f46]">DONATION CONFIRMED</p>
              <p className="text-body-md text-[#065f46]">Donor confirmed. Bridge fulfilled.</p>
            </div>
          </div>
        )}

        {isEscalated && (
          <div className="mb-lg bg-error-container border border-error/30 rounded-xl p-md flex items-center gap-md">
            <span className="material-symbols-outlined text-error text-[32px]">warning</span>
            <div>
              <p className="text-label-md font-bold text-error">ESCALATED — All Candidates Exhausted</p>
              <p className="text-body-md text-on-error-container">Admin alerted. Manual intervention required.</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-md">
          {/* Timeline */}
          <div className="lg:col-span-8 space-y-md">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md shadow-sm flex justify-between items-center">
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary">rss_feed</span>
                <h3 className="text-headline-md text-on-surface">Outreach Status — Live</h3>
              </div>
              <div className="flex items-center gap-xs px-sm py-xs rounded-full bg-primary/10 border border-primary/20">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-label-sm text-primary uppercase tracking-wide">Live</span>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-lg shadow-sm">
              {loading && (
                <div className="text-center py-xl text-on-surface-variant">
                  <span className="material-symbols-outlined text-[40px] animate-spin">autorenew</span>
                  <p className="text-body-md mt-md">Loading outreach data…</p>
                </div>
              )}

              {!loading && events.length === 0 && (
                <div className="text-center py-xl text-on-surface-variant">
                  <span className="material-symbols-outlined text-[48px]">chat_bubble_outline</span>
                  <p className="text-body-lg mt-md">No outreach events yet.</p>
                  <p className="text-label-md mt-xs">Submit a match request to start automated outreach.</p>
                </div>
              )}

              {!loading && events.length > 0 && (
                <div className="relative ml-sm border-l-2 border-surface-variant space-y-xl pb-lg">
                  {events.map((ev, i) => {
                    const s = eventStyle(ev.event_type);
                    return (
                      <div key={ev.event_id} className="relative pl-lg" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full ${s.dot} border-2 border-surface-container-lowest ${s.ring}`} />
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-sm">
                          <div>
                            <div className="flex items-center gap-sm mb-xs">
                              <span className={`text-label-md ${s.color}`}>{s.label}</span>
                              <span className="text-label-sm text-secondary">{fmtTime(ev.timestamp)}</span>
                            </div>
                            <p className="text-body-md text-on-surface">
                              Candidate {ev.candidate_rank}{ev.user_hash ? ` (${ev.user_hash.toUpperCase()})` : ''}
                              {ev.event_type === 'whatsapp_sent' && ' — message delivered.'}
                              {ev.event_type === 'declined' && ' — declined the request.'}
                              {ev.event_type === 'no_response' && ' — no response received.'}
                              {ev.event_type === 'confirmed' && ' — confirmed donation!'}
                              {ev.event_type === 'escalated' && ' — all candidates exhausted.'}
                            </p>
                            {ev.event_type === 'declined' && (
                              <div className="mt-sm p-sm bg-surface-container rounded border border-outline-variant flex items-center gap-sm">
                                <span className="material-symbols-outlined text-secondary text-[16px]">smart_toy</span>
                                <span className="text-label-sm text-secondary">AI noted unavailability. Proceeding to next candidate.</span>
                              </div>
                            )}
                          </div>
                          {s.badge && (
                            <div className="shrink-0">
                              <span className={`px-xs py-[2px] rounded text-[10px] font-bold border uppercase ${s.badge}`}>{s.label}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {!isConfirmed && !isEscalated && (
                    <div className="relative pl-lg opacity-60">
                      <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-secondary border-2 border-surface-container-lowest" />
                      <span className="text-label-md text-secondary">Queued — Candidates {step + 1}–5 in standby queue.</span>
                    </div>
                  )}
                </div>
              )}

              {events.length > 0 && (
                <div className="mt-lg pt-md border-t border-outline-variant flex justify-between items-center bg-surface-container-low p-sm rounded-lg">
                  <span className="text-label-md text-on-surface font-medium">Step {step} of 5</span>
                  {!isConfirmed && !isEscalated && (
                    <div className="flex items-center gap-sm text-primary text-label-md bg-primary/10 px-sm py-xs rounded">
                      <span className="material-symbols-outlined text-[16px]">timer</span>
                      Processing…
                    </div>
                  )}
                  {isConfirmed && <span className="text-label-md text-[#10b981] font-bold">✓ Confirmed</span>}
                  {isEscalated && <span className="text-label-md text-error font-bold">⚠ Escalated</span>}
                </div>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="lg:col-span-4 space-y-md hidden md:block">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md shadow-sm">
              <h4 className="text-label-md text-secondary uppercase tracking-wider mb-sm">Active Request</h4>
              <div className="flex items-center justify-between mb-md">
                <span className="text-headline-md text-on-surface">{matchId ? matchId.slice(0, 8).toUpperCase() : '—'}</span>
                <span className={`px-2 py-1 rounded text-label-sm uppercase font-bold border ${isEscalated ? 'bg-error/10 text-error border-error/20' : isConfirmed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {isEscalated ? 'Escalated' : isConfirmed ? 'Confirmed' : 'In Progress'}
                </span>
              </div>
              <div className="space-y-sm text-body-md">
                <div className="flex justify-between"><span className="text-secondary">Events</span><span className="text-on-surface font-bold">{events.length}</span></div>
                <div className="flex justify-between"><span className="text-secondary">Status</span><span className="text-on-surface capitalize">{session?.status ?? '—'}</span></div>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md shadow-sm relative overflow-hidden">
              <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 rounded-bl-full -z-10" />
              <h4 className="text-label-md text-secondary uppercase tracking-wider mb-sm flex items-center gap-xs">
                <span className="material-symbols-outlined text-[16px]">psychology</span>
                AI Match Confidence
              </h4>
              <div className="flex items-end gap-sm mb-xs">
                <span className="text-display font-bold text-on-surface">94%</span>
              </div>
              <p className="text-label-md text-secondary">High probability of fulfillment based on historical response rates.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
