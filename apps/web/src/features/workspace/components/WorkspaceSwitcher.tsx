import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Check, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, initials } from '@/lib/utils';
import { useWorkspaceRole, workspaceKeys } from '../hooks';
import { workspaceApi } from '../api';
import type { WorkspaceListEntry } from '../types';

interface Props {
  currentWorkspaceId?: string;
  onCreateWorkspace?: () => void;
  variant?: 'sidebar' | 'header';
  className?: string;
}

export function WorkspaceSwitcher({
  currentWorkspaceId,
  onCreateWorkspace,
  variant = 'sidebar',
  className,
}: Props) {
  const navigate = useNavigate();
  const currentRole = useWorkspaceRole(currentWorkspaceId ?? '');

  const workspaces = useQuery({
    queryKey: workspaceKeys.all,
    queryFn: () => workspaceApi.list(),
  });

  const list = workspaces.data?.data ?? [];
  const current =
    list.find((w) => w.id === currentWorkspaceId) ??
    (currentWorkspaceId ? null : (list[0] ?? null));

  const onSelect = (id: string) => {
    if (id === currentWorkspaceId) return;
    navigate(`/board/${id}`);
  };

  if (workspaces.isLoading) {
    return variant === 'sidebar' ? (
      <Skeleton className="h-9 w-full" />
    ) : (
      <Skeleton className="h-9 w-48" />
    );
  }

  if (list.length === 0) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCreateWorkspace}
        className={cn('justify-start gap-2', className)}
      >
        <Plus className="h-4 w-4" />
        New workspace
      </Button>
    );
  }

  if (variant === 'sidebar') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-muted',
              className,
            )}
          >
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-semibold text-primary"
            >
              {initials(current?.name ?? '?')}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {current?.name ?? 'Select workspace'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="min-w-56">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {list.map((w) => {
            const active = w.id === currentWorkspaceId;
            return (
              <DropdownMenuItem
                key={w.id}
                onSelect={() => onSelect(w.id)}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold"
                >
                  {initials(w.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                {active && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
          {onCreateWorkspace && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onCreateWorkspace}>
                <Plus className="h-4 w-4" />
                New workspace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-9 gap-2 px-2.5', className)}
          aria-label="Switch workspace"
        >
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/15 text-[10px] font-semibold text-primary"
          >
            {initials(current?.name ?? '?')}
          </span>
          <span className="hidden max-w-[180px] truncate text-sm font-medium sm:inline">
            {current?.name ?? 'Select workspace'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="min-w-56">
        <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
        {list.map((w) => {
          const active = w.id === currentWorkspaceId;
          return (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => onSelect(w.id)}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold"
              >
                {initials(w.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {currentRole && w.id === currentWorkspaceId && (
                <span className="text-xs text-muted-foreground">{currentRole.toLowerCase()}</span>
              )}
              {active && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
        {onCreateWorkspace && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCreateWorkspace}>
              <Plus className="h-4 w-4" />
              New workspace
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
