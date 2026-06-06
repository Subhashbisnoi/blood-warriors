import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { to: '/match', icon: 'person_search', label: 'Match Requests' },
  { to: '/outreach', icon: 'chat_bubble', label: 'Outreach Log' },
  { to: '/bridges', icon: 'emergency_home', label: 'Bridge Status' },
  { to: '/donors', icon: 'group_off', label: 'Donor Panel' },
  { to: '/analytics', icon: 'analytics', label: 'Analytics' },
  { to: '/bills', icon: 'receipt_long', label: 'Medical Bills' },
  { to: '/inventory/dashboard', icon: 'inventory_2', label: 'Inventory' },
];

export default function Sidebar() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <nav className="w-[240px] h-screen sticky left-0 top-0 bg-inverse-surface shadow-sm hidden md:flex flex-col py-lg px-md z-50 shrink-0">
      <div className="mb-xl">
        <h1 className="text-headline-md font-bold text-on-primary-fixed">Blood Warriors AI</h1>
        <p className="text-label-md text-secondary-fixed-dim mt-1">Clinical Precision AI</p>
      </div>

      <button
        onClick={() => navigate('/match')}
        className="w-full bg-primary-container text-on-primary font-label-md text-label-md py-sm px-md rounded-lg flex items-center justify-center gap-sm mb-xl hover:bg-primary transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        New Match Request
      </button>

      <div className="flex-1 flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              isActive
                ? 'flex items-center gap-md py-sm px-md rounded-lg text-primary-fixed font-bold border-r-4 border-primary-fixed bg-on-secondary-fixed-variant transition-colors duration-200'
                : 'flex items-center gap-md py-sm px-md rounded-lg text-secondary-fixed-dim hover:text-on-primary-fixed-variant hover:bg-on-secondary-fixed-variant transition-colors duration-200'
            }
          >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            <span className="font-label-md text-label-md">{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="mt-auto border-t border-outline-variant/20 pt-md flex flex-col gap-1">
        <NavLink
          to="/chat"
          className={({ isActive }) =>
            isActive
              ? 'flex items-center gap-md py-sm px-md rounded-lg text-primary-fixed font-bold border-r-4 border-primary-fixed bg-on-secondary-fixed-variant'
              : 'flex items-center gap-md py-sm px-md rounded-lg text-secondary-fixed-dim hover:text-on-primary-fixed-variant hover:bg-on-secondary-fixed-variant transition-colors duration-200'
          }
        >
          <span className="material-symbols-outlined text-[20px]">smart_toy</span>
          <span className="font-label-md text-label-md">AI Assistant</span>
        </NavLink>
        <button
          onClick={logout}
          className="flex items-center gap-md py-sm px-md rounded-lg text-secondary-fixed-dim hover:text-on-primary-fixed-variant hover:bg-on-secondary-fixed-variant transition-colors duration-200 w-full text-left"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          <span className="font-label-md text-label-md">Sign Out</span>
        </button>
        <div className="flex items-center gap-md mt-sm px-md">
          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center shrink-0">
            <span className="text-on-primary text-label-sm font-bold">SC</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-md text-label-md text-on-primary-fixed">Dr. Sarah Chen</span>
            <span className="font-label-sm text-label-sm text-secondary-fixed-dim">Admin</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
