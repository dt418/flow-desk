import { Link, useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { Plus, Search, Calendar, AlertCircle, ListChecks, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDate } from '@/lib/utils';

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

const PRIORITY_TONE: Record<string, string> = {
  LOW: 'border-slate-400/40 text-slate-500',
  MEDIUM: 'border-blue-500/40 text-blue-600',
  HIGH: 'border-amber-500/40 text-amber-600',
  URGENT: 'border-red-500/40 text-red-600',
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
    <div className="relative flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/70 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between text-[var(--fg-3)]">
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
        <Icon
          className={cn(
            'h-4 w-4',
            tone === 'warning' && 'text-amber-500',
            tone === 'critical' && 'text-red-500',
          )}
        />
      </div>
      <span
        className={cn(
          'text-[28px] font-semibold tabular-nums tracking-tight',
          tone === 'critical' && 'text-red-500',
          tone === 'warning' && 'text-amber-600',
        )}
      >
        {value}
      </span>
      {hint && <span className="caption">{hint}</span>}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/70 p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-12" />
    </div>
  );
}

function TaskRow({ task, workspaceSlug }: { task: TaskRow; workspaceSlug?: string }) {
  const due = relDays(task.dueDate);
  const isDone = task.status === 'DONE';
  return (
    <Link
      to={`/board/${task.workspaceId}`}
      className={cn(
        'group flex items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-colors',
        'hover:border-[var(--border)] hover:bg-[var(--bg-2)]',
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
            'truncate text-[13px] font-medium',
            isDone && 'line-through text-[var(--fg-3)]',
          )}
        >
          {task.title}
        </div>
        {workspaceSlug && (
          <div className="truncate text-[11px] text-[var(--fg-3)]">/{workspaceSlug}</div>
        )}
      </div>
      <Badge
        variant="outline"
        className={cn('border text-[10px]', PRIORITY_TONE[task.priority] ?? '')}
      >
        {task.priority}
      </Badge>
      {due ? (
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 text-[10px] tabular-nums',
            due.tone === 'overdue'
              ? 'bg-red-500/10 text-red-500'
              : due.tone === 'today'
                ? 'bg-amber-500/10 text-amber-600'
                : 'bg-[var(--bg-3)] text-[var(--fg-2)]',
          )}
        >
          {due.label}
        </span>
      ) : (
        <span className="shrink-0 caption">—</span>
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

export function DashboardPage() {
  const navigate = useNavigate();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: { id: string; name: string } }>('/api/auth/me'),
  });

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api<{ data: WorkspaceSummary[]; nextCursor: string | null }>('/api/workspaces'),
  });

  const workspaceList = workspaces.data?.data ?? [];

  // Fetch tasks per workspace in parallel to build a unified "my tasks" feed.
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

  const now = Date.now();
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
  const completedThisWeek = allTasks.filter((t) => {
    if (t.assignee?.id !== myUserId) return false;
    // Without completedAt in our slice, approximate by status DONE in the page.
    return false;
  }).length;
  const totalOpen = allTasks.filter(
    (t) => t.assignee?.id === myUserId && t.status !== 'DONE',
  ).length;

  void now;
  void completedThisWeek; // reserved for future completedAt filter

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
    <div className="flex w-full flex-col gap-8 p-8">
      {/* Hero / Greeting */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="caption">FlowDesk</span>
          <h1 className="text-[28px] font-semibold tracking-tight">
            {greeting}
            {me.data?.user.name ? (
              <span className="text-[var(--fg-2)]">, {me.data.user.name.split(' ')[0]}</span>
            ) : null}
          </h1>
          <p className="text-[13px] text-[var(--fg-2)]">
            {workspaceList.length === 0
              ? 'Create your first workspace to get started.'
              : `${totalOpen} open · ${dueThisWeekCount} due this week · ${overdueCount} overdue`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const w = workspaceList[0];
              if (w) navigate(`/board/${w.id}`);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-3 text-[12px] text-[var(--fg-2)] transition-colors hover:bg-[var(--bg-3)]"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Quick switch</span>
            <kbd className="ml-1 hidden rounded bg-[var(--bg-3)] px-1.5 py-0.5 font-mono text-[10px] sm:inline">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            className="btn-primary inline-flex h-9 items-center gap-2 text-[12px]"
          >
            <Plus className="h-4 w-4" />
            New workspace
          </button>
        </div>
      </header>

      {/* Stat strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
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

      {/* Main two-column */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        {/* My tasks */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight">My tasks</h2>
            {myTasks.length > 0 && (
              <span className="caption">
                {myTasks.length} of {totalOpen}
              </span>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/50">
            {myTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <span className="caption">No tasks assigned to you yet.</span>
                <Link to="/workspaces" className="text-[12px] text-emerald-600 hover:underline">
                  Open a workspace →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {myTasks.map((t) => {
                  const ws = workspaceList.find((w) => w.id === t.workspaceId);
                  return <TaskRow key={t.id} task={t} workspaceSlug={ws?.slug} />;
                })}
              </div>
            )}
          </div>
        </div>

        {/* Workspaces rail */}
        <aside className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight">Workspaces</h2>
            <span className="caption">{workspaceList.length}</span>
          </div>
          {workspaces.isLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : workspaceList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-2)]/40 p-6 text-center">
              <p className="caption mb-3">You don't have any workspace yet.</p>
              <button
                type="button"
                className="btn-primary inline-flex h-8 items-center gap-1 text-[12px]"
              >
                <Plus className="h-3.5 w-3.5" />
                Create your first
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {workspaceList.map((w) => (
                <Link
                  key={w.id}
                  to={`/board/${w.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)]/70 p-3 transition-colors hover:border-emerald-500/50 hover:bg-[var(--bg-2)]"
                >
                  <Avatar className="h-9 w-9 text-[12px]">
                    <AvatarFallback>{initials(w.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{w.name}</div>
                    <div className="caption truncate">/{w.slug}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <span className="text-[12px] tabular-nums">{w._count.tasks}</span>
                    <span className="text-[10px] uppercase tracking-wider text-[var(--fg-3)]">
                      tasks
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
