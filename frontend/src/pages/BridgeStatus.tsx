import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/layout/TopBar';
import { getBridges } from '../api/dashboard';
import type { ActiveBridge } from '../types';

function urgencyColor(days: number) {
  if (days <= 1) return { border: 'border-error', bg: 'bg-error-container', badge: 'bg-error text-on-error', label: 'CRITICAL', bar: 'bg-error' };
  if (days <= 3) return { border: 'border-[#D97706]', bg: 'bg-surface-container-lowest', badge: 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]', label: 'AT RISK', bar: 'bg-[#D97706]' };
  return { border: 'border-[#10B981]', bg: 'bg-surface-container-lowest', badge: 'bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0]', label: 'STABLE', bar: 'bg-[#10B981]' };
}

export default function BridgeStatus() {
  const [bridges, setBridges] = useState<ActiveBridge[]>([]);
  const [filter, setFilter] = useState<'All' | 'At Risk' | 'Critical' | 'Rare'>('All');
  const navigate = useNavigate();

  useEffect(() => {
    getBridges().then(setBridges).catch(console.error);
  }, []);

  const filtered = bridges.filter(b => {
    if (filter === 'Critical') return b.days_until <= 1;
    if (filter === 'At Risk') return b.days_until > 1 && b.days_until <= 3;
    if (filter === 'Rare') return ['A Negative', 'O Negative', 'AB Negative', 'Bombay Blood Group'].includes(b.patient_blood_group);
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Active Blood Bridges" />
      <div className="flex-1 overflow-y-auto p-xl bg-background">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-md mb-xl">
          <div>
            <h2 className="text-headline-lg text-on-surface mb-sm">Active Blood Bridges</h2>
            <p className="text-body-md text-on-surface-variant">
              Monitoring {bridges.length} clinical pairings requiring immediate or scheduled action.
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            {(['All', 'At Risk', 'Critical', 'Rare'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-md py-sm rounded-full text-label-md font-bold border transition-colors ${filter === f ? 'bg-secondary-container text-on-secondary-container border-transparent' : 'bg-surface text-on-surface border-outline-variant hover:bg-surface-variant'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {bridges.length === 0 ? (
          <div className="text-center py-xl text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] mb-md block">emergency_home</span>
            <p className="text-body-lg">Loading bridge data...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {filtered.map(bridge => {
              const u = urgencyColor(bridge.days_until);
              const donorPct = bridge.donor_count > 0 ? Math.min(100, (bridge.donor_count / Math.max(bridge.quantity_required, 1)) * 100) : 0;
              return (
                <article key={bridge.bridge_id} className={`${u.bg} border-2 ${u.border} rounded-xl p-lg flex flex-col gap-md shadow-sm relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-16 h-16 opacity-10 rounded-bl-full" style={{ background: bridge.days_until <= 1 ? '#ba1a1a' : bridge.days_until <= 3 ? '#D97706' : '#10B981' }} />
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-sm">
                      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center border border-outline-variant">
                        <span className="material-symbols-outlined text-primary">person</span>
                      </div>
                      <div>
                        <h3 className="text-label-md font-bold text-on-surface">{bridge.bridge_id.slice(0, 8).toUpperCase()}</h3>
                        <p className="text-label-sm font-bold" style={{ color: bridge.days_until <= 1 ? '#ba1a1a' : '#5b4040' }}>{bridge.patient_blood_group}</p>
                      </div>
                    </div>
                    <span className={`px-sm py-xs rounded-full ${u.badge} text-label-sm font-bold flex items-center gap-xs`}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        {bridge.days_until <= 1 ? 'warning' : bridge.days_until <= 3 ? 'schedule' : 'check_circle'}
                      </span>
                      {u.label}
                    </span>
                  </div>

                  <div className="py-sm">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-label-sm text-on-surface-variant">
                        {bridge.days_until <= 0 ? 'TODAY' : bridge.days_until === 1 ? 'Surgery: TOMORROW' : `Surgery: ${bridge.days_until} Days Away`}
                      </span>
                      <span className="text-label-sm font-bold" style={{ color: bridge.days_until <= 1 ? '#ba1a1a' : bridge.days_until <= 3 ? '#D97706' : '#10B981' }}>
                        {bridge.donor_count}/{bridge.quantity_required} Donors
                      </span>
                    </div>
                    <div className="w-full bg-surface-variant h-2 rounded-full overflow-hidden">
                      <div className={`${u.bar} h-full transition-all`} style={{ width: `${donorPct}%` }} />
                    </div>
                  </div>

                  <div className="mt-auto pt-sm flex gap-sm">
                    {bridge.days_until <= 1 ? (
                      <button
                        onClick={() => navigate('/match')}
                        className="flex-1 bg-error text-on-error text-label-md font-bold py-sm rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-xs"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>bolt</span>
                        EMERGENCY MATCH
                      </button>
                    ) : bridge.days_until <= 3 ? (
                      <button
                        onClick={() => navigate('/match')}
                        className="flex-1 bg-surface border border-primary text-primary text-label-md font-bold py-sm rounded-lg hover:bg-surface-variant transition-colors flex items-center justify-center gap-xs"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>
                        Find Donor Now
                      </button>
                    ) : (
                      <button className="flex-1 bg-surface-variant text-on-surface-variant text-label-md font-bold py-sm rounded-lg opacity-70 flex items-center justify-center gap-xs cursor-default">
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>verified</span>
                        Confirmed
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-3 text-center py-xl text-on-surface-variant">
                <p className="text-body-lg">No bridges match the selected filter.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
