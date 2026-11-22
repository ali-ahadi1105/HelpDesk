import { useQuery } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './contexts/AuthContext';
import { api } from './lib/api';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectBoardPage } from './pages/ProjectBoardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import type { Workspace } from './types';

function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="full-page-loader"><LoaderCircle className="spin" size={28} /> Loading TaskFlow…</div>;
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />;
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
