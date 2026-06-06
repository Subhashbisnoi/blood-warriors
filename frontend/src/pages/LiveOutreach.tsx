import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import TopBar from '../components/layout/TopBar';
import { getOutreach } from '../api/outreach';
import { listMatches } from '../api/match';
import { useWebSocket } from '../hooks/useWebSocket';
import type { OutreachSession, OutreachEvent, AuditLogEntry, OutreachCandidate } from '../types';

function eventStyle(type: string) {
  if (type === 'confirmed') return { dot: 'bg-[#10b981]', label: 'Confirmed', color: 'text-[#10b981]', badge: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20' };
  if (type === 'declined') return { dot: 'bg-error', label: 'Declined', color: 'text-error', badge: 'bg-error/10 text-error border-error/20' };
  if (type === 'no_response') return { dot: 'bg-[#f59e0b] animate-pulse', label: 'No Response', color: 'text-[#f59e0b]', badge: 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20' };
  if (type === 'escalated') return { dot: 'bg-error animate-pulse', label: 'Escalated', color: 'text-error', badge: 'bg-error/10 text-error border-error/20' };
  if (type === 'followup_sent') return { dot: 'bg-[#8b5cf6]', label: 'Follow-up Sent', color: 'text-[#8b5cf6]', badge: 'bg-[#8b5cf6]/10 text-[#8b5cf6] border-[#8b5cf6]/20' };
  return { dot: 'bg-[#10b981]', label: 'WhatsApp Sent', color: 'text-[#10b981]', badge: 'bg-[#10b981]/10 text-[#10b981] border-[#10b981]/20' };
}

function responseBadge(r: string | null) {
  if (!r) return <span className="text-xs text-gray-400 italic">Awaiting…</span>;
  if (r === 'CONFIRM') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">✓ Confirmed</span>;
  if (r === 'DECLINE') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">✗ Declined</span>;
  if (r === 'OPT_OUT') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">Opted Out</span>;
  if (r === 'NO_RESPONSE') return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">No Response</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">Question</span>;
}

function tierBadge(tier: string | null) {
  if (tier === 'Tier1') return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">T1</span>;
  if (tier === 'Tier2') return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">T2</span>;
  return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-500 border border-gray-200">Reserve</span>;
}

function fmtTime(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtLatency(secs: number | null) {
  if (secs == null) return '—';
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function LiveOutreach() {
  const { matchId: paramMatchId } = useParams();
  const [matchId, setMatchId] = useState(paramMatchId ?? '');
  const [session, setSession] = useState<OutreachSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'timeline' | 'audit' | 'candidates'>('timeline');

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
        .then((matches: { id?: string; match_id?: string }[]) => {
          const id = matches?.[0]?.id ?? matches?.[0]?.match_id;
          if (id) { setMatchId(id); load(id); }
        })
        .catch(console.error);
    }
  }, [paramMatchId, load]);

  // Poll every 3s while the match is not yet resolved
  useEffect(() => {
    if (!matchId) return;
    if (session?.status === 'confirmed' || session?.status === 'escalated') return;
    const t = setInterval(() => load(matchId), 3000);
    return () => clearInterval(t);
  }, [matchId, session?.status, load]);

  useWebSocket(useCallback((data: unknown) => {
    const ev = data as { type?: string; match_id?: string };
    if (
      (ev?.type === 'outreach_event' || ev?.type === 'twilio_response' || ev?.type === 'match_confirmed') &&
      ev?.match_id === matchId
    ) {
      load(matchId);
    }
  }, [matchId, load]));

  const events: OutreachEvent[] = session?.events ?? [];
  const auditLog: AuditLogEntry[] = session?.audit_log ?? [];
  const candidates: OutreachCandidate[] = session?.candidates ?? [];
  const isConfirmed = session?.status === 'confirmed';
  const isEscalated = session?.status === 'escalated';

  const sent = auditLog.length;
  const responded = auditLog.filter(l => l.response && l.response !== 'NO_RESPONSE').length;
  const confirmed = auditLog.filter(l => l.response === 'CONFIRM').length;
  const declined = auditLog.filter(l => l.response === 'DECLINE').length;
  const awaiting = auditLog.filter(l => !l.response).length;

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Live Outreach Log" />
      <div className="flex-1 overflow-y-auto p-xl bg-background">

        {/* Header */}
        <div className="mb-lg flex flex-col md:flex-row md:items-end justify-between gap-md">
          <div>
            <h2 className="text-headline-lg text-on-background">Live Outreach Log</h2>
            <p className="text-body-md text-secondary mt-xs">
              Monitoring automated communications
              {matchId ? ` — Match ${matchId.slice(0, 8).toUpperCase()}` : ''}
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
            <div className="flex items-center gap-xs px-sm py-xs rounded-full bg-primary/10 border border-primary/20">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-label-sm text-primary uppercase tracking-wide">Live</span>
            </div>
          </div>
        </div>

        {/* Status banners */}
        {isConfirmed && (
          <div className="mb-lg bg-[#D1FAE5] border border-[#34d399] rounded-xl p-md flex items-center gap-md">
            <span className="material-symbols-outlined text-[#065f46] text-[32px]">check_circle</span>
            <div>
              <p className="text-label-md font-bold text-[#065f46]">DONATION CONFIRMED</p>
              <p className="text-body-md text-[#065f46]">Primary donor confirmed via WhatsApp. Bridge fulfilled.</p>
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

        {/* Stats row */}
        {sent > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-sm mb-lg">
            {[
              { label: 'Sent', value: sent, icon: 'send', color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Responded', value: responded, icon: 'reply', color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'Confirmed', value: confirmed, icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Declined', value: declined, icon: 'cancel', color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Awaiting', value: awaiting, icon: 'hourglass_empty', color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(s => (
              <div key={s.label} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center gap-sm">
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                  <span className={`material-symbols-outlined text-[18px] ${s.color}`}>{s.icon}</span>
                </div>
                <div>
                  <div className="text-xl font-bold text-on-surface">{s.value}</div>
                  <div className="text-[10px] text-secondary font-medium uppercase tracking-wide">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-xs mb-md border-b border-outline-variant">
          {(['timeline', 'audit', 'candidates'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-md py-sm text-label-md capitalize transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-secondary hover:text-on-surface'
              }`}
            >
              {tab === 'timeline' ? 'Timeline' : tab === 'audit' ? `Audit Log (${sent})` : `Candidates (${candidates.length})`}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-xl text-on-surface-variant">
            <span className="material-symbols-outlined text-[40px] animate-spin">autorenew</span>
            <p className="text-body-md mt-md">Loading outreach data…</p>
          </div>
        )}

        {!loading && !session && (
          <div className="text-center py-xl text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px]">chat_bubble_outline</span>
            <p className="text-body-lg mt-md">No outreach data.</p>
            <p className="text-label-md mt-xs">Submit a match request to start automated outreach.</p>
          </div>
        )}

        {/* ── TIMELINE TAB ── */}
        {!loading && session && activeTab === 'timeline' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-md">
            <div className="lg:col-span-8">
              <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-lg shadow-sm">
                {events.length === 0 ? (
                  <div className="text-center py-xl text-on-surface-variant">
                    <span className="material-symbols-outlined text-[40px]">history</span>
                    <p className="text-body-md mt-md">No events yet.</p>
                  </div>
                ) : (
                  <div className="relative ml-sm border-l-2 border-surface-variant space-y-xl pb-lg">
                    {events.map((ev, i) => {
                      const s = eventStyle(ev.event_type);
                      return (
                        <div key={ev.event_id ?? i} className="relative pl-lg">
                          <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full ${s.dot} border-2 border-surface-container-lowest`} />
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-sm">
                            <div>
                              <div className="flex items-center gap-sm mb-xs">
                                <span className={`text-label-md font-semibold ${s.color}`}>{s.label}</span>
                                <span className="text-label-sm text-secondary">{fmtTime(ev.timestamp)}</span>
                              </div>
                              <p className="text-body-md text-on-surface">
                                {ev.candidate_rank === 1 ? '📱 Primary Candidate' : `Candidate #${ev.candidate_rank}`}
                                {ev.user_hash ? ` (${ev.user_hash.toUpperCase()})` : ''}
                                {ev.event_type === 'whatsapp_sent' && ' — message sent.'}
                                {ev.event_type === 'followup_sent' && ' — follow-up sent.'}
                                {ev.event_type === 'declined' && ' — declined the request.'}
                                {ev.event_type === 'no_response' && ' — no response received.'}
                                {ev.event_type === 'confirmed' && ' — confirmed donation! ✓'}
                                {ev.event_type === 'escalated' && ' — all candidates exhausted.'}
                              </p>
                              {ev.candidate_rank === 1 && (ev.event_type === 'whatsapp_sent' || ev.event_type === 'followup_sent') && (
                                <div className="mt-xs inline-flex items-center gap-xs px-sm py-xs rounded bg-blue-50 border border-blue-100">
                                  <span className="material-symbols-outlined text-[14px] text-blue-500">send</span>
                                  <span className="text-[11px] text-blue-600 font-medium">Real WhatsApp sent via Twilio</span>
                                </div>
                              )}
                            </div>
                            <span className={`shrink-0 px-xs py-[2px] rounded text-[10px] font-bold border uppercase ${s.badge}`}>{s.label}</span>
                          </div>
                        </div>
                      );
                    })}
                    {!isConfirmed && !isEscalated && (
                      <div className="relative pl-lg opacity-50">
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-secondary border-2 border-surface-container-lowest" />
                        <span className="text-label-md text-secondary">Next candidates on standby…</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Side panel */}
            <div className="lg:col-span-4 space-y-md">
              <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md shadow-sm">
                <h4 className="text-label-md text-secondary uppercase tracking-wider mb-sm">Active Request</h4>
                <div className="flex items-center justify-between mb-md">
                  <span className="text-headline-md text-on-surface font-mono">{matchId ? matchId.slice(0, 8).toUpperCase() : '—'}</span>
                  <span className={`px-2 py-1 rounded text-label-sm uppercase font-bold border ${
                    isEscalated ? 'bg-error/10 text-error border-error/20' :
                    isConfirmed ? 'bg-green-50 text-green-700 border-green-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {isEscalated ? 'Escalated' : isConfirmed ? 'Confirmed' : 'In Progress'}
                  </span>
                </div>
                <div className="space-y-sm text-body-md">
                  <div className="flex justify-between"><span className="text-secondary">Events</span><span className="font-bold">{events.length}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Messages Sent</span><span className="font-bold">{sent}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Response Rate</span><span className="font-bold">{sent ? `${Math.round((responded / sent) * 100)}%` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-secondary">Status</span><span className="capitalize font-bold">{session?.status ?? '—'}</span></div>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-md shadow-sm">
                <h4 className="text-label-md text-secondary uppercase tracking-wider mb-sm flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[16px]">info</span>
                  Outreach Strategy
                </h4>
                <div className="space-y-xs text-body-sm text-on-surface-variant">
                  <p>📱 <strong>Real WhatsApp</strong> sent to Primary Candidate (#1) via Twilio.</p>
                  <p>👥 Candidates #2–5 on standby — escalated only if #1 declines.</p>
                  <p>🔄 Donor replies update this log in real-time.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AUDIT LOG TAB ── */}
        {!loading && session && activeTab === 'audit' && (
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            {auditLog.length === 0 ? (
              <div className="text-center py-xl text-on-surface-variant">
                <span className="material-symbols-outlined text-[40px]">receipt_long</span>
                <p className="text-body-md mt-md">No audit entries yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-container border-b border-outline-variant text-left">
                      <th className="px-md py-sm text-label-sm text-secondary font-semibold">#</th>
                      <th className="px-md py-sm text-label-sm text-secondary font-semibold">Channel</th>
                      <th className="px-md py-sm text-label-sm text-secondary font-semibold">Sent At</th>
                      <th className="px-md py-sm text-label-sm text-secondary font-semibold">Message</th>
                      <th className="px-md py-sm text-label-sm text-secondary font-semibold">Response</th>
                      <th className="px-md py-sm text-label-sm text-secondary font-semibold">Reply</th>
                      <th className="px-md py-sm text-label-sm text-secondary font-semibold">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {auditLog.map((entry, i) => (
                      <tr key={entry.log_id} className="hover:bg-surface-container/50 transition-colors">
                        <td className="px-md py-sm text-on-surface-variant font-mono text-xs">{i + 1}</td>
                        <td className="px-md py-sm">
                          <div className="flex items-center gap-xs">
                            <span className="material-symbols-outlined text-[14px] text-green-600">chat</span>
                            <span className="capitalize text-on-surface text-xs font-medium">{entry.channel}</span>
                          </div>
                        </td>
                        <td className="px-md py-sm text-on-surface-variant text-xs font-mono">{fmtTime(entry.sent_at)}</td>
                        <td className="px-md py-sm max-w-[200px]">
                          <p className="text-xs text-on-surface truncate" title={entry.message_body ?? ''}>{entry.message_body ?? '—'}</p>
                        </td>
                        <td className="px-md py-sm">{responseBadge(entry.response)}</td>
                        <td className="px-md py-sm text-xs text-on-surface-variant max-w-[150px]">
                          <span className="truncate block" title={entry.response_text ?? ''}>{entry.response_text ?? '—'}</span>
                        </td>
                        <td className="px-md py-sm text-xs text-on-surface-variant font-mono">{fmtLatency(entry.response_latency_secs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── CANDIDATES TAB ── */}
        {!loading && session && activeTab === 'candidates' && (
          <div className="space-y-sm">
            {candidates.length === 0 ? (
              <div className="text-center py-xl text-on-surface-variant bg-surface-container-lowest rounded-xl border border-outline-variant">
                <span className="material-symbols-outlined text-[40px]">group</span>
                <p className="text-body-md mt-md">No candidate data.</p>
              </div>
            ) : candidates.map(c => {
              const borderColor =
                c.outreach_status === 'CONFIRM' ? 'border-l-green-500' :
                c.outreach_status === 'DECLINE' ? 'border-l-red-400' :
                c.outreach_status === 'NO_RESPONSE' ? 'border-l-amber-400' :
                'border-l-gray-300';
              return (
                <div key={c.donor_user_id ?? c.rank} className={`bg-surface-container-lowest rounded-xl border border-outline-variant border-l-4 ${borderColor} p-md shadow-sm flex flex-col sm:flex-row sm:items-center gap-md`}>
                  <div className="flex items-center gap-md flex-1">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold text-sm">#{c.rank}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-sm flex-wrap">
                        <span className="text-label-md font-semibold text-on-surface">
                          {c.rank === 1 ? '📱 Primary Candidate' : `Candidate #${c.rank}`}
                        </span>
                        {tierBadge(c.tier)}
                        {c.rank === 1 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Real WhatsApp</span>
                        )}
                      </div>
                      <div className="flex gap-md mt-xs flex-wrap">
                        {c.distance_km != null && (
                          <span className="text-xs text-secondary flex items-center gap-xs">
                            <span className="material-symbols-outlined text-[12px]">location_on</span>
                            {c.distance_km.toFixed(1)} km
                          </span>
                        )}
                        {c.kag_score != null && (
                          <span className="text-xs text-secondary">Score: <strong>{c.kag_score.toFixed(3)}</strong></span>
                        )}
                        {c.contacted_at && (
                          <span className="text-xs text-secondary">Contacted: {fmtTime(c.contacted_at)}</span>
                        )}
                      </div>
                      {c.explanation && (
                        <p className="text-xs text-secondary mt-xs italic truncate max-w-lg">{c.explanation}</p>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">{responseBadge(c.outreach_status)}</div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
