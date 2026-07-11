import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { addMonths, buildMonthGrid, buildWeekGrid, dueDateKey } from '../utils/date-grid';

interface CalTask {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  priority: string;
}

type ViewMode = 'month' | 'week' | 'day';

export function CalendarPage() {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const [anchor, setAnchor] = useState(() => new Date());
  const [mode, setMode] = useState<ViewMode>('month');
  const qc = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ['calendar-tasks', workspaceId],
    queryFn: () => api<{ data: CalTask[] }>(`/tasks?workspaceId=${workspaceId}&limit=100`),
    enabled: Boolean(workspaceId),
  });

  const updateDue = useMutation({
    mutationFn: ({ id, dueDate }: { id: string; dueDate: string }) =>
      api(`/tasks/${id}`, {
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
    // noon UTC to avoid timezone day shifts
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
          {(['month', 'week', 'day'] as ViewMode[]).map((m) => (
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
        {days.map((day) => (
          <div
            key={day.iso}
            className={`min-h-24 bg-card p-1 ${day.inMonth ? '' : 'opacity-40'} ${day.isToday ? 'ring-1 ring-primary' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const taskId = e.dataTransfer.getData('text/task-id');
              if (taskId) onDropTask(taskId, day.iso);
            }}
          >
            <div className="text-xs font-medium text-muted-foreground">{day.date.getUTCDate()}</div>
            <ul className="mt-1 space-y-0.5">
              {(byDay.get(day.iso) ?? []).map((t) => (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
                  className="cursor-grab truncate rounded bg-primary/10 px-1 py-0.5 text-xs"
                  title={t.title}
                >
                  {t.title}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export default CalendarPage;
