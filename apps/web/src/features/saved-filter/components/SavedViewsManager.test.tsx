import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SavedViewsManager } from './SavedViewsManager';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const qc = makeQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SavedViewsManager', () => {
  it('shows empty state when no saved views exist', () => {
    renderWithClient(<SavedViewsManager workspaceId="w1" />);
    expect(screen.getByText(/No saved views yet/)).toBeDefined();
  });
});
