import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

// Mock the API client so the switcher's workspace list query resolves with fixtures.
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

import { api } from '@/lib/api';

const mockApi = vi.mocked(api);

const wsA = {
  id: 'ws-a',
  name: 'Acme',
  slug: 'acme',
  role: 'OWNER' as const,
  _count: { members: 1, tasks: 0 },
};
const wsB = {
  id: 'ws-b',
  name: 'Beta Corp',
  slug: 'beta',
  role: 'MEMBER' as const,
  _count: { members: 2, tasks: 3 },
};

function renderSwitcher(props?: Partial<React.ComponentProps<typeof WorkspaceSwitcher>>) {
  const onCreateWorkspace = vi.fn();
  const navigate = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/board/ws-a']}>
        <Routes>
          <Route path="/board/:workspaceId" element={<div>board</div>} />
          <Route path="*" element={<div>fallback</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { onCreateWorkspace, navigate, ...utils };
}

function renderWithSwitcher(
  props?: Partial<React.ComponentProps<typeof WorkspaceSwitcher>>,
  list: unknown[] = [wsA, wsB],
) {
  const onCreateWorkspace = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/board/ws-a']}>
        <WorkspaceSwitcher
          currentWorkspaceId={props?.currentWorkspaceId ?? 'ws-a'}
          onCreateWorkspace={onCreateWorkspace}
          variant={props?.variant ?? 'sidebar'}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { onCreateWorkspace, ...utils };
}

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it('calls onCreateWorkspace when the empty-state "New workspace" button is clicked', async () => {
    mockApi.mockResolvedValue({ data: [], nextCursor: null } as never);
    const user = userEvent.setup();
    const { onCreateWorkspace } = renderWithSwitcher({}, []);

    const btn = await screen.findByRole('button', { name: /new workspace/i });
    await user.click(btn);

    expect(onCreateWorkspace).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateWorkspace when "New workspace" is selected from the sidebar dropdown', async () => {
    mockApi.mockResolvedValue({ data: [wsA, wsB], nextCursor: null } as never);
    const user = userEvent.setup();
    const { onCreateWorkspace } = renderWithSwitcher({ variant: 'sidebar' });

    // Open the dropdown
    const trigger = await screen.findByRole('button', { name: /acme/i });
    await user.click(trigger);

    // Click "New workspace" menu item
    const newItem = await screen.findByRole('menuitem', { name: /new workspace/i });
    await user.click(newItem);

    await waitFor(() => {
      expect(onCreateWorkspace).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onCreateWorkspace when "New workspace" is selected from the header dropdown', async () => {
    mockApi.mockResolvedValue({ data: [wsA, wsB], nextCursor: null } as never);
    const user = userEvent.setup();
    const { onCreateWorkspace } = renderWithSwitcher({ variant: 'header' });

    const trigger = await screen.findByRole('button', { name: /switch workspace/i });
    await user.click(trigger);

    const newItem = await screen.findByRole('menuitem', { name: /new workspace/i });
    await user.click(newItem);

    await waitFor(() => {
      expect(onCreateWorkspace).toHaveBeenCalledTimes(1);
    });
  });

  it('does not render "New workspace" item when onCreateWorkspace is omitted', async () => {
    mockApi.mockResolvedValue({ data: [wsA, wsB], nextCursor: null } as never);
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/board/ws-a']}>
          <WorkspaceSwitcher currentWorkspaceId="ws-a" variant="sidebar" />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const trigger = await screen.findByRole('button', { name: /acme/i });
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: /new workspace/i })).not.toBeInTheDocument();
    });
  });
});
