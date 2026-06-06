import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { getPatientToken, getPatientProfile, clearPatientSession } from '../../api/patient';

export default function PatientPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = getPatientProfile();

  useEffect(() => {
    if (!getPatientToken() || !profile) {
      navigate('/patient-login', { replace: true });
    }
  }, [navigate, profile]);

  if (!profile) return null;

  const bmiColor = profile.bmi < 18.5 ? '#e65100' : profile.bmi < 25 ? '#2e7d32' : profile.bmi < 30 ? '#e65100' : '#ba1a1a';

  const navLinks = [
    { to: '/patient/match',    icon: 'manage_search', label: 'Match Request' },
    { to: '/patient/outreach', icon: 'notifications_active', label: 'My Outreach' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">

      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-outline-variant/30 bg-surface/95 backdrop-blur"
              style={{ borderBottomColor: 'rgba(186,26,26,0.12)' }}>
        <div className="max-w-6xl mx-auto px-lg flex items-center gap-lg h-16">

          {/* Logo */}
          <div className="flex items-center gap-sm flex-shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#ba1a1a' }}>
              <span className="material-symbols-outlined icon-fill text-white" style={{ fontSize: 18 }}>water_drop</span>
            </div>
            <span className="font-black text-on-surface text-body-lg">Blood<span style={{ color: '#ba1a1a' }}>Warriors</span></span>
          </div>

          {/* Nav tabs */}
          <nav className="flex items-center gap-xs ml-lg">
            {navLinks.map(link => {
              const active = location.pathname.startsWith(link.to);
              return (
                <Link key={link.to} to={link.to}
                  className="flex items-center gap-xs px-md py-sm rounded-xl text-label-md font-bold transition-colors"
                  style={{
                    background: active ? 'rgba(186,26,26,0.1)' : 'transparent',
                    color: active ? '#ba1a1a' : '#49454f',
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Profile chip */}
          <div className="ml-auto flex items-center gap-md">
            <div className="flex items-center gap-sm px-md py-xs rounded-full border"
                 style={{ borderColor: 'rgba(186,26,26,0.2)', background: 'rgba(186,26,26,0.05)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-label-sm font-black"
                   style={{ background: '#ba1a1a' }}>
                {profile.blood_group}
              </div>
              <div className="hidden sm:block">
                <p className="text-label-sm font-bold text-on-surface leading-none">{profile.name}</p>
                <p className="text-[10px] leading-none mt-0.5" style={{ color: bmiColor }}>
                  BMI {profile.bmi} · {profile.bmi_label}
                </p>
              </div>
            </div>

            <button
              onClick={() => { clearPatientSession(); navigate('/patient-login'); }}
              className="text-label-sm text-on-surface-variant hover:text-error transition-colors flex items-center gap-xs"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-lg py-xl">
        <Outlet />
      </main>
    </div>
  );
}
