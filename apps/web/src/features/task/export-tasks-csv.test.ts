import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exportTasksCsv } from './api';

// P1-3: exportTasksCsv builds the correct query string and assigns it to
// window.location.href so the browser downloads the CSV via
// Content-Disposition: attachment.
describe('exportTasksCsv (P1-3)', () => {
  let assignedHref: string | undefined;
  const originalLocation = window.location;

  beforeEach(() => {
    assignedHref = undefined;
    // jsdom's window.location is non-writable; stub via defineProperty so we
    // can capture the href assignment without triggering a real navigation.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return assignedHref ?? originalLocation.href;
        },
        set href(v: string) {
          assignedHref = v;
        },
      },
    });
  });

  afterEach(() => {
    // Restore the real location object.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it('builds a URL with workspaceId only when filters are ALL', () => {
    exportTasksCsv({ workspaceId: 'ws-123', status: 'ALL', priority: 'ALL' });
    expect(assignedHref).toBe('/api/tasks/export?workspaceId=ws-123');
  });

  it('includes status and priority when not ALL', () => {
    exportTasksCsv({ workspaceId: 'ws-123', status: 'IN_REVIEW', priority: 'HIGH' });
    expect(assignedHref).toContain('workspaceId=ws-123');
    expect(assignedHref).toContain('status=IN_REVIEW');
    expect(assignedHref).toContain('priority=HIGH');
  });

  it('omits status when ALL but includes priority when set', () => {
    exportTasksCsv({ workspaceId: 'ws-123', status: 'ALL', priority: 'HIGH' });
    expect(assignedHref).not.toContain('status=');
    expect(assignedHref).toContain('priority=HIGH');
  });
});
