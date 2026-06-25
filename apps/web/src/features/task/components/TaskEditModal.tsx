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
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).optional(),
  columnId: z.string().min(1, 'Pick a column'),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
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
            description: values.description?.trim() ? values.description.trim() : undefined,
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
          description: values.description?.trim() ? values.description.trim() : undefined,
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
