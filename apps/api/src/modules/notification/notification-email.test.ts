import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockUpsert = vi.fn();
const mockEmailJobCreate = vi.fn();
const mockEnqueueEmail = vi.fn();

const mockPrisma = {
  workspaceNotificationSetting: { findUnique: mockFindUnique, upsert: mockUpsert },
  userNotificationPreference: {
    findUnique: mockFindFirst,
    findFirst: mockFindFirst,
    upsert: mockUpsert,
  },
  emailJob: { create: mockEmailJobCreate },
};

vi.mock('../../shared/lib/prisma', () => ({
  prisma: mockPrisma,
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
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

vi.mock('../../workers/email/queue', () => ({
  enqueueEmail: (...args: unknown[]) => mockEnqueueEmail(...args),
  createEmailQueue: vi.fn(),
  EMAIL_QUEUE_NAME: 'email',
}));

describe('handleTaskAssignedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    mockEmailJobCreate.mockResolvedValue({ id: 'email-job-1' });
  });

  it('enqueues INSTANT email when user has no delay preference', async () => {
    mockEnqueueEmail.mockResolvedValue({ id: 'job-1' });

    const { handleTaskAssignedEmail } = await import('./notification-email.service');
    await handleTaskAssignedEmail(mockPrisma as any, {
      assigneeId: 'user-1',
      assigneeName: 'Alice',
      assigneeEmail: 'alice@example.com',
      assignerName: 'Bob',
      taskId: 'task-1',
      taskTitle: 'Fix login bug',
      taskUrl: 'http://localhost:3000/tasks/task-1',
      workspaceId: 'ws-1',
      workspaceName: 'Workspace Alpha',
      dueAt: null,
    });

    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    const callArgs = mockEnqueueEmail.mock.calls[0]!;
    expect(callArgs[0].type).toBe('INSTANT');
    expect(callArgs[0].to).toBe('alice@example.com');
    expect(callArgs[0].userId).toBe('user-1');
    expect(callArgs[1]).toEqual({ delay: undefined, jobId: expect.any(String) });

    expect(mockEmailJobCreate).toHaveBeenCalledTimes(1);
    const jobArgs = mockEmailJobCreate.mock.calls[0]![0];
    expect(jobArgs.data.type).toBe('INSTANT');
    expect(jobArgs.data.status).toBe('PENDING');
    expect(jobArgs.data.userId).toBe('user-1');
  });

  it('enqueues DELAYED email when user has delay preference', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockImplementation((args: any) => {
      if (args?.where?.userId_workspaceId?.workspaceId === 'ws-1') {
        return Promise.resolve({ emailDelayMinutes: 15 });
      }
      if (args?.where?.workspaceId === null) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });
    mockEnqueueEmail.mockResolvedValue({ id: 'job-2' });

    const { handleTaskAssignedEmail } = await import('./notification-email.service');
    await handleTaskAssignedEmail(mockPrisma as any, {
      assigneeId: 'user-1',
      assigneeName: 'Alice',
      assigneeEmail: 'alice@example.com',
      assignerName: 'Bob',
      taskId: 'task-1',
      taskTitle: 'Fix login bug',
      taskUrl: 'http://localhost:3000/tasks/task-1',
      workspaceId: 'ws-1',
      workspaceName: 'Workspace Alpha',
      dueAt: null,
    });

    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    const callArgs = mockEnqueueEmail.mock.calls[0]!;
    expect(callArgs[0].type).toBe('DELAYED');
    expect(callArgs[1]?.delay).toBe(15 * 60 * 1000);

    expect(mockEmailJobCreate).toHaveBeenCalledTimes(1);
    const jobArgs = mockEmailJobCreate.mock.calls[0]![0];
    expect(jobArgs.data.type).toBe('DELAYED');
    expect(jobArgs.data.status).toBe('PENDING');
    expect(jobArgs.data.scheduledAt).toBeInstanceOf(Date);
  });

  it('skips email when taskAssignedEmail preference is false', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockImplementation((args: any) => {
      if (args?.where?.userId_workspaceId?.workspaceId === 'ws-1') {
        return Promise.resolve({ taskAssignedEmail: false });
      }
      if (args?.where?.workspaceId === null) {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });
    mockEnqueueEmail.mockResolvedValue({ id: 'job-3' });

    const { handleTaskAssignedEmail } = await import('./notification-email.service');
    await handleTaskAssignedEmail(mockPrisma as any, {
      assigneeId: 'user-1',
      assigneeName: 'Alice',
      assigneeEmail: 'alice@example.com',
      assignerName: 'Bob',
      taskId: 'task-1',
      taskTitle: 'Fix login bug',
      taskUrl: 'http://localhost:3000/tasks/task-1',
      workspaceId: 'ws-1',
      workspaceName: 'Workspace Alpha',
      dueAt: null,
    });

    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });
});
