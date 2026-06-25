# Kanban CRUD + Soft-Delete w/ Undo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable full CRUD for tasks on the Kanban board: click-to-edit modal, kebab menu (Edit/Delete), soft-delete with 5s Undo toast, and realtime sync.

**Architecture:** Backend adds `restore` endpoint; frontend reuses `TaskCard` `onClick` for edit modal, adds kebab menu with Delete, and implements optimistic delete + undo via sonner toast.

**Tech Stack:** Hono + Prisma (backend), React + TanStack Query + shadcn/ui (frontend), Socket.IO (realtime)

## Global Constraints

- Zod validation on all API inputs
- `deletedAt` field already exists in schema; no migrations
- Use existing `taskApi`, `useCreateTask`, `useRealtime` patterns
- Toast via `sonner` already imported in `board.tsx`
- No `any` types

---

## File Structure

| File                                                      | Responsibility                                     |
| --------------------------------------------------------- | -------------------------------------------------- |
| `packages/shared/src/task.ts`                             | Zod schema for restore (empty body)                |
| `apps/api/src/modules/task/task.service.ts`               | `restore()` method + emit `task:restored`          |
| `apps/api/src/modules/task/task.routes.ts`                | `POST /:id/restore` route                          |
| `apps/api/tests/integration/task.routes.test.ts`          | Integration tests for restore                      |
| `apps/web/src/features/task/api.ts`                       | `update()`, `restore()` client methods             |
| `apps/web/src/features/task/hooks.ts`                     | `useUpdateTask`, `useDeleteTask`, `useRestoreTask` |
| `apps/web/src/features/task/components/TaskEditModal.tsx` | Unified create/edit modal                          |
| `apps/web/src/features/task/components/NewTaskModal.tsx`  | Thin wrapper re-exporting `TaskEditModal`          |
| `apps/web/src/features/task/components/TaskCard.tsx`      | Kebab menu (Edit/Delete)                           |
| `apps/web/src/pages/board.tsx`                            | Modal state, optimistic delete, toast Undo         |
| `apps/web/src/features/realtime/useRealtime.ts`           | Add `task:restored` event listener                 |

---

### Task 1: Backend — Add restore endpoint

**Files:**

- Create: none
- Modify: `packages/shared/src/task.ts:149`
- Modify: `apps/api/src/modules/task/task.service.ts:177`
- Modify: `apps/api/src/modules/task/task.routes.ts:87`
- Test: `apps/api/tests/integration/task.routes.test.ts`

**Interfaces:**

- Consumes: existing `repo.findActiveById`, `assertMembership`, `safeEmit`
- Produces: `POST /api/tasks/:id/restore` → `{ task: Task }`, emits `task:restored`

- [ ] **Step 1: Add restore schema to shared/task.ts**

After `createSubtaskSchema` (line ~159):

```typescript
export const restoreTaskSchema = z.object({});
export type RestoreTaskInput = z.infer<typeof restoreTaskSchema>;
```

- [ ] **Step 2: Add restore method in task.service.ts**

After `delete` method (line ~177):

```typescript
async restore(userId: string, id: string) {
  const existing = await repo.findActiveById(prisma, id);
  if (!existing) throw new NotFoundError('Task not found');
  await assertMembership(existing.workspaceId, userId);
  const task = await prisma.task.update({
    where: { id },
    data: { deletedAt: null },
  });
  safeEmit(() => emitToWorkspace(existing.workspaceId, 'task:restored', { task }), {
    event: 'task:restored',
    taskId: id,
  });
  safeEmit(() => emitToTask(id, 'task:restored', { task }), {
    event: 'task:restored',
    taskId: id,
  });
  return task;
}
```

- [ ] **Step 3: Add restore route in task.routes.ts**

After `/:id/move` route (line ~69):

```typescript
taskRouter.post('/:id/restore', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  return c.json({ task: await taskService.restore(auth.user.id, id) });
});
```

- [ ] **Step 4: Add integration test in task.routes.test.ts**

Add a test case after the existing delete test:

```typescript
test('POST /:id/restore restores soft-deleted task', async () => {
  const created = await taskService.create(testUser.id, {
    workspaceId: testWorkspace.id,
    columnId: testColumn.id,
    title: 'Restore me',
    status: 'TODO',
    priority: 'MEDIUM',
  });
  await taskService.delete(testUser.id, created.id);
  const res = await app.request(`/api/tasks/${created.id}/restore`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${testToken}` },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.task.id).toBe(created.id);
  expect(body.task.deletedAt).toBeNull();
});
```

- [ ] **Step 5: Run backend tests**

Run: `pnpm --filter @flow-desk/api test`
Expected: all tests pass including new restore test

- [ ] **Step 6: Commit backend restore**

```bash
git add packages/shared/src/task.ts apps/api/src/modules/task/task.service.ts apps/api/src/modules/task/task.routes.ts apps/api/tests/integration/task.routes.test.ts
git commit -m "feat(api): add task restore endpoint + task:restored socket event"
```

---

### Task 2: Frontend — Add API client methods

**Files:**

- Modify: `apps/web/src/features/task/api.ts:11`

**Interfaces:**

- Consumes: `Task` type from `@flow-desk/shared/task`
- Produces: `taskApi.update(id, body)`, `taskApi.restore(id)`

- [ ] **Step 1: Add update and restore methods to taskApi**

After `move` method (line ~16):

```typescript
update(taskId: string, body: import('@flow-desk/shared/task').UpdateTaskInput) {
  return api<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    json: body,
  });
},
restore(taskId: string) {
  return api<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}/restore`, {
    method: 'POST',
  });
},
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: no errors

- [ ] **Step 3: Commit API client**

```bash
git add apps/web/src/features/task/api.ts
git commit -m "feat(web): add taskApi.update + restore methods"
```

---

### Task 3: Frontend — Add mutation hooks

**Files:**

- Modify: `apps/web/src/features/task/hooks.ts:9`

**Interfaces:**

- Consumes: `taskApi`, `taskKeys`
- Produces: `useUpdateTask`, `useDeleteTask`, `useRestoreTask`

- [ ] **Step 1: Add three mutation hooks**

After `useCreateTask` (line ~17):

```typescript
export function useUpdateTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: import('@flow-desk/shared/task').UpdateTaskInput;
    }) => taskApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.board(workspaceId) });
    },
  });
}

export function useDeleteTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      taskApi.delete ?? api<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.board(workspaceId) });
    },
  });
}

export function useRestoreTask(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => taskApi.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: taskKeys.board(workspaceId) });
    },
  });
}
```

Note: `taskApi.delete` doesn't exist yet; add it:

```typescript
// In api.ts, add:
delete(taskId: string) {
  return api<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
},
```

- [ ] **Step 2: Add delete to taskApi (if missing)**

In `apps/web/src/features/task/api.ts`, add after `restore`:

```typescript
delete(taskId: string) {
  return api<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
},
```

- [ ] **Step 3: Export hooks from index.ts**

Add to `apps/web/src/features/task/index.ts`:

```typescript
export { useUpdateTask, useDeleteTask, useRestoreTask } from './hooks';
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: no errors

- [ ] **Step 5: Commit hooks**

```bash
git add apps/web/src/features/task/hooks.ts apps/web/src/features/task/api.ts apps/web/src/features/task/index.ts
git commit -m "feat(web): add useUpdateTask, useDeleteTask, useRestoreTask hooks"
```

---

### Task 4: Frontend — Create unified TaskEditModal

**Files:**

- Create: `apps/web/src/features/task/components/TaskEditModal.tsx`
- Modify: `apps/web/src/features/task/components/NewTaskModal.tsx`
- Modify: `apps/web/src/features/task/index.ts`

**Interfaces:**

- Consumes: `useCreateTask`, `useUpdateTask`, form patterns from `NewTaskModal`
- Produces: `TaskEditModal` (create/edit), `NewTaskModal` as thin wrapper

- [ ] **Step 1: Create TaskEditModal.tsx**

Copy content from `NewTaskModal.tsx`, then modify:

```tsx
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useCreateTask, useUpdateTask } from '../hooks';
import type { TaskCardData } from './TaskCard';

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title is too long'),
  description: z.string().max(10_000, 'Description is too long').optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  columnId: z.string().min(1, 'Pick a column'),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).optional(),
});
type FormInput = z.infer<typeof formSchema>;

export interface ColumnOption {
  id: string;
  name: string;
}
export interface MemberOption {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  columns: ColumnOption[];
  defaultColumnId?: string;
  members: MemberOption[];
  initial?: TaskCardData | null;
}

export function TaskEditModal({
  open,
  onClose,
  workspaceId,
  columns,
  defaultColumnId,
  members,
  initial,
}: Props) {
  const create = useCreateTask(workspaceId);
  const update = useUpdateTask(workspaceId);
  const firstInputRef = React.useRef<HTMLInputElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initial?.title ?? '',
      description: '',
      priority: initial?.priority ?? 'MEDIUM',
      columnId: initial?.columnId ?? defaultColumnId ?? columns[0]?.id ?? '',
      assigneeId: initial?.assignee?.id ?? '',
      dueDate: initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
      status: (initial?.status as FormInput['status']) ?? 'TODO',
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        title: initial?.title ?? '',
        description: '',
        priority: initial?.priority ?? 'MEDIUM',
        columnId: initial?.columnId ?? defaultColumnId ?? columns[0]?.id ?? '',
        assigneeId: initial?.assignee?.id ?? '',
        dueDate: initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
        status: (initial?.status as FormInput['status']) ?? 'TODO',
      });
    }
  }, [open, initial, defaultColumnId, columns, reset]);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => firstInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const dueDate = values.dueDate
        ? new Date(`${values.dueDate}T00:00:00.000Z`).toISOString()
        : null;
      if (isEdit && initial) {
        await update.mutateAsync({
          id: initial.id,
          body: {
            title: values.title.trim(),
            description: values.description?.trim() || null,
            priority: values.priority,
            status: values.status,
            columnId: values.columnId,
            assigneeId: values.assigneeId && values.assigneeId !== '' ? values.assigneeId : null,
            dueDate,
          },
        });
        toast.success('Task updated');
      } else {
        await create.mutateAsync({
          workspaceId,
          columnId: values.columnId,
          title: values.title.trim(),
          description: values.description?.trim() || undefined,
          priority: values.priority,
          status: values.status ?? 'TODO',
          assigneeId: values.assigneeId && values.assigneeId !== '' ? values.assigneeId : null,
          dueDate,
        });
        toast.success('Task created');
      }
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : `Failed to ${isEdit ? 'update' : 'create'} task`,
      );
    }
  });

  return (
    <div
      ref={dialogRef}
      onMouseDown={onBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-edit-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="task-edit-title" className="text-[14px] font-semibold tracking-tight">
            {isEdit ? 'Edit task' : 'New task'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="caption rounded px-1.5 py-0.5 hover:bg-[var(--bg-2)]"
            aria-label="Close"
          >
            Esc
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              {...register('title')}
              ref={(el) => {
                register('title').ref(el);
                firstInputRef.current = el;
              }}
              placeholder="What needs to happen?"
              aria-invalid={Boolean(errors.title)}
            />
            {errors.title && <p className="text-[11px] text-red-500">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-desc">Description</Label>
            <textarea
              id="task-desc"
              {...register('description')}
              rows={3}
              placeholder="Optional"
              className="flex w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-[13px] placeholder:text-[var(--fg-3)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-column">Column</Label>
              <select
                id="task-column"
                {...register('columnId')}
                className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-status">Status</Label>
              <select
                id="task-status"
                {...register('status')}
                className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
              >
                <option value="BACKLOG">Backlog</option>
                <option value="TODO">Todo</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <select
                id="task-priority"
                {...register('priority')}
                className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-assignee">Assignee</Label>
              <select
                id="task-assignee"
                {...register('assigneeId')}
                className="flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 text-[13px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" {...register('dueDate')} />
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="h-9 px-3 text-[12px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-9 bg-emerald-500 px-4 text-[12px] text-white hover:bg-emerald-600"
            >
              {isSubmitting ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save' : 'Create task'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function NewTaskModal(props: Omit<Props, 'initial'>) {
  return <TaskEditModal {...props} initial={null} />;
}
```

- [ ] **Step 2: Replace NewTaskModal.tsx with re-export**

Replace entire content of `apps/web/src/features/task/components/NewTaskModal.tsx`:

```typescript
export { TaskEditModal, NewTaskModal } from './TaskEditModal';
export type { ColumnOption, MemberOption } from './TaskEditModal';
```

- [ ] **Step 3: Update index.ts exports**

Update `apps/web/src/features/task/index.ts`:

```typescript
export { taskApi } from './api';
export { taskKeys, useCreateTask, useUpdateTask, useDeleteTask, useRestoreTask } from './hooks';
export type { Task } from './types';
export { TaskEditModal, NewTaskModal } from './components/TaskEditModal';
export { TaskCard, TaskCardSkeleton } from './components/TaskCard';
export type { TaskCardData } from './components/TaskCard';
export { TaskLabelSelect } from './components/TaskLabelSelect';
export type { ColumnOption, MemberOption } from './components/TaskEditModal';
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: no errors

- [ ] **Step 5: Commit modal refactor**

```bash
git add apps/web/src/features/task/components/TaskEditModal.tsx apps/web/src/features/task/components/NewTaskModal.tsx apps/web/src/features/task/index.ts
git commit -m "refactor(web): TaskEditModal unifies create/edit; NewTaskModal thin wrapper"
```

---

### Task 5: Frontend — Add kebab menu to TaskCard

**Files:**

- Modify: `apps/web/src/features/task/components/TaskCard.tsx:77`

**Interfaces:**

- Consumes: `onClick` callback (already exists), add `onEdit`, `onDelete`
- Produces: TaskCard with kebab menu (Edit/Delete)

- [ ] **Step 1: Add DropdownMenu import and props**

Add to imports:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
```

Add to Props interface:

```tsx
interface Props {
  task: TaskCardData;
  workspaceId: string;
  canEditLabels?: boolean;
  className?: string;
  onClick?: (taskId: string) => void;
  onEdit?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
}
```

Update function signature:

```tsx
export function TaskCard({ task, workspaceId, canEditLabels = true, className, onClick, onEdit, onDelete }: Props) {
```

- [ ] **Step 2: Add kebab menu to card header area**

After the `<span className="absolute right-2...` line (~line 117), add:

```tsx
{
  (onEdit || onDelete) && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="absolute right-8 top-2 rounded p-1 opacity-0 transition-opacity hover:bg-[var(--bg-2)] group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          aria-label="Task actions"
        >
          <MoreHorizontal className="h-4 w-4 text-[var(--fg-2)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        {onEdit && (
          <DropdownMenuItem onClick={() => onEdit(task.id)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem
            onClick={() => onDelete(task.id)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: no errors

- [ ] **Step 4: Commit kebab menu**

```bash
git add apps/web/src/features/task/components/TaskCard.tsx
git commit -m "feat(web): add kebab menu to TaskCard with Edit/Delete actions"
```

---

### Task 6: Frontend — Wire board page with edit modal, delete, undo

**Files:**

- Modify: `apps/web/src/pages/board.tsx:98`

**Interfaces:**

- Consumes: `TaskEditModal`, `useDeleteTask`, `useRestoreTask`, `sonner` toast
- Produces: Full CRUD board experience with undo

- [ ] **Step 1: Add imports**

Add to imports:

```tsx
import { TaskEditModal, useDeleteTask, useRestoreTask } from '@/features/task';
import type { TaskCardData } from '@/features/task';
```

- [ ] **Step 2: Add state for edit modal + selected task**

After `const [modalOpen, setModalOpen] = React.useState(false);` (~line 102):

```tsx
const [editModalOpen, setEditModalOpen] = React.useState(false);
const [selectedTask, setSelectedTask] = React.useState<TaskCardData | null>(null);
const deleteTask = useDeleteTask(workspaceId);
const restoreTask = useRestoreTask(workspaceId);
```

- [ ] **Step 3: Add handlers for edit/delete**

After `membersQuery`:

```tsx
const handleEdit = (taskId: string) => {
  const task = orderedColumns.flatMap((c) => c.tasks).find((t) => t.id === taskId);
  if (task) {
    setSelectedTask(task as TaskCardData);
    setEditModalOpen(true);
  }
};

const handleDelete = (taskId: string) => {
  const task = orderedColumns.flatMap((c) => c.tasks).find((t) => t.id === taskId);
  if (!task) return;

  deleteTask.mutate(taskId, {
    onSuccess: () => {
      toast('Task deleted', {
        action: {
          label: 'Undo',
          onClick: () => {
            restoreTask.mutate(taskId);
          },
        },
        duration: 5000,
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete task');
    },
  });
};
```

- [ ] **Step 4: Pass onClick/onEdit/onDelete to TaskCard**

In the KanbanCard render (~line 280):

```tsx
<KanbanCard key={t.id} id={t.id} columnId={meta.id} index={i}>
  <TaskCard
    task={t as unknown as Parameters<typeof TaskCard>[0]['task']}
    workspaceId={workspaceId}
    onClick={() => handleEdit(t.id)}
    onEdit={handleEdit}
    onDelete={handleDelete}
  />
</KanbanCard>
```

- [ ] **Step 5: Add TaskEditModal for edit mode**

After the existing `NewTaskModal` at bottom (~line 288):

```tsx
<TaskEditModal
  open={editModalOpen}
  onClose={() => {
    setEditModalOpen(false);
    setSelectedTask(null);
  }}
  workspaceId={workspaceId}
  columns={orderedColumns.map(({ meta }) => ({ id: meta.id, name: meta.name }))}
  members={(membersQuery.data ?? []).map((m) => ({ id: m.user.id, name: m.user.name }))}
  initial={selectedTask}
/>
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @flow-desk/web typecheck`
Expected: no errors

- [ ] **Step 7: Commit board wiring**

```bash
git add apps/web/src/pages/board.tsx
git commit -m "feat(web): wire board with edit modal, delete + undo toast"
```

---

### Task 7: Frontend — Add task:restored realtime listener

**Files:**

- Modify: `apps/web/src/features/realtime/useRealtime.ts:30`

**Interfaces:**

- Consumes: existing socket pattern
- Produces: invalidation on `task:restored` event

- [ ] **Step 1: Add task:restored to events list**

Change line ~30-37:

```tsx
const events = [
  'task:created',
  'task:updated',
  'task:deleted',
  'task:restored',
  'task:moved',
  'task:subtask:created',
  'task:dependency:added',
];
```

- [ ] **Step 2: Commit realtime update**

```bash
git add apps/web/src/features/realtime/useRealtime.ts
git commit -m "feat(web): listen for task:restored socket event"
```

---

### Task 8: Integration verification

**Files:**

- No new files

**Interfaces:**

- Consumes: full stack
- Produces: verified working CRUD

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @flow-desk/api test`
Expected: all tests pass

- [ ] **Step 2: Run web build**

Run: `pnpm --filter @flow-desk/web build`
Expected: build succeeds (chunk warning ok)

- [ ] **Step 3: Manual e2e test**

1. Start dev: `docker compose up`
2. Navigate to `http://localhost:5173/board/:workspaceId`
3. Click a task card → edit modal opens
4. Change title → Save → board reflects
5. Click kebab → Delete → toast appears
6. Click Undo within 5s → card returns
7. Open second browser tab → verify realtime sync

- [ ] **Step 4: Push all commits**

```bash
git push
```

---

## Summary

8 tasks, ~35 steps total. Each task produces a testable deliverable:

1. Backend restore endpoint + socket event
2. Frontend API client methods
3. Mutation hooks
4. Unified TaskEditModal
5. TaskCard kebab menu
6. Board page wiring (modal, delete, undo)
7. Realtime listener
8. Full verification

After completion, the Kanban board supports full CRUD with soft-delete + undo, matching the spec in `docs/superpowers/specs/2026-06-24-kanban-crud-undo-design.md`.
