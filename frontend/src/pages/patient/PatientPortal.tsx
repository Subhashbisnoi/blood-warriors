import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { getPatientToken, getPatientProfile, clearPatientSession } from '../../api/patient';

function ChatFab() {
  const navigate = useNavigate();
  const location = useLocation();
  if (location.pathname === '/patient/chat') return null;
  return (
    <button
      onClick={() => navigate('/patient/chat')}
      title="AI Assistant"
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
        width: 56, height: 56, borderRadius: '50%',
        background: '#ba1a1a', border: 'none', cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(186,26,26,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 26 }}>smart_toy</span>
    </button>
  );
}

export default function PatientPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile = getPatientProfile();
  const token = getPatientToken();

  useEffect(() => {
    if (!token || !profile) {
      navigate('/patient-login', { replace: true });
      return;
    }
    // Copy patient token into the slot the existing API client reads —
    // this makes MatchPage and LiveOutreach work without any changes.
    localStorage.setItem('bw_token', token);
  }, [token, profile, navigate]);

  if (!token || !profile) return null;

  const bmiColor = profile.bmi < 18.5 ? '#e65100' : profile.bmi < 25 ? '#2e7d32' : profile.bmi < 30 ? '#e65100' : '#ba1a1a';

  const tabs = [
    { to: '/patient/match',     icon: 'manage_search',        label: 'Match Request' },
    { to: '/patient/outreach',  icon: 'notifications_active', label: 'Outreach Log'  },
    { to: '/patient/gratitude', icon: 'favorite',             label: 'Send Thanks'   },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* Thin patient identity bar */}
      <div className="sticky top-0 z-50 flex items-center gap-md px-lg py-sm border-b"
           style={{ background: '#fff8f7', borderColor: 'rgba(186,26,26,0.12)' }}>

        {/* Logo */}
        <div className="flex items-center gap-sm flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#ba1a1a' }}>
            <span className="material-symbols-outlined icon-fill text-white" style={{ fontSize: 16 }}>water_drop</span>
          </div>
          <span className="font-black text-on-surface text-label-lg hidden sm:block">
            Blood<span style={{ color: '#ba1a1a' }}>Warriors</span>
          </span>
        </div>

        {/* Tabs */}
        <nav className="flex items-center gap-xs ml-md">
          {tabs.map(tab => {
            const active = location.pathname.startsWith(tab.to);
            return (
              <Link key={tab.to} to={tab.to}
                className="flex items-center gap-xs px-md py-xs rounded-xl text-label-md font-bold transition-colors"
                style={{
                  background: active ? 'rgba(186,26,26,0.1)' : 'transparent',
                  color: active ? '#ba1a1a' : '#49454f',
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17 }}>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Profile chip */}
        <div className="ml-auto flex items-center gap-sm">
          <div className="flex items-center gap-sm px-sm py-xs rounded-full border"
               style={{ borderColor: 'rgba(186,26,26,0.2)', background: 'rgba(186,26,26,0.05)' }}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-black"
                 style={{ background: '#ba1a1a', fontSize: 9 }}>
              {profile.blood_group.replace(' Positive','+').replace(' Negative','−')}
            </div>
            <div className="hidden sm:block leading-tight">
              <p className="text-label-sm font-bold text-on-surface">{profile.name}</p>
              <p className="text-[10px]" style={{ color: bmiColor }}>BMI {profile.bmi} · {profile.bmi_label}</p>
            </div>
          </div>

          <button
            title="Sign out"
            onClick={() => {
              clearPatientSession();
              localStorage.removeItem('bw_token');
              navigate('/patient-login');
            }}
            className="text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
          </button>
        </div>
      </div>

      {/* Existing pages render here — they include their own TopBar */}
      <div className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </div>

      <ChatFab />
    </div>
  );
}
