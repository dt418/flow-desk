import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

const mockPrisma = {
  chatChannel: {
    findMany: mockFindMany,
    findUnique: mockFindUnique,
    findFirst: mockFindFirst,
    create: mockCreate,
    update: mockUpdate,
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

vi.mock('../../shared/lib/env', () => ({
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

vi.mock('../../shared/lib/access', () => ({
  assertMembership: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../shared/lib/prisma', () => ({
  prisma: mockPrisma,
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

const now = new Date('2026-06-28T00:00:00Z');
const mockChannel = {
  id: 'ch-1',
  workspaceId: 'ws-1',
  name: 'general',
  description: 'General chat',
  isPrivate: false,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  messages: [{ id: 'msg-1', authorId: 'user-1', content: 'hello', createdAt: now }],
};

const mockChannelNoMessages = { ...mockChannel, messages: [] };

describe('chat service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue(mockChannel);
    mockUpdate.mockResolvedValue(mockChannel);
  });

  describe('listChannels', () => {
    it('returns channels with latest message', async () => {
      mockFindMany.mockResolvedValue([mockChannel]);
      const { listChannels } = await import('./chat.service');
      const result = await listChannels(mockPrisma as any, 'user-1', 'ws-1');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('ch-1');
      expect(result[0]!.latestMessage).toBeTruthy();
      expect(result[0]!.latestMessage!.content).toBe('hello');
    });

    it('returns channels with null latestMessage when no messages', async () => {
      mockFindMany.mockResolvedValue([mockChannelNoMessages]);
      const { listChannels } = await import('./chat.service');
      const result = await listChannels(mockPrisma as any, 'user-1', 'ws-1');
      expect(result[0]!.latestMessage).toBeNull();
    });

    it('returns empty array when no channels', async () => {
      mockFindMany.mockResolvedValue([]);
      const { listChannels } = await import('./chat.service');
      const result = await listChannels(mockPrisma as any, 'user-1', 'ws-1');
      expect(result).toEqual([]);
    });
  });

  describe('getChannel', () => {
    it('returns channel by id', async () => {
      mockFindUnique.mockResolvedValue(mockChannel);
      const { getChannel } = await import('./chat.service');
      const result = await getChannel(mockPrisma as any, 'user-1', 'ws-1', 'ch-1');
      expect(result.id).toBe('ch-1');
      expect(result.latestMessage).toBeTruthy();
    });
  });

  describe('createChannel', () => {
    it('creates channel successfully', async () => {
      mockFindFirst.mockResolvedValue(null);
      mockCreate.mockResolvedValue(mockChannel);
      const { createChannel } = await import('./chat.service');
      const result = await createChannel(mockPrisma as any, 'user-1', 'ws-1', {
        workspaceId: 'ws-1',
        name: 'general',
        description: 'General chat',
        isPrivate: false,
        scope: 'WORKSPACE',
      });
      expect(result.id).toBe('ch-1');
      expect(result.name).toBe('general');
    });

    it('translates P2002 duplicate name to ConflictError', async () => {
      const p2002Error = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        clientVersion: '0.0.0',
        meta: { target: ['workspaceId', 'name'] },
      });
      mockCreate.mockRejectedValueOnce(p2002Error);
      const { createChannel } = await import('./chat.service');
      await expect(
        createChannel(mockPrisma as any, 'user-1', 'ws-1', {
          workspaceId: 'ws-1',
          name: 'general',
          isPrivate: false,
          scope: 'WORKSPACE',
        }),
      ).rejects.toThrow('already exists');
    });
  });

  describe('updateChannel', () => {
    it('updates channel fields', async () => {
      mockFindUnique.mockResolvedValue(mockChannel);
      mockUpdate.mockResolvedValue(mockChannel);
      const { updateChannel } = await import('./chat.service');
      const result = await updateChannel(mockPrisma as any, 'user-1', 'ws-1', 'ch-1', {
        name: 'random',
      });
      expect(result.name).toBe('general');
    });

    it('throws NotFoundError when channel not found', async () => {
      mockFindUnique.mockResolvedValue(null);
      const { updateChannel } = await import('./chat.service');
      await expect(
        updateChannel(mockPrisma as any, 'user-1', 'ws-1', 'ch-1', { name: 'test' }),
      ).rejects.toThrow('not found');
    });
  });

  describe('deleteChannel', () => {
    it('soft-deletes channel', async () => {
      mockFindUnique.mockResolvedValue(mockChannel);
      const { deleteChannel } = await import('./chat.service');
      await expect(
        deleteChannel(mockPrisma as any, 'user-1', 'ws-1', 'ch-1'),
      ).resolves.toBeUndefined();
    });
  });
});

describe('chat routes', () => {
  it('mounts without error', async () => {
    const { chatRouter } = await import('./chat.routes');
    expect(chatRouter).toBeDefined();
  });
});

describe('chat schema', () => {
  it('createChannelSchema validates valid input', async () => {
    const { createChannelSchema } = await import('@flow-desk/shared/chat');
    const result = createChannelSchema.parse({
      name: 'general',
      isPrivate: false,
      workspaceId: 'cmramg4pr000f7ggv657384wv',
    });
    expect(result.name).toBe('general');
    expect(result.isPrivate).toBe(false);
  });

  it('createChannelSchema rejects short name', async () => {
    const { createChannelSchema } = await import('@flow-desk/shared/chat');
    expect(() => createChannelSchema.parse({ name: 'x' })).toThrow();
  });

  it('updateChannelSchema requires at least one field', async () => {
    const { updateChannelSchema } = await import('@flow-desk/shared/chat');
    expect(() => updateChannelSchema.parse({})).toThrow();
  });
});
