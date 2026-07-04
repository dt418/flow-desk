import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { LogOut, Moon, Sun, Plus } from 'lucide-react';
import type { ApiError } from '@/lib/api';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth';
import { useTheme } from '@/lib/theme';
import { useSocket } from '@/lib/socket';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspaceSwitcher } from '@/features/workspace';
import { WorkspaceCreateDialog } from '@/components/ui/workspace-create-dialog';
import { cn, initials } from '@/lib/utils';

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
}

interface WorkspacesResponse {
  data: WorkspaceSummary[];
  nextCursor: string | null;
}

export function AppShell() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  useSocket();
  const [createOpen, setCreateOpen] = React.useState(false);

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<WorkspacesResponse>('/api/workspaces'),
  });

  const activeWorkspaceId = React.useMemo(() => {
    if (typeof window === 'undefined') return undefined;
    const match = window.location.pathname.match(/\/(?:board|list|workspaces)\/([^/]+)/);
    return match?.[1];
  }, []);

  const onCreateWorkspace = () => {
    setCreateOpen(true);
  };

  const onLogout = async () => {
    await logout();
    qc.clear();
    navigate('/login');
  };

  return (
    <div className="flex h-full bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>

      <aside className="flex w-60 flex-col border-r border-border bg-card">
        <div className="flex flex-col gap-3 px-4 py-4">
          <h2 className="text-lg font-semibold text-primary">FlowDesk</h2>
          <WorkspaceSwitcher
            currentWorkspaceId={activeWorkspaceId}
            onCreateWorkspace={onCreateWorkspace}
            variant="sidebar"
          />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2" aria-label="Primary">
          <NavLink to="/" end className={navItem}>
            Dashboard
          </NavLink>

          <div className="px-2 pt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Workspaces
          </div>
          {workspaces.isLoading ? (
            <div className="space-y-1 px-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : workspaces.isError ? (
            <p className="px-2 text-xs text-destructive">
              Failed to load: {(workspaces.error as ApiError | null)?.message ?? 'unknown error'}
            </p>
          ) : (
            (workspaces.data?.data ?? []).map((w) => (
              <div key={w.id} className="space-y-1">
                <NavLink to={`/board/${w.id}`} className={navItem}>
                  {w.name}
                </NavLink>
                <NavLink to={`/list/${w.id}`} className={navSubItem}>
                  List view
                </NavLink>
                <NavLink to={`/workspaces/${w.id}/chat`} className={navSubItem}>
                  Chat
                </NavLink>
                <NavLink to={`/workspaces/${w.id}/settings`} className={navSubItem}>
                  Settings
                </NavLink>
              </div>
            ))
          )}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar size="sm">
                <AvatarFallback>{user?.name ? initials(user.name) : '?'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user?.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="mt-2 w-full justify-start"
          >
            <LogOut />
            Sign out
          </Button>
        </div>
      </aside>

      <main id="main" className="flex-1 overflow-auto" aria-label="Main content">
        <Outlet />
      </main>

      <WorkspaceCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(ws) => navigate(`/board/${ws.id}`)}
      />
    </div>
  );
}

function navItem({ isActive }: { isActive: boolean }) {
  return cn(
    'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  );
}

function navSubItem({ isActive }: { isActive: boolean }) {
  return cn(
    'block rounded-md py-1 pl-6 pr-3 text-xs transition-colors',
    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
  );
}
