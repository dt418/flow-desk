import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { FOCUS_RING_CLASS } from '@/lib/a11y';
import { cn } from '@/lib/utils';
import { Trash2, Play, Square, Plus } from 'lucide-react';

interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string;
  endDate: string;
  totalPoints?: number;
  taskCount?: number;
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

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function SprintPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [cName, setCName] = useState('');
  const [cGoal, setCGoal] = useState('');
  const [cStart, setCStart] = useState(toIsoDate(new Date()));
  const [cEnd, setCEnd] = useState(toIsoDate(new Date(Date.now() + 14 * 864e5)));

  const sprints = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () => api<{ data: Sprint[] }>(`/workspaces/${workspaceId}/sprints`),
    enabled: Boolean(workspaceId),
  });

  const backlog = useQuery({
    queryKey: ['backlog', workspaceId],
    queryFn: () => api<{ data: SprintTask[] }>(`/workspaces/${workspaceId}/sprints/backlog`),
    enabled: Boolean(workspaceId),
  });

  // Tasks in selected sprint
  const sprintTasks = useQuery({
    queryKey: ['sprint-tasks', workspaceId, selected],
    queryFn: () =>
      api<{ data: SprintTask[] }>(
        `/tasks?workspaceId=${workspaceId}&limit=100&sprintId=${selected}`,
      ),
    enabled: Boolean(selected),
  });

  const burndown = useQuery({
    queryKey: ['burndown', selected],
    queryFn: () =>
      api<{ data: BurndownPoint[] }>(`/workspaces/${workspaceId}/sprints/${selected}/burndown`),
    enabled: Boolean(selected),
  });

  const create = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/sprints`, {
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
      api(`/workspaces/${workspaceId}/sprints/${id}`, {
        method: 'PATCH',
        json: { status },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints', workspaceId] });
    },
  });

  const deleteSprint = useMutation({
    mutationFn: (id: string) =>
      api(`/workspaces/${workspaceId}/sprints/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Sprint deleted');
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['sprints', workspaceId] });
      qc.invalidateQueries({ queryKey: ['backlog', workspaceId] });
    },
  });

  const assign = useMutation({
    mutationFn: ({ sprintId, taskId }: { sprintId: string; taskId: string }) =>
      api(`/workspaces/${workspaceId}/sprints/${sprintId}/tasks`, {
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
      api(`/workspaces/${workspaceId}/sprints/${sprintId}/tasks/${taskId}`, {
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
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sprints</h1>
        <Button
          size="sm"
          className={cn(FOCUS_RING_CLASS)}
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="mr-1 h-4 w-4" /> New sprint
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="space-y-3 rounded-lg border border-border p-4">
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
              <DatePicker value={cStart} onChange={(v) => v && setCStart(v)} placeholder="Start" />
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
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {/* Sprint list */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Sprints</h2>
          <ul className="space-y-2">
            {(sprints.data?.data ?? []).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full rounded-md border border-border px-3 py-2 text-left text-sm',
                    FOCUS_RING_CLASS,
                    selected === s.id && 'border-primary bg-primary/5',
                  )}
                  onClick={() => setSelected(s.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.name}</span>
                    <Badge className={cn('text-[10px]', STATUS_STYLE[s.status] ?? '')}>
                      {s.status}
                    </Badge>
                  </div>
                  {s.goal && (
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">{s.goal}</div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {s.taskCount ?? 0} tasks · {s.totalPoints ?? 0} pts
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Sprint actions + tasks in sprint */}
        <div className="space-y-3">
          {activeSprint ? (
            <>
              <div className="flex flex-wrap gap-2">
                {activeSprint.status === 'PLANNED' && (
                  <Button
                    size="sm"
                    variant="default"
                    className={cn(FOCUS_RING_CLASS)}
                    onClick={() => updateStatus.mutate({ id: activeSprint.id, status: 'ACTIVE' })}
                  >
                    <Play className="mr-1 h-3 w-3" /> Start
                  </Button>
                )}
                {activeSprint.status === 'ACTIVE' && (
                  <Button
                    size="sm"
                    variant="default"
                    className={cn(FOCUS_RING_CLASS)}
                    onClick={() => updateStatus.mutate({ id: activeSprint.id, status: 'CLOSED' })}
                  >
                    <Square className="mr-1 h-3 w-3" /> Close
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  className={cn(FOCUS_RING_CLASS)}
                  onClick={() => {
                    if (confirm(`Delete sprint "${activeSprint.name}"?`))
                      deleteSprint.mutate(activeSprint.id);
                  }}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Delete
                </Button>
              </div>

              <h2 className="text-sm font-medium text-muted-foreground">
                Tasks in {activeSprint.name}
              </h2>
              <ul className="space-y-1">
                {(sprintTasks.data?.data ?? []).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-sm"
                  >
                    <span className="truncate">
                      {t.title}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({t.estimate ?? '—'} pts)
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-destructive"
                      onClick={() => unassign.mutate({ sprintId: selected!, taskId: t.id })}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
                {(sprintTasks.data?.data ?? []).length === 0 && (
                  <li className="text-xs text-muted-foreground">No tasks in this sprint</li>
                )}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a sprint to manage</p>
          )}
        </div>

        {/* Backlog */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Backlog (unassigned)</h2>
          <ul className="space-y-1">
            {(backlog.data?.data ?? []).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-sm"
              >
                <span className="truncate">
                  {t.title}{' '}
                  <span className="text-xs text-muted-foreground">({t.estimate ?? '—'} pts)</span>
                </span>
                {selected && (
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn(FOCUS_RING_CLASS, 'h-6 px-2 text-xs')}
                    onClick={() => assign.mutate({ sprintId: selected, taskId: t.id })}
                  >
                    Add
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Burndown chart */}
      {selected && burndown.data && burndown.data.data.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-3 text-sm font-medium">Burndown</h2>
          <BurndownChart data={burndown.data.data} />
        </div>
      )}
    </div>
  );
}

/** Simple SVG burndown chart */
function BurndownChart({ data }: { data: BurndownPoint[] }) {
  const W = 600;
  const H = 200;
  const PAD = 40;
  const maxPts = Math.max(...data.map((d) => Math.max(d.remaining, d.ideal)), 1);

  function x(i: number) {
    return PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
  }
  function y(v: number) {
    return H - PAD - (v / maxPts) * (H - PAD * 2);
  }

  const idealPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.ideal)}`).join(' ');
  const remainPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.remaining)}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-xs">
      {/* Ideal line */}
      <path
        d={idealPath}
        fill="none"
        stroke="currentColor"
        className="text-muted-foreground/40"
        strokeWidth="1.5"
        strokeDasharray="4 2"
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
        <circle key={i} cx={x(i)} cy={y(d.remaining)} r="3" className="fill-primary" />
      ))}
      {/* Y-axis labels */}
      <text x={PAD - 4} y={y(maxPts) + 4} textAnchor="end" className="fill-muted-foreground">
        {maxPts}
      </text>
      <text x={PAD - 4} y={y(0) + 4} textAnchor="end" className="fill-muted-foreground">
        0
      </text>
      {/* X-axis labels */}
      {data
        .filter((_, i) => i % Math.ceil(data.length / 6) === 0 || i === data.length - 1)
        .map((d, i) => (
          <text
            key={i}
            x={x(data.indexOf(d))}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted-foreground"
          >
            {d.date.slice(5)}
          </text>
        ))}
    </svg>
  );
}
