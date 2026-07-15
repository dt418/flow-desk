import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Sparkles,
  Loader2,
  Calendar,
  Flag,
  User,
  Columns3,
  CircleDot,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/utils';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { renderMarkdownToHtml } from '@/lib/sanitize';
import { useCreateTask, useUpdateTask } from '../hooks';
import type { TaskCardData } from './TaskCard';
import { TaskChat } from '@/features/chat/components/TaskChat';
import { ActivityTimeline } from '@/features/activity';
import { useSuggestAssignee } from '@/features/ai';
import type { SuggestAssigneeSuggestion, SuggestFallbackReason } from '@/features/ai';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title is too long'),
  description: z.string().max(10_000, 'Description is too long').optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).optional(),
  columnId: z.string().min(1, 'Pick a column'),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  type: z.enum(['TASK', 'EPIC', 'STORY', 'SUBTASK']).optional(),
  parentTaskId: z.string().optional(),
});
type FormInput = z.infer<typeof formSchema>;

export interface ColumnOption {
  id: string;
  name: string;
}

export interface MemberOption {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  /** P4-2: when creating, assign task to this board so kanban partition works */
  boardId?: string | null;
  columns: ColumnOption[];
  defaultColumnId?: string;
  members: MemberOption[];
  initial?: TaskCardData | null;
  /** Tasks list for parentTaskId selector */
  tasks?: Array<{ id: string; title: string; type?: string }>;
}

const PRIORITY_TONE: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

const STATUS_TONE: Record<string, string> = {
  BACKLOG: 'bg-slate-400',
  TODO: 'bg-slate-500',
  IN_PROGRESS: 'bg-blue-500',
  IN_REVIEW: 'bg-amber-500',
  DONE: 'bg-primary',
  BLOCKED: 'bg-red-500',
};

function MemberAvatar({
  name,
  avatarUrl,
  size = 6,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  size?: 6 | 8;
}) {
  const dim = size === 6 ? 'h-6 w-6' : 'h-8 w-8';
  return (
    <Avatar className={`${dim} rounded-full`}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={name ?? ''} /> : null}
      <AvatarFallback className="bg-muted text-[10px] font-medium text-muted-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const QUICK_DATE_OFFSETS: { label: string; days: number | null }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'Next week', days: 7 },
];

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-xs font-medium uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}

export function TaskEditModal({
  open,
  onClose,
  workspaceId,
  columns,
  defaultColumnId,
  boardId,
  members,
  initial,
  tasks,
}: Props) {
  const create = useCreateTask(workspaceId);
  const update = useUpdateTask(workspaceId);
  const suggestAssignee = useSuggestAssignee(workspaceId);
  const isEdit = Boolean(initial);
  const [tab, setTab] = React.useState<'details' | 'chat' | 'activity'>('details');
  const [aiSuggestions, setAiSuggestions] = React.useState<SuggestAssigneeSuggestion[] | null>(
    null,
  );
  const [aiFallbackReason, setAiFallbackReason] = React.useState<SuggestFallbackReason | null>(
    null,
  );
  const [previewDescription, setPreviewDescription] = React.useState(false);
  const [aiElapsedSec, setAiElapsedSec] = React.useState(0);

  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  // R-24: elapsed timer while AI request is in flight.
  React.useEffect(() => {
    if (!suggestAssignee.isPending) {
      setAiElapsedSec(0);
      return;
    }
    setAiElapsedSec(0);
    const id = window.setInterval(() => setAiElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [suggestAssignee.isPending]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initial?.title ?? '',
      description: initial?.description ?? '',
      priority: initial?.priority ?? 'MEDIUM',
      columnId: initial?.columnId ?? defaultColumnId ?? columns[0]?.id ?? '',
      assigneeId: initial?.assignee?.id ?? '',
      dueDate: initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
      status: (initial?.status as FormInput['status']) ?? 'TODO',
      type: (initial?.type as FormInput['type']) ?? 'TASK',
      parentTaskId: initial?.parentTaskId ?? '',
    },
  });

  React.useEffect(() => {
    if (open) {
      reset({
        title: initial?.title ?? '',
        description: initial?.description ?? '',
        priority: initial?.priority ?? 'MEDIUM',
        columnId: initial?.columnId ?? defaultColumnId ?? columns[0]?.id ?? '',
        assigneeId: initial?.assignee?.id ?? '',
        dueDate: initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
        status: (initial?.status as FormInput['status']) ?? 'TODO',
        type: (initial?.type as FormInput['type']) ?? 'TASK',
        parentTaskId: initial?.parentTaskId ?? '',
      });
      setTab('details');
      setAiSuggestions(null);
      setAiFallbackReason(null);
    }
  }, [open, initial, defaultColumnId, columns, reset]);

  // R-24: abort in-flight AI when modal closes (unmount also aborts via abortRef).
  React.useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  const watchTitle = watch('title');
  const watchDescription = watch('description') ?? '';

  const handleSuggest = () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setAiSuggestions(null);
    setAiFallbackReason(null);
    suggestAssignee.mutate(
      {
        taskId: initial?.id,
        title: watchTitle || initial?.title,
        description: watchDescription || undefined,
        signal: abortRef.current.signal,
      },
      {
        onSuccess: (data) => {
          setAiSuggestions(data.suggestions);
          setAiFallbackReason(data.fallback ? (data.fallbackReason ?? 'error') : null);
        },
        onError: (err) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          if (err instanceof DOMException && err.name === 'AbortError') return;
          toast.error('AI suggestion failed');
        },
      },
    );
  };

  const handleCancelSuggest = () => {
    abortRef.current?.abort();
    suggestAssignee.reset();
  };

  const on_submit = handleSubmit(async (values) => {
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
            type: values.type,
            parentTaskId:
              values.parentTaskId && values.parentTaskId !== '' ? values.parentTaskId : null,
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
          type: values.type,
          parentTaskId:
            values.parentTaskId && values.parentTaskId !== '' ? values.parentTaskId : undefined,
          ...(boardId ? { boardId } : {}),
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

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      on_submit();
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      on_submit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-full flex-col gap-0 rounded-xl p-0 sm:max-w-2xl"
        aria-describedby="task-edit-desc"
      >
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Header */}
          <DialogHeader className="flex-row items-center justify-between border-b border-border px-5 py-3">
            <DialogTitle className="text-sm font-semibold tracking-tight">
              {isEdit ? 'Edit task' : 'New task'}
            </DialogTitle>
            {isEdit && (
              <TabsList variant="line" className="text-xs">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="chat">Chat</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
            )}
          </DialogHeader>
          <DialogDescription id="task-edit-desc" className="sr-only">
            {isEdit ? 'Edit task details' : 'Create a new task'}
          </DialogDescription>

          {tab === 'details' && (
            <form
              onSubmit={on_submit}
              onKeyDown={handleFormKeyDown}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {/* Title — highest priority */}
                <Input
                  {...register('title')}
                  autoFocus
                  onKeyDown={handleTitleKeyDown}
                  placeholder="What needs to happen?"
                  aria-label="Task title"
                  aria-invalid={Boolean(errors.title)}
                  className="h-11 border-transparent bg-transparent px-0 text-base font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0"
                />
                {errors.title && (
                  <p className="-mt-2 text-xs text-destructive" role="status">
                    {errors.title.message}
                  </p>
                )}

                {/* Description */}
                {previewDescription ? (
                  <div className="min-h-[44px] rounded-md border border-border bg-card px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                    {watchDescription.trim() ? (
                      <div
                        className="prose prose-sm prose-invert max-w-none [&_a]:text-primary [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:mb-1 [&_h2]:mb-1 [&_h3]:mb-1 [&_p]:mb-1.5 [&_ul]:mb-1.5"
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdownToHtml(watchDescription),
                        }}
                      />
                    ) : (
                      <span className="text-muted-foreground">No description</span>
                    )}
                  </div>
                ) : (
                  <textarea
                    {...register('description')}
                    rows={2}
                    placeholder="Add a description…"
                    aria-label="Task description"
                    className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setPreviewDescription((v) => !v)}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={previewDescription ? 'Edit description' : 'Preview description'}
                >
                  {previewDescription ? (
                    <>
                      <EyeOff className="h-3 w-3" /> Edit
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" /> Preview
                    </>
                  )}
                </button>

                <Separator />

                {/* Column + Status */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <SectionLabel className="flex items-center gap-1.5">
                      <Columns3 className="h-3 w-3" /> Column
                    </SectionLabel>
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
                    <SectionLabel className="flex items-center gap-1.5">
                      <CircleDot className="h-3 w-3" /> Status
                    </SectionLabel>
                    <Controller
                      name="status"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pick status" />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              [
                                'BACKLOG',
                                'TODO',
                                'IN_PROGRESS',
                                'IN_REVIEW',
                                'DONE',
                                'BLOCKED',
                              ] as const
                            ).map((s) => (
                              <SelectItem key={s} value={s}>
                                <span className="flex items-center gap-2">
                                  <span className={cn('h-2 w-2 rounded-full', STATUS_TONE[s])} />
                                  {s.replace('_', ' ')}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>

                {/* Priority */}
                <div className="space-y-1.5">
                  <SectionLabel className="flex items-center gap-1.5">
                    <Flag className="h-3 w-3" /> Priority
                  </SectionLabel>
                  <Controller
                    name="priority"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const).map((p) => (
                            <SelectItem key={p} value={p}>
                              <span className="flex items-center gap-2">
                                <span className={cn('h-2 w-2 rounded-full', PRIORITY_TONE[p])} />
                                {p.charAt(0) + p.slice(1).toLowerCase()}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {/* Type + Parent */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <SectionLabel>Type</SectionLabel>
                    <Controller
                      name="type"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value ?? 'TASK'} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['TASK', 'EPIC', 'STORY', 'SUBTASK'] as const).map((t) => (
                              <SelectItem key={t} value={t}>
                                {t === 'EPIC'
                                  ? '📦 '
                                  : t === 'STORY'
                                    ? '📖 '
                                    : t === 'SUBTASK'
                                      ? '🔗 '
                                      : ''}
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <SectionLabel>Parent task</SectionLabel>
                    <Controller
                      name="parentTaskId"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">None</SelectItem>
                            {(tasks ?? [])
                              .filter((t) => t.type === 'EPIC')
                              .map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  📦 {t.title}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>

                <Separator />

                {/* Assignee + Due Date */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <SectionLabel className="flex items-center gap-1.5">
                        <User className="h-3 w-3" /> Assignee
                      </SectionLabel>
                      <div className="flex items-center gap-1">
                        {suggestAssignee.isPending && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={handleCancelSuggest}
                            className="text-xs text-muted-foreground"
                            title="Cancel AI suggestion"
                          >
                            Cancel
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={handleSuggest}
                          disabled={suggestAssignee.isPending || members.length === 0}
                          className="gap-1 text-xs text-primary hover:text-primary/80"
                          title="AI-suggest assignee based on workload"
                        >
                          {suggestAssignee.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          {suggestAssignee.isPending
                            ? aiElapsedSec > 0
                              ? `AI thinking… ${aiElapsedSec}s`
                              : 'AI thinking…'
                            : 'Suggest'}
                        </Button>
                      </div>
                    </div>
                    <Controller
                      name="assigneeId"
                      control={control}
                      render={({ field }) => {
                        const selected = members.find((m) => m.id === field.value);
                        return (
                          <Select value={field.value ?? ''} onValueChange={field.onChange}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Unassigned">
                                {selected && selected.name ? (
                                  <span className="flex items-center gap-2">
                                    <MemberAvatar
                                      name={selected.name}
                                      avatarUrl={selected.avatarUrl}
                                    />
                                    <span>{selected.name}</span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">Unassigned</span>
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Unassigned</SelectItem>
                              {members.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  <span className="flex items-center gap-2">
                                    <MemberAvatar name={m.name} avatarUrl={m.avatarUrl} />
                                    <span>{m.name}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      }}
                    />
                    {aiSuggestions && (
                      <div className="space-y-1 pt-1">
                        {aiSuggestions.map((s) => {
                          const member = members.find((m) => m.id === s.userId);
                          return (
                            <button
                              key={s.userId}
                              type="button"
                              onClick={() => {
                                setValue('assigneeId', s.userId, { shouldValidate: true });
                                setAiSuggestions(null);
                              }}
                              className="flex w-full items-center justify-between rounded-md border border-border bg-card px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                              title={`Assign to ${member?.name ?? 'this user'}`}
                            >
                              <span className="text-xs font-medium text-foreground">
                                {member?.name ?? s.userId.slice(0, 8)}
                              </span>
                              <span className="max-w-[160px] truncate text-xs text-muted-foreground">
                                {s.reason}
                              </span>
                            </button>
                          );
                        })}
                        {(aiFallbackReason || suggestAssignee.data?.fallback) && (
                          <p className="text-[11px] text-[var(--warning)]">
                            {aiFallbackReason === 'timeout'
                              ? 'Rule-based (AI timed out — results by workload)'
                              : 'Rule-based (AI unavailable)'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <SectionLabel className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> Due date
                    </SectionLabel>
                    <Controller
                      name="dueDate"
                      control={control}
                      render={({ field }) => (
                        <div className="space-y-1.5">
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Pick a date"
                          />
                          <div className="flex flex-wrap items-center gap-1">
                            {QUICK_DATE_OFFSETS.map((q) => {
                              const d = new Date();
                              d.setDate(d.getDate() + (q.days ?? 0));
                              const value = toDateInputValue(d);
                              const active = field.value === value;
                              return (
                                <button
                                  key={q.label}
                                  type="button"
                                  onClick={() => field.onChange(value)}
                                  className={cn(
                                    'rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                                    active
                                      ? 'border-primary/50 bg-primary/10 text-primary'
                                      : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground',
                                  )}
                                >
                                  {q.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Footer — sticky, always visible */}
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  size="sm"
                  className="h-9 px-3"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} size="sm" className="h-9 px-4">
                  {isSubmitting
                    ? isEdit
                      ? 'Saving…'
                      : 'Creating…'
                    : isEdit
                      ? 'Save'
                      : 'Create task'}
                </Button>
              </div>
            </form>
          )}

          {tab === 'chat' && initial && (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TaskChat taskId={initial.id} />
            </div>
          )}

          {tab === 'activity' && initial && (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <ActivityTimeline taskId={initial.id} />
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export function NewTaskModal(props: Omit<Props, 'initial'>) {
  return <TaskEditModal {...props} initial={null} />;
}
