import { Link, useParams } from 'react-router-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { ChevronDown, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDate, initials } from '@/lib/utils';
import { useTaskDelete, exportTasksCsv } from '@/features/task';
import { useMembers, useColumns } from '@/features/workspace';
import { TaskEditModal, NewTaskModal } from '@/features/task/components/TaskEditModal';
import { PRIORITY_DOT, STATUS_TONE, PriorityDot } from '@/features/task/utils';
import { SavedViewsBar } from '@/features/saved-filter/components/SavedViewsBar';
import type { SavedFilterQuery } from '@flow-desk/shared/saved-filter';
void PRIORITY_DOT;

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  columnId: string;
  position: number;
  version: number;
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

function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn('border-transparent', STATUS_TONE[status] ?? '')}>
      {status.replace('_', ' ')}
    </Badge>
  );
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
          'h-8 appearance-none rounded-md border bg-card py-0 pl-2.5 pr-8 text-xs text-foreground',
          'border-input outline-none transition-colors',
          'focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40',
          'hover:border-muted-foreground/50',
        )}
        style={{ colorScheme: 'light dark' }}
      >
        {options.map(([v, label]) => (
          <option key={v} value={v} className="bg-card text-foreground">
            {label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <span className="sr-only">{current}</span>
    </div>
  );
}

export default function ListPage() {
  const { workspaceId = '' } = useParams();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const taskDelete = useTaskDelete(workspaceId);
  const { data: membersData } = useMembers(workspaceId);
  const { data: wsColumnsData } = useColumns(workspaceId);
  const members = useMemo(
    () =>
      (membersData ?? []).map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
      })),
    [membersData],
  );
  const wsColumns = useMemo(() => wsColumnsData ?? [], [wsColumnsData]);

  // Build current query from filter state for save/load
  const currentQuery: SavedFilterQuery = {
    ...(statusFilter !== 'ALL' ? { status: statusFilter as SavedFilterQuery['status'] } : {}),
    ...(priorityFilter !== 'ALL'
      ? { priority: priorityFilter as SavedFilterQuery['priority'] }
      : {}),
  };

  const handleLoadView = (_viewId: string, query: SavedFilterQuery) => {
    setActiveViewId(_viewId);
    setStatusFilter((query.status as StatusFilter) ?? 'ALL');
    setPriorityFilter((query.priority as PriorityFilter) ?? 'ALL');
  };

  const handleClearView = () => {
    setActiveViewId(null);
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
  };

  const handleEdit = (taskId: string) => {
    setSelectedTaskId(taskId);
    setEditModalOpen(true);
  };

  const handleDelete = (taskId: string, title: string) => {
    taskDelete.request({ id: taskId, title });
  };

  const data = useInfiniteQuery<ListPageResponse, Error>({
    queryKey: ['tasks', workspaceId, statusFilter, priorityFilter],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ workspaceId, limit: '50' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (typeof pageParam === 'string' && pageParam) params.set('cursor', pageParam);
      const res = await api<ListPageResponse>(`/api/tasks?${params.toString()}`);
      return {
        data: Array.isArray(res?.data) ? res.data : [],
        nextCursor: typeof res?.nextCursor === 'string' ? res.nextCursor : null,
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const filtered = useMemo(() => {
    const pages = data.data?.pages ?? [];
    return pages.flatMap((p) => (Array.isArray(p.data) ? p.data : []));
  }, [data.data]);

  const columns = useMemo<ColumnDef<TaskRow, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(row.original.id);
            }}
            className="cursor-pointer text-left font-medium text-foreground hover:text-primary"
          >
            {row.original.title}
          </button>
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
              <span className="text-xs">{row.original.assignee.name}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          ),
      },
      {
        id: 'labels',
        accessorFn: (r) => (r.labels ?? []).join(','),
        header: 'Labels',
        enableHiding: true,
        cell: ({ row }) =>
          !row.original.labels || row.original.labels.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.labels.map((l) => (
                <span
                  key={l}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
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
          <span className="text-xs text-muted-foreground">
            {formatDate(getValue() as string | null)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(row.original.id);
              }}
              className="cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/row:opacity-100 focus-visible:opacity-100"
              title="Edit task"
              aria-label={`Edit ${row.original.title}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(row.original.id, row.original.title);
              }}
              className="cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100 focus-visible:opacity-100"
              title="Delete task"
              aria-label={`Delete ${row.original.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [workspaceId, members, wsColumns],
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
          <h2 className="text-base font-semibold tracking-tight">Tasks</h2>
          <span className="text-xs text-muted-foreground">
            {filtered.length} task{filtered.length === 1 ? '' : 's'}
            {data.hasNextPage ? '+' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNewModalOpen(true)}
            className="h-8 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            New task
          </Button>
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
          <div className="h-4 w-px bg-border" role="separator" />
          <SavedViewsBar
            workspaceId={workspaceId}
            activeViewId={activeViewId}
            currentQuery={currentQuery}
            onLoadView={handleLoadView}
            onClearView={handleClearView}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => {
              void exportTasksCsv({
                workspaceId,
                status: statusFilter,
                priority: priorityFilter,
              }).catch((err: unknown) => {
                const message = err instanceof Error ? err.message : 'Export failed';
                toast.error(message);
              });
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
            <Link
              to={`/board/${workspaceId}`}
              className="rounded px-2.5 py-1 text-muted-foreground hover:text-foreground"
            >
              Board
            </Link>
            <span className="rounded bg-muted px-2.5 py-1 font-medium text-foreground">List</span>
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
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
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
            onRowClick={(row) => handleEdit(row.id)}
          />
          {data.hasNextPage ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={data.isFetchingNextPage}
                onClick={() => void data.fetchNextPage()}
              >
                {data.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <NewTaskModal
        open={newModalOpen}
        onClose={() => {
          setNewModalOpen(false);
          qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
        }}
        workspaceId={workspaceId}
        columns={wsColumns}
        members={members}
        defaultColumnId={wsColumns[0]?.id}
      />
      {selectedTaskId && (
        <TaskEditModal
          open={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedTaskId(null);
            qc.invalidateQueries({ queryKey: ['tasks', workspaceId] });
          }}
          workspaceId={workspaceId}
          columns={wsColumns}
          members={members}
          initial={filtered.find((t) => t.id === selectedTaskId) ?? null}
        />
      )}
      {taskDelete.dialog}
    </div>
  );
}
