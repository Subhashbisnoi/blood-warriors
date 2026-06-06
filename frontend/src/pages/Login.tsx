import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@bloodwarriors.in');
  const [password, setPassword] = useState('demo123');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError('Invalid credentials. Try admin@bloodwarriors.in / demo123');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-md font-body-md text-on-background relative overflow-hidden"
      style={{ background: 'radial-gradient(circle at center, #291717 0%, #1a0a0a 100%)' }}
    >
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-error/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 bg-surface-container-lowest rounded-[24px] shadow-2xl overflow-hidden relative z-10 border border-outline-variant/30">
        {/* Left: Hero */}
        <div className="hidden md:flex flex-col justify-end p-xl relative bg-inverse-surface text-on-primary overflow-hidden min-h-[600px]">
          <img
            src="/blood-cells.png"
            alt="Blood Cells"
            className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface via-inverse-surface/50 to-transparent" />
          <div className="relative z-10 max-w-sm">
            <h1 className="text-display font-bold text-on-primary mb-md leading-tight">
              Every drop counts.<br />Every match matters.
            </h1>
            <p className="text-body-lg text-on-primary/80">
              AI-powered blood bridge for Thalassemia patients across India
            </p>
          </div>
        </div>

        {/* Right: Form */}
        <div className="flex flex-col justify-center p-lg md:p-xl bg-surface-container-lowest">
          <div className="w-full max-w-md mx-auto space-y-xl">
            <div className="text-center md:text-left space-y-sm">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary-container text-on-primary mb-md">
                <span className="material-symbols-outlined icon-fill">water_drop</span>
              </div>
              <h2 className="text-headline-lg font-bold text-on-surface">Coordinator Portal</h2>
              <p className="text-body-md text-on-surface-variant">Sign in to manage clinical matches</p>
            </div>

            <form className="space-y-md" onSubmit={handleSubmit}>
              <div className="space-y-sm">
                <label className="text-label-md text-on-surface block" htmlFor="email">Email Address</label>
                <div className="flex items-center gap-sm px-md py-md bg-surface border border-outline-variant rounded-xl focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px] leading-none flex-shrink-0">mail</span>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="coordinator@bloodwarriors.in"
                    className="flex-1 bg-transparent text-body-md outline-none min-w-0"
                  />
                </div>
              </div>

              <div className="space-y-sm">
                <label className="text-label-md text-on-surface block" htmlFor="password">Password</label>
                <div className="flex items-center gap-sm px-md py-md bg-surface border border-outline-variant rounded-xl focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-all">
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px] leading-none flex-shrink-0">lock</span>
                  <input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex-1 bg-transparent text-body-md outline-none min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="text-on-surface-variant hover:text-primary transition-colors flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-[20px] leading-none">{showPwd ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-sm">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-primary focus:ring-primary border-outline-variant rounded"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-label-md text-on-surface-variant">
                    Remember me
                  </label>
                </div>
                <div className="text-label-md">
                  <a href="#" className="text-primary hover:text-on-primary-fixed-variant transition-colors">Forgot password?</a>
                </div>
              </div>

              {error && (
                <p className="text-label-md text-error bg-error-container p-sm rounded-lg">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-md px-lg rounded-xl shadow-sm text-label-md text-on-primary bg-primary-container hover:bg-on-primary-fixed-variant focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200 disabled:opacity-60"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="pt-xl border-t border-outline-variant/30 text-center">
              <p className="text-label-sm text-on-surface-variant flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[16px]">verified_user</span>
                Powered by Claude AI • DPDP Compliant
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
