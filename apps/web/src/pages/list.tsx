import { useParams, Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDate } from '@/lib/utils';

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  columnId: string;
  position: number;
  assignee: { id: string; name: string; email?: string; avatarUrl: string | null } | null;
  dueDate: string | null;
  labels: string[];
}

interface ListPageResponse {
  data: TaskRow[];
  nextCursor: string | null;
}

const STATUS_OPTIONS = [
  'ALL',
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'BLOCKED',
] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

const PRIORITY_OPTIONS = ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
type PriorityFilter = (typeof PRIORITY_OPTIONS)[number];

const STATUS_TONE: Record<string, string> = {
  BACKLOG: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  TODO: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  IN_REVIEW: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  DONE: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  BLOCKED: 'bg-red-500/10 text-red-600 dark:text-red-300',
};

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn('border-transparent', STATUS_TONE[status] ?? '')}>
      {status.replace('_', ' ')}
    </Badge>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--fg-2)]">
      <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[priority] ?? 'bg-slate-400')} />
      {priority}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Native <select> styled to match the FlowDesk theme.
 * The chevron uses lucide (theme-aware) instead of a hardcoded SVG stroke.
 * The open menu uses browser-native rendering — color-scheme on <html>
 * (set in index.css) keeps options dark/light matching the app.
 */
function NativeSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
  ariaLabel: string;
}) {
  const current = options.find(([v]) => v === value)?.[1] ?? '';
  return (
    <div className="relative inline-flex">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-8 appearance-none rounded-md border bg-[var(--bg-2)] py-0 pl-2.5 pr-8 text-[12px] text-[var(--fg)]',
          'border-[var(--border)] outline-none transition-colors',
          'focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40',
          'hover:border-[var(--fg-3)]',
        )}
        style={{ colorScheme: 'light dark' }}
      >
        {options.map(([v, label]) => (
          <option key={v} value={v} className="bg-[var(--bg-2)] text-[var(--fg)]">
            {label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-3)]"
      />
      <span className="sr-only">{current}</span>
    </div>
  );
}

export function ListPage() {
  const { workspaceId = '' } = useParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');

  const data = useInfiniteQuery<ListPageResponse, Error>({
    queryKey: ['tasks', workspaceId],
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      try {
        const search = new URLSearchParams({ workspaceId, limit: '100' });
        if (pageParam) search.set('cursor', String(pageParam));
        const res = await api<ListPageResponse>(`/api/tasks?${search.toString()}`);
        return {
          data: Array.isArray(res?.data) ? res.data : [],
          nextCursor: typeof res?.nextCursor === 'string' ? res.nextCursor : null,
        };
      } catch {
        return { data: [], nextCursor: null };
      }
    },
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const filtered = useMemo(() => {
    const pages = Array.isArray(data.data?.pages) ? data.data.pages : [];
    const tasks = pages.flatMap((p) => (Array.isArray(p?.data) ? p.data : []));
    return tasks.filter((t) => {
      if (statusFilter !== 'ALL' && t?.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && t?.priority !== priorityFilter) return false;
      return true;
    });
  }, [data.data, statusFilter, priorityFilter]);

  const columns = useMemo<ColumnDef<TaskRow, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => (
          <Link
            to={`/board/${workspaceId}`}
            className="font-medium text-[var(--fg)] hover:text-emerald-600"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => <StatusPill status={String(getValue())} />,
      },
      {
        id: 'priority',
        accessorKey: 'priority',
        header: 'Priority',
        cell: ({ getValue }) => <PriorityDot priority={String(getValue())} />,
      },
      {
        id: 'assignee',
        accessorFn: (r) => r.assignee?.name ?? '',
        header: 'Assignee',
        cell: ({ row }) =>
          row.original.assignee ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5 text-[9px]">
                {row.original.assignee.avatarUrl ? (
                  <AvatarImage
                    src={row.original.assignee.avatarUrl}
                    alt={row.original.assignee.name}
                  />
                ) : null}
                <AvatarFallback>{initials(row.original.assignee.name)}</AvatarFallback>
              </Avatar>
              <span className="text-[12px]">{row.original.assignee.name}</span>
            </div>
          ) : (
            <span className="caption">Unassigned</span>
          ),
      },
      {
        id: 'labels',
        accessorFn: (r) => (r.labels ?? []).join(','),
        header: 'Labels',
        enableHiding: true,
        cell: ({ row }) =>
          !row.original.labels || row.original.labels.length === 0 ? (
            <span className="caption">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.labels.map((l) => (
                <span
                  key={l}
                  className="rounded bg-[var(--bg-3)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--fg-2)]"
                >
                  {l}
                </span>
              ))}
            </div>
          ),
      },
      {
        id: 'dueDate',
        accessorKey: 'dueDate',
        header: 'Due',
        cell: ({ getValue }) => (
          <span className="text-[12px] text-[var(--fg-2)]">
            {formatDate(getValue() as string | null)}
          </span>
        ),
      },
    ],
    [workspaceId],
  );

  const statusOptions: ReadonlyArray<readonly [string, string]> = STATUS_OPTIONS.map((s) => [
    s,
    s === 'ALL' ? 'All statuses' : s.replace('_', ' '),
  ]);
  const priorityOptions: ReadonlyArray<readonly [string, string]> = PRIORITY_OPTIONS.map((p) => [
    p,
    p === 'ALL' ? 'All priorities' : p,
  ]);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight">Tasks</h2>
          <span className="caption">{filtered.length} shown</span>
        </div>
        <div className="flex items-center gap-2">
          <NativeSelect
            ariaLabel="Status filter"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={statusOptions}
          />
          <NativeSelect
            ariaLabel="Priority filter"
            value={priorityFilter}
            onChange={(v) => setPriorityFilter(v as PriorityFilter)}
            options={priorityOptions}
          />
          <div className="flex items-center rounded-md border border-[var(--border)] bg-[var(--bg-2)] p-0.5 text-[12px]">
            <Link
              to={`/board/${workspaceId}`}
              className="rounded px-2.5 py-1 text-[var(--fg-2)] hover:text-[var(--fg)]"
            >
              Board
            </Link>
            <span className="rounded bg-[var(--bg-3)] px-2.5 py-1 font-medium text-[var(--fg)]">
              List
            </span>
          </div>
        </div>
      </div>

      {data.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : data.isError ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600">
          Failed to load tasks: {(data.error as Error | null)?.message ?? 'unknown error'}
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={filtered}
            searchKey="title"
            searchPlaceholder="Filter by title…"
            empty="No tasks match the current filters."
          />
          {data.hasNextPage ? (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => void data.fetchNextPage()}
                disabled={data.isFetchingNextPage}
                className="btn-ghost text-[12px]"
              >
                {data.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
