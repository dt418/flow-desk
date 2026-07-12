import { useMemo, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { CalendarDays, Plus, User, Calendar, Clock, FileText } from 'lucide-react';
import { addMonths, buildMonthGrid, buildWeekGrid, dueDateKey } from '../utils/date-grid';
import { FOCUS_RING_CLASS } from '@/lib/a11y';
import { cn } from '@/lib/utils';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ──────────────────────── types ──────────────────────── */

interface CalTask {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string | null;
  startDate: string | null;
  color: string | null;
  status: string;
  priority: string;
  type?: string;
  assigneeId?: string | null;
  assignee?: { id: string; name: string; email: string; avatarUrl?: string | null } | null;
}

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

/* ──────────────────────── constants ──────────────────────── */

const COLOR_PRESETS: { label: string; value: string; bg: string; text: string }[] = [
  { label: 'Blue', value: 'blue', bg: 'bg-blue-500', text: 'text-white' },
  { label: 'Purple', value: 'purple', bg: 'bg-purple-500', text: 'text-white' },
  { label: 'Green', value: 'green', bg: 'bg-emerald-500', text: 'text-white' },
  { label: 'Yellow', value: 'yellow', bg: 'bg-amber-500', text: 'text-white' },
  { label: 'Red', value: 'red', bg: 'bg-red-500', text: 'text-white' },
  { label: 'Pink', value: 'pink', bg: 'bg-pink-500', text: 'text-white' },
  { label: 'Indigo', value: 'indigo', bg: 'bg-indigo-500', text: 'text-white' },
  { label: 'Orange', value: 'orange', bg: 'bg-orange-500', text: 'text-white' },
];

const COLOR_MAP: Record<string, { bg: string; text: string; chip: string }> = {
  blue: { bg: 'bg-blue-500', text: 'text-white', chip: 'bg-blue-500/90 text-white' },
  purple: { bg: 'bg-purple-500', text: 'text-white', chip: 'bg-purple-500/90 text-white' },
  green: { bg: 'bg-emerald-500', text: 'text-white', chip: 'bg-emerald-500/90 text-white' },
  yellow: { bg: 'bg-amber-500', text: 'text-white', chip: 'bg-amber-500/90 text-white' },
  red: { bg: 'bg-red-500', text: 'text-white', chip: 'bg-red-500/90 text-white' },
  pink: { bg: 'bg-pink-500', text: 'text-white', chip: 'bg-pink-500/90 text-white' },
  indigo: { bg: 'bg-indigo-500', text: 'text-white', chip: 'bg-indigo-500/90 text-white' },
  orange: { bg: 'bg-orange-500', text: 'text-white', chip: 'bg-orange-500/90 text-white' },
};

const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

const MAX_VISIBLE = 3;

function getChipColor(color: string | null, priority: string): string {
  if (color && COLOR_MAP[color]) return COLOR_MAP[color].chip;
  return COLOR_MAP[priority === 'URGENT' ? 'red' : priority === 'HIGH' ? 'orange' : 'blue'].chip;
}

function getColorValue(color: string | null): string {
  if (color && COLOR_MAP[color]) return color;
  return 'blue';
}

/* ──────────────────────── main component ──────────────────────── */

export function CalendarPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const [anchor, setAnchor] = useState(() => new Date());
  const [mode, setMode] = useState<ViewMode>('month');
  const [selectedTask, setSelectedTask] = useState<CalTask | null>(null);
  const [editingTask, setEditingTask] = useState<CalTask | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createDate, setCreateDate] = useState<string>('');
  const qc = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['calendar-tasks', workspaceId],
    queryFn: () => api<{ data: CalTask[] }>(`/api/tasks?workspaceId=${workspaceId}&limit=100`),
    enabled: Boolean(workspaceId),
  });

  const createTask = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/api/tasks', { method: 'POST', json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-tasks', workspaceId] });
      setShowCreate(false);
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api(`/api/tasks/${id}`, { method: 'PATCH', json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-tasks', workspaceId] });
      setEditingTask(null);
      setSelectedTask(null);
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-tasks', workspaceId] });
      setSelectedTask(null);
      setEditingTask(null);
    },
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

  const totalEvents = useMemo(() => {
    const month = anchor.getUTCMonth();
    const year = anchor.getUTCFullYear();
    return (tasksQuery.data?.data ?? []).filter((t) => {
      const key = dueDateKey(t.dueDate);
      if (!key) return false;
      const d = new Date(`${key}T00:00:00Z`);
      return d.getUTCMonth() === month && d.getUTCFullYear() === year;
    }).length;
  }, [tasksQuery.data, anchor]);

  const onDropTask = useCallback(
    (taskId: string, iso: string) => {
      updateTask.mutate({ id: taskId, dueDate: `${iso}T12:00:00.000Z` });
    },
    [updateTask],
  );

  const openCreate = useCallback((iso?: string) => {
    setCreateDate(iso ?? new Date().toISOString().slice(0, 10));
    setShowCreate(true);
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-border bg-card">
            <span className="text-[10px] font-medium uppercase text-muted-foreground leading-none">
              {anchor.toLocaleString('en', { month: 'short', timeZone: 'UTC' })}
            </span>
            <span className="text-lg font-bold leading-tight">{anchor.getUTCDate()}</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {anchor.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </h1>
            <p className="text-xs text-muted-foreground">{totalEvents} events</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <div className="flex items-center rounded-lg border border-border">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-r-none px-2"
              onClick={() =>
                setAnchor((a) =>
                  mode === 'month' ? addMonths(a, -1) : addDaysLocal(a, mode === 'week' ? -7 : -1),
                )
              }
            >
              ‹
            </Button>
            <div className="px-2 text-xs font-medium text-muted-foreground">
              {mode === 'month'
                ? `${anchor.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} 1 – ${new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate()}`
                : anchor.toLocaleString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-l-none px-2"
              onClick={() =>
                setAnchor((a) =>
                  mode === 'month' ? addMonths(a, 1) : addDaysLocal(a, mode === 'week' ? 7 : 1),
                )
              }
            >
              ›
            </Button>
          </div>
          <div className="flex items-center rounded-lg border border-border">
            {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((m, i) => (
              <Button
                key={m}
                size="sm"
                variant="ghost"
                className={cn(
                  'h-8 rounded-none px-3 capitalize text-xs',
                  i > 0 && 'border-l border-border',
                  mode === m && 'bg-primary/10 text-primary font-medium',
                )}
                onClick={() => setMode(m)}
              >
                {m}
              </Button>
            ))}
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            Add Event
          </Button>
        </div>
      </div>

      {/* Loading */}
      {tasksQuery.isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading tasks...</div>
        </div>
      )}

      {/* Error */}
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

      {/* Month/week/day grid */}
      {!tasksQuery.isLoading && !tasksQuery.isError && mode !== 'agenda' && (
        <Card className="flex-1 overflow-hidden">
          <div
            className={cn(
              mode === 'day' ? 'grid grid-cols-1 gap-2 p-2' : 'grid grid-cols-7 gap-px bg-border',
            )}
          >
            {mode !== 'day' &&
              ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div
                  key={d}
                  className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
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
                    'min-h-28 bg-card p-1 transition-colors hover:bg-accent/20 cursor-pointer',
                    !day.inMonth && 'opacity-30',
                    day.isToday && 'ring-2 ring-inset ring-primary/40 bg-primary/5',
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const taskId = e.dataTransfer.getData('text/task-id');
                    if (taskId) onDropTask(taskId, day.iso);
                  }}
                  onClick={() => openCreate(day.iso)}
                >
                  <div
                    className={cn(
                      'mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      day.isToday && 'bg-primary text-primary-foreground',
                      !day.isToday && 'text-muted-foreground',
                    )}
                  >
                    {day.date.getUTCDate()}
                  </div>
                  <ul className="space-y-px">
                    {visible.map((t) => (
                      <li
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.setData('text/task-id', t.id);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTask(t);
                        }}
                        className={cn(
                          'flex cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors hover:opacity-90',
                          getChipColor(t.color, t.priority),
                        )}
                        title={t.title}
                      >
                        <span className="truncate">{t.title}</span>
                        {t.startDate && (
                          <span className="ml-auto shrink-0 text-[9px] opacity-80">
                            {new Date(t.startDate).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              timeZone: 'UTC',
                            })}
                          </span>
                        )}
                      </li>
                    ))}
                    {overflow > 0 && (
                      <li className="px-1 text-[10px] font-medium text-muted-foreground">
                        +{overflow} more...
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* View task modal */}
      {selectedTask && !editingTask && (
        <TaskViewModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={() => setEditingTask(selectedTask)}
          onDelete={() => deleteTask.mutate(selectedTask.id)}
          isDeleting={deleteTask.isPending}
        />
      )}

      {/* Edit task modal */}
      {editingTask && (
        <TaskFormModal
          workspaceId={workspaceId}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSubmit={(body) => updateTask.mutate({ id: editingTask.id, ...body })}
          isPending={updateTask.isPending}
        />
      )}

      {/* Create task modal */}
      {showCreate && (
        <TaskFormModal
          workspaceId={workspaceId}
          defaultDate={createDate}
          onClose={() => setShowCreate(false)}
          onSubmit={(body) =>
            createTask.mutate({
              workspaceId,
              columnId: '', // will be resolved server-side or needs default
              title: body.title,
              description: body.description,
              startDate: body.startDate,
              dueDate: body.dueDate,
              color: body.color,
              assigneeId: body.assigneeId,
            })
          }
          isPending={createTask.isPending}
        />
      )}
    </div>
  );
}

/* ──────────────────────── helpers ──────────────────────── */

function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/* ──────────────────────── Task View Modal ──────────────────────── */

function TaskViewModal({
  task,
  onClose,
  onEdit,
  onDelete,
  isDeleting,
}: {
  task: CalTask;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Responsible</p>
              <p className="font-medium">{task.assignee?.name ?? 'Unassigned'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Start Date</p>
              <p className="font-medium">{formatDateTime(task.startDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">End Date</p>
              <p className="font-medium">{formatDateTime(task.dueDate)}</p>
            </div>
          </div>
          {task.description && (
            <div className="flex items-start gap-3 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="whitespace-pre-wrap">{task.description}</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────── Task Form Modal ──────────────────────── */

interface TaskFormValues {
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  startTime: string;
  endTime: string;
  color: string;
  assigneeId: string;
}

function TaskFormModal({
  workspaceId,
  task,
  defaultDate,
  onClose,
  onSubmit,
  isPending,
}: {
  workspaceId: string;
  task?: CalTask;
  defaultDate?: string;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const isEdit = Boolean(task);

  const [form, setForm] = useState<TaskFormValues>(() => {
    if (task) {
      const sd = task.startDate ? new Date(task.startDate) : null;
      const dd = task.dueDate ? new Date(task.dueDate) : null;
      return {
        title: task.title,
        description: task.description ?? '',
        startDate: sd ? sd.toISOString().slice(0, 10) : '',
        dueDate: dd ? dd.toISOString().slice(0, 10) : '',
        startTime: sd
          ? `${String(sd.getUTCHours()).padStart(2, '0')}:${String(sd.getUTCMinutes()).padStart(2, '0')}`
          : '09:00',
        endTime: dd
          ? `${String(dd.getUTCHours()).padStart(2, '0')}:${String(dd.getUTCMinutes()).padStart(2, '0')}`
          : '10:00',
        color: getColorValue(task.color),
        assigneeId: task.assigneeId ?? '',
      };
    }
    return {
      title: '',
      description: '',
      startDate: defaultDate ?? new Date().toISOString().slice(0, 10),
      dueDate: defaultDate ?? new Date().toISOString().slice(0, 10),
      startTime: '09:00',
      endTime: '10:00',
      color: 'blue',
      assigneeId: '',
    };
  });

  const usersQuery = useQuery({
    queryKey: ['workspace-users', workspaceId],
    queryFn: () =>
      api<{ data: { user: { id: string; name: string } }[] }>(
        `/api/workspaces/${workspaceId}/members`,
      ),
    enabled: Boolean(workspaceId),
    select: (res) => res.data.map((m) => m.user),
  });

  const set = <K extends keyof TaskFormValues>(key: K, val: TaskFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;

    const startIso =
      form.startDate && form.startTime ? `${form.startDate}T${form.startTime}:00.000Z` : null;
    const endIso = form.dueDate && form.endTime ? `${form.dueDate}T${form.endTime}:00.000Z` : null;

    onSubmit({
      title: form.title.trim(),
      description: form.description.trim() || null,
      startDate: startIso,
      dueDate: endIso,
      color: form.color,
      assigneeId: form.assigneeId || null,
    });
  }

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Event' : 'Add New Event'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Responsible */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Responsible</Label>
            <Select
              value={form.assigneeId || undefined}
              onValueChange={(v) => set('assigneeId', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {(usersQuery.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Enter a title"
              className={FOCUS_RING_CLASS}
              autoFocus
            />
          </div>

          {/* Start Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Start Date</Label>
              <DatePicker
                value={form.startDate || null}
                onChange={(v) => set('startDate', v ?? new Date().toISOString().slice(0, 10))}
                placeholder="Pick a date"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Start Time</Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => set('startTime', e.target.value)}
                className={FOCUS_RING_CLASS}
              />
            </div>
          </div>

          {/* End Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">End Date</Label>
              <DatePicker
                value={form.dueDate || null}
                onChange={(v) => set('dueDate', v ?? new Date().toISOString().slice(0, 10))}
                placeholder="Pick a date"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">End Time</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => set('endTime', e.target.value)}
                className={FOCUS_RING_CLASS}
              />
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Color</Label>
            <div className="flex gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => set('color', c.value)}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform hover:scale-110',
                    c.bg,
                    form.color === c.value && 'ring-2 ring-offset-2 ring-foreground/30',
                  )}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description</Label>
            <textarea
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                set('description', e.target.value)
              }
              placeholder="Add a description..."
              rows={3}
              className={cn(
                'flex w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm',
                'placeholder:text-muted-foreground',
                FOCUS_RING_CLASS,
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending || !form.title.trim()}>
              {isPending ? 'Saving...' : isEdit ? 'Save changes' : 'Create Event'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────── Agenda view ──────────────────────── */

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

  if (groups.length === 0) {
    return (
      <Card className="flex-1">
        <CardContent className="flex items-center justify-center py-20">
          <EmptyState
            icon={CalendarDays}
            title="No tasks this month"
            description="Tasks with due dates will appear here"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-auto">
      {groups.map((g) => (
        <div key={g.iso} className="space-y-2">
          <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 py-2 backdrop-blur">
            <p className="text-sm font-semibold">
              {g.date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </p>
            <Badge variant="secondary" className="text-[10px]">
              {g.tasks.length}
            </Badge>
          </div>
          <div className="space-y-1.5 pl-1">
            {g.tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t)}
                className="group relative flex w-full items-start gap-3 rounded-md border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-accent/50"
              >
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 w-[3px] rounded-l-md',
                    PRIORITY_COLOR[t.priority] ?? 'bg-transparent',
                  )}
                />
                <div className="min-w-0 flex-1 pl-2">
                  <div className="font-medium text-foreground">{t.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {t.startDate
                        ? new Date(t.startDate).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'UTC',
                          })
                        : ''}
                    </Badge>
                    {t.assignee && (
                      <span className="text-[10px] text-muted-foreground">{t.assignee.name}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CalendarPage;
