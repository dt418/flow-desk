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
import { cn, initials } from '@/lib/utils';
import { INTERACTIVE_SELECTOR, NoCardClick } from '@/components/ui/kanban';
import { TaskLabelSelect } from './TaskLabelSelect';
import { PRIORITY_BAR, PRIORITY_DOT, shortId, relativeDate, PriorityDot } from '../utils';

export interface TaskCardData {
  id: string;
  title: string;
  description?: string;
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
  onDelete?: (taskId: string, title: string) => void;
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
    if (target.closest(INTERACTIVE_SELECTOR)) return;
    onClick?.(task.id);
  };

  return (
    <article
      aria-roledescription="draggable"
      tabIndex={onClick ? 0 : -1}
      aria-label={`Task: ${task.title}`}
      onClick={onClick ? onCardClick : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          const target = e.target as HTMLElement;
          if (target.closest(INTERACTIVE_SELECTOR)) return;
          e.preventDefault();
          onClick(task.id);
        }
      }}
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-card p-3 pl-4',
        'border-border shadow-[0_1px_0_rgba(0,0,0,0.02)]',
        'transition-[border-color,box-shadow] duration-150 hover:border-muted-foreground/50',
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
      <span className="absolute right-2 top-2 rounded font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        {shortId(task.id)}
      </span>
      {(onEdit || onDelete) && (
        <NoCardClick>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-task-kebab
                className="absolute right-7 top-1.5 rounded p-1 opacity-0 transition-opacity hover:bg-card group-hover:opacity-100"
                aria-label={`Actions for ${task.title}`}
              >
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
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
                  onClick={() => onDelete(task.id, task.title)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </NoCardClick>
      )}
      <div className="line-clamp-2 pr-6 text-[13px] font-medium leading-snug">{task.title}</div>

      <div data-task-label-trigger className="mt-2">
        <NoCardClick>
          <TaskLabelSelect
            workspaceId={workspaceId}
            taskId={task.id}
            canEdit={canEditLabels}
            size="sm"
          />
        </NoCardClick>
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
                  : 'bg-muted text-muted-foreground',
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
    <div className="rounded-lg border border-border bg-card p-3 pl-4">
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
