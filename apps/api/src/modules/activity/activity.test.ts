import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTaskActivityCreate = vi.fn();
const mockTaskFindFirst = vi.fn();
const mockTaskFindUnique = vi.fn();
const mockTaskActivityFindMany = vi.fn();

const mockPrisma = {
  taskActivity: {
    create: mockTaskActivityCreate,
    findMany: mockTaskActivityFindMany,
  },
  task: {
    findFirst: mockTaskFindFirst,
    findUnique: mockTaskFindUnique,
  },
};

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

vi.mock('../../shared/lib/prisma', () => ({
  prisma: mockPrisma,
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

vi.mock('../../shared/lib/access', () => ({
  assertMembership: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../webhook/webhook.repository', () => ({
  listActiveByWorkspace: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../workers/webhook/queue', () => ({
  webhookQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../shared/errors', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(resource: string) {
      super(`${resource} not found`);
      this.name = 'NotFoundError';
    }
  },
  BadRequestError: class BadRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BadRequestError';
    }
  },
}));

const now = new Date('2026-07-04T00:00:00Z');
const mockActivity = {
  id: 'act-1',
  taskId: 'task-1',
  userId: 'user-1',
  action: 'CREATED',
  field: null,
  oldValue: null,
  newValue: 'Set up CI',
  metadata: null,
  createdAt: now,
};

describe('activity service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskActivityCreate.mockResolvedValue(mockActivity);
    mockTaskFindUnique.mockResolvedValue({ workspaceId: 'ws-1' });
  });

  describe('record', () => {
    it('creates a TaskActivity row', async () => {
      const { activityService } = await import('./activity.service');
      const result = await activityService.record({
        taskId: 'task-1',
        userId: 'user-1',
        action: 'CREATED',
        newValue: 'Set up CI',
      });

      expect(mockTaskActivityCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          taskId: 'task-1',
          userId: 'user-1',
          action: 'CREATED',
          field: null,
          oldValue: null,
          newValue: 'Set up CI',
        }),
      });
      expect(result?.id).toBe('act-1');
    });

    it('returns null when prisma throws', async () => {
      mockTaskActivityCreate.mockRejectedValue(new Error('db down'));
      const { activityService } = await import('./activity.service');
      const result = await activityService.record({
        taskId: 'task-1',
        userId: 'user-1',
        action: 'CREATED',
      });
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('throws NotFoundError when task missing', async () => {
      mockTaskFindFirst.mockResolvedValue(null);
      const { activityService } = await import('./activity.service');
      await expect(activityService.list('user-1', 'missing-task', { limit: 20 })).rejects.toThrow(
        'Task not found',
      );
    });

    it('returns paginated activities for existing task', async () => {
      mockTaskFindFirst.mockResolvedValue({ workspaceId: 'ws-1' });
      const activityWithUser = {
        ...mockActivity,
        user: { id: 'user-1', name: 'Alice', avatarUrl: null },
      };
      mockTaskActivityFindMany.mockResolvedValue([activityWithUser]);
      const { activityService } = await import('./activity.service');
      const result = await activityService.list('user-1', 'task-1', { limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.user.name).toBe('Alice');
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor when more rows exist', async () => {
      mockTaskFindFirst.mockResolvedValue({ workspaceId: 'ws-1' });
      const rows = [
        { ...mockActivity, id: 'a1', user: { id: 'u1', name: 'A', avatarUrl: null } },
        { ...mockActivity, id: 'a2', user: { id: 'u1', name: 'A', avatarUrl: null } },
      ];
      mockTaskActivityFindMany.mockResolvedValue([...rows, { ...mockActivity, id: 'a3' }]);
      const { activityService } = await import('./activity.service');
      const result = await activityService.list('user-1', 'task-1', { limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBe('a2');
    });
  });
});
