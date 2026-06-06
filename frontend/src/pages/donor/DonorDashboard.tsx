import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import TopBar from '../../components/layout/TopBar';
import { getDonorProfile } from '../../api/donorPortal';
import type { DonationRecord } from '../../api/donorPortal';

// ── mini stat card ────────────────────────────────────────────────────────────
function Stat({ icon, label, value, color = '#ba1a1a' }: { icon: string; label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg flex items-center gap-md shadow-sm">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
           style={{ background: color + '18' }}>
        <span className="material-symbols-outlined icon-fill" style={{ color, fontSize: 22 }}>{icon}</span>
      </div>
      <div>
        <p className="text-headline-md font-black text-on-surface leading-none">{value}</p>
        <p className="text-label-sm text-on-surface-variant mt-xs">{label}</p>
      </div>
    </div>
  );
}

// ── D3 donation history chart ─────────────────────────────────────────────────
function DonationChart({ history }: { history: DonationRecord[] }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !history.length) return;
    const el = ref.current;
    const W = el.clientWidth || 720;
    const H = 220;
    const M = { top: 20, right: 20, bottom: 40, left: 36 };
    const iW = W - M.left - M.right;
    const iH = H - M.top - M.bottom;

    d3.select(el).selectAll('*').remove();
    const svg = d3.select(el).attr('width', W).attr('height', H);
    const g = svg.append('g').attr('transform', `translate(${M.left},${M.top})`);

    // Aggregate by month
    const byMonth = d3.rollup(
      history,
      v => d3.sum(v, d => d.units),
      d => d.date.slice(0, 7),
    );
    const data = Array.from(byMonth, ([month, units]) => ({ month, units }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const x = d3.scaleBand()
      .domain(data.map(d => d.month))
      .range([0, iW])
      .padding(0.35);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.units)! + 0.5])
      .range([iH, 0]);

    // Gradient
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'bar-grad').attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
    grad.append('stop').attr('offset', '0%').attr('stop-color', '#ba1a1a').attr('stop-opacity', 0.9);
    grad.append('stop').attr('offset', '100%').attr('stop-color', '#ef9a9a').attr('stop-opacity', 0.5);

    // Grid lines
    g.append('g').attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(4).tickSize(-iW).tickFormat(() => ''))
      .call(gg => gg.select('.domain').remove())
      .call(gg => gg.selectAll('line').attr('stroke', 'rgba(186,26,26,0.08)').attr('stroke-dasharray', '3,3'));

    // Bars
    g.selectAll<SVGRectElement, typeof data[number]>('rect.bar')
      .data(data).join('rect').attr('class', 'bar')
      .attr('x', d => x(d.month)!)
      .attr('width', x.bandwidth())
      .attr('y', iH)
      .attr('height', 0)
      .attr('rx', 4)
      .attr('fill', 'url(#bar-grad)')
      .transition().duration(600).delay((_, i) => i * 40)
      .attr('y', d => y(d.units))
      .attr('height', d => iH - y(d.units));

    // Value labels on bars
    g.selectAll<SVGTextElement, typeof data[number]>('text.val')
      .data(data).join('text').attr('class', 'val')
      .attr('x', d => x(d.month)! + x.bandwidth() / 2)
      .attr('y', d => y(d.units) - 5)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('font-weight', '700')
      .attr('fill', '#ba1a1a')
      .attr('opacity', 0)
      .text(d => d.units > 0 ? `${d.units}u` : '')
      .transition().duration(600).delay((_, i) => i * 40 + 300)
      .attr('opacity', 1);

    // X axis
    g.append('g').attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(x).tickFormat(d => {
        const [y, m] = (d as string).split('-');
        return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m - 1]} ${y.slice(2)}`;
      }))
      .call(gg => gg.select('.domain').remove())
      .call(gg => gg.selectAll('text').attr('font-size', '9px').attr('fill', '#9e7878')
        .attr('transform', 'rotate(-35)').attr('text-anchor', 'end').attr('dx', '-0.5em').attr('dy', '0.15em'));

    // Y axis
    g.append('g')
      .call(d3.axisLeft(y).ticks(4).tickFormat(d => `${d}u`))
      .call(gg => gg.select('.domain').remove())
      .call(gg => gg.selectAll('text').attr('font-size', '9px').attr('fill', '#9e7878'));

  }, [history]);

  return (
    <svg ref={ref} className="w-full" style={{ height: 220 }} />
  );
}

// ── timeline dots ─────────────────────────────────────────────────────────────
function DonationTimeline({ history }: { history: DonationRecord[] }) {
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-0.5 rounded-full" style={{ background: 'rgba(186,26,26,0.12)' }} />
      {sorted.map((d, i) => (
        <div key={d.id} className="relative mb-md last:mb-0" style={{ animationDelay: `${i * 50}ms` }}>
          <div className="absolute -left-4 top-1 w-3 h-3 rounded-full border-2 flex-shrink-0"
               style={{ background: d.recipient_saved ? '#ba1a1a' : '#e0e0e0', borderColor: d.recipient_saved ? '#7b0000' : '#bdbdbd' }} />
          <div className="bg-surface rounded-xl border border-outline-variant/30 px-md py-sm hover:shadow-sm transition-shadow">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-sm">
                <span className="text-label-md font-bold text-on-surface">
                  {new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-label-sm px-xs py-0 rounded-full font-medium"
                      style={{ background: 'rgba(186,26,26,0.08)', color: '#ba1a1a' }}>{d.type}</span>
              </div>
              <div className="flex items-center gap-sm">
                <span className="text-label-sm text-on-surface-variant">{d.location}</span>
                {d.recipient_saved && (
                  <span className="text-label-sm font-bold" style={{ color: '#2e7d32' }}>
                    <span className="material-symbols-outlined icon-fill" style={{ fontSize: 14, verticalAlign: 'middle' }}>favorite</span> Saved
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function DonorDashboard() {
  const profile = getDonorProfile();
  if (!profile) return null;

  const history = profile.donation_history ?? [];
  const tierColor = profile.donor_tier === 'Platinum' ? '#7b1fa2'
    : profile.donor_tier === 'Gold'   ? '#e65100'
    : profile.donor_tier === 'Silver' ? '#546e7a' : '#2e7d32';

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

  const nextEligible = profile.next_eligible_date
    ? new Date(profile.next_eligible_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'N/A';

  return (
    <div className="flex flex-col h-full">
      <TopBar title="My Donor Impact" />
      <div className="flex-1 overflow-y-auto p-xl bg-background space-y-xl">

        {/* Profile hero */}
        <div className="rounded-2xl p-lg flex flex-col sm:flex-row items-start sm:items-center gap-lg"
             style={{ background: 'linear-gradient(135deg, #fff8f7 0%, #fde8e8 100%)', border: '1px solid rgba(186,26,26,0.15)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-black text-headline-md flex-shrink-0"
               style={{ background: '#ba1a1a' }}>
            {profile.blood_group}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-sm flex-wrap">
              <h2 className="text-headline-md font-bold text-on-surface">Donor {profile.hash}</h2>
              <span className="px-sm py-xs rounded-full text-label-sm font-bold"
                    style={{ background: tierColor + '18', color: tierColor }}>
                {profile.donor_tier}
              </span>
              <span className="px-sm py-xs rounded-full text-label-sm font-bold"
                    style={{ background: profile.eligibility_status === 'Eligible' ? 'rgba(46,125,50,0.1)' : 'rgba(230,81,0,0.1)',
                             color: profile.eligibility_status === 'Eligible' ? '#2e7d32' : '#e65100' }}>
                {profile.eligibility_status ?? 'Active'}
              </span>
            </div>
            <p className="text-body-md text-on-surface-variant mt-xs">
              {profile.city ?? ''} · {profile.donor_type ?? 'Donor'}
            </p>
            {profile.next_eligible_date && (
              <p className="text-label-sm mt-xs font-medium" style={{ color: '#1565c0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle' }}>event_available</span>
                {' '}Next eligible: {nextEligible}
              </p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
          <Stat icon="water_drop"          label="Total Donations"  value={profile.donations_till_date ?? history.length} />
          <Stat icon="favorite"            label="Lives Saved"      value={profile.lives_saved}        color="#ba1a1a" />
          <Stat icon="local_fire_department" label="Streak"          value={`${streak}×`}               color="#e65100" />
          <Stat icon="grade"               label="KAG Score"        value={profile.kag_score != null ? profile.kag_score.toFixed(2) : '—'} color="#7b1fa2" />
        </div>

        {/* Chart */}
        <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm">
          <div className="flex items-center justify-between mb-md">
            <div>
              <h3 className="text-title-lg font-bold text-on-surface">Donation History</h3>
              <p className="text-label-sm text-on-surface-variant">Units donated per month</p>
            </div>
            <span className="text-label-sm px-md py-xs rounded-full font-bold"
                  style={{ background: 'rgba(186,26,26,0.08)', color: '#ba1a1a' }}>
              {history.length} sessions
            </span>
          </div>
          {history.length > 0
            ? <DonationChart history={history} />
            : <p className="text-body-md text-on-surface-variant text-center py-lg">No donation history yet.</p>
          }
        </div>

        {/* Timeline */}
        {history.length > 0 && (
          <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm">
            <h3 className="text-title-lg font-bold text-on-surface mb-md">Donation Timeline</h3>
            <DonationTimeline history={history} />
          </div>
        )}
      </div>
    </div>
  );
}
