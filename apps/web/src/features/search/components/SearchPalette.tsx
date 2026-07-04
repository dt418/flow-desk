import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, MessageSquare, Paperclip } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSearch } from '../hooks';
import type { SearchResult } from '../types';

interface SearchPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_ICON = {
  task: FileText,
  comment: MessageSquare,
  attachment: Paperclip,
} as const;

export function SearchPalette({ open, onOpenChange }: SearchPaletteProps) {
  const navigate = useNavigate();
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { data, isLoading } = useSearch(q, open);
  const results = data?.data ?? [];

  React.useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  React.useEffect(() => {
    setActive(0);
  }, [q]);

  function goTo(r: SearchResult) {
    onOpenChange(false);
    navigate(`/board/${r.workspaceId}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) goTo(r);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search tasks, comments, and attachments</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tasks, comments, attachments…"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            aria-label="Search query"
            aria-autocomplete="list"
            aria-controls="search-results"
          />
        </div>
        <ul
          id="search-results"
          role="listbox"
          aria-label="Search results"
          className="max-h-80 overflow-y-auto p-1"
        >
          {isLoading && q.trim() ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">Searching…</li>
          ) : results.length === 0 && q.trim() ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">No matches.</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              Type to search across your workspaces.
            </li>
          ) : (
            results.map((r, i) => {
              const Icon = TYPE_ICON[r.type];
              return (
                <li key={`${r.type}-${r.id}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => goTo(r)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                      i === active ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    <span className="shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
                      {r.type}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
