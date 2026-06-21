import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: { name: string } | null;
  dueDate: string | null;
}

export function ListPage() {
  const { workspaceId = '' } = useParams();
  const data = useQuery({
    queryKey: ['tasks', workspaceId],
    queryFn: () => api<{ tasks: TaskRow[] }>(`/api/tasks?workspaceId=${workspaceId}`),
    enabled: Boolean(workspaceId),
  });

  return (
    <div className="p-6">
      <h2 className="mb-4">Tasks</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)] text-left label-xs">
            <th className="py-2">Title</th>
            <th className="py-2">Status</th>
            <th className="py-2">Priority</th>
            <th className="py-2">Assignee</th>
            <th className="py-2">Due</th>
          </tr>
        </thead>
        <tbody>
          {data.data?.tasks.map((t) => (
            <tr key={t.id} className="border-b border-[var(--border)]">
              <td className="py-2 text-sm font-medium">{t.title}</td>
              <td className="py-2 text-sm">{t.status}</td>
              <td className="py-2 text-sm">{t.priority}</td>
              <td className="py-2 text-sm">{t.assignee?.name ?? '—'}</td>
              <td className="py-2 text-sm">
                {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
