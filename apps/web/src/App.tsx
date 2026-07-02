import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/features/auth';
import { AppShell } from '@/components/layout/app-shell';

const LoginPage = lazy(() => import('@/features/auth/pages/login'));
const RegisterPage = lazy(() => import('@/features/auth/pages/register'));
const DashboardPage = lazy(() => import('@/pages/dashboard'));
const BoardPage = lazy(() => import('@/pages/board'));
const ListPage = lazy(() => import('@/pages/list'));
const WorkspaceSettingsPage = lazy(() => import('@/pages/workspace-settings'));
const LabelManagerPage = lazy(() => import('@/features/label/pages/LabelManagerPage'));
const ChatPage = lazy(() => import('@/pages/chat'));

function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="caption">Loading…</div>
    </div>
  );
}

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
    return <Loading />;
  }

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/" /> : <RegisterPage />} />
        <Route element={user ? <AppShell /> : <Navigate to="/login" />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/board/:workspaceId" element={<BoardPage />} />
          <Route path="/list/:workspaceId" element={<ListPage />} />
          <Route path="/workspaces/:workspaceId/settings" element={<WorkspaceSettingsPage />} />
          <Route path="/workspaces/:workspaceId/labels" element={<LabelManagerRoute />} />
          <Route path="/workspaces/:workspaceId/chat" element={<ChatPage />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/' : '/login'} />} />
      </Routes>
    </Suspense>
  );
}

function LabelManagerRoute() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  return <LabelManagerPage workspaceId={workspaceId} />;
}
