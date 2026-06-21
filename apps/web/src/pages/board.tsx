import { useParams, Link } from 'react-router-dom';
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Kanban, KanbanCard, KanbanColumn } from '@/components/ui/kanban';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  columnId: string;
  position: number;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  dueDate: string | null;
  labels: string[];
}

interface ColumnData {
  id: string;
  name: string;
  position: number;
  isDoneColumn: boolean;
  tasks: Task[];
}

const PRIORITY_BAR: Record<string, string> = {
  LOW: 'bg-slate-300 dark:bg-slate-600',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

const STATUS_TONE: Record<string, string> = {
  BACKLOG: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  TODO: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  IN_REVIEW: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  DONE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  BLOCKED: 'bg-red-500/10 text-red-600 dark:text-red-300',
};

function shortId(id: string): string {
  return id.slice(-4).toUpperCase();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function relativeDate(value: string | null): { label: string; tone: 'overdue' | 'soon' | 'normal' } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { label: 'Today', tone: 'soon' };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (days === -1) return { label: 'Yesterday', tone: 'overdue' };
  if (days > 1 && days < 7) return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), tone: 'normal' };
  if (days < 0) return { label: `${-days}d late`, tone: 'overdue' };
  return { label: `+${days}d`, tone: 'normal' };
}

function PriorityDot({ priority }: { priority: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--fg-2)]">
      <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[priority] ?? 'bg-slate-400')} />
      {priority}
    </span>
  );
}

function TaskCard({ task }: { task: Task }) {
  const due = relativeDate(task.dueDate);
  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-[var(--bg)] p-3 pl-4',
        'border-[var(--border)] shadow-[0_1px_0_rgba(0,0,0,0.02)]',
        'transition-[border-color,box-shadow] duration-150 hover:border-[var(--fg-3)]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-[3px] rounded-l-lg',
          PRIORITY_BAR[task.priority] ?? 'bg-transparent',
        )}
      />
      <span className="absolute right-2 top-2 rounded font-mono text-[10px] text-[var(--fg-3)] opacity-0 transition-opacity group-hover:opacity-100">
        {shortId(task.id)}
      </span>
      <div className="line-clamp-2 pr-6 text-[13px] font-medium leading-snug">{task.title}</div>
      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <span
              key={l}
              className="rounded bg-[var(--bg-3)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--fg-2)]"
            >
              {l}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between">
        {due ? (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] tabular-nums',
              due.tone === 'overdue'
                ? 'bg-red-500/10 text-red-500'
                : due.tone === 'soon'
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'bg-[var(--bg-3)] text-[var(--fg-2)]',
            )}
          >
            {due.label}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <PriorityDot priority={task.priority} />
          {task.assignee && (
            <Avatar className="h-5 w-5 text-[9px]">
              {task.assignee.avatarUrl ? (
                <AvatarImage src={task.assignee.avatarUrl} alt={task.assignee.name} />
              ) : null}
              <AvatarFallback>{initials(task.assignee.name)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </article>
  );
}

export function BoardPage() {
  const { workspaceId = '' } = useParams();
  const qc = useQueryClient();

  const data = useQuery({
    queryKey: ['board', workspaceId],
    queryFn: () => api<{ columns: ColumnData[] }>(`/api/workspaces/${workspaceId}/board`),
    enabled: Boolean(workspaceId),
  });

  // Source of truth: server snapshot keyed by column id.
  const serverColumnsById = React.useMemo<Record<string, Task[]>>(() => {
    if (!data.data) return {};
    const next: Record<string, Task[]> = {};
    for (const col of data.data.columns) next[col.id] = col.tasks;
    return next;
  }, [data.data]);

  // Local override that survives a drag until the server snapshot refetches.
  const [local, setLocal] = React.useState<Record<string, Task[]> | null>(null);
  // Reset local when server identity changes (post-refetch).
  React.useEffect(() => {
    setLocal(null);
  }, [serverColumnsById]);

  const columnsById = local ?? serverColumnsById;
  // Stable ordered list of columns for rendering.
  const orderedColumns = React.useMemo(() => {
    if (!data.data) return [];
    return data.data.columns.map((meta) => ({
      meta,
      tasks: columnsById[meta.id] ?? meta.tasks ?? [],
    }));
  }, [data.data, columnsById]);

  const moveMutation = useMutation({
    mutationFn: ({ taskId, toColumnId }: { taskId: string; toColumnId: string }) =>
      api<{ task: Task }>(`/api/tasks/${taskId}/move`, {
        method: 'POST',
        json: { columnId: toColumnId },
      }),
    onError: (err) => {
      if (err instanceof ApiError) console.error('move failed:', err.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['board', workspaceId] }),
  });

  const handleMove: React.ComponentProps<typeof Kanban>['onMove'] = (
    taskId,
    fromColumnId,
    toColumnId,
    fromIndex,
    toIndex,
  ) => {
    setLocal((prev) => {
      const base = prev ?? serverColumnsById;
      const fromList = [...(base[fromColumnId] ?? [])];
      const toList = fromColumnId === toColumnId ? fromList : [...(base[toColumnId] ?? [])];
      if (fromIndex < 0 || fromIndex >= fromList.length) return base;
      const [moved] = fromList.splice(fromIndex, 1);
      if (!moved) return base;
      const updated = { ...moved, columnId: toColumnId };
      const insertAt = Math.min(Math.max(toIndex, 0), toList.length);
      toList.splice(insertAt, 0, updated);
      return fromColumnId === toColumnId
        ? { ...base, [toColumnId]: toList }
        : { ...base, [fromColumnId]: fromList, [toColumnId]: toList };
    });
    moveMutation.mutate({ taskId, toColumnId });
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Board</h2>
          <span className="caption">
            {orderedColumns.reduce((acc, c) => acc + c.tasks.length, 0)} tasks
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-md border border-[var(--border)] bg-[var(--bg-2)] p-0.5 text-[12px]">
            <span className="rounded bg-[var(--bg-3)] px-2.5 py-1 font-medium text-[var(--fg)]">
              Board
            </span>
            <Link
              to={`/list/${workspaceId}`}
              className="rounded px-2.5 py-1 text-[var(--fg-2)] hover:text-[var(--fg)]"
            >
              List
            </Link>
          </div>
          <button type="button" className="btn-primary text-[12px]">
            New task
          </button>
        </div>
      </header>

      {data.isLoading && (
        <div className="flex gap-3 overflow-x-auto p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex w-72 flex-shrink-0 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/40 p-3"
            >
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      )}

      {data.isError && <div className="caption p-6 text-red-500">Failed to load board.</div>}

      {data.data && (
        <Kanban onMove={handleMove}>
          {orderedColumns.map(({ meta, tasks }) => (
            <KanbanColumn key={meta.id} id={meta.id} name={meta.name} count={tasks.length}>
              {tasks.map((t, i) => (
                <KanbanCard key={t.id} id={t.id} columnId={meta.id} index={i}>
                  <TaskCard task={t} />
                </KanbanCard>
              ))}
            </KanbanColumn>
          ))}
        </Kanban>
      )}
    </div>
  );
}
