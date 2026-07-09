# Calendar View — Design Spec

**Date:** 2026-07-08
**Feature:** P3-3 (Calendar View)
**Status:** Draft
**Author:** Brainstorming session with user

---

## 1. Goal

Add a Calendar View to FlowDesk as another representation of the existing task dataset. Calendar is a **view layer**, not a new data domain — it reuses the same queries, mutations, realtime sync, and validation as Board/List/Table.

The implementation is incremental: Month → Week → Day. The core architecture (provider, state, queries, Socket.IO integration, DnD, optimistic updates, task rendering) is shared across all views, with each view acting as a different renderer.

Built from scratch using FlowDesk's existing stack (React, Vite, date-fns v4, shadcn/ui, dnd-kit, TanStack Query, Socket.IO). big-calendar serves as an architectural and UX reference, not a codebase to vendor.

## 2. Non-Goals (v1)

- Time-slot scheduling (tasks are all-day, no start/end time)
- Recurring events
- Event resizing
- Cross-view DnD (board → calendar)
- Calendar-specific Saved Views (calendar respects the currently selected saved view)
- DB schema changes (no `startDate`/`endDate` columns yet)
- Mini calendar sidebar
- Agenda/Timeline views

## 3. Architecture

### 3.1 Core Principle

Calendar is a **view** of the task domain. It does not own data fetching, mutations, realtime sync, or validation. It composes existing task infrastructure.

```
Task Domain (shared)
├── useTasks()          ← query
├── updateTaskMutation() ← mutation
├── useTaskRealtime()   ← Socket.IO
└── taskSchema          ← validation

View Layer
├── Board  → uses task domain
├── List   → uses task domain
├── Table  → uses task domain
└── Calendar → uses task domain
```

### 3.2 File Structure

```
apps/web/src/features/calendar/
  provider.tsx          — CalendarProvider (date, view mode, navigation)
  hooks.ts              — useCalendarTasks, useCalendarDnD, useCalendarNavigation
  types.ts              — CalendarTask, ViewMode, CalendarState, CalendarGridProps
  utils.ts              — date math helpers (getMonthDays, getWeekDays, etc.)

Modified existing files:
  apps/web/src/features/task/api.ts   — add taskApi.list() method
  apps/web/src/features/task/hooks.ts — no changes (useUpdateTask reused as-is)

apps/web/src/components/calendar/
  calendar-layout.tsx   — CalendarLayout (composition shell)
  calendar-toolbar.tsx  — View switcher + prev/next/today
  month-grid.tsx        — MonthView renderer
  week-grid.tsx         — WeekView renderer
  day-grid.tsx          — DayView renderer
  task-card.tsx         — TaskCard (presentation-only)
  draggable-task-card.tsx — DraggableTaskCard (DnD wrapper)

apps/web/src/pages/calendar.tsx — CalendarPage (thin shell)
```

### 3.3 Routing

- Route: `/calendar/:workspaceId`
- Lazy-loaded in `App.tsx`
- NavLink added to sidebar after Chat, before Settings

## 4. Component Design

### 4.1 CalendarProvider

Owns **UI/navigation state only**. No data fetching, no mutations, no socket listeners.

```ts
interface CalendarState {
  currentDate: Date; // anchor date for navigation
  viewMode: 'month' | 'week' | 'day';
  dateRange: DateRange; // derived from currentDate + viewMode (not mutable)
}

interface CalendarActions {
  goToToday(): void;
  goToDate(date: Date): void;
  setView(mode: ViewMode): void;
  navigate(direction: 'prev' | 'next'): void;
}
```

`dateRange` is always derived — never stored as mutable state.

Navigation state persisted to URL search params for deep linking.

### 4.2 CalendarLayout

Composition shell that assembles the calendar page:

```
CalendarLayout
├── CalendarToolbar
├── CalendarSidebar (future — mini calendar, upcoming, legend)
├── CalendarContent
│   ├── MonthGrid
│   ├── WeekGrid
│   └── DayGrid
└── TaskDetailDrawer (reuse)
```

Adding future features (mini calendar, sidebar panels) only requires editing `CalendarLayout`, not individual grids.

### 4.3 Grid Components (MonthGrid, WeekGrid, DayGrid)

All three implement a **shared interface**:

```ts
interface CalendarGridProps {
  tasks: CalendarTask[];
  visibleRange: DateRange;
  onTaskClick: (task: CalendarTask) => void;
  onTaskMove: (taskId: string, newDate: Date) => void;
}
```

Future grids (AgendaGrid, TimelineGrid) implement the same interface.

**MonthGrid:**

- 7-column CSS grid (Sun-Sat), 5-6 rows
- Each cell: day number + up to 2-3 TaskCard items
- Overflow: "+N more" opens a popover/drawer listing all tasks for that day (reuses existing drawer patterns)
- Current day highlighted with ring/border
- Days outside current month grayed out

**WeekGrid:**

- 7-column layout with day headers
- Tasks are all-day in v1 — single row of columns, no hour slots
- Same overflow behavior as MonthGrid

**DayGrid:**

- Single-column layout with full date header
- Lists all tasks vertically with more detail (priority, assignee, description preview)

### 4.4 TaskCard

**Presentation-only.** No DnD logic, no click handlers beyond `onTaskClick`.

```ts
interface TaskCardProps {
  task: CalendarTask;
  onClick?: () => void;
  compact?: boolean; // true in MonthGrid, false in DayGrid
  startDate?: Date; // future extensibility
  endDate?: Date; // future extensibility
}
```

Renders:

- Priority color indicator (left border or dot — matches board's priority colors)
- Task title (truncated)
- Optional: assignee avatar, label chips (space permitting)

Reused outside calendar: search results, dashboard, recent tasks, activity feed.

### 4.5 DraggableTaskCard

Wraps `TaskCard` with `@dnd-kit`'s `useSortable`. Attaches drag behavior without coupling TaskCard to DnD.

```tsx
<DraggableTaskCard task={task} onDrop={handleDrop}>
  <TaskCard task={task} />
</DraggableTaskCard>
```

### 4.6 CalendarToolbar

- Left: prev/next arrows, "Today" button, current date range label
- Right: view mode switcher (Month / Week / Day segmented control)
- Uses existing shadcn/ui button and segmented-control patterns

## 5. Data Flow

### 5.1 Query

**Existing infrastructure:** `GET /api/tasks` endpoint accepts `dueBefore`/`dueAfter` params (validated by `listTasksQuerySchema` in `task.service.ts`). No backend changes needed.

**Client-side gap:** No `useTasks` query hook or `taskApi.list` method exists yet. The calendar will:

1. Add `taskApi.list(params)` to `apps/web/src/features/task/api.ts` — calls `GET /api/tasks` with query params
2. Create `useCalendarTasks` as a `useQuery` call (not a composition over a non-existent hook):

```ts
function useCalendarTasks(workspaceId: string, savedViewFilters: SavedViewFilters) {
  const { dateRange } = useCalendar();
  return useQuery({
    queryKey: [
      'calendar',
      workspaceId,
      dateRange.start.toISOString(),
      dateRange.end.toISOString(),
      savedViewFilters,
    ],
    queryFn: () =>
      taskApi.list({
        workspaceId,
        dueAfter: dateRange.start.toISOString(),
        dueBefore: dateRange.end.toISOString(),
        ...savedViewFilters,
      }),
    enabled: Boolean(workspaceId),
  });
}
```

Query key: `['calendar', workspaceId, dateRange.start, dateRange.end, ...filters]`

The `taskApi.list` method is reusable by other features (e.g., future List/Table views that need filtered task queries). The calendar does not create calendar-specific data fetching logic — it uses the standard TanStack Query pattern.

### 5.2 Mutation (Drag & Drop)

`useCalendarDnD` wraps existing `useUpdateTask(workspaceId)` from `apps/web/src/features/task/hooks.ts`:

```ts
function useCalendarDnD(workspaceId: string) {
  const updateTask = useUpdateTask(workspaceId); // existing mutation

  const handleMove = (taskId: string, newDate: Date) => {
    updateTask.mutate({
      id: taskId,
      body: { dueDate: newDate.toISOString() },
    });
  };

  return { handleMove, isPending: updateTask.isPending };
}
```

`useUpdateTask` already invalidates `taskKeys.board(workspaceId)` on success. The calendar query key (`['calendar', ...]`) is different from the board key (`['board', ...]`), so we need to add calendar query invalidation to the mutation's `onSuccess`, or use `queryClient.invalidateQueries({ queryKey: ['calendar', workspaceId] })` in the `onSettled` callback.

Optimistic update: same pattern as board's `useMoveTask` — snapshot, apply, rollback on error, invalidate on settle.

### 5.3 Realtime Sync

Calendar uses the **same `useTaskRealtime()` hook** as Board/List/Table:

- `task:moved` → invalidate calendar query
- `task:updated` → invalidate if task is in current view
- `task:created` → invalidate if new task falls in visible date range
- `task:deleted` → invalidate if task was in visible range

No calendar-specific socket listeners.

### 5.4 Saved View Integration

Calendar respects the currently selected Saved View's filters (assignee, label, status). No calendar-specific Saved Views. Filters are merged into the `useCalendarTasks` query params.

## 6. Drag & Drop

### 6.1 Interaction Model

- **Desktop:** Drag `DraggableTaskCard` to a day cell. `DragOverlay` provides visual feedback (ghost card follows cursor). Target cell highlights on hover.
- **Mobile:** Tap task → opens edit date picker in drawer. No drag on mobile.

### 6.2 DnD Layer

DnD is **independent from grid components**. Grids expose drop targets; the DnD layer coordinates:

```
MonthGrid (renders cells)
    ↓
CalendarDnD (coordinates drag/drop)
    ↓
DropTarget (date cells)
```

Grids only render cells. DnD layer decides which cells are drop targets. This keeps the interaction layer reusable across Month/Week/Day/Timeline.

### 6.3 Constraints

- Drag within the same calendar view only (no cross-grid Month→Week)
- DnD disabled on mobile — use tap-to-edit-date instead
- No time-slot snapping — drops snap to day cell boundary
- DnD architecture is extensible for future cross-view dragging

### 6.4 Visual Feedback

Use `@dnd-kit`'s `DragOverlay` for the ghost card (not DOM cloning — smoother and more consistent).

## 7. Responsive Design

### 7.1 Breakpoints

- **Desktop (≥1024px):** Full month grid, week grid with visible task cards, day grid with all details
- **Tablet (768-1023px):** Month grid compresses — task cards truncate earlier, fewer visible per cell. Week/day unchanged
- **Mobile (<768px):** Month grid collapses to compact mode — day numbers with dot indicators, tap to expand day's tasks in drawer. Week view switches to single-day focus with swipe navigation

### 7.2 Strategy

Responsive behavior via Tailwind responsive prefixes (`md:`, `lg:`) and `useMediaQuery` hook for mobile day-drawer. Layout adaptations rather than completely different component trees wherever possible.

## 8. Keyboard Accessibility

From v1, calendar supports:

- **Tab** navigation between cells and tasks
- **Arrow keys** to move between days
- **Enter** to open task detail
- **Space** to pick up task (keyboard DnD), arrow to move, space to drop
- Focus rings on all interactive elements
- ARIA attributes: `role="grid"`, `role="gridcell"`, `aria-label` for dates and tasks

Full keyboard DnD is complex — v1 provides basic navigation and task opening. Keyboard DnD can be enhanced in a follow-up.

## 9. Implementation Phases

### Phase 1: Month View (Foundation)

- CalendarProvider, CalendarLayout, CalendarToolbar
- MonthGrid with TaskCard
- `useCalendarTasks` (compose existing task query)
- Basic navigation (prev/next/today)
- Saved View filter integration
- Sidebar NavLink + route
- Responsive month grid
- Keyboard navigation basics

### Phase 2: Month View (DnD + Realtime)

- DraggableTaskCard with @dnd-kit
- Drag between day cells (optimistic update)
- Socket.IO realtime sync (reuse `useTaskRealtime`)
- Mobile: tap-to-edit-date in drawer

### Phase 3: Week View

- WeekGrid (reuses same provider, hooks, DnD logic)
- Week navigation
- Responsive week layout

### Phase 4: Day View

- DayGrid (reuses WeekView architecture)
- Day detail with full task info
- Responsive day layout

## 10. Testing Strategy

- Unit tests: date utility functions (`getMonthDays`, `getWeekDays`)
- Component tests: MonthGrid renders correct cells, TaskCard displays task data
- Integration tests: DnD move triggers mutation, realtime sync invalidates query
- E2E: navigate months, drag task to new date, verify persistence

## 11. Risks

| Risk                                           | Likelihood | Impact | Mitigation                                               |
| ---------------------------------------------- | ---------- | ------ | -------------------------------------------------------- |
| Month grid performance with many tasks per day | Medium     | Medium | Virtual scrolling or "show first N" with overflow drawer |
| DnD conflicts with existing board DnD          | Low        | Low    | Separate DnD contexts, no cross-view dragging in v1      |
| Responsive month grid complexity               | High       | Medium | Start with compact mobile mode, iterate                  |
| Keyboard DnD accessibility                     | Medium     | Low    | Basic nav in v1, full DnD keyboard in follow-up          |
