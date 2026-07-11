import { useParams, Link } from 'react-router-dom';
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { boardResponseSchema } from '@/features/task/schemas';
import { Kanban, KanbanCard, KanbanColumn } from '@/components/ui/kanban';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NewTaskModal, TaskCard, TaskEditModal, useTaskDelete } from '@/features/task';
import { useMembers, useUpdateColumn } from '@/features/workspace';
import { useRealtime } from '@/features/realtime/useRealtime';
import { setMoveInProgress } from '@/features/realtime/move-progress';
import { EmptyBoardState, PresenceBar } from '@/features/board';
import { BoardSwitcher } from '@/features/board/components/BoardSwitcher';
import { PRIORITY_BAR, PriorityDot } from '@/features/task/utils';
void PRIORITY_BAR;
void PriorityDot;

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  columnId: string;
  position: number;
  version: number;
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

export default function BoardPage() {
  const { workspaceId = '' } = useParams();
  useRealtime(workspaceId);
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [createColumnId, setCreateColumnId] = React.useState<string | null>(null);
  const [boardId, setBoardId] = React.useState<string | null>(null);
  const membersQuery = useMembers(workspaceId);
  const taskDelete = useTaskDelete(workspaceId);
  const updateColumn = useUpdateColumn(workspaceId);

  const data = useQuery({
    queryKey: ['board', workspaceId],
    queryFn: () =>
      api<{ columns: ColumnData[] }>(`/api/workspaces/${workspaceId}/board`, {
        schema: boardResponseSchema,
      }),
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

  // Pre-move snapshot for rollback if the server rejects the move.
  const moveSnapshotRef = React.useRef<Record<string, Task[]> | null>(null);
  const moveIdRef = React.useRef<{
    taskId: string;
    fromColumnId: string;
    toColumnId: string;
  } | null>(null);

  const moveMutation = useMutation({
    mutationFn: ({
      taskId,
      toColumnId,
      position,
      version,
    }: {
      taskId: string;
      toColumnId: string;
      position: number;
      version: number;
    }) =>
      api<{ task: Task }>(`/api/tasks/${taskId}/move`, {
        method: 'POST',
        json: { columnId: toColumnId, position, version },
      }),
    onError: (err) => {
      const snap = moveSnapshotRef.current;
      const meta = moveIdRef.current;
      if (snap && meta) {
        setLocal(snap);
      }
      moveSnapshotRef.current = null;
      moveIdRef.current = null;
      setMoveInProgress(false);
      const message = err instanceof ApiError ? err.message : 'Move failed. Reverted board state.';
      toast.error(message);
    },
    onSettled: () => {
      moveSnapshotRef.current = null;
      moveIdRef.current = null;
      setMoveInProgress(false);
      qc.invalidateQueries({ queryKey: ['board', workspaceId] });
    },
  });

  const handleMove: React.ComponentProps<typeof Kanban>['onMove'] = (
    taskId,
    fromColumnId,
    toColumnId,
    fromIndex,
    toIndex,
  ) => {
    // RC5: Skip no-op moves (same column, same position).
    if (fromColumnId === toColumnId && fromIndex === toIndex) return;

    setLocal((prev) => {
      const base = prev ?? serverColumnsById;
      const fromList = [...(base[fromColumnId] ?? [])];
      const toList = fromColumnId === toColumnId ? fromList : [...(base[toColumnId] ?? [])];
      if (fromIndex < 0 || fromIndex >= fromList.length) return base;
      const [moved] = fromList.splice(fromIndex, 1);
      if (!moved) return base;
      const insertAt = Math.min(Math.max(toIndex, 0), toList.length);
      const updated = { ...moved, columnId: toColumnId };
      toList.splice(insertAt, 0, updated);
      // Snapshot for rollback BEFORE we mutate the server.
      moveSnapshotRef.current = { ...base };
      moveIdRef.current = { taskId, fromColumnId, toColumnId };
      return fromColumnId === toColumnId
        ? { ...base, [toColumnId]: toList }
        : { ...base, [fromColumnId]: fromList, [toColumnId]: toList };
    });
    // Compute clamped position from the post-splice target length (server also clamps).
    const baseLen = (columnsById[fromColumnId]?.length ?? 0) - 1; // removed one
    const targetLen =
      fromColumnId === toColumnId ? baseLen : (columnsById[toColumnId]?.length ?? 0);
    const clampedPosition = Math.min(Math.max(toIndex, 0), targetLen);
    const taskVersion = columnsById[fromColumnId]?.find((t) => t.id === taskId)?.version ?? 0;
    setMoveInProgress(true);
    moveMutation.mutate({ taskId, toColumnId, position: clampedPosition, version: taskVersion });
  };

  const handleCardOpen = (taskId: string) => {
    setSelectedTaskId(taskId);
    setEditModalOpen(true);
  };

  const handleDelete = (taskId: string, title: string) => {
    taskDelete.request({ id: taskId, title });
  };

  const selectedTask = React.useMemo(() => {
    if (!selectedTaskId) return null;
    for (const col of orderedColumns) {
      const found = col.tasks.find((t) => t.id === selectedTaskId);
      if (found) return found;
    }
    return null;
  }, [selectedTaskId, orderedColumns]);

  const modalColumns = React.useMemo(
    () => orderedColumns.map(({ meta }) => ({ id: meta.id, name: meta.name })),
    [orderedColumns],
  );

  const modalMembers = React.useMemo(
    () =>
      (membersQuery.data ?? []).map((m) => ({
        id: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
      })),
    [membersQuery.data],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold tracking-tight">Board</h2>
          <BoardSwitcher
            workspaceId={workspaceId}
            value={boardId}
            onChange={(id) => {
              setBoardId(id);
              // Persist selection for create flows
              try {
                sessionStorage.setItem(`board:${workspaceId}`, id);
              } catch {
                /* ignore */
              }
            }}
          />
          <span className="text-xs text-muted-foreground">
            {orderedColumns.reduce((acc, c) => acc + c.tasks.length, 0)} tasks
          </span>
        </div>
        <div className="flex items-center gap-1">
          <PresenceBar workspaceId={workspaceId} />
          <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
            <span className="rounded bg-muted px-2.5 py-1 font-medium text-foreground">Board</span>
            <Link
              to={`/list/${workspaceId}`}
              className="rounded px-2.5 py-1 text-muted-foreground hover:text-foreground"
            >
              List
            </Link>
          </div>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            New task
          </Button>
        </div>
      </header>

      {data.isLoading && (
        <div className="flex gap-3 overflow-x-auto p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex w-72 flex-shrink-0 flex-col gap-2 rounded-xl border border-border bg-card/40 p-3"
            >
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      )}

      {data.isError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          Failed to load board: {(data.error as Error | null)?.message ?? 'unknown error'}
        </div>
      )}

      {data.data && orderedColumns.reduce((acc, c) => acc + c.tasks.length, 0) === 0 && (
        <EmptyBoardState onCreate={() => setModalOpen(true)} />
      )}

      {data.data && orderedColumns.reduce((acc, c) => acc + c.tasks.length, 0) > 0 && (
        <Kanban
          onMove={handleMove}
          renderOverlay={(taskId) => {
            const task = orderedColumns.flatMap((c) => c.tasks).find((t) => t.id === taskId);
            return task ? (
              <TaskCard
                task={task as unknown as Parameters<typeof TaskCard>[0]['task']}
                workspaceId={workspaceId}
              />
            ) : null;
          }}
        >
          {orderedColumns.map(({ meta, tasks }) => (
            <KanbanColumn
              key={meta.id}
              id={meta.id}
              name={meta.name}
              count={tasks.length}
              onAddTask={() => {
                setCreateColumnId(meta.id);
                setModalOpen(true);
              }}
              onRenameColumn={(newName) => {
                updateColumn.mutate(
                  { columnId: meta.id, body: { name: newName } },
                  {
                    onError: (err) => {
                      toast.error(
                        err instanceof ApiError ? err.message : 'Failed to rename column',
                      );
                    },
                  },
                );
              }}
            >
              {tasks.map((t, i) => (
                <KanbanCard key={t.id} id={t.id} columnId={meta.id} index={i}>
                  <TaskCard
                    task={t as unknown as Parameters<typeof TaskCard>[0]['task']}
                    workspaceId={workspaceId}
                    onClick={() => handleCardOpen(t.id)}
                    onEdit={handleCardOpen}
                    onDelete={handleDelete}
                  />
                </KanbanCard>
              ))}
            </KanbanColumn>
          ))}
        </Kanban>
      )}

      <NewTaskModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setCreateColumnId(null);
        }}
        workspaceId={workspaceId}
        columns={modalColumns}
        defaultColumnId={createColumnId ?? orderedColumns[0]?.meta.id ?? ''}
        members={modalMembers}
      />

      <TaskEditModal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedTaskId(null);
        }}
        workspaceId={workspaceId}
        columns={modalColumns}
        members={modalMembers}
        initial={selectedTask as unknown as Parameters<typeof TaskEditModal>[0]['initial']}
      />
      {taskDelete.dialog}
    </div>
  );
}
