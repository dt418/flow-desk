import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/features/auth';
import { LoginPage } from '@/features/auth/pages/login';
import { RegisterPage } from '@/features/auth/pages/register';
import { AppShell } from '@/components/layout/app-shell';
import { DashboardPage } from '@/pages/dashboard';
import { BoardPage } from '@/pages/board';
import { ListPage } from '@/pages/list';
import { WorkspaceSettingsPage } from '@/pages/workspace-settings';
import { LabelManagerPage } from '@/features/label';

export function App() {
  const { theme } = useTheme();
  const { user, isLoading, checkAuth } = useAuth();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ status: string }>('/api/health'),
    staleTime: 60_000,
    retry: 0,
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="caption">Loading…</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />
      <Route element={user ? <AppShell /> : <Navigate to="/login" />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/board/:workspaceId" element={<BoardPage />} />
        <Route path="/list/:workspaceId" element={<ListPage />} />
        <Route path="/workspaces/:workspaceId/settings" element={<WorkspaceSettingsPage />} />
        <Route path="/workspaces/:workspaceId/labels" element={<LabelManagerRoute />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} />} />
    </Routes>
  );
}

function LabelManagerRoute() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  return <LabelManagerPage workspaceId={workspaceId} />;
}
