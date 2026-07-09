import * as React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import type { Notification } from '@flow-desk/shared/notification';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNotifications, useMarkRead, useMarkAllRead } from '../hooks';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const { data, isLoading, isError, error } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const [open, setOpen] = React.useState(false);

  const items = data?.data ?? [];
  const unread = data?.unreadCount ?? 0;

  function handleClick(n: Notification) {
    if (!n.readAt) {
      markRead.mutate([n.id], {
        onError: (e) => toast.error((e as Error)?.message ?? 'Failed to mark read'),
      });
    }
    // ponytail: no deep-link — notification.data has taskId but no workspaceId,
    // and no task-detail route exists. Add workspaceId to notification.data +
    // a /task/:id route to enable navigation.
  }

  function handleMarkAll() {
    if (unread === 0) return;
    markAllRead.mutate(undefined, {
      onError: (e) => toast.error((e as Error)?.message ?? 'Failed to mark all read'),
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
          className="relative"
        >
          <Bell />
          {unread > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]"
            >
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">Notifications</DropdownMenuLabel>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={unread === 0 || markAllRead.isPending}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <CheckCheck className="size-3" />
            Mark all read
          </button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : isError ? (
            <p className="p-4 text-xs text-destructive">
              Failed to load: {(error as Error | null)?.message ?? 'unknown error'}
            </p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No notifications</p>
          ) : (
            items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={() => handleClick(n)}
                className="flex flex-col items-start gap-0.5 rounded-none px-3 py-2 text-left"
              >
                <div className="flex w-full items-start gap-2">
                  {!n.readAt && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm',
                        n.readAt ? 'text-muted-foreground' : 'font-medium text-foreground',
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatRelative(n.createdAt)}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
