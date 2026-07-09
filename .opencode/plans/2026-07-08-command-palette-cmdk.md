# Command Palette (cmdk) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled SearchPalette with a full Cmd+K command palette using shadcn's Command component (cmdk), supporting navigation, quick actions, and search.

**Architecture:** Install `cmdk` + shadcn `command` component. Rewrite `SearchPalette.tsx` → `CommandPalette.tsx` using the Command component. Reuse existing `useSearch` hook and workspace data from app-shell. No backend changes.

**Tech Stack:** cmdk, shadcn/ui Command component, React 18, react-router-dom, TanStack Query

## Global Constraints

- React 18 + Vite + TypeScript + Tailwind CSS v4
- shadcn v4 (radix-nova style, CSS variables enabled)
- Monorepo: apps/web is the frontend package
- Run `pnpm --filter @flow-desk/web typecheck` and `pnpm --filter @flow-desk/web lint` before commits
- No `any` types
- Follow existing code conventions (named exports, feature-based structure)

---

## File Structure

| File                                                              | Action | Purpose                                        |
| ----------------------------------------------------------------- | ------ | ---------------------------------------------- |
| `apps/web/package.json`                                           | Modify | Add `cmdk` dependency                          |
| `apps/web/src/components/ui/command.tsx`                          | Create | shadcn Command component (via CLI)             |
| `apps/web/src/features/search/components/CommandPalette.tsx`      | Create | New command palette component                  |
| `apps/web/src/features/search/components/SearchPalette.tsx`       | Delete | Replaced by CommandPalette                     |
| `apps/web/src/features/search/components/SearchPalette.test.tsx`  | Delete | Replaced by CommandPalette test                |
| `apps/web/src/features/search/components/CommandPalette.test.tsx` | Create | Tests for new component                        |
| `apps/web/src/features/search/index.ts`                           | Modify | Export CommandPalette instead of SearchPalette |
| `apps/web/src/components/layout/app-shell.tsx`                    | Modify | Import CommandPalette, rename state            |

---

### Task 1: Install cmdk and add shadcn Command component

**Files:**

- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/ui/command.tsx`

**Interfaces:**

- Consumes: None (setup task)
- Produces: `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator` components available from `@/components/ui/command`

- [ ] **Step 1: Install cmdk dependency**

```bash
pnpm --filter @flow-desk/web add cmdk
```

- [ ] **Step 2: Add shadcn Command component**

```bash
pnpm --filter @flow-desk/web dlx shadcn@latest add command
```

This creates `apps/web/src/components/ui/command.tsx` with the Command component wrapping cmdk.

- [ ] **Step 3: Verify the component was created**

```bash
ls apps/web/src/components/ui/command.tsx
```

Expected: file exists.

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm --filter @flow-desk/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/components/ui/command.tsx
git commit -m "feat: add cmdk dependency and shadcn Command component"
```

---

### Task 2: Create CommandPalette component

**Files:**

- Create: `apps/web/src/features/search/components/CommandPalette.tsx`

**Interfaces:**

- Consumes: `Command*` components from `@/components/ui/command`, `Dialog/DialogContent` from `@/components/ui/dialog`, `useSearch` from `../hooks`, `useWorkspaces` query via `workspaceApi.list()` from `@/features/workspace`, `useNavigate` from `react-router-dom`, `useTheme` from `@/lib/theme`
- Produces: `CommandPalette` component with same props interface as old SearchPalette: `{ open: boolean; onOpenChange: (open: boolean) => void }`

- [ ] **Step 1: Write the CommandPalette component**

```tsx
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
import {
  FileText,
  MessageSquare,
  Paperclip,
  LayoutDashboard,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';
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
          <CommandItem onSelect={() => runAction(() => navigate('/'))}>
            <LayoutDashboard className="mr-2 size-4" />
            Dashboard
          </CommandItem>
          {workspaceList.map((w) => (
            <React.Fragment key={w.id}>
              <CommandItem onSelect={() => runAction(() => navigate(`/board/${w.id}`))}>
                <FileText className="mr-2 size-4" />
                {w.name}
              </CommandItem>
              <CommandItem onSelect={() => runAction(() => navigate(`/list/${w.id}`))}>
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
          <CommandItem onSelect={() => runAction(() => toggleTheme)}>
            {theme === 'dark' ? <Sun className="mr-2 size-4" /> : <Moon className="mr-2 size-4" />}
            Toggle Theme
          </CommandItem>
        </CommandGroup>

        {search.trim() && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Search Results">
              {searchLoading && <CommandItem disabled>Searching…</CommandItem>}
              {!searchLoading && results.length === 0 && (
                <CommandItem disabled>No matches.</CommandItem>
              )}
              {results.map((r) => {
                const Icon = TYPE_ICON[r.type];
                return (
                  <CommandItem
                    key={`${r.type}-${r.id}`}
                    onSelect={() => runAction(() => navigate(`/board/${r.workspaceId}`))}
                  >
                    <Icon className="mr-2 size-4" />
                    <span className="flex-1 truncate">{r.title}</span>
                    <span className="ml-2 text-xs uppercase text-muted-foreground">{r.type}</span>
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
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter @flow-desk/web typecheck
```

Expected: PASS. If it fails, fix the type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/search/components/CommandPalette.tsx
git commit -m "feat: add CommandPalette component using shadcn Command"
```

---

### Task 3: Update search feature exports and app-shell

**Files:**

- Modify: `apps/web/src/features/search/index.ts`
- Modify: `apps/web/src/components/layout/app-shell.tsx`

**Interfaces:**

- Consumes: `CommandPalette` from Task 2
- Produces: Updated exports and imports

- [ ] **Step 1: Update search feature index.ts**

Replace the SearchPalette export with CommandPalette:

```ts
export { searchApi } from './api';
export { useSearch, searchKeys } from './hooks';
export type { SearchResult } from './types';
export { CommandPalette } from './components/CommandPalette';
```

- [ ] **Step 2: Update app-shell.tsx imports**

Change line 16 from:

```tsx
import { SearchPalette } from '@/features/search';
```

to:

```tsx
import { CommandPalette } from '@/features/search';
```

- [ ] **Step 3: Update app-shell.tsx component usage**

Change line 180 from:

```tsx
<SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
```

to:

```tsx
<CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm --filter @flow-desk/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Verify lint passes**

```bash
pnpm --filter @flow-desk/web lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/search/index.ts apps/web/src/components/layout/app-shell.tsx
git commit -m "feat: switch SearchPalette to CommandPalette in app-shell"
```

---

### Task 4: Write CommandPalette tests

**Files:**

- Create: `apps/web/src/features/search/components/CommandPalette.test.tsx`

**Interfaces:**

- Consumes: `CommandPalette` from Task 2, `api` mock from `@/lib/api`
- Produces: Passing test suite

- [ ] **Step 1: Write the test file**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: unknown,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/features/workspace', () => ({
  workspaceApi: {
    list: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
  },
}));

vi.mock('@/lib/theme', () => ({
  useTheme: () => ({ theme: 'light', toggle: vi.fn() }),
}));

import { api } from '@/lib/api';
const mockApi = vi.mocked(api);

function renderPalette(open = true, onOpenChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CommandPalette open={open} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the search input when open', () => {
    renderPalette();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows navigation group with Dashboard', () => {
    renderPalette();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows Quick Actions group', () => {
    renderPalette();
    expect(screen.getByText('Toggle Theme')).toBeInTheDocument();
  });

  it('debounces and shows search results', async () => {
    mockApi.mockResolvedValue({
      data: [
        {
          type: 'task',
          id: 't1',
          workspaceId: 'ws1',
          taskId: 't1',
          title: 'Report draft',
          rank: 0.5,
        },
      ],
    });
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'report');
    await waitFor(() => expect(screen.getByText('Report draft')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('shows "No results found." when all groups are empty', async () => {
    mockApi.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'zzz');
    await waitFor(() => expect(screen.getByText('No results found.')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @flow-desk/web test -- --run
```

Expected: All tests PASS.

- [ ] **Step 3: Fix any test failures**

If tests fail, update the test file or component to match actual behavior. Common issues:

- CommandDialog may render the input with a different role
- cmdk may filter items differently than expected

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/search/components/CommandPalette.test.tsx
git commit -m "test: add CommandPalette tests"
```

---

### Task 5: Delete old SearchPalette files and run full verification

**Files:**

- Delete: `apps/web/src/features/search/components/SearchPalette.tsx`
- Delete: `apps/web/src/features/search/components/SearchPalette.test.tsx`

**Interfaces:**

- Consumes: None
- Produces: Cleaned up feature directory

- [ ] **Step 1: Delete old files**

```bash
rm apps/web/src/features/search/components/SearchPalette.tsx
rm apps/web/src/features/search/components/SearchPalette.test.tsx
```

- [ ] **Step 2: Verify no remaining imports of SearchPalette**

```bash
grep -r "SearchPalette" apps/web/src/
```

Expected: No results.

- [ ] **Step 3: Run full verification**

```bash
pnpm verify
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove old SearchPalette, replaced by CommandPalette"
```
