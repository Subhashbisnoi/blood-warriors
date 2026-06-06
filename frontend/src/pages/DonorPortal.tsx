import { useState, FormEvent } from 'react';
import TopBar from '../components/layout/TopBar';
import { getDonor, getDonorBridges } from '../api/donors';
import type { DonorProfile } from '../types';

interface Bridge {
  bridge_id: string;
  expected_next_transfusion_date: string;
  status_of_bridge: boolean;
  quantity_required: number;
}

function fmt(d: string | null) {
  if (!d) return 'Unknown';
  return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function tierBadge(donorType: string) {
  if (donorType === 'Regular Donor') return 'bg-primary text-on-primary';
  if (donorType === 'One-Time Donor') return 'bg-surface-variant text-on-surface';
  return 'bg-secondary-container text-on-secondary-container';
}

export default function DonorPortal() {
  const [userId, setUserId] = useState('');
  const [input, setInput] = useState('');
  const [donor, setDonor] = useState<DonorProfile | null>(null);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const id = input.trim();
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const [d, b] = await Promise.all([getDonor(id), getDonorBridges(id)]);
      setDonor(d);
      setBridges(b);
      setUserId(id);
    } catch {
      setError('Donor not found. Try a valid user ID from the database.');
      setDonor(null);
      setBridges([]);
    } finally {
      setLoading(false);
    }
  }

  const livesImpacted = donor ? Math.round(donor.donations_till_date * 3) : 0;

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Donor Portal" />
      <div className="flex-1 overflow-y-auto p-xl bg-background">

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-md mb-xl max-w-lg">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter donor user ID (hex)…"
            className="flex-1 px-md py-sm rounded-xl border border-outline-variant bg-surface text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-lg py-sm rounded-xl bg-primary-container text-on-primary text-label-md font-bold hover:bg-primary transition-colors disabled:opacity-60"
          >
            {loading ? 'Loading…' : 'Search'}
          </button>
        </form>

        {error && <p className="text-label-md text-error bg-error-container p-sm rounded-lg mb-lg">{error}</p>}

        {!donor && !loading && !error && (
          <>
            {/* Demo profile shown before search, matching Stitch design */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-md mb-lg">
              <div>
                <h1 className="text-headline-lg text-on-background">Donor Portal</h1>
                <p className="text-body-md text-on-surface-variant mt-1">Manage your donations and view your life-saving impact.</p>
              </div>
              <button className="bg-surface text-primary border border-primary px-lg py-sm rounded-lg text-label-md hover:bg-primary-fixed transition-colors">
                Update Preferences
              </button>
            </div>
            <div className="flex flex-col items-center justify-center py-xl gap-md text-on-surface-variant">
              <span className="material-symbols-outlined text-[64px] text-outline">person_search</span>
              <p className="text-body-lg">Enter a donor ID to view their profile and bridge assignments.</p>
            </div>
          </>
        )}

        {donor && (
          <>
            {/* Eligibility banner */}
            {donor.next_eligible_date && (
              <div className="bg-[#FFF8E1] border border-[#FFC107] rounded-xl p-md flex items-start gap-md shadow-sm mb-xl">
                <span className="material-symbols-outlined text-[#FF8F00] mt-xs">calendar_clock</span>
                <div>
                  <h3 className="text-label-md text-[#5D4037] font-bold">Next Eligible Donation Date</h3>
                  <p className="text-body-md text-[#5D4037] mt-1">
                    This donor can donate again from <span className="font-bold">{fmt(donor.next_eligible_date)}</span>.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-xl">
              {/* Left column */}
              <div className="lg:col-span-4 flex flex-col gap-lg">
                {/* Profile card */}
                <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary-fixed-dim/20 rounded-bl-full -z-0" />
                  <div className="flex flex-col items-center text-center z-10 relative">
                    <div className="w-24 h-24 rounded-full bg-primary-container text-on-primary flex items-center justify-center text-[32px] font-bold mb-md shadow-md border-4 border-surface">
                      {donor.blood_group.replace(' ', '').replace('Positive', '+').replace('Negative', '-')}
                    </div>
                    <h2 className="text-headline-md text-on-background">{userId.slice(0, 12).toUpperCase()}</h2>
                    <p className="text-label-md text-on-surface-variant mt-xs">{donor.eligibility_status} • {donor.user_donation_active_status}</p>
                    <div className="flex flex-wrap justify-center gap-sm mt-md">
                      <span className={`px-sm py-xs rounded-full text-label-sm flex items-center gap-1 ${tierBadge(donor.donor_type)}`}>
                        <span className="material-symbols-outlined text-[14px]">water_drop</span>
                        {donor.donor_type}
                      </span>
                      {donor.donations_till_date >= 3 && (
                        <span className="bg-[#1A0A0A] text-[#FFD54F] px-sm py-xs rounded-full text-label-sm flex items-center gap-1 border border-[#FFD54F]/30">
                          <span className="material-symbols-outlined text-[14px] icon-fill">stars</span>
                          Bridge Champion
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-md">
                  <div className="bg-surface-container border border-outline-variant rounded-xl p-md flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-primary mb-xs icon-fill">favorite</span>
                    <span className="text-headline-md font-bold text-on-background">{donor.donations_till_date}</span>
                    <span className="text-label-sm text-on-surface-variant">Lifetime Donations</span>
                  </div>
                  <div className="bg-surface-container border border-outline-variant rounded-xl p-md flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-primary mb-xs icon-fill">group</span>
                    <span className="text-headline-md font-bold text-on-background">{livesImpacted}</span>
                    <span className="text-label-sm text-on-surface-variant">Lives Impacted</span>
                  </div>
                  <div className="bg-surface-container border border-outline-variant rounded-xl p-md flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-amber-600 mb-xs">call</span>
                    <span className="text-headline-md font-bold text-on-background">{donor.calls_to_donations_ratio.toFixed(1)}</span>
                    <span className="text-label-sm text-on-surface-variant">Calls/Donation</span>
                  </div>
                  <div className="bg-surface-container border border-outline-variant rounded-xl p-md flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-primary mb-xs">emergency_home</span>
                    <span className="text-headline-md font-bold text-on-background">{bridges.length}</span>
                    <span className="text-label-sm text-on-surface-variant">Active Bridges</span>
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="lg:col-span-8 flex flex-col gap-xl">
                {/* Impact Story Timeline */}
                <section>
                  <h2 className="text-headline-md text-on-background mb-md flex items-center gap-sm">
                    <span className="material-symbols-outlined text-primary">timeline</span> Your Impact
                  </h2>
                  <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-sm relative">
                    <div className="absolute left-[39px] top-lg bottom-lg w-0.5 bg-outline-variant" />
                    <div className="flex flex-col gap-lg">
                      <div className="flex gap-md relative z-10">
                        <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary flex items-center justify-center shrink-0 shadow-sm border-2 border-surface">
                          <span className="material-symbols-outlined icon-fill">child_care</span>
                        </div>
                        <div className="bg-surface-container border border-outline-variant rounded-lg p-md flex-1">
                          <div className="flex justify-between items-start mb-xs">
                            <span className="text-label-sm text-on-surface-variant">{donor.last_donation_date ? new Date(donor.last_donation_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Last donation'}</span>
                            <span className="bg-[#E8F5E9] text-[#2E7D32] px-2 py-0.5 rounded text-[10px] font-bold border border-[#A5D6A7]">SUCCESS</span>
                          </div>
                          <p className="text-body-md text-on-background">
                            Your {donor.blood_group.replace(' ', '').replace('Positive', '+').replace('Negative', '-')} donation was successfully matched and transfused for a patient. The clinical bridge is now <span className="font-bold text-primary">stable</span>.
                          </p>
                        </div>
                      </div>
                      {donor.donations_till_date > 1 && (
                        <div className="flex gap-md relative z-10">
                          <div className="w-12 h-12 rounded-full bg-surface-variant text-on-surface flex items-center justify-center shrink-0 border-2 border-surface">
                            <span className="material-symbols-outlined">vaccines</span>
                          </div>
                          <div className="bg-surface-container border border-outline-variant rounded-lg p-md flex-1 opacity-70">
                            <p className="text-body-md text-on-background">
                              Whole blood donation collected. Restocked local critical reserve for trauma center.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Donor details */}
                <section>
                  <h2 className="text-headline-md text-on-background mb-md flex items-center gap-sm">
                    <span className="material-symbols-outlined text-primary">info</span> Donor Details
                  </h2>
                  <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg shadow-sm grid grid-cols-2 gap-md">
                    {[
                      ['Blood Group', donor.blood_group],
                      ['Donor Type', donor.donor_type],
                      ['Active Status', donor.user_donation_active_status],
                      ['Eligibility', donor.eligibility_status],
                      ['Last Donation', fmt(donor.last_donation_date)],
                      ['Next Eligible', fmt(donor.next_eligible_date)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <p className="text-label-sm text-on-surface-variant">{label}</p>
                        <p className="text-body-md text-on-surface font-semibold mt-xs">{value}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Bridges */}
                <section>
                  <h2 className="text-headline-md text-on-background mb-md flex items-center gap-sm">
                    <span className="material-symbols-outlined text-primary">diversity_1</span> Bridges I Support
                  </h2>
                  {bridges.length === 0 ? (
                    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg text-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-[40px]">emergency_home</span>
                      <p className="text-body-md mt-md">No bridge assignments found for this donor.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                      {bridges.map(b => {
                        const isActive = b.status_of_bridge;
                        return (
                          <div key={b.bridge_id} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm flex flex-col">
                            <div className="flex justify-between items-start mb-md">
                              <div className="flex items-center gap-sm">
                                <span className="material-symbols-outlined text-primary">medical_services</span>
                                <span className="text-label-md font-bold text-on-background">{b.bridge_id.slice(0, 12).toUpperCase()}</span>
                              </div>
                              <span className={`px-sm py-xs rounded-full text-label-sm flex items-center gap-1 ${isActive ? 'bg-[#E8F5E9] text-[#2E7D32] border border-[#A5D6A7]' : 'bg-surface-variant text-on-surface border border-outline-variant'}`}>
                                <span className="w-2 h-2 rounded-full" style={{ background: isActive ? '#2E7D32' : '#8f6f6f' }} />
                                {isActive ? 'Stable' : 'Inactive'}
                              </span>
                            </div>
                            <div className="pt-md border-t border-outline-variant flex justify-between items-center mt-auto">
                              <span className="text-label-sm text-on-surface-variant">
                                Next: {fmt(b.expected_next_transfusion_date)}
                              </span>
                              <span className="text-label-sm text-on-surface-variant">{b.quantity_required} unit(s)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
