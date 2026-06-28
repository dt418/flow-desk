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
  GitBranch,
  Eye,
  EyeOff,
  X as XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { useSuggestAssignee } from '@/features/ai';
import type { SuggestAssigneeSuggestion } from '@/features/ai';
import { cn } from '@/lib/utils';

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
  avatarUrl?: string | null;
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
  DONE: 'bg-emerald-500',
  BLOCKED: 'bg-red-500',
};

function MemberAvatar({ name, avatarUrl, size = 6 }: { name: string; avatarUrl?: string | null; size?: 6 | 8 }) {
  const dim = size === 6 ? 'h-6 w-6' : 'h-8 w-8';
  return (
    <Avatar className={`${dim} rounded-full bg-slate-200`}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
      <AvatarFallback className="text-[10px] font-medium text-slate-600">
        {name.charAt(0).toUpperCase()}
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

function FieldDivider() {
  return <div className="border-t border-[var(--border)]" />;
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[11px] font-medium uppercase tracking-wider text-[var(--fg-3)]',
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
  members,
  initial,
}: Props) {
  const create = useCreateTask(workspaceId);
  const update = useUpdateTask(workspaceId);
  const suggestAssignee = useSuggestAssignee(workspaceId);
  const isEdit = Boolean(initial);
  const [tab, setTab] = React.useState<'details' | 'chat'>('details');
  const [aiSuggestions, setAiSuggestions] = React.useState<SuggestAssigneeSuggestion[] | null>(
    null,
  );
  const [previewDescription, setPreviewDescription] = React.useState(false);

  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => abortRef.current?.abort(), []);

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
      });
      setTab('details');
      setAiSuggestions(null);
    }
  }, [open, initial, defaultColumnId, columns, reset]);

  const watchTitle = watch('title');
  const watchDescription = watch('description') ?? '';

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

  const isMac = React.useMemo(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-full flex-col gap-0 rounded-xl p-0 sm:max-w-2xl"
        aria-describedby="task-edit-desc"
      >
        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <DialogTitle className="text-sm font-semibold tracking-tight">
            {isEdit ? 'Edit task' : 'New task'}
          </DialogTitle>
          {isEdit && (
            <div className="flex items-center gap-1 text-[12px]">
              <button
                type="button"
                onClick={() => setTab('details')}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  tab === 'details'
                    ? 'bg-[var(--bg-3)] text-[var(--fg)]'
                    : 'text-[var(--fg-3)] hover:text-[var(--fg)]',
                )}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setTab('chat')}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  tab === 'chat'
                    ? 'bg-[var(--bg-3)] text-[var(--fg)]'
                    : 'text-[var(--fg-3)] hover:text-[var(--fg)]',
                )}
              >
                Chat
              </button>
            </div>
          )}
        </DialogHeader>
        <DialogDescription id="task-edit-desc" className="sr-only">
          {isEdit ? 'Edit task details' : 'Create a new task'}
        </DialogDescription>

        {tab === 'details' && (
          <form onSubmit={on_submit} onKeyDown={handleFormKeyDown} className="flex min-h-0 flex-1 flex-col">
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
                <p className="-mt-2 text-[11px] text-red-500">{errors.title.message}</p>
              )}

              {/* Description */}
              {previewDescription ? (
                <div className="min-h-[44px] rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--fg-2)]">
                  {watchDescription.trim() ? (
                    <div
                      className="prose prose-sm prose-invert max-w-none [&_a]:text-emerald-400 [&_code]:rounded [&_code]:bg-[var(--bg-3)] [&_code]:px-1 [&_h1]:mb-1 [&_h2]:mb-1 [&_h3]:mb-1 [&_p]:mb-1.5 [&_ul]:mb-1.5"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdownToHtml(watchDescription),
                      }}
                    />
                  ) : (
                    <span className="text-[var(--fg-3)]">No description</span>
                  )}
                </div>
              ) : (
                <textarea
                  {...register('description')}
                  rows={2}
                  placeholder="Add a description…"
                  aria-label="Task description"
                  className="w-full resize-y rounded-md border border-transparent bg-transparent px-0 text-[13px] leading-relaxed text-[var(--fg-2)] placeholder:text-[var(--fg-3)] outline-none transition-colors focus-visible:border-[var(--border)] focus-visible:bg-[var(--bg-2)] focus-visible:px-3 focus-visible:py-2"
                />
              )}
              <button
                type="button"
                onClick={() => setPreviewDescription((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--fg-3)] transition-colors hover:text-[var(--fg-2)]"
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

              <FieldDivider />

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

              <FieldDivider />

              {/* Assignee + Due Date */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <SectionLabel className="flex items-center gap-1.5">
                      <User className="h-3 w-3" /> Assignee
                    </SectionLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleSuggest}
                      disabled={suggestAssignee.isPending || members.length === 0}
                      className="gap-1 text-[11px] text-emerald-500 hover:text-emerald-400"
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
                    render={({ field }) => {
                      const selected = members.find((m) => m.id === field.value);
                      return (
                        <Select value={field.value ?? ''} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Unassigned">
                              {selected ? (
                                <span className="flex items-center gap-2">
                                  <MemberAvatar name={selected.name} avatarUrl={selected.avatarUrl} />
                                  <span>{selected.name}</span>
                                </span>
                              ) : (
                                <span className="text-[var(--fg-3)]">Unassigned</span>
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
                            className="flex w-full items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-2 py-1.5 text-left transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5"
                            title={`Assign to ${member?.name ?? 'this user'}`}
                          >
                            <span className="text-[12px] font-medium text-[var(--fg)]">
                              {member?.name ?? s.userId.slice(0, 8)}
                            </span>
                            <span className="max-w-[160px] truncate text-[11px] text-[var(--fg-3)]">
                              {s.reason}
                            </span>
                          </button>
                        );
                      })}
                      {suggestAssignee.data?.fallback && (
                        <p className="text-[11px] text-[var(--warning)]">
                          Rule-based (AI unavailable)
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
                        <Input
                          type="date"
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value)}
                          aria-label="Due date"
                          className="w-full"
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
                                  'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                                  active
                                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500'
                                    : 'border-[var(--border)] bg-[var(--bg-2)] text-[var(--fg-2)] hover:border-[var(--fg-3)] hover:text-[var(--fg)]',
                                )}
                              >
                                {q.label}
                              </button>
                            );
                          })}
                          {field.value && (
                            <button
                              type="button"
                              onClick={() => field.onChange('')}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-0.5 text-[11px] font-medium text-[var(--fg-3)] transition-colors hover:border-[var(--fg-3)] hover:text-[var(--fg)]"
                            >
                              <XIcon className="h-3 w-3" /> Clear
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  />
                </div>
              </div>
            </div>
            
            {/* Footer — sticky, always visible */}
            <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="h-9 px-3 text-[12px]"
              >
                Cancel
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="h-9 bg-emerald-500 px-4 text-[12px] text-white hover:bg-emerald-600"
                  >
                    {isSubmitting
                      ? isEdit
                        ? 'Saving…'
                        : 'Creating…'
                      : isEdit
                        ? 'Save'
                        : 'Create task'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  <span className="flex items-center gap-1.5">
                    <kbd className="rounded border border-[var(--border)] bg-[var(--bg-3)] px-1 font-mono text-[10px] text-[var(--fg-2)]">
                      {isMac ? '⌘' : 'Ctrl'}
                    </kbd>
                    <span className="text-[var(--fg-3)]">+</span>
                    <kbd className="rounded border border-[var(--border)] bg-[var(--bg-3)] px-1 font-mono text-[10px] text-[var(--fg-2)]">
                      ↵
                    </kbd>
                    <span className="text-[var(--fg-2)]">to submit</span>
                  </span>
                </TooltipContent>
              </Tooltip>
            </div>
          </form>
        )}

        {tab === 'chat' && initial && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TaskChat taskId={initial.id} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function NewTaskModal(props: Omit<Props, 'initial'>) {
  return <TaskEditModal {...props} initial={null} />;
}
