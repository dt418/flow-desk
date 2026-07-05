import { useState } from 'react';
import { Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useSavedFilters, useUpdateSavedFilter, useDeleteSavedFilter } from '../hooks';

/**
 * Settings page component for managing saved views:
 * - List all saved views with name, visibility, and actions
 * - Inline rename (click pencil → edit name → blur/Enter to save)
 * - Toggle shared/private visibility
 * - Delete with confirmation dialog
 */
export function SavedViewsManager({ workspaceId }: { workspaceId: string }) {
  const { data } = useSavedFilters(workspaceId);
  const updateFilter = useUpdateSavedFilter(workspaceId);
  const deleteFilter = useDeleteSavedFilter(workspaceId);

  const views = data?.data ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingView, setDeletingView] = useState<{ id: string; name: string } | null>(null);

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditName(currentName);
  };

  const commitRename = async () => {
    if (!editingId || !editName.trim()) return;
    await updateFilter.mutateAsync({ id: editingId, body: { name: editName.trim() } });
    setEditingId(null);
    setEditName('');
  };

  const toggleShared = async (id: string, currentIsShared: boolean) => {
    await updateFilter.mutateAsync({ id, body: { isShared: !currentIsShared } });
  };

  const confirmDelete = async () => {
    if (!deletingView) return;
    await deleteFilter.mutateAsync(deletingView.id);
    setDeletingView(null);
  };

  if (views.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No saved views yet. Use the "Save view" button on the Tasks list page to save your current
        filters.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-1">
        {views.map((view) => (
          <div
            key={view.id}
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/50"
          >
            {/* Name / inline edit */}
            <div className="min-w-0 flex-1">
              {editingId === view.id ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="h-7 text-sm"
                  autoFocus
                  maxLength={80}
                />
              ) : (
                <span className="block truncate text-sm font-medium">{view.name}</span>
              )}
            </div>

            {/* Visibility indicator */}
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
              title={view.isShared ? 'Shared with team' : 'Private'}
            >
              {view.isShared ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              {view.isShared ? 'Shared' : 'Private'}
            </span>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                title="Rename"
                onClick={() => startRename(view.id, view.name)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                title={view.isShared ? 'Make private' : 'Share with team'}
                onClick={() => toggleShared(view.id, view.isShared)}
              >
                {view.isShared ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                title="Delete"
                onClick={() => setDeletingView({ id: view.id, name: view.name })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingView} onOpenChange={() => setDeletingView(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved view</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{deletingView?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
