import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  _count: { members: number; tasks: number };
}

export function DashboardPage() {
  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<{ workspaces: WorkspaceSummary[] }>('/api/workspaces'),
  });

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1>Your workspaces</h1>
        <button type="button" className="btn-primary">
          New workspace
        </button>
      </div>

      {workspaces.isLoading && <div className="caption">Loading workspaces…</div>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {workspaces.data?.workspaces.map((w) => (
          <Link
            key={w.id}
            to={`/board/${w.id}`}
            className="card hover:border-emerald-500 transition-colors"
          >
            <h3 className="text-base font-semibold">{w.name}</h3>
            <p className="caption mt-1">/{w.slug}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="caption">{w._count.members} members</span>
              <span className="caption">{w._count.tasks} tasks</span>
            </div>
          </Link>
        ))}

        {workspaces.data?.workspaces.length === 0 && (
          <div className="card col-span-full text-center">
            <p className="caption">No workspaces yet. Create your first one to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
