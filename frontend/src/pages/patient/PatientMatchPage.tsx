import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getPatientProfile, getPatientToken, addPatientMatchId } from '../../api/patient';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const BG_MAP: Record<string, string> = {
  'A+': 'A Positive', 'A-': 'A Negative', 'B+': 'B Positive', 'B-': 'B Negative',
  'O+': 'O Positive', 'O-': 'O Negative', 'AB+': 'AB Positive', 'AB-': 'AB Negative',
};
const CITIES = [
  'Hyderabad', 'Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Kolkata',
  'Pune', 'Ahmedabad', 'Jaipur', 'Surat', 'Lucknow', 'Nagpur',
];

interface Candidate {
  rank: number;
  user_id_hash_short?: string;
  kag_score?: number;
  donor_tier?: string;
  distance_km?: number;
  outreach_status?: string;
  explanation_en?: string;
}

export default function PatientMatchPage() {
  const navigate = useNavigate();
  const profile = getPatientProfile();

  const profileBg = profile?.blood_group ?? '';
  // Convert "O Positive" → "O+" if profile has long form
  const shortBg = Object.entries(BG_MAP).find(([, v]) => v === profileBg)?.[0] ?? profileBg;

  const [bloodGroup, setBloodGroup] = useState(shortBg);
  const [date, setDate]             = useState('');
  const [units, setUnits]           = useState(1);
  const [location, setLocation]     = useState('Hyderabad');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [result, setResult]         = useState<{ match_id: string; candidates: Candidate[] } | null>(null);
  const [autoSending, setAutoSending] = useState(false);
  const [sentLog, setSentLog]       = useState<{ rank: number; name: string; status: 'sending' | 'sent' | 'error' }[]>([]);

  const apiBase = (import.meta.env.VITE_API_URL ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setResult(null); setSentLog([]);
    setLoading(true);
    try {
      const token = getPatientToken();
      const res = await axios.post(`${apiBase}/match`, {
        patient_blood_group: BG_MAP[bloodGroup] ?? bloodGroup,
        transfusion_date: date,
        quantity_required: units,
        hospital_location: location,
      }, { headers: { Authorization: `Bearer ${token}` } });

      const data = res.data;
      setResult(data);
      if (data.match_id) addPatientMatchId(data.match_id);

      // Auto-send outreach
      if (data.candidates?.length && data.match_id) {
        setAutoSending(true);
        for (const c of data.candidates) {
          const label = c.user_id_hash_short?.slice(0, 6).toUpperCase() ?? `#${c.rank}`;
          setSentLog(l => [...l, { rank: c.rank, name: label, status: 'sending' }]);
          try {
            await axios.post(`${apiBase}/outreach/${data.match_id}/contact/${c.rank}`,
              {}, { headers: { Authorization: `Bearer ${token}` } });
            setSentLog(l => l.map(x => x.rank === c.rank ? { ...x, status: 'sent' } : x));
          } catch {
            setSentLog(l => l.map(x => x.rank === c.rank ? { ...x, status: 'error' } : x));
          }
          await new Promise(r => setTimeout(r, 600));
        }
        setAutoSending(false);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? 'Failed to find donors. Please try again.');
    } finally { setLoading(false); }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-xl">
        <h1 className="text-headline-lg font-bold text-on-surface">New Match Request</h1>
        <p className="text-body-md text-on-surface-variant mt-xs">
          Find compatible donors for your transfusion need.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">

        {/* Form card */}
        <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-lg">

            {/* Blood Group */}
            <div>
              <label className="text-label-md font-bold text-on-surface block mb-sm">
                Required Blood Group
                {profileBg && (
                  <span className="ml-2 text-label-sm text-on-surface-variant font-normal">
                    (from your profile)
                  </span>
                )}
              </label>
              <div className="grid grid-cols-4 gap-sm">
                {BLOOD_GROUPS.map(bg => (
                  <button key={bg} type="button"
                    onClick={() => setBloodGroup(bg)}
                    disabled={!!profileBg}
                    className="py-sm rounded-xl text-label-md font-bold border-2 transition-all"
                    style={{
                      background: bloodGroup === bg ? '#ba1a1a' : 'transparent',
                      color: bloodGroup === bg ? '#fff' : '#49454f',
                      borderColor: bloodGroup === bg ? '#ba1a1a' : '#cac4d0',
                      opacity: profileBg && bg !== bloodGroup ? 0.4 : 1,
                      cursor: profileBg ? 'default' : 'pointer',
                    }}>
                    {bg}
                  </button>
                ))}
              </div>
              {profileBg && (
                <p className="text-label-sm text-on-surface-variant mt-xs flex items-center gap-xs">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>lock</span>
                  Locked to your registered blood group
                </p>
              )}
            </div>

            {/* Transfusion Date */}
            <div>
              <label className="text-label-md font-bold text-on-surface block mb-sm">Transfusion Date</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-md py-md bg-surface border border-outline-variant rounded-xl text-body-md outline-none focus:ring-2 focus:ring-primary" />
            </div>

            {/* Units */}
            <div>
              <label className="text-label-md font-bold text-on-surface block mb-sm">Units Required</label>
              <div className="flex items-center gap-md">
                <button type="button" onClick={() => setUnits(u => Math.max(1, u - 1))}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold"
                  style={{ background: 'rgba(186,26,26,0.1)', color: '#ba1a1a' }}>−</button>
                <span className="text-headline-md font-bold text-on-surface w-8 text-center">{units}</span>
                <button type="button" onClick={() => setUnits(u => Math.min(10, u + 1))}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold"
                  style={{ background: 'rgba(186,26,26,0.1)', color: '#ba1a1a' }}>+</button>
                <span className="text-body-md text-on-surface-variant">unit(s)</span>
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="text-label-md font-bold text-on-surface block mb-sm">Hospital / Location</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: 20 }}>location_on</span>
                <select value={location} onChange={e => setLocation(e.target.value)}
                  className="w-full pl-10 pr-md py-md bg-surface border border-outline-variant rounded-xl text-body-md outline-none focus:ring-2 focus:ring-primary appearance-none">
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {error && <p className="text-label-md text-error bg-error-container p-sm rounded-lg">{error}</p>}

            <button type="submit" disabled={loading || autoSending}
              className="w-full py-md rounded-xl text-label-md font-bold text-white flex items-center justify-center gap-sm transition-opacity disabled:opacity-60"
              style={{ background: '#ba1a1a' }}>
              {loading ? (
                <><span className="animate-spin material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Finding donors…</>
              ) : (
                <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>manage_search</span> Find Matching Donors</>
              )}
            </button>
          </form>
        </div>

        {/* Results / status panel */}
        <div className="flex flex-col gap-md">

          {/* Patient profile summary */}
          {profile && (
            <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm">
              <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-sm">Your Profile</p>
              <div className="flex items-center gap-md">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-label-lg"
                     style={{ background: '#ba1a1a' }}>
                  {profile.blood_group.replace(' Positive', '+').replace(' Negative', '−')}
                </div>
                <div>
                  <p className="font-bold text-on-surface">{profile.name}</p>
                  <p className="text-label-sm text-on-surface-variant">Age {profile.age} · {profile.height_cm}cm · {profile.weight_kg}kg</p>
                  <p className="text-label-sm font-bold mt-xs"
                     style={{ color: profile.bmi < 18.5 ? '#e65100' : profile.bmi < 25 ? '#2e7d32' : '#e65100' }}>
                    BMI {profile.bmi} — {profile.bmi_label}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Auto-send log */}
          {sentLog.length > 0 && (
            <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm">
              <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-sm flex items-center gap-xs">
                {autoSending && <span className="animate-spin material-symbols-outlined" style={{ fontSize: 14, color: '#ba1a1a' }}>progress_activity</span>}
                Outreach Status
              </p>
              <div className="flex flex-col gap-xs">
                {sentLog.map(l => (
                  <div key={l.rank} className="flex items-center justify-between py-xs px-sm rounded-lg"
                       style={{ background: l.status === 'sent' ? 'rgba(46,125,50,0.07)' : l.status === 'error' ? 'rgba(186,26,26,0.07)' : 'rgba(0,0,0,0.03)' }}>
                    <div className="flex items-center gap-sm">
                      <span className="text-label-sm font-bold" style={{ color: '#ba1a1a' }}>#{l.rank}</span>
                      <span className="text-label-sm text-on-surface">{l.name}</span>
                    </div>
                    <span className="text-label-sm font-bold"
                          style={{ color: l.status === 'sent' ? '#2e7d32' : l.status === 'error' ? '#ba1a1a' : '#9e7878' }}>
                      {l.status === 'sending' ? '⏳ Sending…' : l.status === 'sent' ? '✓ Sent' : '✕ Failed'}
                    </span>
                  </div>
                ))}
              </div>
              {!autoSending && sentLog.length > 0 && (
                <button
                  onClick={() => navigate('/patient/outreach')}
                  className="w-full mt-md py-sm rounded-xl text-label-md font-bold border-2 transition-colors"
                  style={{ borderColor: '#ba1a1a', color: '#ba1a1a' }}>
                  View Outreach Logs →
                </button>
              )}
            </div>
          )}

          {/* Matched candidates */}
          {result?.candidates && result.candidates.length > 0 && (
            <div className="bg-surface rounded-2xl border border-outline-variant/40 p-lg shadow-sm">
              <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wide mb-sm">
                {result.candidates.length} Donors Found
              </p>
              <div className="flex flex-col gap-sm">
                {result.candidates.map(c => (
                  <div key={c.rank} className="flex items-center gap-sm p-sm rounded-xl border"
                       style={{ borderColor: c.rank === 1 ? '#ba1a1a40' : '#cac4d040', background: c.rank === 1 ? 'rgba(186,26,26,0.04)' : 'transparent' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-label-sm font-bold flex-shrink-0"
                         style={{ background: c.rank === 1 ? '#ba1a1a' : '#9e7878' }}>
                      #{c.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-label-md font-bold text-on-surface truncate">
                        {c.user_id_hash_short?.slice(0, 6).toUpperCase() ?? 'Donor'}
                      </p>
                      <p className="text-label-sm text-on-surface-variant">
                        {c.donor_tier} · {c.distance_km != null ? `${c.distance_km.toFixed(1)} km` : ''}
                      </p>
                    </div>
                    {c.rank === 1 && (
                      <span className="text-label-sm font-bold px-sm py-xs rounded-full"
                            style={{ background: 'rgba(186,26,26,0.1)', color: '#ba1a1a' }}>Primary</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
