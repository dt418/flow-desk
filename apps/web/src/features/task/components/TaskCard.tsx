import * as React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskLabelSelect } from './TaskLabelSelect';

export interface TaskCardData {
  id: string;
  title: string;
  status: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  columnId: string;
  position: number;
  version: number;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  dueDate: string | null;
  labels: string[];
}

interface Props {
  task: TaskCardData;
  workspaceId: string;
  canEditLabels?: boolean;
  className?: string;
  onClick?: (taskId: string) => void;
  onEdit?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
}

const PRIORITY_BAR: Record<TaskCardData['priority'], string> = {
  LOW: 'bg-slate-300 dark:bg-slate-600',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

const PRIORITY_DOT: Record<TaskCardData['priority'], string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-amber-500',
  URGENT: 'bg-red-500',
};

function shortId(id: string): string {
  return id.slice(-4).toUpperCase();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function relativeDate(
  value: string | null,
): { label: string; tone: 'overdue' | 'soon' | 'normal' } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { label: 'Today', tone: 'soon' };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (days === -1) return { label: 'Yesterday', tone: 'overdue' };
  if (days > 1 && days < 7)
    return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), tone: 'normal' };
  if (days < 0) return { label: `${-days}d late`, tone: 'overdue' };
  return { label: `+${days}d`, tone: 'normal' };
}

function PriorityDot({ priority }: { priority: TaskCardData['priority'] }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--fg-2)]">
      <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[priority])} />
      {priority}
    </span>
  );
}

export function TaskCard({
  task,
  workspaceId,
  canEditLabels = true,
  className,
  onClick,
  onEdit,
  onDelete,
}: Props) {
  const due = relativeDate(task.dueDate);

  const onCardClick = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-task-label-trigger]')) return;
    if (target.closest('[data-task-kebab]')) return;
    if (target.closest('button, [role="button"], a, input, select, textarea')) return;
    onClick?.(task.id);
  };

  return (
    <article
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick ? onCardClick : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          const target = e.target as HTMLElement;
          if (target.closest('[data-task-label-trigger]')) return;
          if (target.closest('[data-task-kebab]')) return;
          if (target.closest('button, [role="button"], a, input, select, textarea')) return;
          e.preventDefault();
          onClick(task.id);
        }
      }}
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-[var(--bg)] p-3 pl-4',
        'border-[var(--border)] shadow-[0_1px_0_rgba(0,0,0,0.02)]',
        'transition-[border-color,box-shadow] duration-150 hover:border-[var(--fg-3)]',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-[3px] rounded-l-lg',
          PRIORITY_BAR[task.priority] ?? 'bg-transparent',
        )}
      />
      <span className="absolute right-2 top-2 rounded font-mono text-[10px] text-[var(--fg-3)] opacity-0 transition-opacity group-hover:opacity-100">
        {shortId(task.id)}
      </span>
      {(onEdit || onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-task-kebab
              className="absolute right-7 top-1.5 rounded p-1 opacity-0 transition-opacity hover:bg-[var(--bg-2)] group-hover:opacity-100"
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
      )}
      <div className="line-clamp-2 pr-6 text-[13px] font-medium leading-snug">{task.title}</div>

      <div data-task-label-trigger className="mt-2">
        <TaskLabelSelect
          workspaceId={workspaceId}
          taskId={task.id}
          canEdit={canEditLabels}
          size="sm"
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        {due ? (
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] tabular-nums',
              due.tone === 'overdue'
                ? 'bg-red-500/10 text-red-500'
                : due.tone === 'soon'
                  ? 'bg-amber-500/10 text-amber-600'
                  : 'bg-[var(--bg-3)] text-[var(--fg-2)]',
            )}
          >
            {due.label}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <PriorityDot priority={task.priority} />
          {task.assignee && (
            <Avatar className="h-5 w-5 text-[9px]">
              {task.assignee.avatarUrl ? (
                <AvatarImage src={task.assignee.avatarUrl} alt={task.assignee.name} />
              ) : null}
              <AvatarFallback>{initials(task.assignee.name)}</AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </article>
  );
}

export function TaskCardSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 pl-4">
      <Skeleton className="h-3.5 w-3/4" />
      <div className="mt-2 flex gap-1">
        <Skeleton className="h-4 w-12 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}
