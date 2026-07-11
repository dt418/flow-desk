import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FOCUS_RING_CLASS } from '@/lib/a11y';
import { cn } from '@/lib/utils';

interface Sprint {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  totalPoints?: number;
  taskCount?: number;
}

interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export default function SprintPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const [name, setName] = useState('Sprint 1');
  const [selected, setSelected] = useState<string | null>(null);

  const sprints = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () => api<{ data: Sprint[] }>(`/workspaces/${workspaceId}/sprints`),
    enabled: Boolean(workspaceId),
  });

  const backlog = useQuery({
    queryKey: ['backlog', workspaceId],
    queryFn: () =>
      api<{ data: Array<{ id: string; title: string; estimate: number | null }> }>(
        `/workspaces/${workspaceId}/sprints/backlog`,
      ),
    enabled: Boolean(workspaceId),
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
          name,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 14 * 864e5).toISOString(),
        },
      }),
    onSuccess: () => {
      toast.success('Sprint created');
      qc.invalidateQueries({ queryKey: ['sprints', workspaceId] });
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
      qc.invalidateQueries({ queryKey: ['sprints', workspaceId] });
      qc.invalidateQueries({ queryKey: ['burndown'] });
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Sprints</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-4">
        <div className="space-y-1.5">
          <Label htmlFor="sprint-name">Name</Label>
          <Input
            id="sprint-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FOCUS_RING_CLASS}
          />
        </div>
        <Button
          className={cn(FOCUS_RING_CLASS)}
          aria-label="Create sprint"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          Create sprint
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Active / planned</h2>
          <ul className="space-y-2">
            {(sprints.data?.data ?? []).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-label={`Select sprint ${s.name}`}
                  className={cn(
                    'w-full rounded-md border border-border px-3 py-2 text-left text-sm',
                    FOCUS_RING_CLASS,
                    selected === s.id && 'border-primary bg-primary/5',
                  )}
                  onClick={() => setSelected(s.id)}
                >
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.status} · {s.taskCount ?? 0} tasks · {s.totalPoints ?? 0} pts
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Backlog (unassigned)</h2>
          <ul className="space-y-1">
            {(backlog.data?.data ?? []).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-sm"
              >
                <span>
                  {t.title}{' '}
                  <span className="text-xs text-muted-foreground">({t.estimate ?? '—'} pts)</span>
                </span>
                {selected && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Add ${t.title} to sprint`}
                    className={FOCUS_RING_CLASS}
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

      {selected && burndown.data && (
        <div className="rounded-lg border border-border p-4">
          <h2 className="mb-2 text-sm font-medium">Burndown</h2>
          <ul className="max-h-48 space-y-0.5 overflow-auto font-mono text-xs">
            {burndown.data.data.map((p) => (
              <li key={p.date}>
                {p.date}: remaining={p.remaining} ideal={p.ideal}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
