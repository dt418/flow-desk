import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Check, Plus } from 'lucide-react';
import { api } from '@/lib/api';
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
import { cn } from '@/lib/utils';
import { useWorkspaceRole } from '../hooks';
import { initials } from './role';

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
  _count?: { members: number; tasks: number };
}

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
    queryKey: ['workspaces'],
    queryFn: () => api<{ data: WorkspaceSummary[]; nextCursor: string | null }>('/api/workspaces'),
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
              'flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-2)] px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--bg-3)]',
              className,
            )}
          >
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-[10px] font-semibold text-emerald-600"
            >
              {initials(current?.name ?? '?')}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
              {current?.name ?? 'Select workspace'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--fg-3)]" />
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
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--bg-3)] text-[10px] font-semibold"
                >
                  {initials(w.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{w.name}</span>
                {active && <Check className="h-4 w-4 text-emerald-500" />}
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
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-[10px] font-semibold text-emerald-600"
          >
            {initials(current?.name ?? '?')}
          </span>
          <span className="hidden max-w-[180px] truncate text-[13px] font-medium sm:inline">
            {current?.name ?? 'Select workspace'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-[var(--fg-3)]" />
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
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--bg-3)] text-[10px] font-semibold"
              >
                {initials(w.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {currentRole && w.id === currentWorkspaceId && (
                <span className="caption">{currentRole.toLowerCase()}</span>
              )}
              {active && <Check className="h-4 w-4 text-emerald-500" />}
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
