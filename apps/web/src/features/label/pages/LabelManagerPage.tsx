import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceRole } from '@/features/workspace';
import { LabelChip, colorToHex } from '../components/LabelChip';
import { LabelFormDialog } from '../components/LabelFormDialog';
import { useDeleteLabel, useLabels } from '../hooks';
import type { Label as LabelType } from '../types';

interface Props {
  workspaceId: string;
  embedded?: boolean;
}

export function LabelManagerPage({ workspaceId, embedded = false }: Props) {
  const labels = useLabels(workspaceId);
  const role = useWorkspaceRole(workspaceId);
  const del = useDeleteLabel(workspaceId);

  const [editing, setEditing] = useState<LabelType | null>(null);
  const [creating, setCreating] = useState(false);

  const canManage = role === 'OWNER' || role === 'ADMIN';
  const list = labels.data ?? [];

  const onDelete = async (l: LabelType) => {
    if (!confirm(`Delete label "${l.name}"? It will be removed from all tasks.`)) return;
    try {
      await del.mutateAsync(l.id);
      toast.success(`Label "${l.name}" deleted`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete label');
    }
  };

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {!embedded && (
          <Link
            to={`/board/${workspaceId}`}
            className="btn-ghost h-8 w-8 p-0"
            aria-label="Back to board"
            title="Back to board"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <div>
          <span className="caption">Workspace</span>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight">
            <Tag className="h-5 w-5 text-emerald-500" />
            Labels
          </h1>
        </div>
      </div>
      {canManage && (
        <Button
          type="button"
          onClick={() => setCreating(true)}
          className="h-9 bg-emerald-500 px-4 text-[12px] text-white hover:bg-emerald-600"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New label
        </Button>
      )}
    </header>
  );

  return (
    <div className={embedded ? 'flex flex-col gap-6' : 'flex w-full flex-col gap-6 p-6 lg:p-8'}>
      {header}

      {labels.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-2)]/40 p-10 text-center">
          <Tag className="h-8 w-8 text-[var(--fg-3)]" />
          <p className="text-[14px] font-medium">No labels yet</p>
          <p className="caption max-w-sm">
            Create your first label to start categorizing tasks across columns.
          </p>
          {canManage && (
            <Button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-2 h-9 bg-emerald-500 px-4 text-[12px] text-white hover:bg-emerald-600"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New label
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((l) => (
            <div
              key={l.id}
              className="group flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-2)]/50 p-4 transition-colors hover:border-emerald-500/40"
            >
              <div className="flex flex-1 items-center gap-3">
                <span
                  aria-hidden
                  className="h-10 w-1.5 rounded-full"
                  style={{ backgroundColor: colorToHex(l.color) }}
                />
                <div className="min-w-0 flex-1">
                  <LabelChip label={l} size="md" />
                  <p className="mt-1 font-mono text-[10px] text-[var(--fg-3)]">
                    {l.color} · {colorToHex(l.color)}
                  </p>
                </div>
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(l)}
                    className="text-[11px]"
                  >
                    Edit
                  </Button>
                  <button
                    type="button"
                    onClick={() => onDelete(l)}
                    className="btn-ghost h-7 w-7 p-0 text-red-500"
                    aria-label={`Delete ${l.name}`}
                    title="Delete label"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <LabelFormDialog
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        workspaceId={workspaceId}
        initial={editing}
      />
    </div>
  );
}
