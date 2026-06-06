import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { donorLogin, saveDonorSession } from '../../api/donorPortal';

export default function DonorLogin() {
  const navigate = useNavigate();
  const [hashId, setHashId] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hashId.trim()) return;
    setError(''); setLoading(true);
    try {
      const res = await donorLogin(hashId.trim());
      saveDonorSession(res.access_token, res.profile);
      // also set bw_token so existing API client works (chat, etc.)
      localStorage.setItem('bw_token', res.access_token);
      navigate('/donor');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? 'Donor ID not found. Please check and try again.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-md relative overflow-hidden"
         style={{ background: 'radial-gradient(circle at center, #291717 0%, #1a0a0a 100%)' }}>
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-error/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 bg-surface-container-lowest rounded-[24px] shadow-2xl overflow-hidden relative z-10 border border-outline-variant/30">

        {/* Left hero */}
        <div className="hidden md:flex flex-col justify-end p-xl relative bg-inverse-surface overflow-hidden min-h-[500px]">
          <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface via-inverse-surface/60 to-transparent" />
          <div className="relative z-10 max-w-sm">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-lg"
                 style={{ background: 'rgba(186,26,26,0.2)', border: '1px solid rgba(186,26,26,0.4)' }}>
              <span className="material-symbols-outlined icon-fill" style={{ color: '#ef9a9a', fontSize: 30 }}>volunteer_activism</span>
            </div>
            <h1 className="text-display font-bold text-on-primary mb-md leading-tight">
              You are a hero.<br />See your impact.
            </h1>
            <p className="text-body-lg text-on-primary/80 mb-lg">
              Every donation you make saves up to 3 lives. View your history, impact, and gratitude from those you've helped.
            </p>
            <div className="flex flex-col gap-sm">
              {[
                { icon: 'favorite', text: 'Your complete donation history' },
                { icon: 'monitoring', text: 'Impact chart & lives saved' },
                { icon: 'mail_heart', text: 'Gratitude from patients' },
              ].map(f => (
                <div key={f.text} className="flex items-center gap-sm text-on-primary/80 text-body-sm">
                  <span className="material-symbols-outlined" style={{ color: '#ef9a9a', fontSize: 18 }}>{f.icon}</span>
                  {f.text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right form */}
        <div className="flex flex-col justify-center p-lg md:p-xl bg-surface-container-lowest">
          <div className="w-full max-w-md mx-auto space-y-xl">
            <div className="text-center md:text-left">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-container text-on-primary mb-md">
                <span className="material-symbols-outlined icon-fill">volunteer_activism</span>
              </div>
              <h2 className="text-headline-lg font-bold text-on-surface">Donor Portal</h2>
              <p className="text-body-md text-on-surface-variant mt-xs">
                Enter your Donor ID to access your profile
              </p>
            </div>

            <form className="space-y-md" onSubmit={handleSubmit}>
              <div>
                <label className="text-label-md text-on-surface block mb-sm">Donor ID</label>
                <div className="flex items-center gap-sm px-md py-md bg-surface border border-outline-variant rounded-xl focus-within:ring-2 focus-within:ring-primary transition-all">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 20 }}>badge</span>
                  <input
                    type="text" required
                    value={hashId} onChange={e => setHashId(e.target.value.toUpperCase())}
                    placeholder="e.g. 1E76BE5A"
                    maxLength={12}
                    className="flex-1 bg-transparent text-body-md font-mono outline-none tracking-widest uppercase"
                  />
                </div>
                <p className="text-label-sm text-on-surface-variant mt-xs">
                  Your Donor ID was shared when you registered. Enter at least 4 characters.
                </p>
              </div>

              {error && (
                <p className="text-label-md text-error bg-error-container p-sm rounded-lg">{error}</p>
              )}

              <button type="submit" disabled={loading || hashId.length < 4}
                className="w-full py-md rounded-xl text-label-md font-bold text-white flex items-center justify-center gap-sm transition-opacity disabled:opacity-60"
                style={{ background: '#ba1a1a' }}>
                {loading
                  ? <><span className="animate-spin material-symbols-outlined" style={{ fontSize: 18 }}>progress_activity</span> Looking up…</>
                  : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>login</span> Enter Portal</>
                }
              </button>
            </form>

            <div className="pt-md border-t border-outline-variant/30 space-y-sm">
              <Link to="/donor-register"
                className="w-full flex items-center justify-center gap-sm py-sm rounded-xl border-2 text-label-md font-bold transition-colors"
                style={{ borderColor: '#ba1a1a', color: '#ba1a1a' }}>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize: 16 }}>volunteer_activism</span>
                New Donor? Register here
              </Link>
              <Link to="/patient-login"
                className="w-full flex items-center justify-center gap-sm py-sm rounded-xl border text-label-md font-medium transition-colors text-on-surface-variant hover:text-primary"
                style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>favorite</span>
                Patient Portal
              </Link>
              <Link to="/"
                className="w-full flex items-center justify-center gap-sm py-sm rounded-xl border text-label-md font-medium transition-colors text-on-surface-variant hover:text-primary"
                style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>admin_panel_settings</span>
                Staff Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
