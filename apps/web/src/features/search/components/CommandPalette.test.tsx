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

const mockUseSearch = vi.fn(
  (_q: string, _enabled?: boolean): { data: unknown; isLoading: boolean } => ({
    data: undefined,
    isLoading: false,
  }),
);
vi.mock('../hooks', () => ({
  useSearch: (q: string, enabled?: boolean) => mockUseSearch(q, enabled),
  searchKeys: { list: (q: string) => ['search', q] },
}));

vi.mock('@/features/workspace', () => ({
  workspaceApi: {
    list: vi.fn().mockResolvedValue({ data: [], nextCursor: null }),
  },
}));

vi.mock('@/lib/theme', () => ({
  useTheme: () => ({ theme: 'light', toggle: vi.fn() }),
}));

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
    mockUseSearch.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('renders the search input when open', () => {
    renderPalette();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows navigation group with Dashboard', () => {
    renderPalette();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows Quick Actions group with Toggle Theme', () => {
    renderPalette();
    expect(screen.getByText('Toggle Theme')).toBeInTheDocument();
  });

  it('debounces and shows search results', async () => {
    mockUseSearch.mockReturnValue({
      data: {
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
      },
      isLoading: false,
    });
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'report');
    await waitFor(() => expect(screen.getByText('Report draft')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('shows "No results found." when all groups are empty', async () => {
    mockUseSearch.mockReturnValue({ data: { data: [] }, isLoading: false });
    const user = userEvent.setup();
    renderPalette();
    await user.type(screen.getByRole('combobox'), 'zzz');
    await waitFor(() => expect(screen.getByText('No results found.')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });
});
