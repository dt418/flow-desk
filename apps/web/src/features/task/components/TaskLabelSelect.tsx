import * as React from 'react';
import { toast } from 'sonner';
import { Check, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api';
import { useLabels, useTaskLabels, useToggleTaskLabel } from '@/features/label';
import { LabelChip } from '@/features/label/components/LabelChip';
import type { Label } from '@/features/label';

interface Props {
  workspaceId: string;
  taskId: string;
  canEdit?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  trigger?: React.ReactNode;
}

export function TaskLabelSelect({
  workspaceId,
  taskId,
  canEdit = true,
  size = 'sm',
  className,
  trigger,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const allLabels = useLabels(workspaceId);
  const taskLabels = useTaskLabels(workspaceId, taskId);
  const toggle = useToggleTaskLabel(workspaceId, taskId);

  const assigned = taskLabels.data ?? [];
  const assignedIds = new Set(assigned.map((l) => l.id));
  const available = (allLabels.data ?? []).filter((l) => !assignedIds.has(l.id));
  const filtered = search.trim()
    ? available.filter((l) => l.name.toLowerCase().includes(search.trim().toLowerCase()))
    : available;

  const onToggle = async (labelId: string, currentlyAssigned: boolean) => {
    try {
      await toggle.mutateAsync({ labelId, assigned: currentlyAssigned });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update label');
    }
  };

  const defaultTrigger = (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 rounded-md p-0.5',
        canEdit && 'cursor-pointer hover:bg-card',
        className,
      )}
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : -1}
      data-no-drag={canEdit ? '' : undefined}
      aria-label={canEdit ? 'Edit labels' : 'Labels'}
      onKeyDown={(e) => {
        if (!canEdit) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      {taskLabels.isLoading ? (
        <Skeleton className="h-4 w-12" />
      ) : assigned.length === 0 && canEdit ? (
        <span className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-border px-2 text-[10px] text-muted-foreground">
          <Plus className="h-3 w-3" />
          Label
        </span>
      ) : (
        assigned.slice(0, 4).map((l) => <LabelChip key={l.id} label={l} size={size} />)
      )}
      {assigned.length > 4 && (
        <span className="px-1 text-xs text-muted-foreground">+{assigned.length - 4}</span>
      )}
    </div>
  );

  if (!canEdit) {
    return defaultTrigger;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch('');
      }}
    >
      <PopoverTrigger asChild>{trigger ?? defaultTrigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex flex-col gap-2">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a label…"
            className="h-7 text-[12px]"
            aria-label="Search labels"
          />

          {assigned.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="caption px-1.5 py-0.5">Assigned</div>
              {assigned.map((l: Label) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onToggle(l.id, true)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-card"
                >
                  <Check className="h-3.5 w-3.5 text-primary" />
                  <LabelChip label={l} size="sm" />
                </button>
              ))}
            </div>
          )}

          {filtered.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <div className="caption px-1.5 py-0.5">
                {assigned.length > 0 ? 'Add' : 'Available'}
              </div>
              {filtered.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onToggle(l.id, false)}
                  disabled={toggle.isPending}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-card disabled:opacity-50"
                >
                  <span
                    aria-hidden
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-border"
                  />
                  <LabelChip label={l} size="sm" />
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && assigned.length === 0 && (
            <p className="caption px-1.5 py-3 text-center">
              {search.trim() ? 'No matching labels' : 'No labels yet'}
            </p>
          )}

          {(allLabels.data ?? []).length === 0 && !allLabels.isLoading && (
            <p className="caption px-1.5 py-1 text-center">
              Create labels in workspace settings first.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
