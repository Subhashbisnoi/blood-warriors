import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/layout/TopBar';
import { getStats, getInventory, getActivity } from '../api/dashboard';
import { reengageDonor } from '../api/outreach';
import { useWebSocket } from '../hooks/useWebSocket';
import type { DashboardStats, BloodInventoryItem, ActivityEvent } from '../types';

function statusBadge(status: string) {
  if (status === 'Critical') return 'bg-error-container text-on-error-container border-error/30';
  if (status === 'Low') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

function activityIcon(type: string) {
  if (type === 'confirmed')       return { icon: 'check_circle',        cls: 'text-emerald-600 bg-emerald-50' };
  if (type === 'whatsapp_sent')   return { icon: 'chat',                cls: 'text-blue-600 bg-blue-50' };
  if (type === 'followup_sent')   return { icon: 'send',                cls: 'text-blue-500 bg-blue-50' };
  if (type === 'declined')        return { icon: 'cancel',              cls: 'text-error bg-error-container' };
  if (type === 'no_response')     return { icon: 'schedule',            cls: 'text-amber-600 bg-amber-50' };
  if (type === 'escalated')       return { icon: 'priority_high',       cls: 'text-error bg-error-container' };
  if (type === 'reengage')        return { icon: 'notifications_active', cls: 'text-amber-600 bg-amber-50' };
  if (type === 'session.started') return { icon: 'play_circle',         cls: 'text-primary bg-surface-container' };
  return                                 { icon: 'info',                cls: 'text-on-surface-variant bg-surface-container' };
}

function activityMessage(eventType: string, payload: Record<string, unknown>): string {
  const bg      = (payload?.blood_group as string) ?? '';
  const hash    = ((payload?.user_hash as string) ?? '').slice(0, 8).toUpperCase();
  const rank    = payload?.candidate_rank as number | undefined;
  const rankStr = rank ? `#${rank}` : '';
  const hasTwilio = !!(payload?.twilio_sid as string);

  switch (eventType) {
    case 'whatsapp_sent':
      return hasTwilio
        ? `WhatsApp sent to donor ${rankStr}${hash ? ` (${hash})` : ''}${bg ? ` — ${bg}` : ''}.`
        : `Outreach message sent to donor ${rankStr}${hash ? ` (${hash})` : ''}${bg ? ` — ${bg}` : ''}.`;
    case 'followup_sent':
      return `Follow-up sent to donor ${rankStr}${hash ? ` (${hash})` : ''} — no response yet.`;
    case 'confirmed':
      return `✓ Donor ${rankStr}${hash ? ` (${hash})` : ''} confirmed donation${bg ? ` for ${bg}` : ''}.`;
    case 'declined':
      return `Donor ${rankStr}${hash ? ` (${hash})` : ''} declined — moving to next candidate.`;
    case 'no_response':
      return `No response from donor ${rankStr}${hash ? ` (${hash})` : ''} — escalating.`;
    case 'escalated':
      return `All candidates exhausted${bg ? ` for ${bg}` : ''} — coordinator alerted.`;
    case 'session.started':
      return `New outreach session started${bg ? ` for ${bg}` : ''}.`;
    case 'reengage.triggered':
      return `Re-engagement message sent to inactive ${bg || 'donor'}.`;
    default:
      return `${eventType.replace('.', ' ')}${bg ? ` — ${bg}` : ''}`;
  }
}

const MOCK_INACTIVE = [
  { user_id: 'u1', initials: 'JD', name: 'John Doe', blood_group: 'O-', days: 105 },
  { user_id: 'u2', initials: 'AS', name: 'Anita Sharma', blood_group: 'AB-', days: 120 },
  { user_id: 'u3', initials: 'MK', name: 'Mohan Kumar', blood_group: 'A-', days: 95 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [inventory, setInventory] = useState<BloodInventoryItem[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [reengaging, setReengaging] = useState<Record<string, boolean>>({});

  const refreshStats = useCallback(() => {
    getStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => {
    refreshStats();
    getInventory().then(setInventory).catch(console.error);
    getActivity().then(setActivity).catch(console.error);
  }, [refreshStats]);

  useWebSocket(useCallback((data: unknown) => {
    const ev = data as { type?: string };
    if (ev?.type === 'stats_update' || ev?.type === 'match_created' || ev?.type === 'outreach_event') {
      refreshStats();
      getActivity().then(setActivity).catch(console.error);
    }
  }, [refreshStats]));

  async function handleReengage(userId: string) {
    setReengaging(r => ({ ...r, [userId]: true }));
    try { await reengageDonor(userId); } catch { /* ignore */ }
    setTimeout(() => setReengaging(r => ({ ...r, [userId]: false })), 2000);
  }

  const kpis = [
    {
      icon: 'emergency_home', label: 'Active Blood Bridges',
      value: stats?.active_bridges ?? '—',
      color: 'text-primary', bg: 'bg-surface-container', trend: '+12%', trendIcon: 'trending_up',
      pulse: false, route: '/bridges',
    },
    {
      icon: 'volunteer_activism', label: 'Eligible Donors',
      value: stats ? stats.eligible_donors.toLocaleString() : '—',
      color: 'text-emerald-700', bg: 'bg-emerald-50', trend: '+5%', trendIcon: 'trending_up',
      pulse: false, route: '/donors',
    },
    {
      icon: 'person_search', label: 'Open Match Requests',
      value: stats?.open_matches ?? '—',
      color: 'text-amber-700', bg: 'bg-amber-50', trend: null, trendIcon: '',
      pulse: false, route: '/match',
    },
    {
      icon: 'warning', label: 'Critical Escalations',
      value: stats?.escalations ?? '—',
      color: 'text-error', bg: 'bg-error', trend: null, trendIcon: '',
      pulse: true, route: '/outreach',
    },
  ];

  return (
    <div className="flex flex-col">
      <TopBar title="Good morning, Coordinator" subtitle="dashboard" />
      <div className="p-xl flex flex-col gap-xl max-w-[1440px] mx-auto w-full">

        {/* KPI grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-md">
          {kpis.map(kpi => (
            <div
              key={kpi.label}
              onClick={() => navigate(kpi.route)}
              className={`bg-surface-container-lowest rounded-xl p-lg border shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md transition-shadow ${kpi.pulse ? 'border-error animate-pulse-ring relative overflow-hidden' : 'border-outline-variant'}`}
            >
              {kpi.pulse && <div className="absolute inset-0 bg-error/5 pointer-events-none" />}
              <div className="flex justify-between items-start mb-md relative z-10">
                <div className={`p-sm rounded-lg ${kpi.pulse ? 'bg-error' : kpi.bg} ${kpi.pulse ? 'text-on-error' : kpi.color}`}>
                  <span className="material-symbols-outlined">{kpi.icon}</span>
                </div>
                {kpi.trend && (
                  <span className={`text-label-sm ${kpi.color} flex items-center gap-xs`}>
                    <span className="material-symbols-outlined text-[14px]">{kpi.trendIcon}</span>
                    {kpi.trend}
                  </span>
                )}
              </div>
              <div className="relative z-10">
                <h3 className={`text-label-md ${kpi.pulse ? 'text-error font-semibold' : 'text-on-surface-variant'} mb-xs`}>{kpi.label}</h3>
                <p className={`text-display font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-lg">
          {/* Inventory table */}
          <div className="xl:col-span-2 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col">
            <div className="p-lg border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <h3 className="text-headline-md font-bold text-on-surface">Live Inventory &amp; Readiness</h3>
              <button className="text-label-md text-primary hover:underline flex items-center gap-xs">
                View All <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-bright">
                    {['Blood Group','Eligible Donors','Active Bridges','Status','Action'].map(h => (
                      <th key={h} className={`p-md text-label-sm text-on-surface-variant uppercase tracking-wider ${h === 'Action' ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant text-body-md">
                  {inventory.length === 0
                    ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={5} className="p-md"><div className="h-6 bg-surface-container-low rounded animate-pulse" /></td></tr>
                    ))
                    : inventory.filter(r => r.eligible_active > 0 || r.bridge_count > 0).slice(0, 8).map(row => (
                      <tr key={row.blood_group} className={`hover:bg-surface-container-low transition-colors ${row.supply_status === 'Critical' ? 'bg-error/5' : ''}`}>
                        <td className="p-md font-bold text-on-surface flex items-center gap-xs">
                          {row.blood_group}
                          {row.supply_status === 'Critical' && <span className="material-symbols-outlined text-[16px] text-error">warning</span>}
                        </td>
                        <td className="p-md text-on-surface-variant">{row.eligible_active.toLocaleString()}</td>
                        <td className="p-md text-on-surface-variant">{row.bridge_count}</td>
                        <td className="p-md">
                          <span className={`inline-flex items-center px-sm py-xs rounded-full text-label-sm border ${statusBadge(row.supply_status)}`}>
                            {row.supply_status}
                          </span>
                        </td>
                        <td className="p-md text-right">
                          {row.supply_status === 'Critical' ? (
                            <button
                              onClick={() => navigate('/match')}
                              className="bg-primary-container text-on-primary text-label-sm px-sm py-xs rounded hover:bg-primary transition-colors"
                            >
                              Broadcast
                            </button>
                          ) : (
                            <button className="text-secondary hover:text-primary transition-colors">
                              <span className="material-symbols-outlined">more_vert</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Live activity */}
          <div className="xl:col-span-1 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm flex flex-col">
            <div className="p-lg border-b border-outline-variant bg-surface-container-low">
              <h3 className="text-headline-md font-bold text-on-surface flex items-center gap-sm">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
                Live Activity
              </h3>
            </div>
            <div className="p-md flex-1 overflow-y-auto flex flex-col gap-md max-h-64">
              {activity.length === 0 ? (
                <p className="text-body-md text-on-surface-variant text-center py-lg">Waiting for events…</p>
              ) : [...activity].reverse().slice(0, 10).map((ev, i) => {
                // event_type is like "outreach.whatsapp_sent" — strip prefix
                const shortType = ev.event_type.replace(/^outreach\./, '');
                const { icon, cls } = activityIcon(shortType);
                const payload = ev.payload ?? {};
                const msg = activityMessage(shortType, payload);
                return (
                  <div key={i} className="flex gap-md items-start">
                    <div className="mt-1 shrink-0">
                      <span className={`material-symbols-outlined text-[20px] ${cls} p-xs rounded-full`}>{icon}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-body-md text-on-surface leading-snug">{msg}</p>
                      <p className="text-label-sm text-secondary-fixed-dim mt-xs">
                        {new Date(ev.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Re-engagement section */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-md gap-md">
            <div>
              <h3 className="text-headline-md font-bold text-on-surface">Re-engagement Candidates</h3>
              <p className="text-body-md text-on-surface-variant mt-xs">
                {stats?.inactive_donors ?? '—'} eligible donors inactive for &gt;90 days.
              </p>
            </div>
            <div className="flex bg-surface-container-low rounded-lg p-xs border border-outline-variant">
              <button className="px-md py-xs rounded-md bg-surface-container-lowest shadow-sm text-label-md text-on-surface">All</button>
              <button className="px-md py-xs rounded-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">O- Only</button>
              <button className="px-md py-xs rounded-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">Rare Types</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
            {MOCK_INACTIVE.map(d => (
              <div key={d.user_id} className="p-md rounded-lg border border-outline-variant bg-surface-bright flex items-center justify-between">
                <div className="flex items-center gap-md">
                  <div className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-on-surface-variant font-bold">
                    {d.initials}
                  </div>
                  <div>
                    <p className="text-label-md font-bold text-on-surface">{d.name}</p>
                    <p className="text-label-sm text-secondary-fixed-dim">{d.blood_group} • Last: {d.days} days ago</p>
                  </div>
                </div>
                <button
                  onClick={() => handleReengage(d.user_id)}
                  className="text-primary hover:bg-surface-container p-sm rounded-full transition-colors"
                  title="Re-engage"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {reengaging[d.user_id] ? 'check_circle' : 'mail'}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
