import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { FOCUS_RING_CLASS, hasAccessibleName } from '@/lib/a11y';

interface Board {
  id: string;
  name: string;
}

interface Props {
  workspaceId: string;
  value: string | null;
  onChange: (boardId: string) => void;
}

export function BoardSwitcher({ workspaceId, value, onChange }: Props) {
  const boards = useQuery({
    queryKey: ['boards', workspaceId],
    queryFn: () => api<{ data: Board[] }>(`/api/workspaces/${workspaceId}/boards`),
  });

  const items = boards.data?.data ?? [];

  // Default to first board so kanban always partitions when multi-board is available
  useEffect(() => {
    if (!value && items.length > 0) {
      onChange(items[0]!.id);
    }
  }, [value, items, onChange]);

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="tablist"
      aria-label={hasAccessibleName({ ariaLabel: 'Board switcher' }) ? 'Board switcher' : 'Boards'}
    >
      {items.map((b) => {
        const selected = value === b.id;
        return (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={`Board ${b.name}`}
            className={cn(
              'rounded-md px-2.5 py-1 text-sm transition-colors',
              FOCUS_RING_CLASS,
              selected
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onChange(b.id)}
          >
            {b.name}
          </button>
        );
      })}
    </div>
  );
}
