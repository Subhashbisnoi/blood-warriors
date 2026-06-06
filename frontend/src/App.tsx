import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getToken } from './api/client';
import Sidebar from './components/layout/Sidebar';
import Login from './pages/Login';
import PatientLogin from './pages/patient/PatientLogin';
import PatientPortal from './pages/patient/PatientPortal';
import Dashboard from './pages/Dashboard';
import MatchPage from './pages/MatchPage';
import LiveOutreach from './pages/LiveOutreach';
import BridgeStatus from './pages/BridgeStatus';
import InactiveDonors from './pages/InactiveDonors';
import Analytics from './pages/Analytics';
import ChatAssistant from './pages/ChatAssistant';
import DonorPortal from './pages/DonorPortal';
import PatientGratitude from './pages/patient/PatientGratitude';
import DonorLogin from './pages/donor/DonorLogin';
import DonorRegister from './pages/donor/DonorRegister';
import DonorLayout from './pages/donor/DonorLayout';
import DonorDashboard from './pages/donor/DonorDashboard';
import DonorGratitude from './pages/donor/DonorGratitude';
import BillsPage from './pages/BillsPage';
import BillUploadPage from './pages/BillUploadPage';
import BillsDashboardPage from './pages/BillsDashboardPage';
import InventoryPage from './pages/InventoryPage';
import InventoryDashboard from './pages/InventoryDashboard';
import BulkMatchPage from './pages/BulkMatchPage';

function ChatFab() {
  const navigate = useNavigate();
  const location = useLocation();
  if (location.pathname === '/chat') return null;
  return (
    <button
      onClick={() => navigate('/chat')}
      title="AI Assistant"
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
        width: 56, height: 56, borderRadius: '50%',
        background: '#f04163', border: 'none', cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(240,65,99,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
    >
      <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 26 }}>smart_toy</span>
    </button>
  );
}

function RequireAuth() {
  if (!getToken()) return <Navigate to="/" replace />;
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </div>
      <ChatFab />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/match" element={<MatchPage />} />
          <Route path="/bulk-match" element={<BulkMatchPage />} />
          <Route path="/outreach" element={<LiveOutreach />} />
          <Route path="/outreach/:matchId" element={<LiveOutreach />} />
          <Route path="/bridges" element={<BridgeStatus />} />
          <Route path="/donors" element={<InactiveDonors />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/chat" element={<ChatAssistant />} />
          <Route path="/donor-portal" element={<DonorPortal />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/bills/upload" element={<BillUploadPage />} />
          <Route path="/bills/dashboard" element={<BillsDashboardPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/inventory/dashboard" element={<InventoryDashboard />} />
        </Route>
        {/* Patient portal */}
        <Route path="/patient-login" element={<PatientLogin />} />
        <Route path="/patient" element={<PatientPortal />}>
          <Route index element={<Navigate to="/patient/match" replace />} />
          <Route path="match" element={<MatchPage />} />
          <Route path="outreach" element={<LiveOutreach />} />
          <Route path="chat" element={<ChatAssistant />} />
          <Route path="gratitude" element={<PatientGratitude />} />
        </Route>

        {/* Donor portal */}
        <Route path="/donor-login" element={<DonorLogin />} />
        <Route path="/donor-register" element={<DonorRegister />} />
        <Route path="/donor" element={<DonorLayout />}>
          <Route index element={<Navigate to="/donor/dashboard" replace />} />
          <Route path="dashboard" element={<DonorDashboard />} />
          <Route path="gratitude" element={<DonorGratitude />} />
          <Route path="chat" element={<ChatAssistant />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
