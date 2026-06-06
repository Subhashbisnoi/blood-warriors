import { useEffect, useState } from 'react';
import TopBar from '../components/layout/TopBar';
import { getInactiveDonors } from '../api/dashboard';
import { reengageDonor } from '../api/outreach';
import type { InactiveDonor } from '../types';

function bloodBadgeClass(bg: string) {
  const rare = ['A Negative', 'O Negative', 'AB Negative'];
  if (rare.includes(bg)) return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
}

function fmt(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  const months = Math.round((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (months < 1) return 'Recent';
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

function buildReengageMessage(donor: InactiveDonor): string {
  const timeSince = fmt(donor.last_donation_date);
  const donorId = donor.user_id_hash.slice(0, 6).toUpperCase();

  let timeLine: string;
  if (timeSince === 'Unknown') {
    timeLine = "It's been a while since your last donation.";
  } else if (timeSince === 'Recent') {
    timeLine = "Thank you for your recent support — we'd love to have you back soon.";
  } else {
    timeLine = `It's been ${timeSince} since your last donation.`;
  }

  const lines = [
    `Hi Donor ${donorId},`,
    '',
    timeLine,
    `Right now, patients with ${donor.blood_group} in Hyderabad need you urgently. Would you be able to schedule a quick donation this week?`,
  ];

  if (donor.inactive_trigger_comment) {
    lines.push('', `Note: ${donor.inactive_trigger_comment}`);
  }

  lines.push('', "Reply 'YES' to book or 'LATER' to pause reminders.");
  return lines.join('\n');
}

export default function InactiveDonors() {
  const [donors, setDonors] = useState<InactiveDonor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [slideOver, setSlideOver] = useState<InactiveDonor | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    getInactiveDonors(page, 20)
      .then((res: InactiveDonor[] | { items: InactiveDonor[]; total: number }) => {
        if (Array.isArray(res)) { setDonors(res); setTotal(res.length); }
        else { setDonors(res.items); setTotal(res.total); }
      })
      .catch(console.error);
  }, [page]);

  async function handleReengage(donor: InactiveDonor) {
    setSending(true);
    try {
      await reengageDonor(donor.id);
      setSent(donor.id);
      setSlideOver(null);
    } catch { /* ignore */ }
    setSending(false);
  }

  return (
    <div className="flex flex-col h-full relative">
      <TopBar title="Inactive Donor Re-engagement" />
      <div className="flex-1 overflow-y-auto p-xl bg-background">
        <div className="max-w-[1280px] mx-auto space-y-lg">
          <div>
            <h2 className="text-headline-lg text-on-surface mb-2">Inactive Donor Re-engagement</h2>
            <p className="text-body-md text-on-surface-variant">
              Identify and re-activate donors who have drifted from regular donation cycles.
            </p>
          </div>

          <div className="bg-surface-container-high rounded-xl p-md border border-outline-variant flex items-start gap-md">
            <span className="material-symbols-outlined text-primary mt-1">info</span>
            <div>
              <p className="text-body-md text-on-surface font-medium">
                Group A donors drifted mostly due to scheduling conflicts. Group B isn't responding to SMS.
              </p>
              <p className="text-label-md text-on-surface-variant mt-1">
                Consider prioritizing WhatsApp or personal calls for Group B.
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
            <div className="flex bg-surface-container rounded-lg p-1 border border-outline-variant">
              <button className="px-md py-2 rounded-md bg-surface shadow-sm text-label-md text-on-surface font-semibold">
                {total > 0 ? Math.ceil(total * 0.53) : 361} Not donated 1yr
              </button>
              <button className="px-md py-2 rounded-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors">
                {total > 0 ? Math.floor(total * 0.47) : 321} Low activity
              </button>
            </div>
            <div className="flex gap-sm">
              <button className="flex items-center gap-2 px-md py-2 rounded-lg border border-outline-variant bg-surface hover:bg-surface-container transition-colors text-label-md">
                <span className="material-symbols-outlined text-[18px]">filter_list</span>
                Filter
              </button>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant bg-surface-container-lowest">
                    {['ID / Name', 'Blood Group', 'Last Donation', 'Last Contacted', 'Reason Logged', 'Action'].map(h => (
                      <th key={h} className={`py-sm px-md text-label-sm text-on-surface-variant uppercase tracking-wider ${h === 'Action' ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {donors.length === 0
                    ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="py-md px-md"><div className="h-5 bg-surface-container-low rounded animate-pulse" /></td></tr>
                    ))
                    : donors.map(d => (
                      <tr key={d.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="py-md px-md">
                          <div className="text-label-md text-on-surface font-semibold">{d.user_id_hash.slice(0, 6).toUpperCase()}</div>
                          <div className="text-body-md text-on-surface-variant text-sm">{d.user_id_hash.slice(6, 14).toUpperCase()}</div>
                        </td>
                        <td className="py-md px-md">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-label-sm border ${bloodBadgeClass(d.blood_group)}`}>
                            {d.blood_group}
                          </span>
                        </td>
                        <td className="py-md px-md text-body-md text-on-surface">{fmt(d.last_donation_date)}</td>
                        <td className="py-md px-md text-body-md text-on-surface">{fmt(d.last_contacted_date)}</td>
                        <td className="py-md px-md text-body-md text-on-surface-variant text-sm max-w-[160px] truncate" title={d.inactive_trigger_comment ?? ''}>
                          {d.inactive_trigger_comment ?? '—'}
                        </td>
                        <td className="py-md px-md text-right">
                          {sent === d.id ? (
                            <span className="text-label-sm text-emerald-700 font-semibold">Sent ✓</span>
                          ) : (
                            <button
                              onClick={() => setSlideOver(d)}
                              className="inline-flex items-center justify-center px-3 py-1.5 rounded-full border border-primary text-primary hover:bg-primary hover:text-white transition-colors text-label-sm font-semibold"
                            >
                              Re-engage
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {total > 20 && (
            <div className="flex justify-center gap-sm">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-md py-sm rounded-lg border border-outline-variant text-label-md disabled:opacity-50 hover:bg-surface-container transition-colors">Previous</button>
              <span className="px-md py-sm text-label-md text-on-surface-variant">Page {page} of {Math.ceil(total / 20)}</span>
              <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)} className="px-md py-sm rounded-lg border border-outline-variant text-label-md disabled:opacity-50 hover:bg-surface-container transition-colors">Next</button>
            </div>
          )}
        </div>
      </div>

      {/* Slide-over */}
      <div className={`fixed inset-y-0 right-0 w-full md:w-[400px] bg-surface border-l border-outline-variant shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col ${slideOver ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-md border-b border-outline-variant flex justify-between items-center bg-surface-container-lowest">
          <h3 className="text-headline-md font-bold text-on-surface">AI Drafted Message</h3>
          <button onClick={() => setSlideOver(null)} className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-variant transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {slideOver && (
          <>
            <div className="flex-1 p-md overflow-y-auto">
              <div className="bg-surface-container-low rounded-xl p-md border border-outline-variant">
                <div className="flex items-center gap-2 mb-sm text-secondary">
                  <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                  <span className="text-label-sm uppercase tracking-wider">AI Generated Preview</span>
                </div>
                <p className="text-body-md text-on-surface whitespace-pre-wrap">
                  {buildReengageMessage(slideOver)}
                </p>
              </div>
            </div>
            <div className="p-md border-t border-outline-variant bg-surface-container-lowest flex gap-sm justify-end">
              <button className="px-md py-2 rounded-lg border border-primary text-primary text-label-md font-semibold hover:bg-surface-variant transition-colors">Edit</button>
              <button
                onClick={() => handleReengage(slideOver)}
                disabled={sending}
                className="px-md py-2 rounded-lg bg-primary-container text-white text-label-md font-semibold hover:bg-primary transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                {sending ? 'Sending…' : 'Send This Message'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
