import { useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useRoute } from '@/hooks/useRoute';
import AppLayout from '@/components/AppLayout';
import { Spinner } from '@/components/ui';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import EvidencePage from '@/pages/EvidencePage';
import EvidenceDetailPage from '@/pages/EvidenceDetailPage';
import CasesPage from '@/pages/CasesPage';
import CaseDetailPage from '@/pages/CaseDetailPage';
import CustodyPage from '@/pages/CustodyPage';
import SettingsPage from '@/pages/SettingsPage';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

function useIdleSignOut(enabled: boolean, onIdle: () => void) {
  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(onIdle, IDLE_TIMEOUT_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onIdle, IDLE_TIMEOUT_MS);
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [enabled, onIdle]);
}

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const route = useRoute();
  const [section = 'dashboard', detailId] = route;

  useIdleSignOut(Boolean(user), () => {
    void signOut();
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-night-900">
        <Spinner label="Restoring secure session" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  const renderPage = () => {
    switch (section) {
      case 'evidence':
        return detailId ? <EvidenceDetailPage evidenceId={detailId} /> : <EvidencePage />;
      case 'cases':
        return detailId ? <CaseDetailPage caseId={detailId} /> : <CasesPage />;
      case 'custody':
        return <CustodyPage evidenceId={detailId} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage />;
    }
  };

  const activeKey = ['evidence', 'cases', 'custody', 'settings'].includes(section) ? section : 'dashboard';

  return <AppLayout activeKey={activeKey}>{renderPage()}</AppLayout>;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
