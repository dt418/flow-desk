import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceCreateDialog } from './workspace-create-dialog';

// ─── Mock the API client ──────────────────────────────────────────────
// The dialog calls useCreateWorkspace → workspaceApi.create → api().
// Mocking at the lowest level intercepts all HTTP traffic.

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

// ─── Fixture ──────────────────────────────────────────────────────────

const fakeWorkspace = {
  id: 'test-workspace-id',
  name: 'Test Workspace',
  slug: 'test-workspace',
  description: null,
  visibility: 'PRIVATE',
  ownerId: 'user-1',
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  deletedAt: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────

function renderDialog(props?: Partial<React.ComponentProps<typeof WorkspaceCreateDialog>>) {
  const onCreated = vi.fn();
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceCreateDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        {...props}
      />
    </QueryClientProvider>,
  );

  return { onCreated, onOpenChange, ...utils };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('WorkspaceCreateDialog', () => {
  beforeEach(() => {
    mockApi.mockReset();
  });

  it('renders all form fields when open', () => {
    renderDialog();
    expect(screen.getByText('New workspace')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Slug')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create workspace/i })).toBeInTheDocument();
  });

  it('auto-generates slug from name as user types', async () => {
    const user = userEvent.setup();
    renderDialog();

    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'My Cool Workspace');

    const slugInput = screen.getByLabelText('Slug') as HTMLInputElement;
    expect(slugInput.value).toBe('my-cool-workspace');
  });

  it('lets user override the auto-generated slug', async () => {
    const user = userEvent.setup();
    renderDialog();

    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'Project Alpha');

    // Auto-slug should be "project-alpha"
    const slugInput = screen.getByLabelText('Slug') as HTMLInputElement;
    expect(slugInput.value).toBe('project-alpha');

    // Clear and type a custom slug
    await user.clear(slugInput);
    await user.type(slugInput, 'custom-slug');
    expect(slugInput.value).toBe('custom-slug');

    // Type more in name — slug should NOT change because user touched it
    await user.type(nameInput, ' Beta');
    expect(slugInput.value).toBe('custom-slug');
  });

  it('submits form, calls POST /api/workspaces, and invokes onCreated', async () => {
    mockApi.mockResolvedValue({ workspace: fakeWorkspace } as never);
    const user = userEvent.setup();
    const { onCreated, onOpenChange } = renderDialog();

    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'Test Workspace');

    const submitButton = screen.getByRole('button', { name: /create workspace/i });
    await user.click(submitButton);

    // Verify the API was called with the right URL + body
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        '/api/workspaces',
        expect.objectContaining({
          method: 'POST',
          json: expect.objectContaining({
            name: 'Test Workspace',
            slug: 'test-workspace',
            visibility: 'PRIVATE',
          }),
        }),
      );
    });

    // Verify onCreated received the workspace and dialog was closed
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(fakeWorkspace);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('keeps dialog open and does not call onCreated on API error', async () => {
    mockApi.mockRejectedValue(Object.assign(new Error('Slug already taken'), { status: 409 }));
    const user = userEvent.setup();
    const { onCreated, onOpenChange } = renderDialog();

    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'Test');

    const submitButton = screen.getByRole('button', { name: /create workspace/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalled();
    });

    // Dialog should stay open — onCreated and onOpenChange(false) not called
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    // The dialog should still be visible
    expect(screen.getByText('New workspace')).toBeInTheDocument();
  });

  it('does not submit when name is empty (zod validation)', async () => {
    const user = userEvent.setup();
    renderDialog();

    const submitButton = screen.getByRole('button', { name: /create workspace/i });
    await user.click(submitButton);

    // API should not be called because zod validation rejects empty name
    expect(mockApi).not.toHaveBeenCalled();
  });
});
