import { useState } from 'react';
import { ChevronDown, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useSavedFilters,
  useCreateSavedFilter,
} from '../hooks';
import type { SavedFilterQuery } from '@flow-desk/shared/saved-filter';

/**
 * Compact toolbar for the list page: view selector + save button.
 *
 * The parent page owns filter state. This component:
 * - Lists saved views in a dropdown (reads via useSavedFilters)
 * - On "Save", captures current filters → POSTs a SavedFilter
 * - On dropdown change, returns selected view's query to the parent
 */
export function SavedViewsBar({
  workspaceId,
  activeViewId,
  currentQuery,
  onLoadView,
  onClearView,
}: {
  workspaceId: string;
  activeViewId: string | null;
  currentQuery: SavedFilterQuery;
  onLoadView: (viewId: string, query: SavedFilterQuery) => void;
  onClearView: () => void;
}) {
  const { data } = useSavedFilters(workspaceId);
  const createFilter = useCreateSavedFilter(workspaceId);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');

  const views = data?.data ?? [];
  const activeView = views.find((v) => v.id === activeViewId);

  const handleSave = async () => {
    if (!viewName.trim()) return;
    await createFilter.mutateAsync({
      name: viewName.trim(),
      query: currentQuery,
      isShared: false,
    });
    setViewName('');
    setSaveOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* View selector */}
        <div className="relative inline-flex">
          <select
            aria-label="Saved view"
            value={activeViewId ?? ''}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) {
                onClearView();
                return;
              }
              const view = views.find((v) => v.id === id);
              if (view) onLoadView(view.id, view.query as SavedFilterQuery);
            }}
            className={cn(
              'h-8 appearance-none rounded-md border bg-card py-0 pl-2.5 pr-8 text-xs text-foreground',
              'border-input outline-none transition-colors',
              'focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/40',
              'hover:border-muted-foreground/50',
            )}
            style={{ colorScheme: 'light dark' }}
          >
            <option value="" className="bg-card text-foreground">
              All tasks (default)
            </option>
            {views.map((v) => (
              <option key={v.id} value={v.id} className="bg-card text-foreground">
                {v.name}
                {v.isShared ? ' ★' : ''}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
        </div>

        {/* Save button — always available */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setSaveOpen(true)}
          title="Save current filters as a view"
        >
          <Save className="h-3.5 w-3.5" />
          Save view
        </Button>

        {activeView && (
          <span className="text-xs text-muted-foreground">
            Viewing: <span className="font-medium text-foreground">{activeView.name}</span>
          </span>
        )}
      </div>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
            <DialogDescription>
              Save the current filter settings as a named view you can load later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">View name</Label>
              <Input
                id="view-name"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="e.g. My urgent tasks"
                maxLength={80}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSaveOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!viewName.trim() || createFilter.isPending}
                onClick={handleSave}
              >
                {createFilter.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
