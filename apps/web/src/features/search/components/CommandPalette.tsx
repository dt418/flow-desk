import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { FileText, MessageSquare, Paperclip, LayoutDashboard, Settings, Sun, Moon } from 'lucide-react';
import { useSearch } from '../hooks';
import { workspaceApi } from '@/features/workspace';
import { useTheme } from '@/lib/theme';
import type { SearchResult } from '../types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_ICON = {
  task: FileText,
  comment: MessageSquare,
  attachment: Paperclip,
} as const;

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const [search, setSearch] = React.useState('');
  const { data: searchResults, isLoading: searchLoading } = useSearch(search, open);

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspaceApi.list(),
  });

  const workspaceList = workspaces.data?.data ?? [];
  const results = searchResults?.data ?? [];

  React.useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  function runAction(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a command or search…"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => runAction(() => navigate('/'))}
          >
            <LayoutDashboard className="mr-2 size-4" />
            Dashboard
          </CommandItem>
          {workspaceList.map((w) => (
            <React.Fragment key={w.id}>
              <CommandItem
                onSelect={() => runAction(() => navigate(`/board/${w.id}`))}
              >
                <FileText className="mr-2 size-4" />
                {w.name}
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => navigate(`/list/${w.id}`))}
              >
                <span className="mr-2 size-4" />
                &nbsp;&nbsp;List — {w.name}
              </CommandItem>
              <CommandItem
                onSelect={() => runAction(() => navigate(`/workspaces/${w.id}/settings`))}
              >
                <Settings className="mr-2 size-4" />
                &nbsp;&nbsp;Settings — {w.name}
              </CommandItem>
            </React.Fragment>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => runAction(() => toggleTheme())}
          >
            {theme === 'dark' ? <Sun className="mr-2 size-4" /> : <Moon className="mr-2 size-4" />}
            Toggle Theme
          </CommandItem>
        </CommandGroup>

        {search.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Search Results">
              {searchLoading && (
                <CommandItem disabled>Searching…</CommandItem>
              )}
              {!searchLoading && results.length === 0 && (
                <CommandItem disabled>No matches.</CommandItem>
              )}
              {results.map((r) => {
                const Icon = TYPE_ICON[r.type];
                return (
                  <CommandItem
                    key={`${r.type}-${r.id}`}
                    onSelect={() =>
                      runAction(() => navigate(`/board/${r.workspaceId}`))
                    }
                  >
                    <Icon className="mr-2 size-4" />
                    <span className="flex-1 truncate">{r.title}</span>
                    <span className="ml-2 text-xs uppercase text-muted-foreground">
                      {r.type}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
