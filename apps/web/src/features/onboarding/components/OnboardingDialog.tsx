import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth';
import { useOnboarding } from '../hooks/useOnboarding';

const workspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(50),
});
type WorkspaceInput = z.infer<typeof workspaceSchema>;

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
});
type TaskInput = z.infer<typeof taskSchema>;

interface ColumnOption {
  id: string;
  name: string;
}

interface CreatedWorkspace {
  id: string;
  name: string;
  slug: string;
}

interface OnboardingDialogProps {
  /** When false the wizard renders nothing. */
  open: boolean;
  /** Called when the wizard finishes (either by completing step 3 or by the user skipping). */
  onClose: () => void;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base.length > 0 ? base.slice(0, 40) : 'workspace';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function OnboardingDialog({ open, onClose }: OnboardingDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [createdWorkspace, setCreatedWorkspace] = React.useState<CreatedWorkspace | null>(null);
  const [columns, setColumns] = React.useState<ColumnOption[]>([]);

  const workspaceForm = useForm<WorkspaceInput>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: { name: '' },
  });

  const taskForm = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: { title: 'Welcome to FlowDesk' },
  });

  React.useEffect(() => {
    if (!open) {
      setStep(1);
      setCreatedWorkspace(null);
      setColumns([]);
      workspaceForm.reset({ name: '' });
      taskForm.reset({ title: 'Welcome to FlowDesk' });
    }
  }, [open, workspaceForm, taskForm]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onCreateWorkspace = workspaceForm.handleSubmit(async (values) => {
    try {
      const data = await api<{ workspace: CreatedWorkspace }>('/api/workspaces', {
        method: 'POST',
        json: {
          name: values.name.trim(),
          slug: slugify(values.name),
          visibility: 'PRIVATE',
        },
      });
      setCreatedWorkspace(data.workspace);
      try {
        const cols = await api<{
          workspace: { columns?: ColumnOption[] };
        }>(`/api/workspaces/${data.workspace.id}`);
        setColumns(cols.workspace.columns ?? []);
      } catch {
        setColumns([]);
      }
      setStep(3);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create workspace');
    }
  });

  const onCreateFirstTask = taskForm.handleSubmit(async (values) => {
    if (!createdWorkspace) {
      onClose();
      return;
    }
    const firstColumn = columns[0];
    if (!firstColumn) {
      toast.error('No columns available in the new workspace yet — try refreshing.');
      return;
    }
    try {
      await api('/api/tasks', {
        method: 'POST',
        json: {
          workspaceId: createdWorkspace.id,
          columnId: firstColumn.id,
          title: values.title.trim(),
          priority: 'MEDIUM',
          status: 'TODO',
        },
      });
      toast.success('Workspace and first task ready');
      onClose();
      navigate(`/board/${createdWorkspace.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create task');
    }
  });

  const stepTitle =
    step === 1 ? 'Welcome' : step === 2 ? 'Create your workspace' : 'Your first task';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <Stepper current={step} />

        <div className="mt-5 mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          <h3 id="onboarding-title" className="text-base font-semibold tracking-tight">
            {stepTitle}
          </h3>
        </div>

        {step === 1 && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/60 p-3">
              <Avatar className="h-12 w-12 text-sm">
                {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
                <AvatarFallback>{initials(user?.name ?? '?')}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user?.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Hi {user?.name?.split(' ')[0] ?? 'there'} — let&apos;s set up your workspace so you
              can start tracking work. Three quick steps and you&apos;re done.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setStep(2)} size="sm" className="h-9 px-4">
                Get started
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={onCreateWorkspace} className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick a name for your first workspace. You can rename it later.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="onb-ws-name">Workspace name</Label>
              <Input
                id="onb-ws-name"
                placeholder="e.g. Acme Team"
                autoFocus
                aria-invalid={Boolean(workspaceForm.formState.errors.name)}
                {...workspaceForm.register('name')}
              />
              {workspaceForm.formState.errors.name && (
                <p className="text-xs text-destructive" role="status">
                  {workspaceForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(1)}
                className="h-9 px-3 text-[12px]"
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={workspaceForm.formState.isSubmitting}
                size="sm"
                className="h-9 px-4"
              >
                {workspaceForm.formState.isSubmitting ? 'Creating…' : 'Continue'}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={onCreateFirstTask} className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Almost done. Give your first task a title — it lands in{' '}
              <span className="font-medium text-foreground">
                {columns[0]?.name ?? 'the first column'}
              </span>
              .
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="onb-task-title">Task title</Label>
              <Input
                id="onb-task-title"
                autoFocus
                aria-invalid={Boolean(taskForm.formState.errors.title)}
                {...taskForm.register('title')}
              />
              {taskForm.formState.errors.title && (
                <p className="text-xs text-destructive" role="status">
                  {taskForm.formState.errors.title.message}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(2)}
                size="sm"
                className="h-9 px-3"
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={taskForm.formState.isSubmitting}
                size="sm"
                className="h-9 px-4"
              >
                {taskForm.formState.isSubmitting ? 'Saving…' : 'Done'}
                <Check className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = [1, 2, 3] as const;
  return (
    <ol className="flex items-center gap-2" aria-label="Onboarding steps">
      {steps.map((n, i) => {
        const done = current > n;
        const active = current === n;
        return (
          <React.Fragment key={n}>
            <li className="flex items-center gap-2">
              <span
                aria-current={active ? 'step' : undefined}
                className={
                  done
                    ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground'
                    : active
                      ? 'inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary text-[10px] font-semibold text-primary'
                      : 'inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground'
                }
              >
                {done ? <Check className="h-3 w-3" /> : n}
              </span>
              <span
                className={
                  active ? 'text-xs font-medium text-foreground' : 'text-xs text-muted-foreground'
                }
              >
                {n === 1 ? 'Welcome' : n === 2 ? 'Workspace' : 'First task'}
              </span>
            </li>
            {i < steps.length - 1 && (
              <span aria-hidden className={done ? 'h-px w-6 bg-primary' : 'h-px w-6 bg-border'} />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/**
 * Drop-in helper that wires the OnboardingDialog to auth + workspace list.
 * Mount once near the app root (e.g. inside AppShell). Renders nothing when
 * the wizard is not needed.
 */
export function OnboardingGate() {
  const { user } = useAuth();
  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: () =>
      api<{ data: Array<{ id: string }>; nextCursor: string | null }>('/api/workspaces'),
    enabled: Boolean(user),
    staleTime: 60_000,
  });
  const count = workspacesQuery.data?.data.length ?? 0;
  const { show, markComplete } = useOnboarding(count);

  const handleClose = React.useCallback(() => {
    markComplete();
  }, [markComplete]);

  if (!user) return null;
  return <OnboardingDialog open={show} onClose={handleClose} />;
}
