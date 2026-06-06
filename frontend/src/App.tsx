import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { getToken } from './api/client';
import Sidebar from './components/layout/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MatchPage from './pages/MatchPage';
import LiveOutreach from './pages/LiveOutreach';
import BridgeStatus from './pages/BridgeStatus';
import InactiveDonors from './pages/InactiveDonors';
import Analytics from './pages/Analytics';
import ChatAssistant from './pages/ChatAssistant';
import DonorPortal from './pages/DonorPortal';
import BillsPage from './pages/BillsPage';
import BillUploadPage from './pages/BillUploadPage';
import BillsDashboardPage from './pages/BillsDashboardPage';
import InventoryPage from './pages/InventoryPage';
import InventoryDashboard from './pages/InventoryDashboard';

function RequireAuth() {
  if (!getToken()) return <Navigate to="/" replace />;
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </div>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
