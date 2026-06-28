import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

const mockPrisma = {
  notification: {
    create: mockCreate,
  },
};

vi.mock('../../shared/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../../shared/lib/prisma', () => ({
  prisma: mockPrisma,
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

const now = new Date('2026-06-28T00:00:00Z');
const mockNotification = {
  id: 'notif-1',
  userId: 'assignee-1',
  type: 'TASK_ASSIGNED',
  title: 'You were assigned: Fix login bug',
  body: 'in Workspace Alpha',
  data: { taskId: 'task-1', assignedById: 'user-1' },
  readAt: null,
  createdAt: now,
};

describe('notification service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(mockNotification);
  });

  describe('createTaskAssignmentNotification', () => {
    it('creates a TASK_ASSIGNED notification for the assignee', async () => {
      const { createTaskAssignmentNotification } = await import('./notification.service');
      const result = await createTaskAssignmentNotification(mockPrisma as any, {
        taskId: 'task-1',
        taskTitle: 'Fix login bug',
        workspaceId: 'ws-1',
        assigneeId: 'assignee-1',
        assignedById: 'user-1',
        workspaceName: 'Workspace Alpha',
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: 'assignee-1',
          type: 'TASK_ASSIGNED',
          title: 'You were assigned: Fix login bug',
          body: 'in Workspace Alpha',
          data: { taskId: 'task-1', assignedById: 'user-1' },
        },
      });
      expect(result.id).toBe('notif-1');
      expect(result.type).toBe('TASK_ASSIGNED');
    });
  });
});
