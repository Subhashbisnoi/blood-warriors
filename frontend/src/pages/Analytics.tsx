import { useEffect, useState } from 'react';
import TopBar from '../components/layout/TopBar';
import { getAnalytics } from '../api/dashboard';
import type { AnalyticsData } from '../types';

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: 'forum' },
  { key: 'sms', label: 'SMS', color: '#9e0027', icon: 'sms' },
  { key: 'call', label: 'Voice Call', color: '#4F46E5', icon: 'phone_in_talk' },
];

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [period, setPeriod] = useState<'7' | '30'>('7');

  useEffect(() => {
    getAnalytics().then(setData).catch(console.error);
  }, [period]);

  const metrics = data
    ? [
        { icon: 'check_circle', label: 'Success Rate', value: `${data.success_rate}%`, trend: '+4.2%', trendUp: true },
        { icon: 'route', label: 'Avg Steps to Match', value: String(data.avg_steps), trend: '-0.3', trendUp: true },
        { icon: 'call', label: 'Calls / Donation', value: String(data.calls_per_donation), trend: null, trendUp: false },
        { icon: 'restart_alt', label: 'Donors Re-engaged', value: String(data.reengaged_count), trend: '+12', trendUp: true },
      ]
    : [];

  const channels = data?.channel_performance ?? [
    { channel: 'WhatsApp', rate: 73 },
    { channel: 'SMS', rate: 58 },
    { channel: 'Call', rate: 41 },
  ];

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Outreach Analytics" />
      <div className="flex-1 overflow-y-auto p-xl bg-background">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-xl gap-4">
          <div>
            <h1 className="text-headline-lg text-on-surface mb-1">Outreach Analytics</h1>
            <p className="text-body-md text-on-surface-variant">Performance metrics and AI intervention outcomes.</p>
          </div>
          <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-lg p-1 shadow-sm">
            {(['7', '30'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-label-sm rounded transition-colors ${period === p ? 'bg-surface-variant text-on-surface' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
              >
                {p} Days
              </button>
            ))}
            <button className="px-3 py-1.5 text-label-sm rounded text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">calendar_month</span>
              Custom
            </button>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-md mb-xl">
          {(data ? metrics : [1,2,3,4]).map((m, i) => (
            typeof m === 'number' ? (
              <div key={i} className="bg-surface-container-lowest p-lg rounded-xl border border-outline-variant animate-pulse h-32" />
            ) : (
              <div key={m.label} className="bg-surface-container-lowest p-lg rounded-xl border border-outline-variant flex flex-col justify-between">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">{m.icon}</span>
                  </div>
                  {m.trend && (
                    <span className="text-label-sm text-[#059669] bg-[#ecfdf5] px-2 py-1 rounded-full flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">{m.trendUp ? 'trending_up' : 'trending_down'}</span>
                      {m.trend}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-label-md text-on-surface-variant mb-1">{m.label}</h3>
                  <div className="text-display font-bold text-on-surface">{m.value}</div>
                </div>
              </div>
            )
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-md mb-xl">
          {/* Trend chart */}
          <div className="lg:col-span-2 bg-surface-container-lowest p-lg rounded-xl border border-outline-variant flex flex-col h-[360px]">
            <h2 className="text-headline-md text-on-surface mb-6">Match Success Trend</h2>
            <div className="flex-grow w-full rounded bg-surface-container-low flex items-end p-4 relative overflow-hidden">
              <svg className="w-full h-full absolute bottom-0 left-0" preserveAspectRatio="none" viewBox="0 0 100 100">
                <path d="M0,80 Q20,70 40,60 T80,30 T100,10 L100,100 L0,100 Z" fill="#ecfdf5" opacity="0.5" />
                <path d="M0,80 Q20,70 40,60 T80,30 T100,10" fill="none" stroke="#10b981" strokeWidth="2" />
              </svg>
            </div>
            <div className="flex justify-between mt-2 text-label-sm text-on-surface-variant px-1">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <span key={d}>{d}</span>)}
            </div>
          </div>

          {/* Channel performance */}
          <div className="bg-surface-container-lowest p-lg rounded-xl border border-outline-variant flex flex-col h-[360px]">
            <h2 className="text-headline-md text-on-surface mb-6">Channel Performance</h2>
            <div className="flex-grow flex flex-col justify-center gap-6">
              {channels.map((ch, i) => {
                const cfg = CHANNELS[i] ?? { label: ch.channel, color: '#9e0027', icon: 'campaign' };
                return (
                  <div key={ch.channel}>
                    <div className="flex justify-between text-label-md mb-2">
                      <span className="text-on-surface flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]" style={{ color: cfg.color }}>{cfg.icon}</span>
                        {ch.channel}
                      </span>
                      <span className="text-on-surface-variant font-bold">{ch.rate}%</span>
                    </div>
                    <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${ch.rate}%`, background: cfg.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
          {/* Donut */}
          <div className="bg-surface-container-lowest p-lg rounded-xl border border-outline-variant">
            <h2 className="text-headline-md text-on-surface mb-6">Outcomes by Group</h2>
            <div className="flex items-center justify-center h-[200px] relative">
              <div className="w-[160px] h-[160px] rounded-full border-[24px] border-primary relative flex items-center justify-center" style={{ borderRightColor: '#fca5a5', borderBottomColor: '#4f46e5', borderLeftColor: '#10b981', transform: 'rotate(45deg)' }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[24px] font-bold text-on-surface">{data?.blood_group_outcomes?.reduce((s, b) => s + b.count, 0) ?? 142}</span>
                <span className="text-label-sm text-on-surface-variant">Matches</span>
              </div>
            </div>
            <div className="flex justify-center gap-4 mt-6 flex-wrap text-label-sm">
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-primary" /> O+ (45%)</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#10b981]" /> A+ (30%)</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#fca5a5]" /> B+ (15%)</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-[#4f46e5]" /> Rare (10%)</div>
            </div>
          </div>

          {/* Failure analysis */}
          <div className="lg:col-span-2 bg-surface-container-lowest p-lg rounded-xl border border-outline-variant overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-headline-md text-on-surface">Failure Analysis &amp; Learnings</h2>
              <span className="text-label-sm text-on-surface-variant bg-surface-container px-2 py-1 rounded">AI Insights Active</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/50">
                    <th className="py-3 px-4 text-label-md text-on-surface-variant font-semibold">Category</th>
                    <th className="py-3 px-4 text-label-md text-on-surface-variant font-semibold">Volume</th>
                    <th className="py-3 px-4 text-label-md text-on-surface-variant font-semibold">AI Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-outline-variant/30 hover:bg-surface-container-lowest transition-colors">
                    <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-[#b91c1c]">block</span><span className="text-body-md text-on-surface">No Response (24h)</span></div></td>
                    <td className="py-3 px-4 text-body-md text-on-surface">24%</td>
                    <td className="py-3 px-4"><span className="inline-block px-2 py-1 rounded text-[#065f46] bg-[#d1fae5] text-label-sm border border-[#34d399]">Shift contact to 18:00–20:00</span></td>
                  </tr>
                  <tr className="border-b border-outline-variant/30 hover:bg-surface-container-lowest transition-colors">
                    <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-[#b45309]">event_busy</span><span className="text-body-md text-on-surface">No-show at Clinic</span></div></td>
                    <td className="py-3 px-4 text-body-md text-on-surface">12%</td>
                    <td className="py-3 px-4"><span className="inline-block px-2 py-1 rounded text-[#92400e] bg-[#fef3c7] text-label-sm border border-[#fbbf24]">2-hour automated SMS reminder</span></td>
                  </tr>
                  <tr className="hover:bg-surface-container-lowest transition-colors">
                    <td className="py-3 px-4"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px] text-[#4f46e5]">bloodtype</span><span className="text-body-md text-on-surface">Rare Group Low Inventory</span></div></td>
                    <td className="py-3 px-4 text-body-md text-on-surface">8%</td>
                    <td className="py-3 px-4"><span className="inline-block px-2 py-1 rounded text-[#3730a3] bg-[#e0e7ff] text-label-sm border border-[#818cf8]">Initiate "Champion" tier re-engagement</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
