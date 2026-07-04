import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActivityTimeline } from './ActivityTimeline';

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

const now = '2026-07-04T00:00:00Z';

const aliceActivity = {
  id: 'act-1',
  taskId: 'task-1',
  userId: 'user-a',
  action: 'CREATED' as const,
  field: null,
  oldValue: null,
  newValue: 'Set up CI',
  metadata: null,
  createdAt: now,
  user: { id: 'user-a', name: 'Alice', avatarUrl: null },
};

const bobActivity = {
  id: 'act-2',
  taskId: 'task-1',
  userId: 'user-b',
  action: 'STATUS_CHANGED' as const,
  field: 'status',
  oldValue: 'TODO',
  newValue: 'IN_PROGRESS',
  metadata: null,
  createdAt: now,
  user: { id: 'user-b', name: 'Bob', avatarUrl: null },
};

function renderTimeline(props?: Partial<React.ComponentProps<typeof ActivityTimeline>>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityTimeline taskId="task-1" {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeletons while fetching', async () => {
    mockApi.mockReturnValue(new Promise(() => {}));
    renderTimeline();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders empty state when no activities', async () => {
    mockApi.mockResolvedValue({ data: [], nextCursor: null });
    renderTimeline();
    await waitFor(() => expect(screen.getByText('No activity yet')).toBeTruthy());
  });

  it('renders activity items with user name + label', async () => {
    mockApi.mockResolvedValue({ data: [aliceActivity, bobActivity], nextCursor: null });
    renderTimeline();
    await waitFor(() => expect(screen.getByText('Alice')).toBeTruthy());
    expect(screen.getByText(/created this task/)).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText(/changed the status/)).toBeTruthy();
    expect(screen.getByText('TODO')).toBeTruthy();
    expect(screen.getByText('IN_PROGRESS')).toBeTruthy();
  });

  it('renders Load more button when nextCursor present', async () => {
    mockApi.mockResolvedValue({ data: [aliceActivity], nextCursor: 'act-2' });
    renderTimeline();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Load more activity' })).toBeTruthy(),
    );
  });
});
