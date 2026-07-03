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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApiError } from '@/lib/api';
import type { Column } from '@flow-desk/shared/workspace';
import type { UserRole } from '@flow-desk/shared/user';
import type { ColumnWithCount } from '../types';
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
  const [removeTarget, setRemoveTarget] = useState<ColumnWithCount | null>(null);

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

  const onDelete = (col: ColumnWithCount) => {
    setRemoveTarget(col);
  };

  const confirmDelete = async () => {
    if (!removeTarget) return;
    const col = removeTarget;
    setRemoveTarget(null);
    try {
      await remove.mutateAsync(col.id);
      toast.success('Column deleted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete column');
    }
  };

  const canEdit = canManageColumns(role);
  const list = (columns.data as ColumnWithCount[] | undefined) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="col-name">Add column</Label>
            <Input
              id="col-name"
              placeholder="In Review"
              {...register('name')}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && (
              <p className="text-xs text-destructive" role="status">
                {errors.name.message}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" {...register('isDoneColumn')} className="h-4 w-4" />
            Marks tasks done
          </label>
          <Button type="submit" disabled={isSubmitting} size="sm" className="h-9 px-4">
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-12 px-3 py-2 font-medium">Pos</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Tasks</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
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
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-4 w-12" />
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              ))
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center caption">
                  No columns yet.
                </td>
              </tr>
            ) : (
              list
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((col) => (
                  <tr key={col.id} className="bg-background/40">
                    <td className="px-3 py-2.5 tabular-nums text-xs text-muted-foreground">
                      {col.position}
                    </td>
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
                          className="h-7 rounded border border-primary/60 bg-card px-2 text-sm focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            setEditingId(col.id);
                            setEditingName(col.name);
                          }}
                          className={cn('text-left', canEdit && 'hover:text-primary')}
                          title={canEdit ? 'Click to rename' : undefined}
                        >
                          {col.name}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                        {col._count?.tasks ?? 0}
                        <span className="text-[10px] uppercase tracking-wider opacity-70">
                          tasks
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {col.isDoneColumn ? (
                        <Badge variant="default" className="text-[10px]">
                          Done
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDelete(col)}
                          aria-label={`Delete ${col.name}`}
                          title="Delete column"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete column?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && (
                <>
                  Column <span className="font-medium text-foreground">{removeTarget.name}</span>{' '}
                  will be removed. Tasks in this column will become orphaned and may be lost.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={remove.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {remove.isPending ? 'Deleting…' : 'Delete column'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
