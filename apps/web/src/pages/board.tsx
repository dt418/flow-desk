import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface TaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  columnId: string;
  assignee: { id: string; name: string } | null;
}

interface ColumnData {
  id: string;
  name: string;
  position: number;
  isDoneColumn: boolean;
  tasks: TaskSummary[];
}

export function BoardPage() {
  const { workspaceId = '' } = useParams();
  const data = useQuery({
    queryKey: ['board', workspaceId],
    queryFn: () => api<{ columns: ColumnData[] }>(`/api/workspaces/${workspaceId}/board`),
    enabled: Boolean(workspaceId),
  });

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-2)] px-6 py-3">
        <h2>Board</h2>
        <div className="flex gap-2">
          <Link to={`/list/${workspaceId}`} className="btn-ghost text-sm">
            List view
          </Link>
          <button type="button" className="btn-primary text-sm">
            New task
          </button>
        </div>
      </header>

      <div className="flex flex-1 gap-4 overflow-x-auto p-4">
        {data.data?.columns.map((col) => (
          <section
            key={col.id}
            className="flex w-72 flex-shrink-0 flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-2)]"
            aria-label={`Column ${col.name}`}
          >
            <header className="flex items-center justify-between px-3 py-2">
              <h3 className="text-sm">{col.name}</h3>
              <span className="caption">{col.tasks.length}</span>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {col.tasks.map((t) => (
                <article
                  key={t.id}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 hover:border-emerald-500"
                >
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`label-xs priority-${t.priority.toLowerCase()}`}>
                      {t.priority}
                    </span>
                    {t.assignee && <span className="caption">{t.assignee.name}</span>}
                  </div>
                </article>
              ))}
              {col.tasks.length === 0 && (
                <div className="caption px-2 py-4 text-center">No tasks</div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
