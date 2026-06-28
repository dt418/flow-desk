import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useCreateTask, useUpdateTask } from '../hooks';
import type { TaskCardData } from './TaskCard';
import { TaskChat } from '@/features/chat/components/TaskChat';
import { useSuggestAssignee } from '@/features/ai';
import type { SuggestAssigneeSuggestion } from '@/features/ai';

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
  const suggestAssignee = useSuggestAssignee(workspaceId);
  const firstInputRef = React.useRef<HTMLInputElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const isEdit = Boolean(initial);
  const [tab, setTab] = React.useState<'details' | 'chat'>('details');
  const [aiSuggestions, setAiSuggestions] = React.useState<SuggestAssigneeSuggestion[] | null>(null);

  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  const handleSuggest = () => {
    abortRef.current = new AbortController();
    setAiSuggestions(null);
    suggestAssignee.mutate(
      { taskId: initial?.id, title: watchTitle || initial?.title, signal: abortRef.current.signal },
      {
        onSuccess: (data) => setAiSuggestions(data.suggestions),
        onError: () => toast.error('AI suggestion failed'),
      },
    );
  };

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
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
      setTab('details');
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

  const watchTitle = watch('title');

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
      <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
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

        {isEdit && (
          <div className="flex border-b border-[var(--border)] px-5">
            <button
              type="button"
              onClick={() => setTab('details')}
              className={`px-4 py-2 text-sm font-medium ${
                tab === 'details'
                  ? 'border-b-2 border-emerald-500 text-emerald-500'
                  : 'text-[var(--fg-2)] hover:text-[var(--fg)]'
              }`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setTab('chat')}
              className={`px-4 py-2 text-sm font-medium ${
                tab === 'chat'
                  ? 'border-b-2 border-emerald-500 text-emerald-500'
                  : 'text-[var(--fg-2)] hover:text-[var(--fg)]'
              }`}
            >
              Chat
            </button>
          </div>
        )}

        {tab === 'details' && (
          <form onSubmit={onSubmit} className="flex-1 space-y-3 overflow-y-auto p-5">
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
                <Label>Column</Label>
                <Controller
                  name="columnId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick a column" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pick status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BACKLOG">Backlog</SelectItem>
                        <SelectItem value="TODO">Todo</SelectItem>
                        <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                        <SelectItem value="IN_REVIEW">In Review</SelectItem>
                        <SelectItem value="DONE">Done</SelectItem>
                        <SelectItem value="BLOCKED">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Controller
                  name="priority"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="URGENT">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Assignee</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSuggest}
                    disabled={suggestAssignee.isPending}
                    className="h-auto gap-1 px-1.5 py-0.5 text-[11px] text-emerald-500 hover:text-emerald-400"
                    title="AI-suggest assignee based on workload"
                  >
                    {suggestAssignee.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    {suggestAssignee.isPending ? 'Thinking…' : 'Suggest'}
                  </Button>
                </div>
                <Controller
                  name="assigneeId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Unassigned</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {aiSuggestions && (
                  <div className="space-y-1 pt-1">
                    {aiSuggestions.map((s) => {
                      const member = members.find((m) => m.id === s.userId);
                      return (
                        <div
                          key={s.userId}
                          className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-2 py-1.5"
                        >
                          <span className="text-[13px] font-medium text-[var(--fg)]">
                            {member?.name ?? s.userId.slice(0, 8)}
                          </span>
                          <span className="max-w-[180px] truncate text-[11px] text-[var(--fg-3)]">
                            {s.reason}
                          </span>
                        </div>
                      );
                    })}
                    {suggestAssignee.data?.fallback && (
                      <p className="text-[11px] text-[var(--warning)]">Rule-based (AI unavailable)</p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Due date</Label>
                <Input id="task-due" type="date" {...register('dueDate')} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
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
        )}

        {tab === 'chat' && initial && (
          <div className="flex-1 overflow-hidden">
            <TaskChat taskId={initial.id} />
          </div>
        )}
      </div>
    </div>
  );
}

export function NewTaskModal(props: Omit<Props, 'initial'>) {
  return <TaskEditModal {...props} initial={null} />;
}
