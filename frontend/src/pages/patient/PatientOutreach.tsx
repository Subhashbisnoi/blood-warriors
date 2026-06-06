import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getPatientToken, getPatientMatchIds } from '../../api/patient';

interface AuditEntry {
  log_id: string;
  channel: string;
  message_body: string;
  sent_at: string;
  response: string | null;
  response_text: string | null;
  response_at: string | null;
  response_latency_secs: number | null;
  twilio_sid: string | null;
}

interface MatchOutreach {
  match_id: string;
  status: string;
  events: { event_type: string; timestamp: string }[];
  audit_log: AuditEntry[];
  candidates: { rank: number; donor_user_id: string; outreach_status: string; contacted_at: string | null }[];
}

const STATUS_COLOR: Record<string, string> = {
  confirmed:   '#2e7d32',
  pending:     '#e65100',
  searching:   '#1565c0',
  unknown:     '#9e7878',
};

const RESPONSE_COLOR: Record<string, string> = {
  CONFIRM:            '#2e7d32',
  DECLINE:            '#ba1a1a',
  OPT_OUT:            '#ba1a1a',
  QUESTION_LOGISTICS: '#1565c0',
};

export default function PatientOutreach() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchOutreach[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const ids = getPatientMatchIds();
    if (!ids.length) { setLoading(false); return; }
    const token = getPatientToken();
    const apiBase = import.meta.env.VITE_API_URL ?? '';

    Promise.all(
      ids.map(id =>
        axios.get(`${apiBase}/outreach/${id}`, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.data as MatchOutreach)
          .catch(() => null)
      )
    ).then(results => {
      setMatches(results.filter(Boolean) as MatchOutreach[]);
      if (results[0]) setSelected((results[0] as MatchOutreach).match_id);
    }).finally(() => setLoading(false));
  }, []);

  const active = matches.find(m => m.match_id === selected);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-2xl text-on-surface-variant">
        <span className="animate-spin material-symbols-outlined mr-sm">progress_activity</span>
        Loading outreach data…
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="max-w-xl mx-auto text-center py-2xl">
        <span className="material-symbols-outlined text-on-surface-variant block mb-md" style={{ fontSize: 56 }}>notifications_off</span>
        <h2 className="text-headline-md font-bold text-on-surface mb-sm">No outreach yet</h2>
        <p className="text-body-md text-on-surface-variant mb-lg">
          Submit a match request first and donors will be contacted automatically.
        </p>
        <button onClick={() => navigate('/patient/match')}
          className="px-xl py-md rounded-xl text-label-md font-bold text-white"
          style={{ background: '#ba1a1a' }}>
          Create Match Request
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-xl">
        <h1 className="text-headline-lg font-bold text-on-surface">My Outreach</h1>
        <p className="text-body-md text-on-surface-variant mt-xs">
          Track donor responses and match status for your requests.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-lg">

        {/* Match list sidebar */}
        <div className="flex flex-col gap-sm">
          {matches.map(m => (
            <button key={m.match_id} onClick={() => setSelected(m.match_id)}
              className="text-left p-md rounded-2xl border-2 transition-all"
              style={{
                borderColor: selected === m.match_id ? '#ba1a1a' : 'rgba(0,0,0,0.1)',
                background: selected === m.match_id ? 'rgba(186,26,26,0.05)' : '#fff',
              }}>
              <p className="text-label-sm font-black text-on-surface-variant uppercase tracking-wide">Match</p>
              <p className="text-label-md font-bold text-on-surface truncate">{m.match_id.slice(0, 12)}…</p>
              <div className="flex items-center gap-xs mt-xs">
                <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[m.status] ?? '#9e7878' }} />
                <span className="text-label-sm font-bold capitalize" style={{ color: STATUS_COLOR[m.status] ?? '#9e7878' }}>
                  {m.status}
                </span>
              </div>
              <p className="text-label-sm text-on-surface-variant mt-xs">
                {m.candidates.length} candidate{m.candidates.length !== 1 ? 's' : ''} ·{' '}
                {m.audit_log.length} message{m.audit_log.length !== 1 ? 's' : ''} sent
              </p>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        {active && (
          <div className="md:col-span-2 flex flex-col gap-md">

            {/* Status banner */}
            <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">Match ID</p>
                  <p className="text-label-md font-mono font-bold text-on-surface">{active.match_id}</p>
                </div>
                <span className="px-md py-sm rounded-full text-label-md font-bold capitalize"
                      style={{ background: (STATUS_COLOR[active.status] ?? '#9e7878') + '18', color: STATUS_COLOR[active.status] ?? '#9e7878' }}>
                  {active.status}
                </span>
              </div>

              {/* Timeline events */}
              {active.events.length > 0 && (
                <div className="mt-md pt-md border-t border-outline-variant/30">
                  <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-sm">Timeline</p>
                  <div className="flex flex-col gap-xs">
                    {active.events.map((ev, i) => (
                      <div key={i} className="flex items-center gap-sm text-label-sm">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ba1a1a' }} />
                        <span className="font-bold text-on-surface">{ev.event_type}</span>
                        <span className="text-on-surface-variant ml-auto">
                          {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Audit log */}
            {active.audit_log.length > 0 && (
              <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm">
                <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-md">
                  Messages Sent ({active.audit_log.length})
                </p>
                <div className="flex flex-col gap-sm">
                  {active.audit_log.map((entry, i) => (
                    <div key={entry.log_id ?? i} className="p-md rounded-xl border border-outline-variant/30">
                      <div className="flex items-start justify-between gap-md">
                        <div className="flex items-center gap-sm">
                          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 18 }}>
                            {entry.channel === 'whatsapp' ? 'chat' : 'mail'}
                          </span>
                          <span className="text-label-sm font-bold text-on-surface capitalize">{entry.channel}</span>
                        </div>
                        {entry.response && (
                          <span className="text-label-sm font-bold px-sm py-xs rounded-full"
                                style={{ background: (RESPONSE_COLOR[entry.response] ?? '#9e7878') + '18', color: RESPONSE_COLOR[entry.response] ?? '#9e7878' }}>
                            {entry.response}
                          </span>
                        )}
                      </div>
                      {entry.message_body && (
                        <p className="text-label-sm text-on-surface-variant mt-sm line-clamp-2">{entry.message_body}</p>
                      )}
                      <div className="flex items-center gap-md mt-sm text-label-sm text-on-surface-variant">
                        <span>Sent: {entry.sent_at ? new Date(entry.sent_at).toLocaleString() : '—'}</span>
                        {entry.response_latency_secs != null && (
                          <span>Response in {entry.response_latency_secs}s</span>
                        )}
                      </div>
                      {entry.response_text && (
                        <div className="mt-sm px-sm py-xs rounded-lg text-label-sm font-medium"
                             style={{ background: (RESPONSE_COLOR[entry.response ?? ''] ?? '#9e7878') + '10', color: '#49454f' }}>
                          "{entry.response_text}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Candidates */}
            {active.candidates.length > 0 && (
              <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm">
                <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-md">
                  Donor Candidates
                </p>
                <div className="flex flex-col gap-sm">
                  {active.candidates.map(c => (
                    <div key={c.rank} className="flex items-center gap-sm px-md py-sm rounded-xl border"
                         style={{ borderColor: c.rank === 1 ? '#ba1a1a30' : '#cac4d040' }}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-label-sm font-bold flex-shrink-0"
                           style={{ background: c.rank === 1 ? '#ba1a1a' : '#9e7878' }}>
                        #{c.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-label-sm font-bold text-on-surface truncate">
                          {c.donor_user_id?.slice(0, 8).toUpperCase() ?? '—'}
                        </p>
                        {c.contacted_at && (
                          <p className="text-label-sm text-on-surface-variant">
                            Contacted {new Date(c.contacted_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <span className="text-label-sm font-bold px-sm py-xs rounded-full capitalize"
                            style={{ background: 'rgba(0,0,0,0.05)', color: '#49454f' }}>
                        {c.outreach_status ?? 'pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
