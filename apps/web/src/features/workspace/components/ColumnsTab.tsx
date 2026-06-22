import { z } from 'zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  useColumns,
  useCreateColumn,
  useUpdateColumn,
  useDeleteColumn,
  useWorkspaceRole,
} from '../hooks';
import { canManageColumns } from './role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import type { Column } from '@flow-desk/shared/workspace';
import type { UserRole } from '@flow-desk/shared/user';
import { cn } from '@/lib/utils';

const newColumnSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name is too long'),
  isDoneColumn: z.boolean(),
});
type NewColumnInput = z.infer<typeof newColumnSchema>;

interface Props {
  workspaceId: string;
}

export function ColumnsTab({ workspaceId }: Props) {
  const role = useWorkspaceRole(workspaceId);
  const columns = useColumns(workspaceId);
  const create = useCreateColumn(workspaceId);
  const update = useUpdateColumn(workspaceId);
  const remove = useDeleteColumn(workspaceId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewColumnInput>({
    resolver: zodResolver(newColumnSchema),
    defaultValues: { name: '', isDoneColumn: false },
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const onCreate = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
      toast.success(`Column “${values.name}” added`);
      reset({ name: '', isDoneColumn: false });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add column');
    }
  });

  const onRename = async (col: Column) => {
    if (!editingName.trim() || editingName === col.name) {
      setEditingId(null);
      return;
    }
    try {
      await update.mutateAsync({ columnId: col.id, body: { name: editingName.trim() } });
      toast.success('Column renamed');
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to rename');
    }
  };

  const onDelete = async (col: Column) => {
    if (!confirm(`Delete column “${col.name}”? Tasks in this column will be orphaned.`)) return;
    try {
      await remove.mutateAsync(col.id);
      toast.success('Column deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete column');
    }
  };

  const canEdit = canManageColumns(role);
  const list = columns.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-2)]/50 p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="col-name">Add column</Label>
            <Input
              id="col-name"
              placeholder="In Review"
              {...register('name')}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && <p className="text-[11px] text-red-500">{errors.name.message}</p>}
          </div>
          <label className="flex items-center gap-2 text-[12px] text-[var(--fg-2)]">
            <input type="checkbox" {...register('isDoneColumn')} className="h-4 w-4" />
            Marks tasks done
          </label>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-9 bg-emerald-500 px-4 text-[12px] text-white hover:bg-emerald-600"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--bg-2)] text-left text-[10px] uppercase tracking-wider text-[var(--fg-3)]">
            <tr>
              <th className="w-12 px-3 py-2 font-medium">Pos</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Done?</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {columns.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-4 w-6" />
                  </td>
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-4 w-32" />
                  </td>
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-4 w-10" />
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              ))
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center caption">
                  No columns yet.
                </td>
              </tr>
            ) : (
              list
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((col) => (
                  <tr key={col.id} className="bg-[var(--bg)]/40">
                    <td className="px-3 py-2.5 caption tabular-nums">{col.position}</td>
                    <td className="px-3 py-2.5">
                      {editingId === col.id ? (
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => onRename(col)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onRename(col);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="h-7 rounded border border-emerald-500/60 bg-[var(--bg-2)] px-2 text-[13px] focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            setEditingId(col.id);
                            setEditingName(col.name);
                          }}
                          className={cn(
                            'text-left',
                            canEdit && 'hover:text-emerald-500',
                          )}
                          title={canEdit ? 'Click to rename' : undefined}
                        >
                          {col.name}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {col.isDoneColumn ? (
                        <span className="caption text-emerald-600">Done</span>
                      ) : (
                        <span className="caption">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => onDelete(col)}
                          className="btn-ghost h-7 w-7 p-0 text-red-500"
                          aria-label={`Delete ${col.name}`}
                          title="Delete column"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
