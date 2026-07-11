import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { FOCUS_RING_CLASS } from '@/lib/a11y';
import { cn } from '@/lib/utils';

interface TaskRow {
  id: string;
  title: string;
  type?: string;
  parentTaskId?: string | null;
  status: string;
}

export default function EpicListPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();

  const tasks = useQuery({
    queryKey: ['epic-tasks', workspaceId],
    queryFn: () => api<{ data: TaskRow[] }>(`/tasks?workspaceId=${workspaceId}&limit=100`),
    enabled: Boolean(workspaceId),
  });

  const all = tasks.data?.data ?? [];
  const epics = all.filter((t) => t.type === 'EPIC');
  const childrenOf = (epicId: string) =>
    all.filter(
      (t) => t.parentTaskId === epicId || (t.type === 'STORY' && t.parentTaskId === epicId),
    );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Epics</h1>
      <p className="text-sm text-muted-foreground">
        Epic → Story hierarchy via <code>Task.type</code> and <code>parentTaskId</code>.
      </p>
      {epics.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No epics yet. Set a task type to EPIC from the task editor.
        </p>
      ) : (
        <ul className="space-y-3">
          {epics.map((e) => (
            <li key={e.id} className="rounded-lg border border-border p-3">
              <div
                className={cn('font-medium', FOCUS_RING_CLASS)}
                tabIndex={0}
                aria-label={`Epic ${e.title}`}
              >
                📦 {e.title} <span className="text-xs text-muted-foreground">({e.status})</span>
              </div>
              <ul className="mt-2 space-y-1 border-l border-border pl-3">
                {childrenOf(e.id).map((s) => (
                  <li key={s.id} className="text-sm">
                    └ {s.type === 'STORY' ? '📖' : '•'} {s.title}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
