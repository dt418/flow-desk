import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFindTasks = vi.fn();
const mockFindEmailJobs = vi.fn();
const mockFindSettings = vi.fn();
const mockFindMembers = vi.fn();
const mockEmailJobCreate = vi.fn();

vi.mock('bullmq', () => ({
  Queue: vi.fn(() => ({ add: vi.fn().mockResolvedValue({ id: 'job-1' }) })),
}));

vi.mock('../../shared/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('../../shared/lib/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

vi.mock('../../shared/lib/email-provider', () => ({
  emailProvider: { name: 'nodemailer', send: vi.fn() },
}));

vi.mock('../../shared/lib/prisma', () => ({
  prisma: {
    task: { findMany: mockFindTasks },
    emailJob: { findMany: mockFindEmailJobs, create: mockEmailJobCreate },
    workspaceNotificationSetting: { findMany: mockFindSettings },
    workspaceMember: { findMany: mockFindMembers },
  },
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindTasks.mockResolvedValue([]);
    mockFindEmailJobs.mockResolvedValue([]);
    mockFindSettings.mockResolvedValue([]);
    mockFindMembers.mockResolvedValue([]);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startScheduler sets interval and runs tick', async () => {
    const { startScheduler, stopScheduler } = await import('./scheduler');
    startScheduler();
    await vi.advanceTimersByTimeAsync(60_000);
    stopScheduler();
    expect(mockFindTasks).toHaveBeenCalled();
  });

  it('stopScheduler clears interval', async () => {
    const { startScheduler, stopScheduler } = await import('./scheduler');
    startScheduler();
    stopScheduler();
  });

  it('checkDueReminders handles no due tasks', async () => {
    const { checkDueReminders } = await import('./scheduler');
    mockFindTasks.mockResolvedValue([]);
    await expect(checkDueReminders()).resolves.toBeUndefined();
  });

  it('checkDueReminders enqueues reminder for due task', async () => {
    const { checkDueReminders } = await import('./scheduler');
    mockFindTasks.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Test Task',
        dueDate: new Date(Date.now() + 3600000),
        assigneeId: 'user-1',
        workspaceId: 'ws-1',
        assignee: { id: 'user-1', name: 'Test', email: 'test@example.com' },
      },
    ]);
    mockFindEmailJobs.mockResolvedValue([]);
    await checkDueReminders();
    expect(mockFindEmailJobs).toHaveBeenCalled();
  });

  it('checkDigests handles no settings', async () => {
    const { checkDigests } = await import('./scheduler');
    mockFindSettings.mockResolvedValue([]);
    await expect(checkDigests()).resolves.toBeUndefined();
  });

  it('checkDigests enqueues for workspace with daily digest', async () => {
    const { checkDigests } = await import('./scheduler');
    mockFindSettings.mockResolvedValue([
      { workspaceId: 'ws-1', dailyDigest: true, weeklyDigest: false },
    ]);
    mockFindMembers.mockResolvedValue([
      {
        userId: 'user-1',
        user: { id: 'user-1', name: 'Test', email: 'test@example.com' },
      },
    ]);
    mockFindEmailJobs.mockResolvedValue([]);
    mockEmailJobCreate.mockResolvedValue({ id: 'ej-digest-1' });
    await checkDigests();
    expect(mockFindMembers).toHaveBeenCalled();
    expect(mockEmailJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'DIGEST',
          status: 'PENDING',
        }),
      }),
    );
  });
});
