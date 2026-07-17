import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exportTasksCsv } from './api';

// P1-3: exportTasksCsv fetches CSV and triggers a blob download.
describe('exportTasksCsv (P1-3)', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock');
    revokeObjectURL = vi.fn();
    clickSpy = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          rel: '',
          click: clickSpy,
          remove: vi.fn(),
        } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tag);
    });
    vi.spyOn(document.body, 'appendChild').mockImplementation((n) => n);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches export URL with workspaceId only when filters are ALL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['csv']),
      headers: new Headers({
        'Content-Disposition': 'attachment; filename="tasks.csv"',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await exportTasksCsv({ workspaceId: 'ws-123', status: 'ALL', priority: 'ALL' });

    expect(fetchMock).toHaveBeenCalledWith('/api/tasks/export?workspaceId=ws-123', {
      credentials: 'include',
    });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('includes status and priority when not ALL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['csv']),
      headers: new Headers({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    await exportTasksCsv({ workspaceId: 'ws-123', status: 'IN_REVIEW', priority: 'HIGH' });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('workspaceId=ws-123');
    expect(url).toContain('status=IN_REVIEW');
    expect(url).toContain('priority=HIGH');
  });

  it('throws with server message on 413', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({ message: 'Export exceeds 10000 rows' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      exportTasksCsv({ workspaceId: 'ws-123', status: 'ALL', priority: 'ALL' }),
    ).rejects.toThrow(/Export exceeds 10000 rows/);
  });
});
