import { useState, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { patientRegister, patientLogin, savePatientSession } from '../../api/patient';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

type Mode = 'login' | 'register';

export default function PatientLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Login fields
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [name, setName]           = useState('');
  const [regEmail, setRegEmail]   = useState('');
  const [regPwd, setRegPwd]       = useState('');
  const [age, setAge]             = useState('');
  const [heightCm, setHeightCm]   = useState('');
  const [weightKg, setWeightKg]   = useState('');
  const [bloodGroup, setBloodGroup] = useState('');

  const bmi = useMemo(() => {
    const h = parseFloat(heightCm);
    const w = parseFloat(weightKg);
    if (!h || !w || h < 50 || w < 10) return null;
    const val = w / ((h / 100) ** 2);
    return Math.round(val * 10) / 10;
  }, [heightCm, weightKg]);

  const bmiLabel = !bmi ? '' : bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const bmiColor = !bmi ? '' : bmi < 18.5 ? '#e65100' : bmi < 25 ? '#2e7d32' : bmi < 30 ? '#e65100' : '#ba1a1a';

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await patientLogin(email, password);
      savePatientSession(res.access_token, res.profile);
      navigate('/patient');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? 'Login failed. Please check your credentials.');
    } finally { setLoading(false); }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (!bloodGroup) { setError('Please select your blood group.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await patientRegister({
        name, email: regEmail, password: regPwd,
        age: parseInt(age), height_cm: parseFloat(heightCm),
        weight_kg: parseFloat(weightKg), blood_group: bloodGroup,
      });
      savePatientSession(res.access_token, res.profile);
      navigate('/patient');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-md relative overflow-hidden"
         style={{ background: 'radial-gradient(circle at center, #291717 0%, #1a0a0a 100%)' }}>
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-error/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 bg-surface-container-lowest rounded-[24px] shadow-2xl overflow-hidden relative z-10 border border-outline-variant/30">

        {/* Left hero */}
        <div className="hidden md:flex flex-col justify-end p-xl relative bg-inverse-surface text-on-primary overflow-hidden min-h-[600px]">
          <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface via-inverse-surface/60 to-transparent" />
          <div className="relative z-10 max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-lg">
              <span className="material-symbols-outlined icon-fill text-white" style={{ fontSize: 30 }}>favorite</span>
            </div>
            <h1 className="text-display font-bold text-on-primary mb-md leading-tight">
              Your health,<br />our mission.
            </h1>
            <p className="text-body-lg text-on-primary/80">
              Request blood matches, track outreach status, and get connected to verified donors — all in one place.
            </p>
            <div className="mt-lg flex flex-col gap-sm">
              {['Instant blood group matching', 'Real-time outreach tracking', 'Verified donor network'].map(f => (
                <div key={f} className="flex items-center gap-sm text-on-primary/80 text-body-sm">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>check_circle</span>
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right form */}
        <div className="flex flex-col justify-center p-lg md:p-xl bg-surface-container-lowest overflow-y-auto max-h-screen">
          <div className="w-full max-w-md mx-auto">

            {/* Tab toggle */}
            <div className="flex gap-0 mb-xl rounded-xl overflow-hidden border border-outline-variant/30">
              {(['login', 'register'] as Mode[]).map(m => (
                <button key={m} onClick={() => { setMode(m); setError(''); }}
                  className="flex-1 py-sm text-label-md font-bold transition-colors"
                  style={{
                    background: mode === m ? '#ba1a1a' : 'transparent',
                    color: mode === m ? '#fff' : '#9e7878',
                  }}>
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            {mode === 'login' ? (
              <form className="space-y-md" onSubmit={handleLogin}>
                <div className="text-center md:text-left mb-lg">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-container text-on-primary mb-sm">
                    <span className="material-symbols-outlined icon-fill">water_drop</span>
                  </div>
                  <h2 className="text-headline-lg font-bold text-on-surface">Patient Portal</h2>
                  <p className="text-body-md text-on-surface-variant">Sign in to manage your blood requests</p>
                </div>

                <InputField label="Email" icon="mail" type="email" value={email} onChange={setEmail} placeholder="patient@example.com" />
                <InputField label="Password" icon="lock" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

                {error && <p className="text-label-md text-error bg-error-container p-sm rounded-lg">{error}</p>}

                <button type="submit" disabled={loading}
                  className="w-full py-md rounded-xl text-label-md font-bold text-white transition-opacity disabled:opacity-60"
                  style={{ background: '#ba1a1a' }}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>

                <p className="text-center text-label-sm text-on-surface-variant">
                  No account?{' '}
                  <button type="button" onClick={() => setMode('register')} className="text-primary font-bold">
                    Create one
                  </button>
                </p>
              </form>
            ) : (
              <form className="space-y-md" onSubmit={handleRegister}>
                <div className="mb-md">
                  <h2 className="text-headline-md font-bold text-on-surface">Create Patient Account</h2>
                  <p className="text-body-sm text-on-surface-variant">Fill in your details to get started</p>
                </div>

                <InputField label="Full Name" icon="person" value={name} onChange={setName} placeholder="Ravi Kumar" />
                <InputField label="Email" icon="mail" type="email" value={regEmail} onChange={setRegEmail} placeholder="patient@example.com" />
                <InputField label="Password" icon="lock" type="password" value={regPwd} onChange={setRegPwd} placeholder="Min. 6 characters" />

                {/* Age / Height / Weight row */}
                <div className="grid grid-cols-3 gap-sm">
                  <div>
                    <label className="text-label-sm text-on-surface-variant block mb-xs">Age (yrs)</label>
                    <input type="number" min={1} max={120} required value={age} onChange={e => setAge(e.target.value)}
                      placeholder="25"
                      className="w-full px-sm py-sm bg-surface border border-outline-variant rounded-lg text-body-md outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-label-sm text-on-surface-variant block mb-xs">Height (cm)</label>
                    <input type="number" min={50} max={250} required value={heightCm} onChange={e => setHeightCm(e.target.value)}
                      placeholder="165"
                      className="w-full px-sm py-sm bg-surface border border-outline-variant rounded-lg text-body-md outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-label-sm text-on-surface-variant block mb-xs">Weight (kg)</label>
                    <input type="number" min={10} max={300} required value={weightKg} onChange={e => setWeightKg(e.target.value)}
                      placeholder="60"
                      className="w-full px-sm py-sm bg-surface border border-outline-variant rounded-lg text-body-md outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                </div>

                {/* BMI live display */}
                {bmi && (
                  <div className="flex items-center gap-sm px-md py-sm rounded-xl border"
                       style={{ borderColor: bmiColor + '40', background: bmiColor + '10' }}>
                    <span className="material-symbols-outlined" style={{ color: bmiColor, fontSize: 20 }}>monitor_weight</span>
                    <span className="text-label-md font-bold" style={{ color: bmiColor }}>BMI: {bmi}</span>
                    <span className="text-label-sm ml-1" style={{ color: bmiColor }}>— {bmiLabel}</span>
                  </div>
                )}

                {/* Blood group selector */}
                <div>
                  <label className="text-label-md text-on-surface block mb-sm">Required Blood Group</label>
                  <div className="grid grid-cols-4 gap-sm">
                    {BLOOD_GROUPS.map(bg => (
                      <button key={bg} type="button"
                        onClick={() => setBloodGroup(bg)}
                        className="py-sm rounded-xl text-label-md font-bold border-2 transition-all"
                        style={{
                          background: bloodGroup === bg ? '#ba1a1a' : 'transparent',
                          color: bloodGroup === bg ? '#fff' : '#49454f',
                          borderColor: bloodGroup === bg ? '#ba1a1a' : '#cac4d0',
                        }}>
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p className="text-label-md text-error bg-error-container p-sm rounded-lg">{error}</p>}

                <button type="submit" disabled={loading}
                  className="w-full py-md rounded-xl text-label-md font-bold text-white transition-opacity disabled:opacity-60"
                  style={{ background: '#ba1a1a' }}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>

                <p className="text-center text-label-sm text-on-surface-variant">
                  Already have an account?{' '}
                  <button type="button" onClick={() => setMode('login')} className="text-primary font-bold">
                    Sign in
                  </button>
                </p>
              </form>
            )}

            <div className="mt-lg pt-md border-t border-outline-variant/30 text-center">
              <button onClick={() => navigate('/')} className="text-label-sm text-on-surface-variant hover:text-primary transition-colors">
                ← Staff / Coordinator login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputField({ label, icon, type = 'text', value, onChange, placeholder }: {
  label: string; icon: string; type?: string;
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <label className="text-label-md text-on-surface block mb-xs">{label}</label>
      <div className="flex items-center gap-sm px-md py-md bg-surface border border-outline-variant rounded-xl focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>{icon}</span>
        <input
          type={isPassword ? (show ? 'text' : 'password') : type}
          required value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-body-md outline-none min-w-0"
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(v => !v)} className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{show ? 'visibility_off' : 'visibility'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
