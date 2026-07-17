import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { FOCUS_RING_CLASS } from '@/lib/a11y';
import { cn } from '@/lib/utils';
import { PRIORITY_DOT } from '@/features/task/utils';
import { Trash2, Play, Square, Plus, Target, Calendar } from 'lucide-react';

interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string;
  endDate: string;
  totalPoints?: number;
  taskCount?: number;
  completedPoints?: number;
  completedTaskCount?: number;
}

interface SprintTask {
  id: string;
  title: string;
  estimate: number | null;
  status: string;
  priority: string;
}

interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

const STATUS_STYLE: Record<string, string> = {
  PLANNED: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  ACTIVE: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  CLOSED: 'bg-green-500/15 text-green-700 dark:text-green-300',
};

const STATUS_LABEL: Record<string, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
};

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
}

export default function SprintPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [cName, setCName] = useState('');
  const [cGoal, setCGoal] = useState('');
  const [cStart, setCStart] = useState(toIsoDate(new Date()));
  const [cEnd, setCEnd] = useState(toIsoDate(new Date(Date.now() + 14 * 864e5)));

  const sprints = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () => api<{ data: Sprint[] }>(`/api/workspaces/${workspaceId}/sprints`),
    enabled: Boolean(workspaceId),
  });

  const backlog = useQuery({
    queryKey: ['backlog', workspaceId],
    queryFn: () => api<{ data: SprintTask[] }>(`/api/workspaces/${workspaceId}/sprints/backlog`),
    enabled: Boolean(workspaceId),
  });

  const sprintTasks = useInfiniteQuery({
    queryKey: ['sprint-tasks', workspaceId, selected],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        workspaceId,
        limit: '50',
        sprintId: selected!,
      });
      if (typeof pageParam === 'string' && pageParam) params.set('cursor', pageParam);
      const res = await api<{ data: SprintTask[]; nextCursor: string | null }>(
        `/api/tasks?${params.toString()}`,
      );
      return {
        data: Array.isArray(res?.data) ? res.data : [],
        nextCursor: typeof res?.nextCursor === 'string' ? res.nextCursor : null,
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(selected),
  });

  const sprintTaskList = useMemo(
    () => (sprintTasks.data?.pages ?? []).flatMap((p) => p.data),
    [sprintTasks.data],
  );

  const burndown = useQuery({
    queryKey: ['burndown', selected],
    queryFn: () =>
      api<{ data: BurndownPoint[] }>(`/api/workspaces/${workspaceId}/sprints/${selected}/burndown`),
    enabled: Boolean(selected),
  });

  const create = useMutation({
    mutationFn: () =>
      api(`/api/workspaces/${workspaceId}/sprints`, {
        method: 'POST',
        json: {
          name: cName || 'New Sprint',
          goal: cGoal || undefined,
          startDate: `${cStart}T00:00:00.000Z`,
          endDate: `${cEnd}T23:59:59.999Z`,
        },
      }),
    onSuccess: () => {
      toast.success('Sprint created');
      qc.invalidateQueries({ queryKey: ['sprints', workspaceId] });
      setShowCreate(false);
      setCName('');
      setCGoal('');
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/api/workspaces/${workspaceId}/sprints/${id}`, {
        method: 'PATCH',
        json: { status },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints', workspaceId] });
    },
  });

  const deleteSprint = useMutation({
    mutationFn: (id: string) =>
      api(`/api/workspaces/${workspaceId}/sprints/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Sprint deleted');
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['sprints', workspaceId] });
      qc.invalidateQueries({ queryKey: ['backlog', workspaceId] });
    },
  });

  const assign = useMutation({
    mutationFn: ({ sprintId, taskId }: { sprintId: string; taskId: string }) =>
      api(`/api/workspaces/${workspaceId}/sprints/${sprintId}/tasks`, {
        method: 'POST',
        json: { taskId },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backlog', workspaceId] });
      qc.invalidateQueries({ queryKey: ['sprint-tasks', workspaceId, selected] });
      qc.invalidateQueries({ queryKey: ['sprints', workspaceId] });
      qc.invalidateQueries({ queryKey: ['burndown'] });
    },
  });

  const unassign = useMutation({
    mutationFn: ({ sprintId, taskId }: { sprintId: string; taskId: string }) =>
      api(`/api/workspaces/${workspaceId}/sprints/${sprintId}/tasks/${taskId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backlog', workspaceId] });
      qc.invalidateQueries({ queryKey: ['sprint-tasks', workspaceId, selected] });
      qc.invalidateQueries({ queryKey: ['sprints', workspaceId] });
      qc.invalidateQueries({ queryKey: ['burndown'] });
    },
  });

  const activeSprint = sprints.data?.data.find((s) => s.id === selected);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sprints</h1>
          <p className="text-sm text-muted-foreground">
            Plan and track your team's work in time-boxed iterations
          </p>
        </div>
        <Button
          size="sm"
          aria-label="Create new sprint"
          className={cn(FOCUS_RING_CLASS)}
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="mr-1 h-4 w-4" /> New sprint
        </Button>
      </div>

      {showCreate && (
        <Card className="overflow-visible">
          <CardContent className="pt-4 overflow-visible">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Sprint name</Label>
                  <Input
                    value={cName}
                    onChange={(e) => setCName(e.target.value)}
                    placeholder="Sprint 1"
                    className={FOCUS_RING_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Goal</Label>
                  <Input
                    value={cGoal}
                    onChange={(e) => setCGoal(e.target.value)}
                    placeholder="What will this sprint achieve?"
                    className={FOCUS_RING_CLASS}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Start date</Label>
                  <DatePicker
                    value={cStart}
                    onChange={(v) => v && setCStart(v)}
                    placeholder="Start"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End date</Label>
                  <DatePicker value={cEnd} onChange={(v) => v && setCEnd(v)} placeholder="End" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className={cn(FOCUS_RING_CLASS)}
                  onClick={() => create.mutate()}
                  disabled={create.isPending || !cName.trim()}
                >
                  Create sprint
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Sprint list */}
        <div className="lg:col-span-3">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sprints
          </h2>
          {sprints.data?.data.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No sprints yet"
              description="Create a sprint to start planning work for your team."
              action={
                <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                  <Plus className="mr-1 h-3 w-3" /> New sprint
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {(sprints.data?.data ?? []).map((s) => {
                const progress = s.totalPoints
                  ? ((s.completedPoints ?? 0) / s.totalPoints) * 100
                  : 0;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={cn(
                        'w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                        FOCUS_RING_CLASS,
                        selected === s.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50 hover:bg-muted/50',
                      )}
                      onClick={() => setSelected(s.id)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.name}</span>
                        <Badge className={cn('text-[10px]', STATUS_STYLE[s.status] ?? '')}>
                          {STATUS_LABEL[s.status] ?? s.status}
                        </Badge>
                      </div>
                      {s.goal && (
                        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {s.goal}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDateRange(s.startDate, s.endDate)}</span>
                      </div>
                      {s.totalPoints != null && s.totalPoints > 0 && (
                        <div className="mt-2">
                          <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                            <span>
                              {s.completedPoints ?? 0}/{s.totalPoints} pts
                            </span>
                            <span>{Math.round(progress)}%</span>
                          </div>
                          <Progress value={progress} className="h-1" />
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Sprint detail + tasks */}
        <div className="lg:col-span-5">
          {activeSprint ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{activeSprint.name}</h2>
                    {activeSprint.goal && (
                      <p className="mt-1 text-sm text-muted-foreground">{activeSprint.goal}</p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateRange(activeSprint.startDate, activeSprint.endDate)}
                      </span>
                    </div>
                  </div>
                  <Badge className={cn('text-[10px]', STATUS_STYLE[activeSprint.status] ?? '')}>
                    {STATUS_LABEL[activeSprint.status] ?? activeSprint.status}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {activeSprint.status === 'PLANNED' && (
                    <Button
                      size="sm"
                      variant="default"
                      className={cn(FOCUS_RING_CLASS)}
                      onClick={() => updateStatus.mutate({ id: activeSprint.id, status: 'ACTIVE' })}
                    >
                      <Play className="mr-1 h-3 w-3" /> Start sprint
                    </Button>
                  )}
                  {activeSprint.status === 'ACTIVE' && (
                    <Button
                      size="sm"
                      variant="default"
                      className={cn(FOCUS_RING_CLASS)}
                      onClick={() => updateStatus.mutate({ id: activeSprint.id, status: 'CLOSED' })}
                    >
                      <Square className="mr-1 h-3 w-3" /> Close sprint
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(FOCUS_RING_CLASS, 'text-destructive hover:text-destructive')}
                    onClick={() => {
                      if (confirm(`Delete sprint "${activeSprint.name}"?`))
                        deleteSprint.mutate(activeSprint.id);
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Tasks in {activeSprint.name}
                </h3>
                {sprintTaskList.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                    No tasks in this sprint. Add tasks from the backlog.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {sprintTaskList.map((t) => (
                      <li
                        key={t.id}
                        className="group flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              'h-1.5 w-1.5 shrink-0 rounded-full',
                              PRIORITY_DOT[t.priority] ?? 'bg-muted-foreground',
                            )}
                          />
                          <span className="truncate">{t.title}</span>
                          {t.estimate != null && (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                              {t.estimate} pts
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 text-destructive"
                          onClick={() => unassign.mutate({ sprintId: selected!, taskId: t.id })}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {sprintTasks.hasNextPage ? (
                  <div className="mt-2 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={sprintTasks.isFetchingNextPage}
                      onClick={() => void sprintTasks.fetchNextPage()}
                    >
                      {sprintTasks.isFetchingNextPage ? 'Loading…' : 'Load more tasks'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border py-16">
              <p className="text-sm text-muted-foreground">Select a sprint to manage</p>
            </div>
          )}
        </div>

        {/* Backlog */}
        <div className="lg:col-span-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Backlog (unassigned)
          </h3>
          {backlog.data?.data.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              All tasks are assigned to sprints
            </div>
          ) : (
            <ul className="space-y-1 max-h-[600px] overflow-auto">
              {(backlog.data?.data ?? []).map((t) => (
                <li
                  key={t.id}
                  className="group flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        PRIORITY_DOT[t.priority] ?? 'bg-muted-foreground',
                      )}
                    />
                    <span className="truncate">{t.title}</span>
                    {t.estimate != null && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {t.estimate} pts
                      </Badge>
                    )}
                  </div>
                  {selected && (
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn(
                        FOCUS_RING_CLASS,
                        'h-6 px-2 text-xs opacity-0 group-hover:opacity-100',
                      )}
                      onClick={() => assign.mutate({ sprintId: selected, taskId: t.id })}
                    >
                      Add
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Burndown chart */}
      {selected && burndown.data && burndown.data.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Burndown</CardTitle>
          </CardHeader>
          <CardContent>
            <BurndownChart data={burndown.data.data} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BurndownChart({ data }: { data: BurndownPoint[] }) {
  const W = 700;
  const H = 220;
  const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxPts = Math.max(...data.map((d) => Math.max(d.remaining, d.ideal)), 1);

  function x(i: number) {
    return PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
  }
  function y(v: number) {
    return PAD.top + chartH - (v / maxPts) * chartH;
  }

  const idealPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.ideal)}`).join(' ');
  const remainPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.remaining)}`)
    .join(' ');

  const gridLines = 5;
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) =>
    Math.round((maxPts / gridLines) * i),
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-xs">
      {/* Grid lines */}
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            y1={y(tick)}
            x2={W - PAD.right}
            y2={y(tick)}
            className="stroke-border"
            strokeWidth="0.5"
          />
          <text
            x={PAD.left - 8}
            y={y(tick) + 3}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            {tick}
          </text>
        </g>
      ))}

      {/* Ideal line */}
      <path
        d={idealPath}
        fill="none"
        stroke="currentColor"
        className="text-muted-foreground/30"
        strokeWidth="1.5"
        strokeDasharray="4 2"
      />

      {/* Actual area fill */}
      <path
        d={`${remainPath} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`}
        fill="currentColor"
        className="text-primary/10"
      />

      {/* Actual line */}
      <path
        d={remainPath}
        fill="none"
        stroke="currentColor"
        className="text-primary"
        strokeWidth="2"
      />

      {/* Dots */}
      {data.map((d, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(d.remaining)}
          r="3.5"
          className="fill-primary stroke-background"
          strokeWidth="1.5"
        />
      ))}

      {/* X-axis labels */}
      {data
        .filter((_, i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1)
        .map((d, i) => (
          <text
            key={i}
            x={x(data.indexOf(d))}
            y={H - 12}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {d.date.slice(5)}
          </text>
        ))}

      {/* Axis labels */}
      <text x={W / 2} y={H - 2} textAnchor="middle" className="fill-muted-foreground text-[10px]">
        Date
      </text>
      <text
        x={12}
        y={H / 2}
        textAnchor="middle"
        transform={`rotate(-90, 12, ${H / 2})`}
        className="fill-muted-foreground text-[10px]"
      >
        Points
      </text>
    </svg>
  );
}
