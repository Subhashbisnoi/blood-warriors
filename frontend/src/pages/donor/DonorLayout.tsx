import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { getDonorToken, getDonorProfile, clearDonorSession } from '../../api/donorPortal';

function ChatFab() {
  const navigate = useNavigate();
  const location = useLocation();
  if (location.pathname === '/donor/chat') return null;
  return (
    <button onClick={() => navigate('/donor/chat')} title="AI Assistant"
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
        width: 56, height: 56, borderRadius: '50%',
        background: '#ba1a1a', border: 'none', cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(186,26,26,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 26 }}>smart_toy</span>
    </button>
  );
}

export default function DonorLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const profile  = getDonorProfile();
  const token    = getDonorToken();

  useEffect(() => {
    if (!token || !profile) navigate('/donor-login', { replace: true });
  }, [token, profile, navigate]);

  if (!token || !profile) return null;

  const tierColor = profile.donor_tier === 'Platinum' ? '#7b1fa2'
    : profile.donor_tier === 'Gold'     ? '#e65100'
    : profile.donor_tier === 'Silver'   ? '#546e7a'
    : '#2e7d32';

  const tabs = [
    { to: '/donor/dashboard', icon: 'monitoring',     label: 'My Impact'   },
    { to: '/donor/gratitude', icon: 'favorite',        label: 'Gratitude'   },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b flex items-center gap-md px-lg py-sm"
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
                style={{ background: active ? 'rgba(186,26,26,0.1)' : 'transparent', color: active ? '#ba1a1a' : '#49454f' }}>
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
              {profile.blood_group}
            </div>
            <div className="hidden sm:block leading-tight">
              <p className="text-label-sm font-bold text-on-surface">{profile.hash}</p>
              <p className="text-[10px] font-bold" style={{ color: tierColor }}>{profile.donor_tier}</p>
            </div>
          </div>
          <button title="Sign out"
            onClick={() => { clearDonorSession(); navigate('/donor-login'); }}
            className="text-on-surface-variant hover:text-error transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </main>

      <ChatFab />
    </div>
  );
}
