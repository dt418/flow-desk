# Calendar View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Calendar View to FlowDesk — month/week/day renderers that compose existing task infrastructure (queries, mutations, realtime, validation).

**Architecture:** Calendar is a **view layer**, not a data domain. `CalendarProvider` owns UI/navigation state only. Grid components (MonthGrid, WeekGrid, DayGrid) implement a shared `CalendarGridProps` interface. DnD is independent from grids via `@dnd-kit`. Tasks query the existing `GET /api/tasks` endpoint with `dueBefore`/`dueAfter` params — no backend changes.

**Tech Stack:** React 18, TypeScript, date-fns v4, shadcn/ui, @dnd-kit, TanStack Query, Socket.IO (Redis adapter), Tailwind CSS v4

## Global Constraints

- React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui (web frontend)
- Hono + Node.js + TypeScript (backend) — no backend changes for this feature
- PostgreSQL 16, Prisma ORM — no schema changes for v1
- date-fns v4 for all date math (no moment/dayjs)
- @dnd-kit for drag-and-drop (already in project)
- TanStack Query for server state — no manual useEffect fetch
- Socket.IO via `useNamespacedSocket('/tasks')` for realtime
- JWT auth as middleware, never inline in handlers
- Zod for all input validation
- No `any` in TypeScript
- `pnpm verify` must pass before every commit

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `apps/web/src/features/calendar/types.ts` | CalendarTask, ViewMode, CalendarState, CalendarGridProps, DateRange |
| Create | `apps/web/src/features/calendar/utils.ts` | getMonthDays, getWeekDays, getDayRange, isSameDay, formatDateKey |
| Create | `apps/web/src/features/calendar/provider.tsx` | CalendarProvider — UI/navigation state (currentDate, viewMode, dateRange) |
| Create | `apps/web/src/features/calendar/hooks.ts` | useCalendarTasks, useCalendarDnD, useCalendarNavigation |
| Create | `apps/web/src/components/calendar/task-card.tsx` | TaskCard — presentation-only |
| Create | `apps/web/src/components/calendar/month-grid.tsx` | MonthGrid — 7-col CSS grid, day cells, task cards |
| Create | `apps/web/src/components/calendar/calendar-toolbar.tsx` | Toolbar — prev/next/today, view switcher, date label |
| Create | `apps/web/src/components/calendar/calendar-layout.tsx` | Composition shell — toolbar + content grid |
| Create | `apps/web/src/pages/calendar.tsx` | CalendarPage — thin shell, wraps CalendarLayout |
| Modify | `apps/web/src/features/task/api.ts` | Add `taskApi.list(params)` method |
| Modify | `apps/web/src/App.tsx` | Add `/calendar/:workspaceId` route |
| Modify | `apps/web/src/components/layout/app-shell.tsx` | Add Calendar NavLink per workspace |

---

## Task 1: Types and Date Utilities

**Files:**
- Create: `apps/web/src/features/calendar/types.ts`
- Create: `apps/web/src/features/calendar/utils.ts`

**Interfaces:**
- Produces: `ViewMode`, `DateRange`, `CalendarTask`, `CalendarGridProps`, `CalendarState`, `CalendarActions` (consumed by all subsequent tasks)

- [ ] **Step 1: Create types.ts**

```ts
// apps/web/src/features/calendar/types.ts
import type { Task } from '@flow-desk/shared/task';

export type ViewMode = 'month' | 'week' | 'day';

export interface DateRange {
  start: Date;
  end: Date;
}

export type CalendarTask = Pick<
  Task,
  'id' | 'title' | 'status' | 'priority' | 'dueDate' | 'assigneeId' | 'labels' | 'columnId' | 'position' | 'version'
> & {
  assignee?: { id: string; name: string; avatarUrl: string | null } | null;
};

export interface CalendarGridProps {
  tasks: CalendarTask[];
  visibleRange: DateRange;
  onTaskClick: (task: CalendarTask) => void;
  onTaskMove: (taskId: string, newDate: Date) => void;
}

export interface CalendarState {
  currentDate: Date;
  viewMode: ViewMode;
  dateRange: DateRange;
}

export interface CalendarActions {
  goToToday(): void;
  goToDate(date: Date): void;
  setView(mode: ViewMode): void;
  navigate(direction: 'prev' | 'next'): void;
}
```

- [ ] **Step 2: Create utils.ts**

```ts
// apps/web/src/features/calendar/utils.ts
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, subMonths, addWeeks, subWeeks,
  addDays, subDays, isSameDay, isSameMonth, format, startOfDay,
} from 'date-fns';
import type { DateRange } from './types';

export { isSameDay, isSameMonth };

export function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function getMonthDays(date: Date): Date[] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
}

export function getWeekDays(date: Date): Date[] {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 0 });
  return eachDayOfInterval({ start: weekStart, end: weekEnd });
}

export function getDayRange(date: Date): DateRange {
  return { start: startOfDay(date), end: endOfDay(date) };
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getVisibleRange(currentDate: Date, viewMode: 'month' | 'week' | 'day'): DateRange {
  switch (viewMode) {
    case 'month': {
      const days = getMonthDays(currentDate);
      return { start: days[0], end: days[days.length - 1] };
    }
    case 'week': {
      const days = getWeekDays(currentDate);
      return { start: days[0], end: days[days.length - 1] };
    }
    case 'day':
      return getDayRange(currentDate);
  }
}

export function navigateDate(currentDate: Date, viewMode: 'month' | 'week' | 'day', direction: 'prev' | 'next'): Date {
  const fn = direction === 'next' ? addDays : subDays;
  switch (viewMode) {
    case 'month': return fn(currentDate, 30);
    case 'week': return fn(currentDate, 7);
    case 'day': return fn(currentDate, 1);
  }
}

export function formatDateLabel(range: DateRange, viewMode: 'month' | 'week' | 'day'): string {
  switch (viewMode) {
    case 'month':
      return format(range.start, 'MMMM yyyy');
    case 'week':
      return `${format(range.start, 'MMM d')} – ${format(range.end, 'MMM d, yyyy')}`;
    case 'day':
      return format(range.start, 'EEEE, MMMM d, yyyy');
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/calendar/types.ts apps/web/src/features/calendar/utils.ts
git commit -m "feat(calendar): add types and date utility functions"
```

---

## Task 2: CalendarProvider

**Files:**
- Create: `apps/web/src/features/calendar/provider.tsx`

**Interfaces:**
- Produces: `CalendarProvider`, `useCalendar` hook (consumed by all calendar components)

- [ ] **Step 1: Create provider.tsx**

```tsx
// apps/web/src/features/calendar/provider.tsx
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CalendarState, CalendarActions, ViewMode, DateRange } from './types';
import { getVisibleRange, navigateDate } from './utils';

interface CalendarContextValue extends CalendarState, CalendarActions {}

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function useCalendar(): CalendarContextValue {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendar must be used within CalendarProvider');
  return ctx;
}

function parseViewMode(raw: string | null): ViewMode {
  if (raw === 'week' || raw === 'day') return raw;
  return 'month';
}

function parseDate(raw: string | null): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [currentDate, setCurrentDate] = useState(() => parseDate(searchParams.get('date')));
  const [viewMode, setViewModeState] = useState<ViewMode>(() => parseViewMode(searchParams.get('view')));

  const dateRange: DateRange = useMemo(
    () => getVisibleRange(currentDate, viewMode),
    [currentDate, viewMode],
  );

  const updateParams = useCallback(
    (date: Date, view: ViewMode) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('date', date.toISOString());
        next.set('view', view);
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    updateParams(today, viewMode);
  }, [viewMode, updateParams]);

  const goToDate = useCallback(
    (date: Date) => {
      setCurrentDate(date);
      updateParams(date, viewMode);
    },
    [viewMode, updateParams],
  );

  const setView = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      updateParams(currentDate, mode);
    },
    [currentDate, updateParams],
  );

  const navigate = useCallback(
    (direction: 'prev' | 'next') => {
      const next = navigateDate(currentDate, viewMode, direction);
      setCurrentDate(next);
      updateParams(next, viewMode);
    },
    [currentDate, viewMode, updateParams],
  );

  const value = useMemo<CalendarContextValue>(
    () => ({ currentDate, viewMode, dateRange, goToToday, goToDate, setView, navigate }),
    [currentDate, viewMode, dateRange, goToToday, goToDate, setView, navigate],
  );

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/calendar/provider.tsx
git commit -m "feat(calendar): add CalendarProvider with navigation state"
```

---

## Task 3: taskApi.list() and useCalendarTasks

**Files:**
- Modify: `apps/web/src/features/task/api.ts` (add `list` method)
- Create: `apps/web/src/features/calendar/hooks.ts`

**Interfaces:**
- Produces: `taskApi.list(params)` (reusable by other features), `useCalendarTasks` hook

- [ ] **Step 1: Add taskApi.list() to api.ts**

First, update the imports at the top of `apps/web/src/features/task/api.ts`. Add `z` and `taskSchema`:

```ts
import { z } from 'zod';
import type { CreateTaskInput, Task, UpdateTaskInput } from '@flow-desk/shared/task';
import { taskSchema } from '@flow-desk/shared/task';
```

Then add after the `restore` method:

```ts
  list(params: {
    workspaceId: string;
    dueAfter?: string;
    dueBefore?: string;
    status?: string;
    priority?: string;
    assigneeId?: string;
    search?: string;
    limit?: number;
  }) {
    const qs = new URLSearchParams({ workspaceId: params.workspaceId });
    if (params.dueAfter) qs.set('dueAfter', params.dueAfter);
    if (params.dueBefore) qs.set('dueBefore', params.dueBefore);
    if (params.status) qs.set('status', params.status);
    if (params.priority) qs.set('priority', params.priority);
    if (params.assigneeId) qs.set('assigneeId', params.assigneeId);
    if (params.search) qs.set('search', params.search);
    if (params.limit) qs.set('limit', String(params.limit));
    return api<{ data: Task[]; nextCursor: string | null }>(`/api/tasks?${qs.toString()}`, {
      schema: z.object({ data: z.array(taskSchema), nextCursor: z.string().nullable() }),
    });
  },
```

- [ ] **Step 2: Create hooks.ts with useCalendarTasks**

```ts
// apps/web/src/features/calendar/hooks.ts
import { useQuery } from '@tanstack/react-query';
import { taskApi } from '@/features/task/api';
import { useCalendar } from './provider';
import type { CalendarTask } from './types';

export const calendarKeys = {
  all: (workspaceId: string, start: string, end: string) =>
    ['calendar', workspaceId, start, end] as const,
  workspace: (workspaceId: string) => ['calendar', workspaceId] as const,
};

export function useCalendarTasks(
  workspaceId: string,
  filters?: { status?: string; priority?: string; assigneeId?: string },
) {
  const { dateRange } = useCalendar();

  return useQuery({
    queryKey: calendarKeys.all(
      workspaceId,
      dateRange.start.toISOString(),
      dateRange.end.toISOString(),
    ),
    queryFn: () =>
      taskApi.list({
        workspaceId,
        dueAfter: dateRange.start.toISOString(),
        dueBefore: dateRange.end.toISOString(),
        ...filters,
        limit: 500,
      }),
    enabled: Boolean(workspaceId),
    select: (data) => (data.data ?? []) as CalendarTask[],
  });
}
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/task/api.ts apps/web/src/features/calendar/hooks.ts
git commit -m "feat(calendar): add taskApi.list and useCalendarTasks hook"
```

---

## Task 4: TaskCard Component

**Files:**
- Create: `apps/web/src/components/calendar/task-card.tsx`

**Interfaces:**
- Consumes: `CalendarTask` from types.ts
- Produces: `CalendarTaskCard` component (used by MonthGrid, WeekGrid, DayGrid)

- [ ] **Step 1: Create task-card.tsx**

```tsx
// apps/web/src/components/calendar/task-card.tsx
import { cn } from '@/lib/utils';
import type { CalendarTask } from '@/features/calendar/types';

const PRIORITY_COLORS = {
  LOW: 'border-l-blue-400',
  MEDIUM: 'border-l-yellow-400',
  HIGH: 'border-l-orange-500',
  URGENT: 'border-l-red-500',
} as const;

interface CalendarTaskCardProps {
  task: CalendarTask;
  onClick?: () => void;
  compact?: boolean;
}

export function CalendarTaskCard({ task, onClick, compact = false }: CalendarTaskCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full cursor-pointer rounded border border-border bg-card text-left transition-colors',
        'border-l-[3px]',
        PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] ?? 'border-l-muted-foreground',
        'hover:bg-accent/50',
        compact ? 'px-1.5 py-0.5' : 'px-2 py-1',
      )}
    >
      <p
        className={cn(
          'truncate font-medium text-foreground',
          compact ? 'text-[10px] leading-tight' : 'text-xs leading-snug',
        )}
      >
        {task.title}
      </p>
      {!compact && task.assignee && (
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {task.assignee.name}
        </p>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/calendar/task-card.tsx
git commit -m "feat(calendar): add CalendarTaskCard presentation component"
```

---

## Task 5: MonthGrid Component

**Files:**
- Create: `apps/web/src/components/calendar/month-grid.tsx`

**Interfaces:**
- Consumes: `CalendarGridProps` from types.ts, `CalendarTaskCard`, `getMonthDays`, `isSameDay`, `isSameMonth`, `formatDateKey` from utils.ts
- Produces: `MonthGrid` component (used by CalendarLayout)

- [ ] **Step 1: Create month-grid.tsx**

```tsx
// apps/web/src/components/calendar/month-grid.tsx
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CalendarTaskCard } from './task-card';
import { getMonthDays, isSameDay, isSameMonth, formatDateKey } from '@/features/calendar/utils';
import type { CalendarGridProps } from '@/features/calendar/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_CARDS = 3;

export function MonthGrid({ tasks, visibleRange, onTaskClick, onTaskMove }: CalendarGridProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const days = useMemo(() => getMonthDays(visibleRange.start), [visibleRange.start]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const key = formatDateKey(new Date(task.dueDate));
      const list = map.get(key);
      if (list) list.push(task);
      else map.set(key, [task]);
    }
    return map;
  }, [tasks]);

  const today = new Date();

  return (
    <div className="flex h-full flex-col">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid flex-1 grid-cols-7 grid-rows-[repeat(auto-fill,minmax(0,1fr))]">
        {days.map((day) => {
          const key = formatDateKey(day);
          const dayTasks = tasksByDay.get(key) ?? [];
          const isCurrentMonth = isSameMonth(day, visibleRange.start);
          const isToday = isSameDay(day, today);
          const visible = dayTasks.slice(0, MAX_VISIBLE_CARDS);
          const overflow = dayTasks.length - MAX_VISIBLE_CARDS;

          return (
            <div
              key={key}
              className={cn(
                'flex flex-col border-b border-r border-border p-1',
                !isCurrentMonth && 'bg-muted/30 text-muted-foreground',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                    isToday && 'bg-primary text-primary-foreground font-bold',
                  )}
                >
                  {format(day, 'd')}
                </span>
              </div>

              <div className="mt-1 flex flex-1 flex-col gap-0.5">
                {visible.map((task) => (
                  <CalendarTaskCard
                    key={task.id}
                    task={task}
                    compact
                    onClick={() => onTaskClick(task)}
                  />
                ))}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpandedDay(key)}
                    className="w-full rounded px-1 py-0.5 text-left text-[10px] text-muted-foreground hover:bg-accent/50"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expanded day popover (simplified: inline expansion) */}
      {expandedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setExpandedDay(null)}>
          <div className="max-h-[80vh] w-96 overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{expandedDay}</h3>
              <button type="button" onClick={() => setExpandedDay(null)} className="text-muted-foreground hover:text-foreground">
                ×
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {(tasksByDay.get(expandedDay) ?? []).map((task) => (
                <CalendarTaskCard
                  key={task.id}
                  task={task}
                  onClick={() => {
                    onTaskClick(task);
                    setExpandedDay(null);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/calendar/month-grid.tsx
git commit -m "feat(calendar): add MonthGrid with day cells and task cards"
```

---

## Task 6: CalendarToolbar

**Files:**
- Create: `apps/web/src/components/calendar/calendar-toolbar.tsx`

**Interfaces:**
- Consumes: `useCalendar` from provider.tsx, `formatDateLabel` from utils.ts
- Produces: `CalendarToolbar` component

- [ ] **Step 1: Create calendar-toolbar.tsx**

```tsx
// apps/web/src/components/calendar/calendar-toolbar.tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCalendar } from '@/features/calendar/provider';
import { formatDateLabel } from '@/features/calendar/utils';
import type { ViewMode } from '@/features/calendar/types';

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

export function CalendarToolbar() {
  const { currentDate, viewMode, dateRange, goToToday, navigate, setView } = useCalendar();

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('prev')} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => navigate('next')} aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToToday}>
          Today
        </Button>
        <h2 className="ml-2 text-sm font-semibold">{formatDateLabel(dateRange, viewMode)}</h2>
      </div>

      <div className="flex items-center rounded-md border border-border bg-card p-0.5 text-xs">
        {VIEW_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            className={`rounded px-2.5 py-1 transition-colors ${
              viewMode === value
                ? 'bg-muted font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/calendar/calendar-toolbar.tsx
git commit -m "feat(calendar): add CalendarToolbar with nav and view switcher"
```

---

## Task 7: CalendarLayout and CalendarPage

**Files:**
- Create: `apps/web/src/components/calendar/calendar-layout.tsx`
- Create: `apps/web/src/pages/calendar.tsx`

**Interfaces:**
- Consumes: `CalendarProvider`, `CalendarToolbar`, `MonthGrid`, `useCalendarTasks`
- Produces: `CalendarPage` (routed page)

- [ ] **Step 1: Create calendar-layout.tsx**

```tsx
// apps/web/src/components/calendar/calendar-layout.tsx
import { useCalendarTasks } from '@/features/calendar/hooks';
import { CalendarToolbar } from './calendar-toolbar';
import { MonthGrid } from './month-grid';
import { Skeleton } from '@/components/ui/skeleton';
import type { CalendarTask } from '@/features/calendar/types';

interface CalendarLayoutProps {
  workspaceId: string;
  onTaskClick: (task: CalendarTask) => void;
  onTaskMove: (taskId: string, newDate: Date) => void;
}

export function CalendarLayout({ workspaceId, onTaskClick, onTaskMove }: CalendarLayoutProps) {
  const { dateRange } = useCalendarTasks.__provider__ ?? {};
  const tasksQuery = useCalendarTasks(workspaceId);

  if (tasksQuery.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <CalendarToolbar />
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (tasksQuery.isError) {
    return (
      <div className="flex h-full flex-col">
        <CalendarToolbar />
        <div className="flex flex-1 items-center justify-center">
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load tasks: {(tasksQuery.error as Error | null)?.message ?? 'unknown error'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <CalendarToolbar />
      <div className="flex-1 overflow-auto">
        <MonthGrid
          tasks={tasksQuery.data ?? []}
          visibleRange={/* from provider */ { start: new Date(), end: new Date() }}
          onTaskClick={onTaskClick}
          onTaskMove={onTaskMove}
        />
      </div>
    </div>
  );
}
```

Wait — I need the `dateRange` from the provider. Let me fix the import:

```tsx
// apps/web/src/components/calendar/calendar-layout.tsx
import { useCalendar } from '@/features/calendar/provider';
import { useCalendarTasks } from '@/features/calendar/hooks';
import { CalendarToolbar } from './calendar-toolbar';
import { MonthGrid } from './month-grid';
import { Skeleton } from '@/components/ui/skeleton';
import type { CalendarTask } from '@/features/calendar/types';

interface CalendarLayoutProps {
  workspaceId: string;
  onTaskClick: (task: CalendarTask) => void;
  onTaskMove: (taskId: string, newDate: Date) => void;
}

export function CalendarLayout({ workspaceId, onTaskClick, onTaskMove }: CalendarLayoutProps) {
  const { dateRange } = useCalendar();
  const tasksQuery = useCalendarTasks(workspaceId);

  if (tasksQuery.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <CalendarToolbar />
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (tasksQuery.isError) {
    return (
      <div className="flex h-full flex-col">
        <CalendarToolbar />
        <div className="flex flex-1 items-center justify-center">
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load tasks: {(tasksQuery.error as Error | null)?.message ?? 'unknown error'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <CalendarToolbar />
      <div className="flex-1 overflow-auto">
        <MonthGrid
          tasks={tasksQuery.data ?? []}
          visibleRange={dateRange}
          onTaskClick={onTaskClick}
          onTaskMove={onTaskMove}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create calendar.tsx page**

```tsx
// apps/web/src/pages/calendar.tsx
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { CalendarProvider } from '@/features/calendar/provider';
import { CalendarLayout } from '@/components/calendar/calendar-layout';
import type { CalendarTask } from '@/features/calendar/types';

export default function CalendarPage() {
  const { workspaceId = '' } = useParams();
  const [selectedTask, setSelectedTask] = useState<CalendarTask | null>(null);

  const handleTaskClick = (task: CalendarTask) => {
    setSelectedTask(task);
    // Phase 1: just log. Phase 2+: open TaskEditModal
    console.log('Task clicked:', task.id, task.title);
  };

  const handleTaskMove = (taskId: string, newDate: Date) => {
    // Phase 2: wired to useCalendarDnD. Phase 1: no-op placeholder.
    console.log('Move task:', taskId, 'to', newDate.toISOString());
  };

  return (
    <CalendarProvider>
      <CalendarLayout
        workspaceId={workspaceId}
        onTaskClick={handleTaskClick}
        onTaskMove={handleTaskMove}
      />
    </CalendarProvider>
  );
}
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/calendar/calendar-layout.tsx apps/web/src/pages/calendar.tsx
git commit -m "feat(calendar): add CalendarLayout and CalendarPage shell"
```

---

## Task 8: Routing and Sidebar NavLink

**Files:**
- Modify: `apps/web/src/App.tsx` (add route)
- Modify: `apps/web/src/components/layout/app-shell.tsx` (add NavLink)

**Interfaces:**
- Consumes: `CalendarPage` from pages/calendar.tsx

- [ ] **Step 1: Add lazy import and route to App.tsx**

Add after line 16 (`const ChatPage = lazy(...)`):

```ts
const CalendarPage = lazy(() => import('@/pages/calendar'));
```

Add inside the `<Route element={user ? <AppShell /> : ...}>` block, after the Chat route (line 60):

```tsx
<Route path="/calendar/:workspaceId" element={<CalendarPage />} />
```

- [ ] **Step 2: Add NavLink to app-shell.tsx**

In `apps/web/src/components/layout/app-shell.tsx`, after the Chat NavLink (line 128-129), before Settings:

```tsx
<NavLink to={`/calendar/${w.id}`} className={navSubItem}>
  Calendar
</NavLink>
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/components/layout/app-shell.tsx
git commit -m "feat(calendar): add route and sidebar NavLink"
```

---

## Task 9: Saved View Integration

**Files:**
- Modify: `apps/web/src/features/calendar/hooks.ts` (extend useCalendarTasks to accept filters)

**Interfaces:**
- Consumes: `SavedFilterQuery` from `@flow-desk/shared/saved-filter`

- [ ] **Step 1: Check SavedViewsBar pattern**

Read `apps/web/src/features/saved-filter/components/SavedViewsBar.tsx` to understand the filter interface. The `SavedFilterQuery` type has `status`, `priority`, and optionally `assigneeId`.

- [ ] **Step 2: Update useCalendarTasks to accept filters**

In `apps/web/src/features/calendar/hooks.ts`, update the function signature:

```ts
export function useCalendarTasks(
  workspaceId: string,
  filters?: { status?: string; priority?: string; assigneeId?: string },
) {
  const { dateRange } = useCalendar();

  return useQuery({
    queryKey: calendarKeys.all(
      workspaceId,
      dateRange.start.toISOString(),
      dateRange.end.toISOString(),
    ),
    queryFn: () =>
      taskApi.list({
        workspaceId,
        dueAfter: dateRange.start.toISOString(),
        dueBefore: dateRange.end.toISOString(),
        ...filters,
        limit: 500,
      }),
    enabled: Boolean(workspaceId),
    select: (data) => (data.data ?? []) as CalendarTask[],
  });
}
```

- [ ] **Step 3: Add SavedViewsBar to CalendarLayout**

Update `calendar-layout.tsx` to include filter state and SavedViewsBar in the toolbar area. Add `useState` for status/priority filters and pass them to `useCalendarTasks`.

- [ ] **Step 4: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/calendar/hooks.ts apps/web/src/components/calendar/calendar-layout.tsx
git commit -m "feat(calendar): integrate SavedViewsBar filter support"
```

---

## Task 10: DnD Support — DraggableTaskCard and useCalendarDnD

**Files:**
- Create: `apps/web/src/components/calendar/draggable-task-card.tsx`
- Modify: `apps/web/src/features/calendar/hooks.ts` (add useCalendarDnD)

**Interfaces:**
- Consumes: `CalendarTaskCard`, `useUpdateTask` from task hooks, `useQueryClient` from TanStack Query
- Produces: `DraggableTaskCard`, `useCalendarDnD` hook

- [ ] **Step 1: Create draggable-task-card.tsx**

```tsx
// apps/web/src/components/calendar/draggable-task-card.tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarTaskCard } from './task-card';
import type { CalendarTask } from '@/features/calendar/types';

interface DraggableTaskCardProps {
  task: CalendarTask;
  onClick?: () => void;
  compact?: boolean;
}

export function DraggableTaskCard({ task, onClick, compact }: DraggableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <CalendarTaskCard task={task} onClick={onClick} compact={compact} />
    </div>
  );
}
```

- [ ] **Step 2: Add useCalendarDnD to hooks.ts**

```ts
// Add to apps/web/src/features/calendar/hooks.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUpdateTask } from '@/features/task/hooks';

export function useCalendarDnD(workspaceId: string) {
  const qc = useQueryClient();
  const updateTask = useUpdateTask(workspaceId);

  const handleMove = (taskId: string, newDate: Date) => {
    updateTask.mutate(
      { id: taskId, body: { dueDate: newDate.toISOString() } },
      {
        onSettled: () => {
          // Invalidate both board and calendar queries
          qc.invalidateQueries({ queryKey: calendarKeys.workspace(workspaceId) });
        },
      },
    );
  };

  return { handleMove, isPending: updateTask.isPending };
}
```

- [ ] **Step 3: Wire DnD into CalendarPage**

Update `apps/web/src/pages/calendar.tsx` to use `useCalendarDnD` and wrap the layout with `@dnd-kit`'s `DndContext` and `DragOverlay`. Add a `handleDragEnd` that extracts the task ID and target date from the drop event, then calls `handleMove`.

- [ ] **Step 4: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/calendar/draggable-task-card.tsx apps/web/src/features/calendar/hooks.ts apps/web/src/pages/calendar.tsx
git commit -m "feat(calendar): add DnD support with DraggableTaskCard and useCalendarDnD"
```

---

## Task 11: Realtime Sync

**Files:**
- Modify: `apps/web/src/pages/calendar.tsx` (add useRealtime or socket listener)

**Interfaces:**
- Consumes: `useNamespacedSocket` from `@/lib/socket`, `useQueryClient` from TanStack Query

- [ ] **Step 1: Add realtime invalidation to CalendarPage**

Add a `useEffect` in `CalendarPage` that listens to socket events and invalidates the calendar query:

```ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNamespacedSocket } from '@/lib/socket';
import { calendarKeys } from '@/features/calendar/hooks';

// Inside CalendarPage:
const qc = useQueryClient();
const { socket } = useNamespacedSocket('/tasks');

useEffect(() => {
  if (!workspaceId) return;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: calendarKeys.workspace(workspaceId) });
  };

  socket.on('task:moved', invalidate);
  socket.on('task:updated', invalidate);
  socket.on('task:created', invalidate);
  socket.on('task:deleted', invalidate);

  return () => {
    socket.off('task:moved', invalidate);
    socket.off('task:updated', invalidate);
    socket.off('task:created', invalidate);
    socket.off('task:deleted', invalidate);
  };
}, [socket, workspaceId, qc]);
```

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/calendar.tsx
git commit -m "feat(calendar): add Socket.IO realtime sync"
```

---

## Task 12: Responsive Design

**Files:**
- Modify: `apps/web/src/components/calendar/month-grid.tsx` (responsive classes)

**Interfaces:**
- Consumes: Tailwind responsive prefixes (`md:`, `lg:`)

- [ ] **Step 1: Add responsive behavior to MonthGrid**

Update MonthGrid to use responsive classes:
- Mobile (`<768px`): Compact mode — show day numbers with dot indicators, tap to expand
- Tablet (`768-1023px`): Compressed task cards, fewer visible per cell
- Desktop (`≥1024px`): Full month grid as-is

Use `useMediaQuery` or Tailwind `md:` / `lg:` prefixes. For the mobile compact mode, conditionally render dot indicators instead of task cards.

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/calendar/month-grid.tsx
git commit -m "feat(calendar): add responsive month grid layout"
```

---

## Task 13: Keyboard Accessibility

**Files:**
- Modify: `apps/web/src/components/calendar/month-grid.tsx` (ARIA, keyboard nav)
- Modify: `apps/web/src/components/calendar/task-card.tsx` (keyboard support)

**Interfaces:**
- Consumes: ARIA patterns (role=grid, role=gridcell, aria-label)

- [ ] **Step 1: Add ARIA attributes to MonthGrid**

Add `role="grid"` to the grid container, `role="gridcell"` to each day cell, `aria-label` with the date to each cell. Add `tabIndex` for keyboard navigation.

- [ ] **Step 2: Add keyboard handlers**

Add `onKeyDown` handler to MonthGrid that handles:
- Arrow keys: move focus between day cells
- Enter: open task detail
- Tab: move between tasks within a cell

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/calendar/month-grid.tsx apps/web/src/components/calendar/task-card.tsx
git commit -m "feat(calendar): add keyboard accessibility and ARIA attributes"
```

---

## Task 14: Week View

**Files:**
- Create: `apps/web/src/components/calendar/week-grid.tsx`
- Modify: `apps/web/src/components/calendar/calendar-layout.tsx` (render WeekGrid for week mode)

**Interfaces:**
- Consumes: `CalendarGridProps`, `getWeekDays`, `useCalendarTasks`
- Produces: `WeekGrid` component

- [ ] **Step 1: Create week-grid.tsx**

Similar structure to MonthGrid but with 7 columns (one per day), no month boundary cells. Each column shows the day header and lists all tasks vertically. Implements `CalendarGridProps`.

- [ ] **Step 2: Update CalendarLayout to switch between MonthGrid and WeekGrid**

Import WeekGrid and conditionally render based on `viewMode` from `useCalendar`.

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/calendar/week-grid.tsx apps/web/src/components/calendar/calendar-layout.tsx
git commit -m "feat(calendar): add WeekView grid component"
```

---

## Task 15: Day View

**Files:**
- Create: `apps/web/src/components/calendar/day-grid.tsx`
- Modify: `apps/web/src/components/calendar/calendar-layout.tsx` (render DayGrid for day mode)

**Interfaces:**
- Consumes: `CalendarGridProps`, `getDayRange`, `useCalendarTasks`
- Produces: `DayGrid` component

- [ ] **Step 1: Create day-grid.tsx**

Single-column layout. Lists all tasks vertically with full detail (priority, assignee, description preview, labels). Implements `CalendarGridProps`.

- [ ] **Step 2: Update CalendarLayout to switch between MonthGrid, WeekGrid, and DayGrid**

Add conditional rendering for all three view modes.

- [ ] **Step 3: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/calendar/day-grid.tsx apps/web/src/components/calendar/calendar-layout.tsx
git commit -m "feat(calendar): add DayView grid component"
```

---

## Task 16: Task Detail Integration

**Files:**
- Modify: `apps/web/src/pages/calendar.tsx` (open TaskEditModal on task click)

**Interfaces:**
- Consumes: `TaskEditModal` from `@/features/task/components/TaskEditModal`

- [ ] **Step 1: Add TaskEditModal to CalendarPage**

Import `TaskEditModal` and wire `selectedTask` state to open the modal. Pass `workspaceId`, `columns`, and `members` from existing hooks.

- [ ] **Step 2: Verify types compile**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/calendar.tsx
git commit -m "feat(calendar): integrate TaskEditModal for task detail view"
```

---

## Task 17: Final Integration and Polish

**Files:**
- Modify: `apps/web/src/components/calendar/calendar-layout.tsx`
- Modify: `apps/web/src/pages/calendar.tsx`

**Interfaces:**
- Consumes: All previous tasks

- [ ] **Step 1: Wire up all pieces in CalendarLayout**

Ensure CalendarLayout correctly:
- Passes `dateRange` from provider to grids
- Uses `useCalendarDnD` for `onTaskMove`
- Shows loading/error states
- Includes SavedViewsBar

- [ ] **Step 2: Verify full typecheck and build**

Run: `pnpm --filter @flow-desk/web typecheck && pnpm --filter @flow-desk/web build`
Expected: PASS

- [ ] **Step 3: Verify with pnpm verify**

Run: `pnpm verify`
Expected: PASS

- [ ] **Step 4: Update feature_list.json and claude-progress.md**

Mark P3-3 as completed with evidence.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(calendar): complete calendar view implementation"
```
