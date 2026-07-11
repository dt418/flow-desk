import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { addMonths, buildMonthGrid, buildWeekGrid, dueDateKey } from '../utils/date-grid';
import { STATUS_TONE } from '@/features/task/utils';
import { cn } from '@/lib/utils';

interface CalTask {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  priority: string;
  type?: string;
}

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

const TYPE_ICON: Record<string, string> = {
  EPIC: '📦',
  STORY: '📖',
  SUBTASK: '🔗',
  TASK: '',
};

const MAX_VISIBLE = 3;

export function CalendarPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const [anchor, setAnchor] = useState(() => new Date());
  const [mode, setMode] = useState<ViewMode>('month');
  const [selectedTask, setSelectedTask] = useState<CalTask | null>(null);
  const qc = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['calendar-tasks', workspaceId],
    queryFn: () => api<{ data: CalTask[] }>(`/api/tasks?workspaceId=${workspaceId}&limit=100`),
    enabled: Boolean(workspaceId),
  });

  const updateDue = useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string }) =>
      api(`/api/tasks/${id}`, {
        method: 'PATCH',
        json: { dueDate },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-tasks', workspaceId] }),
  });

  const days = useMemo(() => {
    if (mode === 'week') return buildWeekGrid(anchor);
    if (mode === 'day') {
      const iso = anchor.toISOString().slice(0, 10);
      return [
        {
          date: anchor,
          iso,
          inMonth: true,
          isToday: iso === new Date().toISOString().slice(0, 10),
        },
      ];
    }
    return buildMonthGrid(anchor);
  }, [anchor, mode]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalTask[]>();
    for (const t of tasksQuery.data?.data ?? []) {
      const key = dueDateKey(t.dueDate);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [tasksQuery.data]);

  function onDropTask(taskId: string, iso: string) {
    updateDue.mutate({ id: taskId, dueDate: `${iso}T12:00:00.000Z` });
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Calendar</h1>
          <span className="text-sm text-muted-foreground">
            {anchor.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setAnchor((a) =>
                mode === 'month' ? addMonths(a, -1) : addDaysLocal(a, mode === 'week' ? -7 : -1),
              )
            }
          >
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setAnchor((a) =>
                mode === 'month' ? addMonths(a, 1) : addDaysLocal(a, mode === 'week' ? 7 : 1),
              )
            }
          >
            Next
          </Button>
          {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? 'default' : 'outline'}
              onClick={() => setMode(m)}
            >
              {m}
            </Button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {tasksQuery.isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading tasks...</div>
        </div>
      )}

      {/* Error state */}
      {tasksQuery.isError && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-destructive">Failed to load tasks</div>
        </div>
      )}

      {/* Agenda view */}
      {!tasksQuery.isLoading && !tasksQuery.isError && mode === 'agenda' && (
        <AgendaView
          tasks={tasksQuery.data?.data ?? []}
          anchor={anchor}
          onSelect={setSelectedTask}
        />
      )}

      {/* Calendar grid */}
      {!tasksQuery.isLoading && !tasksQuery.isError && mode !== 'agenda' && (
        <div
          className={
            mode === 'day'
              ? 'grid grid-cols-1 gap-2'
              : 'grid grid-cols-7 gap-px overflow-auto rounded-lg border border-border bg-border'
          }
        >
          {mode !== 'day' &&
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                className="bg-muted/50 px-2 py-1 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          {days.map((day) => {
            const dayTasks = byDay.get(day.iso) ?? [];
            const visible = dayTasks.slice(0, MAX_VISIBLE);
            const overflow = dayTasks.length - MAX_VISIBLE;
            return (
              <div
                key={day.iso}
                className={cn(
                  'min-h-24 bg-card p-1',
                  !day.inMonth && 'opacity-40',
                  day.isToday && 'ring-1 ring-primary',
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const taskId = e.dataTransfer.getData('text/task-id');
                  if (taskId) onDropTask(taskId, day.iso);
                }}
              >
                <div className="text-xs font-medium text-muted-foreground">
                  {day.date.getUTCDate()}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {visible.map((t) => (
                    <li
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
                      onClick={() => setSelectedTask(t)}
                      className={cn(
                        'flex cursor-pointer items-center gap-1 truncate rounded px-1 py-0.5 text-xs hover:bg-primary/20',
                        'bg-primary/10',
                      )}
                      title={`${t.title} (${t.priority})`}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          PRIORITY_DOT[t.priority] ?? 'bg-gray-400',
                        )}
                      />
                      <span className="truncate">{t.title}</span>
                    </li>
                  ))}
                  {overflow > 0 && (
                    <li className="px-1 text-[10px] text-muted-foreground">+{overflow} more</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Task detail panel */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-card p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span>{TYPE_ICON[selectedTask.type ?? 'TASK']}</span>
                  <h3 className="text-lg font-semibold">{selectedTask.title}</h3>
                </div>
                <div className="mt-2 flex gap-2">
                  <Badge variant="outline" className="text-xs">
                    {selectedTask.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {selectedTask.priority}
                  </Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Due:{' '}
                  {selectedTask.dueDate
                    ? new Date(selectedTask.dueDate).toLocaleDateString()
                    : 'No due date'}
                </div>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/* ------------------------------------------------------------------ */
/*  Agenda view — vertical day-grouped list (à la big-calendar)       */
/* ------------------------------------------------------------------ */

interface AgendaDayGroup {
  iso: string;
  date: Date;
  tasks: CalTask[];
}

function buildAgendaGroups(tasks: CalTask[], anchor: Date): AgendaDayGroup[] {
  const month = anchor.getUTCMonth();
  const year = anchor.getUTCFullYear();
  const map = new Map<string, AgendaDayGroup>();

  for (const t of tasks) {
    const key = dueDateKey(t.dueDate);
    if (!key) continue;
    const d = new Date(`${key}T00:00:00Z`);
    // Only show tasks in the anchored month
    if (d.getUTCMonth() !== month || d.getUTCFullYear() !== year) continue;
    if (!map.has(key)) map.set(key, { iso: key, date: d, tasks: [] });
    map.get(key)!.tasks.push(t);
  }

  return Array.from(map.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((g) => ({
      ...g,
      tasks: g.tasks.sort(
        (a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
      ),
    }));
}

const PRIORITY_BAR: Record<string, string> = {
  LOW: 'bg-slate-300 dark:bg-slate-600',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

const TYPE_LABEL: Record<string, string> = {
  EPIC: 'Epic',
  STORY: 'Story',
  SUBTASK: 'Subtask',
  TASK: 'Task',
};

function AgendaView({
  tasks,
  anchor,
  onSelect,
}: {
  tasks: CalTask[];
  anchor: Date;
  onSelect: (t: CalTask) => void;
}) {
  const groups = useMemo(() => buildAgendaGroups(tasks, anchor), [tasks, anchor]);
  const totalTasks = groups.reduce((n, g) => n + g.tasks.length, 0);

  return (
    <div className="flex-1 overflow-auto rounded-lg border border-border">
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
          <span className="text-3xl">📅</span>
          <p className="text-sm">No tasks with due dates this month</p>
        </div>
      ) : (
        <div className="space-y-6 p-4">
          <p className="text-xs text-muted-foreground">
            {totalTasks} task{totalTasks !== 1 ? 's' : ''} across {groups.length} day
            {groups.length !== 1 ? 's' : ''}
          </p>
          {groups.map((g) => (
            <div key={g.iso} className="space-y-2">
              {/* Sticky day header */}
              <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/95 py-2 backdrop-blur">
                <p className="text-sm font-semibold">
                  {g.date.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {g.tasks.length}
                </span>
              </div>
              {/* Task cards */}
              <div className="space-y-1.5 pl-1">
                {g.tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t)}
                    className={cn(
                      'group relative flex w-full items-start gap-3 rounded-md border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-accent/50',
                    )}
                  >
                    {/* Priority bar */}
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0 w-[3px] rounded-l-md',
                        PRIORITY_BAR[t.priority] ?? 'bg-transparent',
                      )}
                    />
                    <div className="min-w-0 flex-1 pl-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{t.title}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'border-transparent text-[10px]',
                            STATUS_TONE[t.status] ?? '',
                          )}
                        >
                          {t.status.replace('_', ' ')}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {TYPE_LABEL[t.type ?? 'TASK']}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(t.dueDate!).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'UTC',
                          })}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CalendarPage;
