'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Undo2 } from 'lucide-react';

import { ApiError } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDeleteTask, useRestoreTask } from '../hooks';

interface DeleteTarget {
  id: string;
  title: string;
}

interface UseTaskDeleteResult {
  /** Open the confirmation dialog for a task. */
  request: (target: DeleteTarget) => void;
  /** The confirmation dialog node — render once near the table/list. */
  dialog: React.ReactNode;
  /** True when a delete request is pending. */
  isPending: boolean;
}

const UNDO_DURATION_MS = 10_000;

/**
 * Hook that wraps a task delete with:
 *   1. A confirmation AlertDialog
 *   2. A 10s undo toast that calls the restore mutation
 *
 * Used by BoardPage, ListPage, and any future list/grid view that needs
 * the same delete UX. `dialog` should be rendered once per page; `request(id, title)`
 * opens it. The actual mutation + undo toast run inside the hook.
 */
export function useTaskDelete(workspaceId: string): UseTaskDeleteResult {
  const deleteTask = useDeleteTask(workspaceId);
  const restoreTask = useRestoreTask(workspaceId);
  const [target, setTarget] = React.useState<DeleteTarget | null>(null);

  const performDelete = React.useCallback(
    async (t: DeleteTarget) => {
      setTarget(null);
      try {
        await deleteTask.mutateAsync(t.id);
        toast('Task deleted', {
          description: t.title,
          action: {
            label: (
              <span className="inline-flex items-center gap-1">
                <Undo2 className="size-3" />
                Undo
              </span>
            ),
            onClick: () => {
              void restoreTask.mutateAsync(t.id);
            },
          },
          duration: UNDO_DURATION_MS,
        });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to delete task');
      }
    },
    [deleteTask, restoreTask],
  );

  const dialog = (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
      <AlertDialogContent>
        {target && (
          <>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{target.title}</span> will be moved to
              the trash. You can undo this from the toast for the next 10 seconds.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteTask.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void performDelete(target);
                }}
                disabled={deleteTask.isPending}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {deleteTask.isPending ? 'Deleting…' : 'Delete task'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    request: setTarget,
    dialog,
    isPending: deleteTask.isPending,
  };
}
