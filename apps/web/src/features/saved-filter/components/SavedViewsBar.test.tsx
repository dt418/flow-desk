import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SavedViewsBar } from './SavedViewsBar';
import type { SavedFilterQuery } from '@flow-desk/shared/saved-filter';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const qc = makeQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SavedViewsBar', () => {
  it('renders save view button and view selector', () => {
    renderWithClient(
      <SavedViewsBar
        workspaceId="w1"
        activeViewId={null}
        currentQuery={{}}
        onLoadView={vi.fn()}
        onClearView={vi.fn()}
      />,
    );
    expect(screen.getByText('Save view')).toBeDefined();
    expect(screen.getByLabelText('Saved view')).toBeDefined();
  });

  it('shows "All tasks (default)" as default option', () => {
    renderWithClient(
      <SavedViewsBar
        workspaceId="w1"
        activeViewId={null}
        currentQuery={{}}
        onLoadView={vi.fn()}
        onClearView={vi.fn()}
      />,
    );
    const select = screen.getByLabelText('Saved view') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.getByText('All tasks (default)')).toBeDefined();
  });

  it('shows active view name in select when query data is cached', () => {
    const qc = makeQueryClient();
    qc.setQueryData(['saved-filters', 'w1'], {
      data: [
        { id: 'sf1', name: 'Urgent only', query: { priority: 'URGENT' }, isShared: false, userId: 'u1', workspaceId: 'w1', createdAt: '', updatedAt: '' },
      ],
    });
    render(
      <QueryClientProvider client={qc}>
        <SavedViewsBar
          workspaceId="w1"
          activeViewId="sf1"
          currentQuery={{ priority: 'URGENT' }}
          onLoadView={vi.fn()}
          onClearView={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const select = screen.getByLabelText('Saved view') as HTMLSelectElement;
    expect(select.value).toBe('sf1');
    expect(select.options.length).toBe(2);
    expect(select.options[1].text).toContain('Urgent only');
  });

  it('opens save dialog when save button is clicked', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <SavedViewsBar
        workspaceId="w1"
        activeViewId={null}
        currentQuery={{ status: 'TODO' }}
        onLoadView={vi.fn()}
        onClearView={vi.fn()}
      />,
    );
    await user.click(screen.getByText('Save view'));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Save current view')).toBeDefined();
    expect(screen.getByLabelText('View name')).toBeDefined();
  });
});
