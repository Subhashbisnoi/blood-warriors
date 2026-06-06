import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { donorRegister, saveDonorSession } from '../../api/donorPortal';

const BLOOD_GROUPS = ['A Positive','A Negative','B Positive','B Negative','O Positive','O Negative','AB Positive','AB Negative'];
const DONOR_TYPES  = ['Regular Donor','One-Time Donor','Emergency Donor'];
const GENDERS      = ['Male','Female','Other'];
const CITIES       = ['Hyderabad','Mumbai','Delhi','Bangalore','Chennai','Pune','Kolkata','Ahmedabad','Jaipur','Surat','Lucknow','Bhopal','Other'];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-xs">
      <label className="text-label-md font-bold text-on-surface block">{label}</label>
      {children}
      {hint && <p className="text-label-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function InputWrap({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-sm px-md py-md rounded-xl border border-outline-variant bg-surface focus-within:ring-2 focus-within:ring-primary transition-all">
      <span className="material-symbols-outlined text-on-surface-variant flex-shrink-0" style={{ fontSize: 20 }}>{icon}</span>
      {children}
    </div>
  );
}

// ── Success screen showing the generated Donor ID ─────────────────────────────
function SuccessCard({ donorId, onContinue }: { donorId: string; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(donorId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-md"
         style={{ background: 'radial-gradient(circle at center, #291717 0%, #1a0a0a 100%)' }}>
      <div className="bg-surface rounded-3xl p-xl max-w-md w-full text-center shadow-2xl space-y-lg"
           style={{ border: '1px solid rgba(186,26,26,0.2)' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
             style={{ background: 'rgba(46,125,50,0.1)' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize: 36, color: '#2e7d32' }}>verified</span>
        </div>
        <div>
          <h2 className="text-headline-lg font-bold text-on-surface">Registration Successful!</h2>
          <p className="text-body-md text-on-surface-variant mt-xs">
            Your Donor ID has been created. <strong>Save it</strong> — you'll use it to log in.
          </p>
        </div>

        {/* Donor ID display */}
        <div className="rounded-2xl p-lg flex flex-col items-center gap-sm"
             style={{ background: 'linear-gradient(135deg,#1a0505,#3d0c0c)', border: '1px solid rgba(186,26,26,0.3)' }}>
          <p className="text-label-sm font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>Your Donor ID</p>
          <p className="text-[2.5rem] font-black tracking-[0.15em] text-white font-mono">{donorId}</p>
          <button onClick={copy}
                  className="flex items-center gap-xs px-md py-xs rounded-xl text-label-sm font-bold transition-all"
                  style={{ background: copied ? 'rgba(46,125,50,0.2)' : 'rgba(255,255,255,0.08)', color: copied ? '#81c784' : 'rgba(255,255,255,0.7)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied!' : 'Copy ID'}
          </button>
        </div>

        <div className="flex items-start gap-sm p-sm rounded-xl text-left"
             style={{ background: 'rgba(186,26,26,0.05)', border: '1px solid rgba(186,26,26,0.1)' }}>
          <span className="material-symbols-outlined icon-fill flex-shrink-0 mt-[1px]" style={{ fontSize: 16, color: '#ba1a1a' }}>info</span>
          <p className="text-label-sm text-on-surface-variant">
            This ID is permanent. Screenshot or write it down. There is no way to recover it if lost.
          </p>
        </div>

        <button onClick={onContinue}
                className="w-full py-md rounded-xl text-label-md font-bold text-white"
                style={{ background: '#ba1a1a' }}>
          Enter My Portal →
        </button>
      </div>
    </div>
  );
}

// ── Main registration form ────────────────────────────────────────────────────
export default function DonorRegister() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: '', blood_group: '', gender: '', city: '',
    phone: '', date_of_birth: '', donor_type: 'Regular Donor',
    has_donated_before: false, previous_donations: 0, medical_notes: '',
  });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [donorId, setDonorId]   = useState('');

  function set(key: string, val: unknown) {
    setForm(f => ({ ...f, [key]: val }));
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.full_name || !form.blood_group || !form.gender || !form.city || !form.phone) {
      setError('Please fill in all required fields.'); return;
    }
    setLoading(true); setError('');
    try {
      const res = await donorRegister({
        ...form,
        date_of_birth: form.date_of_birth || undefined,
        medical_notes: form.medical_notes || undefined,
      });
      saveDonorSession(res.access_token, res.profile);
      localStorage.setItem('bw_token', res.access_token);
      setDonorId(res.donor_id);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  }

  if (donorId) {
    return <SuccessCard donorId={donorId} onContinue={() => navigate('/donor')} />;
  }

  const inputCls = "flex-1 bg-transparent text-body-md outline-none min-w-0";
  const selectCls = "flex-1 bg-transparent text-body-md outline-none min-w-0 cursor-pointer";

  return (
    <div className="min-h-screen flex items-center justify-center p-md relative overflow-hidden"
         style={{ background: 'radial-gradient(circle at center, #291717 0%, #1a0a0a 100%)' }}>
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-error/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-2xl w-full bg-surface-container-lowest rounded-[24px] shadow-2xl overflow-hidden relative z-10 border border-outline-variant/30">

        {/* Header */}
        <div className="px-xl pt-xl pb-lg border-b border-outline-variant/20"
             style={{ background: 'linear-gradient(135deg,#200808,#3d0c0c)' }}>
          <div className="flex items-center gap-sm mb-sm">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: 'rgba(186,26,26,0.25)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ color: '#fca5a5', fontSize: 22 }}>volunteer_activism</span>
            </div>
            <div>
              <h2 className="text-headline-sm font-black text-white">Donor Registration</h2>
              <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Create your Blood Warriors donor profile</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-xl space-y-xl">

          {/* ── Section 1: Personal ── */}
          <div>
            <p className="text-label-sm font-black uppercase tracking-widest mb-md" style={{ color: '#ba1a1a' }}>Personal Information</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <Field label="Full Name *">
                <InputWrap icon="person">
                  <input className={inputCls} placeholder="Rahul Sharma" required
                         value={form.full_name} onChange={e => set('full_name', e.target.value)} />
                </InputWrap>
              </Field>

              <Field label="Gender *">
                <InputWrap icon="wc">
                  <select className={selectCls} required value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">Select gender</option>
                    {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </InputWrap>
              </Field>

              <Field label="Date of Birth" hint="Used to verify age eligibility">
                <InputWrap icon="calendar_month">
                  <input type="date" className={inputCls}
                         value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
                </InputWrap>
              </Field>

              <Field label="Blood Group *">
                <InputWrap icon="water_drop">
                  <select className={selectCls} required value={form.blood_group} onChange={e => set('blood_group', e.target.value)}>
                    <option value="">Select blood group</option>
                    {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
                  </select>
                </InputWrap>
              </Field>
            </div>
          </div>

          {/* ── Section 2: Contact ── */}
          <div>
            <p className="text-label-sm font-black uppercase tracking-widest mb-md" style={{ color: '#ba1a1a' }}>Contact & Location</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <Field label="Phone Number *" hint="Used for donor coordination">
                <InputWrap icon="phone">
                  <input className={inputCls} placeholder="+91 98765 43210" type="tel"
                         value={form.phone} onChange={e => set('phone', e.target.value)} />
                </InputWrap>
              </Field>

              <Field label="City *">
                <InputWrap icon="location_on">
                  <select className={selectCls} required value={form.city} onChange={e => set('city', e.target.value)}>
                    <option value="">Select city</option>
                    {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </InputWrap>
              </Field>
            </div>
          </div>

          {/* ── Section 3: Donation history ── */}
          <div>
            <p className="text-label-sm font-black uppercase tracking-widest mb-md" style={{ color: '#ba1a1a' }}>Donation Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
              <Field label="Donor Type *">
                <InputWrap icon="category">
                  <select className={selectCls} value={form.donor_type} onChange={e => set('donor_type', e.target.value)}>
                    {DONOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </InputWrap>
              </Field>

              <Field label="Previous Donations">
                <InputWrap icon="history">
                  <input type="number" min={0} max={100} className={inputCls} placeholder="0"
                         value={form.previous_donations || ''}
                         onChange={e => {
                           const n = parseInt(e.target.value) || 0;
                           set('previous_donations', n);
                           set('has_donated_before', n > 0);
                         }} />
                </InputWrap>
              </Field>
            </div>

            {/* Donated before toggle */}
            <label className="flex items-center gap-md mt-md cursor-pointer group">
              <div className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 flex items-center px-[3px]
                              ${form.has_donated_before ? 'bg-primary' : 'bg-outline-variant'}`}
                   onClick={() => set('has_donated_before', !form.has_donated_before)}>
                <div className={`w-[18px] h-[18px] rounded-full bg-white shadow transition-transform
                                ${form.has_donated_before ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="text-body-md text-on-surface">I have donated blood before</span>
            </label>
          </div>

          {/* ── Section 4: Medical ── */}
          <div>
            <p className="text-label-sm font-black uppercase tracking-widest mb-md" style={{ color: '#ba1a1a' }}>Medical Notes <span className="normal-case font-normal text-on-surface-variant">(optional)</span></p>
            <textarea
              rows={3} placeholder="Any medical conditions, allergies, or notes for coordinators…"
              value={form.medical_notes}
              onChange={e => set('medical_notes', e.target.value)}
              className="w-full px-md py-md rounded-xl border border-outline-variant bg-surface text-body-md outline-none resize-none focus:ring-2 focus:ring-primary transition-all"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-sm p-sm rounded-xl"
                 style={{ background: 'rgba(186,26,26,0.06)', border: '1px solid rgba(186,26,26,0.2)' }}>
              <span className="material-symbols-outlined icon-fill text-error flex-shrink-0 mt-[1px]" style={{ fontSize: 16 }}>error</span>
              <p className="text-label-md text-error">{error}</p>
            </div>
          )}

          {/* Consent + Submit */}
          <div className="space-y-md pt-sm">
            <div className="flex items-start gap-sm p-md rounded-xl"
                 style={{ background: 'rgba(186,26,26,0.04)', border: '1px solid rgba(186,26,26,0.08)' }}>
              <span className="material-symbols-outlined icon-fill flex-shrink-0 mt-[1px]" style={{ fontSize: 16, color: '#ba1a1a' }}>info</span>
              <p className="text-label-sm text-on-surface-variant leading-relaxed">
                After registration you'll receive a unique <strong>Donor ID</strong>.
                Save it — this is your only login credential. No password required.
              </p>
            </div>

            <button type="submit" disabled={loading}
                    className="w-full py-md rounded-xl text-label-md font-bold text-white flex items-center justify-center gap-sm disabled:opacity-60 transition-opacity"
                    style={{ background: '#ba1a1a' }}>
              {loading
                ? <><span className="animate-spin material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Registering…</>
                : <><span className="material-symbols-outlined icon-fill" style={{ fontSize: 18 }}>volunteer_activism</span> Register as Donor</>}
            </button>

            <div className="text-center">
              <span className="text-label-sm text-on-surface-variant">Already registered? </span>
              <Link to="/donor-login" className="text-label-sm font-bold" style={{ color: '#ba1a1a' }}>
                Login with Donor ID
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
