import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/features/auth';
import { useTheme } from '@/lib/theme';
import { useSocket } from '@/lib/socket';

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
}

export function AppShell() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  useSocket();

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<{ workspaces: WorkspaceSummary[] }>('/api/workspaces'),
  });

  const onLogout = async () => {
    await logout();
    qc.clear();
    navigate('/login');
  };

  return (
    <div className="flex h-full bg-[var(--bg)] text-[var(--fg)]">
      <aside className="flex w-60 flex-col border-r border-[var(--border)] bg-[var(--bg-2)]">
        <div className="px-4 py-4">
          <h2 className="text-lg font-semibold text-emerald-500">FlowDesk</h2>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2">
          <NavLink to="/" end className={navItem}>
            Dashboard
          </NavLink>

          <div className="px-2 pt-4 label-xs">Workspaces</div>
          {workspaces.data?.workspaces.map((w) => (
            <div key={w.id} className="space-y-1">
              <NavLink to={`/board/${w.id}`} className={navItem}>
                {w.name}
              </NavLink>
              <NavLink to={`/list/${w.id}`} className={navSubItem}>
                List view
              </NavLink>
              <NavLink to={`/workspaces/${w.id}/settings`} className={navSubItem}>
                Settings
              </NavLink>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="caption truncate">{user?.email}</div>
            </div>
            <button
              type="button"
              onClick={toggle}
              aria-label="Toggle theme"
              className="btn-ghost text-base"
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
          <button type="button" onClick={onLogout} className="btn-ghost mt-2 w-full text-left">
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function navItem({ isActive }: { isActive: boolean }) {
  return [
    'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-emerald-500/10 text-emerald-500'
      : 'text-[var(--fg-2)] hover:bg-[var(--bg-3)]',
  ].join(' ');
}

function navSubItem({ isActive }: { isActive: boolean }) {
  return [
    'block rounded-md py-1 pl-6 pr-3 text-xs transition-colors',
    isActive ? 'text-emerald-500' : 'text-[var(--fg-3)] hover:text-[var(--fg-2)]',
  ].join(' ');
}
