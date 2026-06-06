import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/layout/TopBar';
import { createMatch } from '../api/match';
import apiClient from '../api/client';
import type { DonorCandidate } from '../types';

type ContactState = 'idle' | 'sending' | 'awaiting' | 'confirming' | 'confirmed';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] as const;
const BG_MAP: Record<string, string> = {
  'A+': 'A Positive', 'A-': 'A Negative', 'B+': 'B Positive', 'B-': 'B Negative',
  'O+': 'O Positive', 'O-': 'O Negative', 'AB+': 'AB Positive', 'AB-': 'AB Negative',
};

function tierColor(tier: string) {
  if (tier === 'Tier1') return 'text-emerald-600';
  if (tier === 'Tier2') return 'text-amber-600';
  return 'text-on-surface-variant';
}

function tierIcon(tier: string) {
  if (tier === 'Tier1') return 'star';
  if (tier === 'Tier2') return 'star_half';
  return 'star_border';
}

export default function MatchPage() {
  const navigate = useNavigate();
  const [selectedBG, setSelectedBG] = useState('O+');
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [units, setUnits] = useState(1);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<DonorCandidate[] | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [error, setError] = useState('');
  const [contactState, setContactState] = useState<Record<number, ContactState>>({});
  const [confirmedRank, setConfirmedRank] = useState<number | null>(null);

  async function handleContact(rank: number) {
    if (!matchId) return;
    setContactState(s => ({ ...s, [rank]: 'sending' }));
    try {
      await apiClient.post(`/outreach/${matchId}/contact/${rank}`);
      setContactState(s => ({ ...s, [rank]: 'awaiting' }));
    } catch {
      setContactState(s => ({ ...s, [rank]: 'idle' }));
    }
  }

  async function handleConfirm(rank: number) {
    if (!matchId) return;
    setContactState(s => ({ ...s, [rank]: 'confirming' }));
    try {
      await apiClient.post(`/outreach/${matchId}/confirm/${rank}`);
      setContactState(s => ({ ...s, [rank]: 'confirmed' }));
      setConfirmedRank(rank);
    } catch {
      setContactState(s => ({ ...s, [rank]: 'awaiting' }));
    }
  }

  async function handleFind() {
    setLoading(true);
    setError('');
    setCandidates(null);
    try {
      const res = await createMatch({
        blood_group: BG_MAP[selectedBG],
        transfusion_date: date,
        patient_lat: 17.385,
        patient_lon: 78.4867,
        quantity_required: units,
      });
      setCandidates(res.candidates);
      setMatchId(res.match_id);
      setScanned(res.total_pool_searched ?? res.total_scanned ?? 0);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? 'Failed to find donors. Check backend connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="AI Blood Matching" />
      <div className="flex-1 overflow-y-auto p-xl bg-background">
        <div className="flex items-center gap-sm mb-xl">
          <span className="material-symbols-outlined text-primary text-[32px] icon-fill">magic_button</span>
          <h2 className="text-headline-lg font-bold text-on-surface tracking-tight">AI Blood Matching</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-lg pb-xl">
          {/* Left: Form */}
          <div className="lg:col-span-5 flex flex-col gap-md">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg flex-1">
              <h3 className="text-headline-md font-bold text-on-surface mb-md pb-sm border-b border-outline-variant">New Match Request</h3>
              <div className="flex flex-col gap-md">
                {/* Blood group selector */}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-sm">Required Blood Group</label>
                  <div className="grid grid-cols-4 gap-sm">
                    {BLOOD_GROUPS.map(bg => (
                      <button
                        key={bg}
                        type="button"
                        onClick={() => setSelectedBG(bg)}
                        className={`py-sm rounded-lg border text-center text-label-md transition-colors ${
                          selectedBG === bg
                            ? 'border-2 border-primary bg-primary text-on-primary shadow-sm'
                            : 'border-outline-variant text-on-surface bg-surface-container-lowest hover:bg-surface-variant'
                        }`}
                      >
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-sm">Transfusion Date</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={date}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm px-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Units */}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-sm">Units Required</label>
                  <div className="flex items-center gap-md">
                    <button
                      type="button"
                      onClick={() => setUnits(u => Math.max(1, u - 1))}
                      className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-on-surface hover:bg-secondary-container transition-colors"
                    >
                      <span className="material-symbols-outlined">remove</span>
                    </button>
                    <span className="text-headline-md text-on-surface w-8 text-center">{units}</span>
                    <button
                      type="button"
                      onClick={() => setUnits(u => Math.min(10, u + 1))}
                      className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-on-surface hover:bg-secondary-container transition-colors"
                    >
                      <span className="material-symbols-outlined">add</span>
                    </button>
                    <span className="text-body-md text-on-surface-variant ml-sm">unit(s)</span>
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-label-md text-on-surface-variant mb-sm">Hospital / Location</label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant">location_on</span>
                    <input
                      type="text"
                      defaultValue="Hyderabad"
                      readOnly
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg py-sm pl-10 pr-md text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="mt-sm h-24 rounded-lg bg-surface-container border border-outline-variant overflow-hidden relative flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
                      <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#9e0027" strokeWidth="0.5"/></pattern></defs>
                      <rect width="100%" height="100%" fill="url(#grid)"/>
                      <circle cx="50%" cy="50%" r="6" fill="#9e0027" opacity="0.8"/>
                      <circle cx="50%" cy="50%" r="14" fill="none" stroke="#9e0027" strokeWidth="1.5" opacity="0.4"/>
                      <circle cx="50%" cy="50%" r="24" fill="none" stroke="#9e0027" strokeWidth="1" opacity="0.2"/>
                    </svg>
                    <div className="relative z-10 flex items-center gap-xs text-primary">
                      <span className="material-symbols-outlined text-[18px]">location_on</span>
                      <span className="text-label-sm font-semibold">Hyderabad, Telangana</span>
                    </div>
                  </div>

                </div>

                {error && <p className="text-label-md text-error bg-error-container p-sm rounded-lg">{error}</p>}

                <button
                  onClick={handleFind}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-sm py-md rounded-xl bg-primary-container text-on-primary text-label-md font-bold hover:bg-primary transition-colors disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <span className="animate-spin material-symbols-outlined">autorenew</span>
                      Scanning donors…
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">search</span>
                      Find Matching Donors
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-7 flex flex-col">
            {loading && (
              <div className="flex flex-col items-center justify-center flex-1 gap-lg py-xl">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <span className="material-symbols-outlined text-primary text-[32px] absolute inset-0 flex items-center justify-center">water_drop</span>
                </div>
                <div className="text-center">
                  <p className="text-body-lg text-on-surface font-semibold">Scanning eligible donors…</p>
                  <p className="text-label-md text-on-surface-variant mt-xs">KAG engine running compatibility checks</p>
                </div>
              </div>
            )}

            {!loading && candidates === null && (
              <div className="flex flex-col items-center justify-center flex-1 gap-md py-xl text-on-surface-variant">
                <span className="material-symbols-outlined text-[64px] text-outline">person_search</span>
                <p className="text-body-lg">Configure a request and click Find to start.</p>
              </div>
            )}

            {!loading && candidates !== null && (
              <>
                <div className="flex justify-between items-end mb-md">
                  <div>
                    <div className="flex items-center gap-sm mb-xs">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                      </span>
                      <span className="text-label-md text-primary font-bold">Analysis Complete</span>
                    </div>
                    <h3 className="text-headline-md text-on-surface">Scanned {scanned.toLocaleString()} donors</h3>
                  </div>
                  <div className="flex items-center gap-xs text-on-surface-variant bg-surface-variant px-sm py-xs rounded-full">
                    <span className="material-symbols-outlined text-[16px]">filter_list</span>
                    <span className="text-label-sm">Filtered by Score</span>
                  </div>
                </div>

                <div className="flex flex-col gap-md">
                  {candidates.map((c, idx) => {
                    const state = contactState[c.rank] ?? 'idle';
                    const isConfirmed = state === 'confirmed';
                    const isAwaiting = state === 'awaiting';
                    const isSending = state === 'sending';
                    const isConfirming = state === 'confirming';
                    const otherConfirmed = confirmedRank !== null && confirmedRank !== c.rank;

                    return (
                    <div
                      key={c.user_id_hash_short}
                      className={`bg-surface-container-lowest rounded-xl border shadow-sm p-md relative overflow-hidden transition-all ${
                        isConfirmed ? 'border-2 border-emerald-500 shadow-[0_8px_20px_rgba(16,185,129,0.15)]' :
                        idx === 0 ? 'border-2 border-primary shadow-[0_8px_16px_rgba(196,30,58,0.08)]' :
                        'border-outline-variant'
                      } ${otherConfirmed && !isConfirmed ? 'opacity-40' : ''}`}
                    >
                      {/* Badge */}
                      {isConfirmed ? (
                        <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] uppercase tracking-wider px-sm py-xs rounded-bl-lg font-bold flex items-center gap-xs">
                          <span className="material-symbols-outlined text-[14px] icon-fill">check_circle</span>
                          Confirmed
                        </div>
                      ) : idx === 0 && !otherConfirmed ? (
                        <div className="absolute top-0 right-0 bg-primary text-on-primary text-[10px] uppercase tracking-wider px-sm py-xs rounded-bl-lg font-bold flex items-center gap-xs">
                          <span className="material-symbols-outlined text-[14px] icon-fill">award_star</span>
                          Primary Candidate
                        </div>
                      ) : null}

                      <div className="flex justify-between items-start mt-sm">
                        <div className="flex items-center gap-md">
                          <div className="relative">
                            <div className={`${idx === 0 ? 'w-12 h-12' : 'w-10 h-10'} rounded-full flex items-center justify-center border ${isConfirmed ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'bg-surface-variant border-outline-variant text-primary'}`}>
                              <span className="material-symbols-outlined">{isConfirmed ? 'how_to_reg' : 'person'}</span>
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center border border-surface" style={{ background: c.tier === 'Tier1' ? '#1A0A0A' : c.tier === 'Tier2' ? '#9e0027' : '#8f6f6f' }}>
                              <span className="material-symbols-outlined text-[10px] icon-fill" style={{ color: c.tier === 'Tier1' ? '#fbbf24' : '#fff' }}>{tierIcon(c.tier)}</span>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-sm">
                              <h4 className="text-body-md font-bold text-on-surface">{c.user_id_hash_short.toUpperCase()}</h4>
                              <span className="px-2 py-0.5 rounded-full bg-surface-variant text-on-surface-variant border border-outline-variant text-[10px] uppercase font-bold">{c.blood_group}</span>
                            </div>
                            <div className="flex items-center gap-sm text-on-surface-variant text-label-sm mt-xs">
                              <span className="flex items-center gap-xs"><span className="material-symbols-outlined text-[14px]">location_on</span>{(c.distance_km ?? 0).toFixed(1)} km</span>
                              <span>•</span>
                              <span>{c.donor_type}</span>
                              <span>•</span>
                              <span>{c.donations_till_date} donations</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${idx === 0 ? 'text-[28px] leading-none' : 'text-headline-md'} ${isConfirmed ? 'text-emerald-600' : tierColor(c.tier)}`}>
                            {c.score.toFixed(2)}
                          </div>
                          <div className="text-label-sm text-on-surface-variant">{c.tier}</div>
                        </div>
                      </div>

                      {/* AI explanation — primary card only */}
                      {idx === 0 && c.explanation && !otherConfirmed && (
                        <div className="mt-md bg-surface-variant rounded-lg p-sm border border-outline-variant flex items-start gap-sm">
                          <span className="material-symbols-outlined text-primary mt-xs text-[18px]">psychology</span>
                          <p className="text-label-md text-on-surface">{c.explanation}</p>
                        </div>
                      )}

                      {/* Outreach action row */}
                      {!otherConfirmed && (
                        <div className="mt-md pt-sm border-t border-outline-variant flex items-center gap-sm">
                          {state === 'idle' && (
                            <button
                              onClick={() => handleContact(c.rank)}
                              className="flex items-center gap-xs px-md py-xs rounded-lg bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">whatsapp</span>
                              Reach Out
                            </button>
                          )}
                          {isSending && (
                            <span className="flex items-center gap-xs text-label-md text-on-surface-variant">
                              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                              Sending WhatsApp…
                            </span>
                          )}
                          {isAwaiting && (
                            <>
                              <span className="flex items-center gap-xs text-label-md text-amber-600 font-medium">
                                <span className="material-symbols-outlined text-[16px]">schedule</span>
                                WhatsApp sent — awaiting response
                              </span>
                              <button
                                onClick={() => handleConfirm(c.rank)}
                                className="ml-auto flex items-center gap-xs px-md py-xs rounded-lg bg-emerald-600 text-white text-label-md font-bold hover:bg-emerald-700 transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                Mark Confirmed
                              </button>
                            </>
                          )}
                          {isConfirming && (
                            <span className="flex items-center gap-xs text-label-md text-on-surface-variant">
                              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                              Confirming…
                            </span>
                          )}
                          {isConfirmed && (
                            <span className="flex items-center gap-xs text-label-md text-emerald-600 font-bold">
                              <span className="material-symbols-outlined text-[16px] icon-fill">check_circle</span>
                              Donor confirmed — outreach complete
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>

                {matchId && (
                  <div className="mt-auto pt-md border-t border-outline-variant bg-background pb-sm">
                    <button
                      onClick={() => navigate(`/outreach/${matchId}`)}
                      className="w-full flex items-center justify-center gap-sm py-md rounded-lg border-2 border-primary text-primary hover:bg-surface-variant transition-colors text-body-md font-bold group"
                    >
                      <span className="material-symbols-outlined group-hover:animate-pulse">rocket_launch</span>
                      View Live Outreach
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
