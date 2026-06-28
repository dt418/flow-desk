import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockUpsert = vi.fn();

const mockPrisma = {
  workspaceNotificationSetting: {
    findUnique: mockFindUnique,
    upsert: mockUpsert,
  },
  userNotificationPreference: {
    findUnique: mockFindFirst,
    findFirst: mockFindFirst,
    upsert: mockUpsert,
    create: mockCreate,
    update: mockUpdate,
  },
};

vi.mock('../../shared/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../../shared/lib/prisma', () => ({
  prisma: mockPrisma,
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

const wsSetting = {
  id: 'ws-set-1',
  workspaceId: 'ws-1',
  taskAssignedEmail: true,
  taskMentionedEmail: true,
  taskDueReminderEmail: true,
  taskDueReminderHours: 24,
  commentReplyEmail: true,
  commentMentionEmail: true,
  dailyDigest: false,
  weeklyDigest: true,
};

const userPrefFull = {
  id: 'up-1',
  userId: 'user-1',
  workspaceId: 'ws-1',
  taskAssignedEmail: false,
  taskMentionedEmail: null,
  taskDueReminderEmail: null,
  taskDueReminderHours: null,
  dailyDigest: true,
  weeklyDigest: null,
  emailDelayMinutes: 0,
};

describe('notification-preferences service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    mockCreate.mockResolvedValue(wsSetting);
    mockUpdate.mockResolvedValue(wsSetting);
    mockUpsert.mockResolvedValue(wsSetting);
  });

  describe('getEffectivePreferences', () => {
    it('merges user pref > global pref > workspace setting > defaults', async () => {
      mockFindFirst.mockImplementation((args: any) => {
        // findUnique via compound key
        if (args?.where?.userId_workspaceId?.workspaceId === 'ws-1') {
          return Promise.resolve(userPrefFull);
        }
        // findFirst for global (workspaceId: null)
        if (args?.where?.workspaceId === null) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });
      mockFindUnique.mockResolvedValue(wsSetting);

      const { getEffectivePreferences } = await import('./notification-preferences.service');
      const result = await getEffectivePreferences(mockPrisma as any, 'user-1', 'ws-1');

      expect(result.taskAssignedEmail).toBe(false);
      expect(result.dailyDigest).toBe(true);
      expect(result.commentReplyEmail).toBe(true);
      expect(result.emailDelayMinutes).toBe(0);
    });

    it('uses workspace defaults when no user preference exists', async () => {
      mockFindFirst.mockResolvedValue(null);
      mockFindUnique.mockResolvedValue(wsSetting);

      const { getEffectivePreferences } = await import('./notification-preferences.service');
      const result = await getEffectivePreferences(mockPrisma as any, 'user-1', 'ws-1');

      expect(result.taskAssignedEmail).toBe(true);
      expect(result.weeklyDigest).toBe(true);
      expect(result.emailDelayMinutes).toBe(0);
    });

    it('falls back to system defaults when no settings exist', async () => {
      mockFindFirst.mockResolvedValue(null);
      mockFindUnique.mockResolvedValue(null);

      const { getEffectivePreferences } = await import('./notification-preferences.service');
      const result = await getEffectivePreferences(mockPrisma as any, 'user-1', 'ws-1');

      expect(result.taskAssignedEmail).toBe(true);
      expect(result.taskDueReminderHours).toBe(24);
      expect(result.dailyDigest).toBe(false);
      expect(result.emailDelayMinutes).toBe(0);
    });
  });

  describe('getOrCreateWorkspaceSetting', () => {
    it('creates workspace setting with defaults when none exists', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue(wsSetting);

      const { getOrCreateWorkspaceSetting } = await import('./notification-preferences.service');
      const result = await getOrCreateWorkspaceSetting(mockPrisma as any, 'ws-1');

      expect(result).toEqual(wsSetting);
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        update: {},
        create: { workspaceId: 'ws-1' },
      });
    });
  });

  describe('updateWorkspaceSetting', () => {
    it('updates workspace setting with provided fields', async () => {
      mockUpsert.mockResolvedValue({ ...wsSetting, dailyDigest: true });

      const { updateWorkspaceSetting } = await import('./notification-preferences.service');
      const result = await updateWorkspaceSetting(mockPrisma as any, 'ws-1', { dailyDigest: true });

      expect(mockUpsert).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        update: { dailyDigest: true },
        create: { workspaceId: 'ws-1', dailyDigest: true },
      });
      expect(result.dailyDigest).toBe(true);
    });
  });
});
