import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SearchPalette } from './SearchPalette';

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

function renderPalette(open = true, onOpenChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SearchPalette open={open} onOpenChange={onOpenChange} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SearchPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the search input when open', () => {
    renderPalette();
    expect(screen.getByRole('textbox', { name: 'Search query' })).toBeInTheDocument();
  });

  it('shows "Type to search" prompt before any input', () => {
    renderPalette();
    expect(screen.getByText('Type to search across your workspaces.')).toBeInTheDocument();
  });

  it('debounces then shows results', async () => {
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
    const input = screen.getByRole('textbox', { name: 'Search query' });
    await user.type(input, 'report');
    await waitFor(() => expect(screen.getByText('Report draft')).toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(mockApi).toHaveBeenCalledWith(
      '/api/search?q=report&limit=20',
      expect.objectContaining({ schema: expect.anything() }),
    );
  });

  it('renders the no-matches message when API returns empty', async () => {
    mockApi.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    renderPalette();
    const input = screen.getByRole('textbox', { name: 'Search query' });
    await user.type(input, 'zzz');
    await waitFor(() => expect(screen.getByText('No matches.')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });
});
