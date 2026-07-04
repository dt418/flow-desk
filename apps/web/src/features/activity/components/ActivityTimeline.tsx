import * as React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Activity } from 'lucide-react';
import type { TaskActivityWithUser } from '@flow-desk/shared/task';
import { useTaskActivity } from '../hooks';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const ACTION_LABELS: Record<TaskActivityWithUser['action'], string> = {
  CREATED: 'created this task',
  TITLE_CHANGED: 'changed the title',
  DESCRIPTION_CHANGED: 'updated the description',
  STATUS_CHANGED: 'changed the status',
  PRIORITY_CHANGED: 'changed the priority',
  COLUMN_CHANGED: 'moved this task',
  ASSIGNEE_CHANGED: 'changed the assignee',
  DUE_DATE_CHANGED: 'changed the due date',
  MOVED: 'reordered this task',
  RESTORED: 'restored this task',
  SUBTASK_CREATED: 'created a subtask',
  DEPENDENCY_CREATED: 'added a dependency',
  DEPENDENCY_DELETED: 'removed a dependency',
  COMMENT_ADDED: 'commented',
  LABEL_ADDED: 'added a label',
  LABEL_REMOVED: 'removed a label',
};

function userInitials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function ActivityItem({ activity }: { activity: TaskActivityWithUser }) {
  const label = ACTION_LABELS[activity.action] ?? activity.action.toLowerCase();
  const hasDiff = activity.oldValue != null && activity.newValue != null;
  const hasNewValue = !hasDiff && activity.newValue != null;
  return (
    <li role="listitem" className="flex gap-3 px-1 py-3">
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={activity.user.avatarUrl ?? undefined} alt="" />
        <AvatarFallback className="text-xs">{userInitials(activity.user.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{activity.user.name}</span> {label}
          {hasDiff ? (
            <>
              {' '}
              from{' '}
              <span className="font-medium text-foreground" data-testid="old-value">
                {activity.oldValue}
              </span>{' '}
              to{' '}
              <span className="font-medium text-foreground" data-testid="new-value">
                {activity.newValue}
              </span>
            </>
          ) : hasNewValue ? (
            <>
              {' '}
              to{' '}
              <span className="font-medium text-foreground" data-testid="new-value">
                {activity.newValue}
              </span>
            </>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          <time dateTime={new Date(activity.createdAt).toISOString()}>
            {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
          </time>
        </p>
      </div>
    </li>
  );
}

function ActivityTimelineSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading activity"
      className={cn('space-y-3 p-1', className)}
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 py-3">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface ActivityTimelineProps {
  taskId: string;
  className?: string;
}

export function ActivityTimeline({ taskId, className }: ActivityTimelineProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useTaskActivity(taskId);

  const items = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((p) => p.data);
  }, [data]);

  if (isLoading) {
    return <ActivityTimelineSkeleton className={className} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Actions on this task will appear here."
        className={cn('py-10', className)}
      />
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      <ul role="list" aria-label="Task activity" className="divide-y divide-border">
        {items.map((a) => (
          <ActivityItem key={a.id} activity={a} />
        ))}
      </ul>
      {hasNextPage ? (
        <div className="flex justify-center pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            aria-label="Load more activity"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
