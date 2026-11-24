import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './contexts/AuthContext';
import { api } from './lib/api';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { InvitationPage } from './pages/InvitationPage';
import { ProjectBoardPage } from './pages/ProjectBoardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import type { Workspace } from './types';

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="full-page-loader"><LoaderCircle className="spin" size={28} /> Loading TaskFlow…</div>;
  }
  if (user) return <Outlet />;
  return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
}

function WorkspaceLayout() {
  const { workspaceId } = useParams();
  const workspace = useQuery({
    queryKey: ['workspace-summary', workspaceId],
    queryFn: () => api.get<Workspace>(`/workspaces/${workspaceId}`),
  });

  if (workspace.isLoading) {
    return <div className="full-page-loader"><LoaderCircle className="spin" size={28} /> Loading workspace…</div>;
  }
  if (workspace.isError || !workspace.data) {
    return <Navigate to="/workspaces" replace />;
  }

  return (
    <AppShell workspaceName={workspace.data.name}>
      <Outlet />
    </AppShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route path="/invitations/:token" element={<InvitationPage />} />
        <Route path="/workspaces/:workspaceId" element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectBoardPage />} />
          <Route path="settings" element={<WorkspaceSettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/workspaces" replace />} />
    </Routes>
  );
}
