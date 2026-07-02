import { Link, useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Plus, Search, Calendar, AlertCircle, ListChecks, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDate } from '@/lib/utils';
import { WorkspaceCreateDialog } from '@/components/ui/workspace-create-dialog';

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  _count: { members: number; tasks: number };
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  workspaceId: string;
  columnId: string;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
}

const PRIORITY_BAR: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

const PRIORITY_VARIANT: Record<
  string,
  'outline' | 'secondary' | 'warning' | 'destructive'
> = {
  LOW: 'outline',
  MEDIUM: 'secondary',
  HIGH: 'warning',
  URGENT: 'destructive',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function relDays(
  value: string | null,
): { label: string; tone: 'overdue' | 'today' | 'soon' | 'normal' } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `${-days}d late`, tone: 'overdue' };
  if (days === 0) return { label: 'Today', tone: 'today' };
  if (days === 1) return { label: 'Tomorrow', tone: 'today' };
  if (days < 7)
    return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), tone: 'soon' };
  return { label: formatDate(value), tone: 'normal' };
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: 'default' | 'warning' | 'critical';
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
          <Icon
            className={cn(
              'size-4 text-muted-foreground',
              tone === 'warning' && 'text-amber-500',
              tone === 'critical' && 'text-red-500',
            )}
          />
        </CardDescription>
        <CardTitle
          className={cn(
            'text-2xl font-semibold tabular-nums',
            tone === 'critical' && 'text-red-500',
            tone === 'warning' && 'text-amber-600',
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-12" />
      </CardHeader>
    </Card>
  );
}

function TaskRow({ task, workspaceSlug }: { task: TaskRow; workspaceSlug?: string }) {
  const due = relDays(task.dueDate);
  const isDone = task.status === 'DONE';
  return (
    <Link
      to={`/board/${task.workspaceId}`}
      className={cn(
        'group flex items-center gap-3 px-3 py-2 transition-colors',
        'hover:bg-muted/50',
        isDone && 'opacity-60',
      )}
    >
      <span
        aria-hidden
        className={cn('h-8 w-[3px] rounded-full', PRIORITY_BAR[task.priority] ?? 'bg-slate-400')}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate text-sm font-medium',
            isDone && 'line-through text-muted-foreground',
          )}
        >
          {task.title}
        </div>
        {workspaceSlug && (
          <div className="truncate text-xs text-muted-foreground">/{workspaceSlug}</div>
        )}
      </div>
      <Badge variant={PRIORITY_VARIANT[task.priority] ?? 'outline'}>{task.priority}</Badge>
      {due ? (
        <Badge
          variant={
            due.tone === 'overdue'
              ? 'destructive'
              : due.tone === 'today'
                ? 'warning'
                : 'secondary'
          }
          className="tabular-nums"
        >
          {due.label}
        </Badge>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">—</span>
      )}
    </Link>
  );
}

function TaskSkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Skeleton className="h-8 w-[3px]" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
      <Skeleton className="h-4 w-12" />
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = React.useState(false);
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: { id: string; name: string } }>('/api/auth/me'),
  });

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<{ data: WorkspaceSummary[]; nextCursor: string | null }>('/api/workspaces'),
  });

  const workspaceList = workspaces.data?.data ?? [];

  const taskQueries = useQueries({
    queries: workspaceList.map((w) => ({
      queryKey: ['tasks', w.id],
      queryFn: () =>
        api<{ data: TaskRow[]; nextCursor: string | null }>(
          `/api/tasks?workspaceId=${encodeURIComponent(w.id)}`,
        ),
      enabled: Boolean(w.id),
      staleTime: 30_000,
    })),
  });

  const allTasks = React.useMemo<TaskRow[]>(() => {
    return taskQueries.flatMap((q) => q.data?.data ?? []);
  }, [taskQueries]);

  const myUserId = me.data?.user.id;
  const myTasks = React.useMemo(
    () =>
      allTasks
        .filter((t) => t.assignee?.id === myUserId && t.status !== 'DONE')
        .sort((a, b) => {
          const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return da - db;
        })
        .slice(0, 8),
    [allTasks, myUserId],
  );

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const overdueCount = allTasks.filter(
    (t) =>
      t.assignee?.id === myUserId &&
      t.status !== 'DONE' &&
      t.dueDate &&
      new Date(t.dueDate).getTime() < startOfToday.getTime(),
  ).length;
  const dueThisWeekCount = allTasks.filter((t) => {
    if (t.assignee?.id !== myUserId || t.status === 'DONE' || !t.dueDate) return false;
    const ms = new Date(t.dueDate).getTime();
    return ms >= startOfToday.getTime() && ms <= endOfWeek.getTime();
  }).length;
  const totalOpen = allTasks.filter(
    (t) => t.assignee?.id === myUserId && t.status !== 'DONE',
  ).length;

  const greeting = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return 'Working late';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const loadingWorkspaces =
    workspaces.isLoading || (workspaceList.length > 0 && taskQueries.some((q) => q.isLoading));

  return (
    <div className="flex w-full flex-col gap-6 p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">FlowDesk</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {greeting}
            {me.data?.user.name ? (
              <span className="text-muted-foreground">, {me.data.user.name.split(' ')[0]}</span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {workspaceList.length === 0
              ? 'Create your first workspace to get started.'
              : `${totalOpen} open · ${dueThisWeekCount} due this week · ${overdueCount} overdue`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const w = workspaceList[0];
              if (w) navigate(`/board/${w.id}`);
            }}
          >
            <Search />
            <span className="hidden sm:inline">Quick switch</span>
            <kbd className="ml-1 hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
              ⌘K
            </kbd>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus />
            New workspace
          </Button>
        </div>
      </header>

      <Separator />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {loadingWorkspaces && !me.data ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <StatCard
              icon={ListChecks}
              label="My open"
              value={totalOpen}
              hint={`across ${workspaceList.length} workspace${workspaceList.length === 1 ? '' : 's'}`}
            />
            <StatCard
              icon={Calendar}
              label="Due this week"
              value={dueThisWeekCount}
              tone={dueThisWeekCount > 0 ? 'warning' : 'default'}
              hint="next 7 days"
            />
            <StatCard
              icon={AlertCircle}
              label="Overdue"
              value={overdueCount}
              tone={overdueCount > 0 ? 'critical' : 'default'}
              hint={overdueCount > 0 ? 'needs attention' : 'all clear'}
            />
            <StatCard
              icon={Clock}
              label="Workspaces"
              value={workspaceList.length}
              hint={workspaceList.length === 0 ? 'none yet' : 'active'}
            />
          </>
        )}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>My tasks</CardTitle>
              {myTasks.length > 0 && (
                <CardDescription>
                  {myTasks.length} of {totalOpen}
                </CardDescription>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {myTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 pb-6 text-center">
                <p className="text-sm text-muted-foreground">No tasks assigned to you yet.</p>
                <Link to="/workspaces" className="text-xs text-primary hover:underline">
                  Open a workspace →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {myTasks.map((t) => {
                  const ws = workspaceList.find((w) => w.id === t.workspaceId);
                  return <TaskRow key={t.id} task={t} workspaceSlug={ws?.slug} />;
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Workspaces</CardTitle>
              <CardDescription>{workspaceList.length}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {workspaces.isLoading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : workspaceList.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <p className="mb-3 text-sm text-muted-foreground">
                  You don't have any workspace yet.
                </p>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  Create your first
                </Button>
              </div>
            ) : (
              workspaceList.map((w) => (
                <Link
                  key={w.id}
                  to={`/board/${w.id}`}
                  className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <Avatar>
                    <AvatarFallback>{initials(w.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{w.name}</div>
                    <div className="truncate text-xs text-muted-foreground">/{w.slug}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <span className="text-sm tabular-nums">{w._count.tasks}</span>
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      tasks
                    </span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <WorkspaceCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(ws) => navigate(`/board/${ws.id}`)}
      />
    </div>
  );
}
