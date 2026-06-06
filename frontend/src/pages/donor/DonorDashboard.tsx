import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { getDonorProfile } from '../../api/donorPortal';
import type { DonationRecord } from '../../api/donorPortal';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, sub, bg, iconColor,
}: {
  icon: string; label: string; value: string | number;
  sub?: string; bg: string; iconColor: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-lg flex flex-col gap-sm" style={{ background: bg }}>
      <div className="flex items-center justify-between">
        <span className="text-label-sm font-semibold uppercase tracking-wider"
              style={{ color: iconColor, opacity: 0.8 }}>{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
             style={{ background: iconColor + '22' }}>
          <span className="material-symbols-outlined icon-fill" style={{ color: iconColor, fontSize: 20 }}>{icon}</span>
        </div>
      </div>
      <p className="text-[2.2rem] font-black leading-none text-on-surface">{value}</p>
      {sub && <p className="text-label-sm" style={{ color: iconColor }}>{sub}</p>}
      {/* decorative circle */}
      <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-[0.07]"
           style={{ background: iconColor }} />
    </div>
  );
}

// ── D3 Bar Chart ──────────────────────────────────────────────────────────────
function DonationChart({ history }: { history: DonationRecord[] }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !history.length) return;

    const W = el.parentElement?.clientWidth || 700;
    const H = 230;
    const M = { top: 24, right: 16, bottom: 44, left: 40 };
    const iW = W - M.left - M.right;
    const iH = H - M.top - M.bottom;

    d3.select(el).selectAll('*').remove();
    const svg = d3.select(el).attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    // Aggregate by month
    const byMonth = d3.rollup(history, v => d3.sum(v, d => d.units), d => d.date.slice(0, 7));
    const data = Array.from(byMonth, ([month, units]) => ({ month, units }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const x = d3.scaleBand().domain(data.map(d => d.month)).range([0, iW]).padding(0.38);
    const y = d3.scaleLinear().domain([0, (d3.max(data, d => d.units) ?? 2) + 0.8]).range([iH, 0]);

    // Defs — gradient + clip
    const defs = svg.append('defs');
    const grd = defs.append('linearGradient').attr('id', 'dd-bar').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
    grd.append('stop').attr('offset', '0%').attr('stop-color', '#ba1a1a');
    grd.append('stop').attr('offset', '100%').attr('stop-color', '#fca5a5').attr('stop-opacity', 0.4);

    // Subtle grid
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickSize(-iW).tickFormat(() => ''))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('line').attr('stroke', 'rgba(186,26,26,0.07)').attr('stroke-dasharray', '4,4'));

    // Bars
    g.selectAll<SVGRectElement, typeof data[number]>('rect.b')
      .data(data).join('rect').attr('class', 'b')
      .attr('x', d => x(d.month)!).attr('width', x.bandwidth())
      .attr('y', iH).attr('height', 0).attr('rx', 6)
      .attr('fill', 'url(#dd-bar)')
      .transition().duration(700).ease(d3.easeCubicOut).delay((_, i) => i * 45)
      .attr('y', d => y(d.units)).attr('height', d => iH - y(d.units));

    // Value labels
    g.selectAll<SVGTextElement, typeof data[number]>('text.lbl')
      .data(data).join('text').attr('class', 'lbl')
      .attr('x', d => x(d.month)! + x.bandwidth() / 2)
      .attr('y', d => y(d.units) - 7)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px').attr('font-weight', '800').attr('fill', '#ba1a1a').attr('opacity', 0)
      .text(d => `${d.units}u`)
      .transition().duration(400).delay((_, i) => i * 45 + 500).attr('opacity', 1);

    // X axis
    g.append('g').attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(x).tickFormat(d => {
        const [yr, mo] = (d as string).split('-');
        return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+mo - 1]}'${yr.slice(2)}`;
      }))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', '10px').attr('fill', '#9e7878')
        .attr('transform', 'rotate(-30)').attr('text-anchor', 'end').attr('dx', '-0.4em').attr('dy', '0.2em'));

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(v => `${v}u`))
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text').attr('font-size', '10px').attr('fill', '#9e7878'));

  }, [history]);

  return <svg ref={ref} style={{ width: '100%', height: 230, display: 'block' }} />;
}

// ── Timeline ──────────────────────────────────────────────────────────────────
function Timeline({ history }: { history: DonationRecord[] }) {
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const typeColor: Record<string, string> = {
    'Whole Blood': '#ba1a1a', Platelets: '#1565c0', Plasma: '#6a1b9a',
  };
  return (
    <div className="relative pl-7">
      <div className="absolute left-[10px] top-1 bottom-1 w-px" style={{ background: 'linear-gradient(to bottom, #ba1a1a44, #ba1a1a11)' }} />
      {sorted.map((d, i) => {
        const c = typeColor[d.type] ?? '#ba1a1a';
        return (
          <div key={d.id} className="relative flex gap-md mb-3 last:mb-0 items-start">
            <div className="absolute -left-[15px] mt-[5px] w-3 h-3 rounded-full border-2 flex-shrink-0 z-10"
                 style={{ background: d.recipient_saved ? c : '#e0e0e0', borderColor: d.recipient_saved ? c : '#bdbdbd' }} />
            <div className="flex-1 rounded-xl border px-md py-sm hover:shadow-sm transition-all cursor-default"
                 style={{ borderColor: 'rgba(186,26,26,0.1)', background: i % 2 === 0 ? '#fff' : '#fff8f7' }}>
              <div className="flex items-center justify-between flex-wrap gap-xs">
                <div className="flex items-center gap-xs flex-wrap">
                  <span className="text-label-md font-bold text-on-surface">
                    {new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="text-[11px] px-xs py-0 rounded-full font-bold"
                        style={{ background: c + '15', color: c }}>{d.type}</span>
                  <span className="text-[11px] px-xs py-0 rounded-full font-bold"
                        style={{ background: 'rgba(0,0,0,0.05)', color: '#555' }}>{d.units}u</span>
                </div>
                <div className="flex items-center gap-xs">
                  <span className="text-[11px] text-on-surface-variant">{d.location}</span>
                  {d.recipient_saved && (
                    <span className="text-[11px] font-bold flex items-center gap-[2px]" style={{ color: '#2e7d32' }}>
                      <span className="material-symbols-outlined icon-fill" style={{ fontSize: 12 }}>favorite</span> Saved
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DonorDashboard() {
  const profile = getDonorProfile();
  if (!profile) return null;

  const history = profile.donation_history ?? [];

  const tierMeta: Record<string, { color: string; bg: string; icon: string }> = {
    Platinum: { color: '#7b1fa2', bg: 'rgba(123,31,162,0.08)', icon: 'diamond' },
    Gold:     { color: '#c77700', bg: 'rgba(199,119,0,0.08)',  icon: 'emoji_events' },
    Silver:   { color: '#546e7a', bg: 'rgba(84,110,122,0.08)', icon: 'military_tech' },
  };
  const tier = tierMeta[profile.donor_tier ?? ''] ?? { color: '#2e7d32', bg: 'rgba(46,125,50,0.08)', icon: 'workspace_premium' };

  const streak = (() => {
    if (!history.length) return 0;
    let s = 1;
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sorted.length; i++) {
      const gap = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000;
      if (gap <= 180) s++; else s = 1;
    }
    return s;
  })();

  const isEligible = (profile.eligibility_status ?? '').toLowerCase() === 'eligible';
  const nextDate = profile.next_eligible_date
    ? new Date(profile.next_eligible_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  // Short blood group: "A Positive" → "A+"
  const bgShort = (profile.blood_group ?? '')
    .replace('Positive', '+').replace('Negative', '-')
    .replace(' ', '').trim() || profile.blood_group;

  return (
    <div className="flex-1 overflow-y-auto bg-background">

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden px-xl pt-xl pb-lg"
           style={{ background: 'linear-gradient(135deg, #1a0505 0%, #3b0a0a 50%, #1a0505 100%)' }}>
        {/* decorative blobs */}
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full blur-[80px] pointer-events-none"
             style={{ background: 'rgba(186,26,26,0.25)', transform: 'translate(30%,-30%)' }} />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 rounded-full blur-[60px] pointer-events-none"
             style={{ background: 'rgba(186,26,26,0.12)' }} />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-lg">
          {/* Blood group circle */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center font-black text-white shadow-lg"
                 style={{ background: 'linear-gradient(135deg, #ba1a1a, #7b0000)', fontSize: 22, letterSpacing: '-0.5px' }}>
              {bgShort}
            </div>
            {isEligible && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-[#1a0505] flex items-center justify-center"
                   style={{ background: '#2e7d32' }}>
                <span className="material-symbols-outlined icon-fill" style={{ color: '#fff', fontSize: 12 }}>check</span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-sm flex-wrap mb-xs">
              <h1 className="font-black text-white" style={{ fontSize: '1.5rem' }}>Donor {profile.hash}</h1>
              {/* Tier badge */}
              <span className="px-sm py-[2px] rounded-full text-[11px] font-black flex items-center gap-[3px]"
                    style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.color}44` }}>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize: 11 }}>{tier.icon}</span>
                {profile.donor_tier ?? 'Active'}
              </span>
              {/* Eligibility */}
              <span className="px-sm py-[2px] rounded-full text-[11px] font-bold"
                    style={{ background: isEligible ? 'rgba(46,125,50,0.2)' : 'rgba(230,81,0,0.2)',
                             color: isEligible ? '#81c784' : '#ffb74d' }}>
                {isEligible ? '✓ Eligible' : '✗ Not Eligible'}
              </span>
            </div>
            <p className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {[profile.city, profile.donor_type].filter(Boolean).join(' · ')}
            </p>
            {nextDate && (
              <p className="mt-xs text-[12px] font-semibold" style={{ color: '#90caf9' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle' }}>event_available</span>
                {' '}Next eligible: {nextDate}
              </p>
            )}
          </div>

          {/* KAG Score pill */}
          {profile.kag_score != null && (
            <div className="flex-shrink-0 text-center px-lg py-md rounded-2xl"
                 style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-[2px]"
                 style={{ color: 'rgba(255,255,255,0.5)' }}>KAG Score</p>
              <p className="text-[2rem] font-black" style={{ color: '#ce93d8' }}>{profile.kag_score.toFixed(2)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-xl py-xl space-y-xl">

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-md">
          <StatCard
            icon="water_drop" label="Total Donations"
            value={profile.donations_till_date ?? history.length}
            sub="sessions completed"
            bg="linear-gradient(135deg,#fff8f7,#fde8e8)"
            iconColor="#ba1a1a"
          />
          <StatCard
            icon="favorite" label="Lives Saved"
            value={profile.lives_saved}
            sub="recipients helped"
            bg="linear-gradient(135deg,#fff8f8,#fce4e4)"
            iconColor="#c62828"
          />
          <StatCard
            icon="local_fire_department" label="Streak"
            value={`${streak}×`}
            sub="consecutive cycles"
            bg="linear-gradient(135deg,#fffbf5,#fff3e0)"
            iconColor="#e65100"
          />
          <StatCard
            icon="military_tech" label="Donor Tier"
            value={profile.donor_tier ?? '—'}
            sub="based on KAG score"
            bg={`linear-gradient(135deg,#faf5ff,#f3e8ff)`}
            iconColor="#7b1fa2"
          />
        </div>

        {/* Chart card */}
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden"
             style={{ border: '1px solid rgba(186,26,26,0.1)' }}>
          <div className="flex items-center justify-between px-xl pt-lg pb-md border-b"
               style={{ borderColor: 'rgba(186,26,26,0.07)' }}>
            <div>
              <h3 className="text-title-lg font-bold text-on-surface">Donation History</h3>
              <p className="text-label-sm text-on-surface-variant mt-[2px]">Units donated per month</p>
            </div>
            <div className="flex items-center gap-xs px-md py-xs rounded-full"
                 style={{ background: 'rgba(186,26,26,0.06)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 14, color: '#ba1a1a' }}>water_drop</span>
              <span className="text-label-sm font-bold" style={{ color: '#ba1a1a' }}>{history.length} sessions</span>
            </div>
          </div>
          <div className="px-lg pb-lg pt-md">
            {history.length > 0
              ? <DonationChart history={history} />
              : <p className="text-body-md text-on-surface-variant text-center py-xl">No donation history yet.</p>
            }
          </div>
        </div>

        {/* Timeline card */}
        {history.length > 0 && (
          <div className="bg-white rounded-3xl shadow-sm overflow-hidden"
               style={{ border: '1px solid rgba(186,26,26,0.1)' }}>
            <div className="flex items-center justify-between px-xl pt-lg pb-md border-b"
                 style={{ borderColor: 'rgba(186,26,26,0.07)' }}>
              <div>
                <h3 className="text-title-lg font-bold text-on-surface">Donation Timeline</h3>
                <p className="text-label-sm text-on-surface-variant mt-[2px]">Chronological donation log</p>
              </div>
              <span className="text-label-sm text-on-surface-variant">Most recent first</span>
            </div>
            <div className="px-xl py-lg">
              <Timeline history={history} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
