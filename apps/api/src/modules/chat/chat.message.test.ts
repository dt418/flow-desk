import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindChannel = vi.fn();
const mockFindMessages = vi.fn();
const mockFindMessage = vi.fn();
const mockCreateMessage = vi.fn();
const mockUpdateMessage = vi.fn();
const mockDeleteMessage = vi.fn();
void mockDeleteMessage;

const mockPrisma = {
  chatChannel: {
    findUnique: mockFindChannel,
  },
  chatMessage: {
    findMany: mockFindMessages,
    findUnique: mockFindMessage,
    create: mockCreateMessage,
    update: mockUpdateMessage,
    findFirst: vi.fn().mockResolvedValue(null),
  },
  notification: {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  $transaction: vi.fn(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)),
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

vi.mock('../../shared/lib/socket-events', () => ({
  emitToRoom: vi.fn(),
  emitToUser: vi.fn(),
  safeEmit: (fn: () => void) => { fn(); return { ok: true as const }; },
}));

vi.mock('../../shared/lib/prisma', () => ({
  prisma: mockPrisma,
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

vi.mock('@flow-desk/shared/pagination', () => ({
  decodeCursor: vi.fn(),
  encodeCursor: vi.fn().mockReturnValue('next-cursor'),
  CursorPaginationQuery: { extend: vi.fn().mockReturnValue({ parse: vi.fn() }) },
}));

const now = new Date('2026-06-28T00:00:00Z');
const mockChannel = {
  id: 'ch-1',
  workspaceId: 'ws-1',
  name: 'general',
  description: null,
  isPrivate: false,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

const mockMessage = {
  id: 'msg-1',
  channelId: 'ch-1',
  authorId: 'user-1',
  content: 'hello',
  mentionedUserIds: [],
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  author: { id: 'user-1', name: 'Test', email: 'test@test.com', avatarUrl: null },
};

const mockDeletedChannel = { ...mockChannel, deletedAt: new Date() };
const mockDeletedMessage = { ...mockMessage, deletedAt: new Date() };
void mockDeletedMessage;

describe('chat message service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindChannel.mockResolvedValue(mockChannel);
    mockFindMessages.mockResolvedValue([]);
    mockFindMessage.mockResolvedValue(null);
    mockCreateMessage.mockResolvedValue(mockMessage);
    mockUpdateMessage.mockResolvedValue(mockMessage);
  });

  describe('sendMessage', () => {
    it('sends message successfully', async () => {
      mockCreateMessage.mockResolvedValue(mockMessage);
      const { sendMessage } = await import('./chat.message.service');
      const result = await sendMessage(mockPrisma as any, 'user-1', 'ch-1', {
        channelId: 'ch-1',
        content: 'hello',
        mentionedUserIds: [],
        clientMessageId: 'test-1',
      });
      expect(result.id).toBe('msg-1');
      expect(mockCreateMessage).toHaveBeenCalled();
    });

    it('throws on deleted channel', async () => {
      mockFindChannel.mockResolvedValue(mockDeletedChannel);
      const { sendMessage } = await import('./chat.message.service');
      await expect(
        sendMessage(mockPrisma as any, 'user-1', 'ch-1', {
          channelId: 'ch-1',
          content: 'hi',
          mentionedUserIds: [],
          clientMessageId: 'test-2',
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('listMessages', () => {
    it('returns empty list', async () => {
      mockFindMessages.mockResolvedValue([]);
      const { listMessages } = await import('./chat.message.service');
      const result = await listMessages(mockPrisma as any, 'user-1', 'ch-1', {
        channelId: 'ch-1',
        limit: 50,
      });
      expect(result.data).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('updateMessage', () => {
    it('updates own message', async () => {
      mockFindMessage.mockResolvedValue(mockMessage);
      mockUpdateMessage.mockResolvedValue({ ...mockMessage, content: 'updated' });
      const { updateMessage } = await import('./chat.message.service');
      const result = await updateMessage(mockPrisma as any, 'user-1', 'ch-1', 'msg-1', {
        content: 'updated',
      });
      expect(result.content).toBe('updated');
    });

    it('throws on others message', async () => {
      mockFindMessage.mockResolvedValue({ ...mockMessage, authorId: 'other-user' });
      const { updateMessage } = await import('./chat.message.service');
      await expect(
        updateMessage(mockPrisma as any, 'user-1', 'ch-1', 'msg-1', { content: 'x' }),
      ).rejects.toThrow('Cannot edit');
    });
  });

  describe('deleteMessage', () => {
    it('deletes own message', async () => {
      mockFindMessage.mockResolvedValue(mockMessage);
      const { deleteMessage } = await import('./chat.message.service');
      await expect(
        deleteMessage(mockPrisma as any, 'user-1', 'ch-1', 'msg-1'),
      ).resolves.toBeUndefined();
    });
  });
});

describe('chat message routes', () => {
  it('mounts without error', async () => {
    const { chatMessageRouter } = await import('./chat.message.routes');
    expect(chatMessageRouter).toBeDefined();
  });
});

describe('chat message schema', () => {
  it('createChatMessageSchema validates valid input', async () => {
    const { createChatMessageSchema } = await import('@flow-desk/shared/chat');
    const result = createChatMessageSchema.parse({ channelId: 'cmramjecb00068lgvh01d3g37', content: 'hello', clientMessageId: 'test-123' });
    expect(result.content).toBe('hello');
    expect(result.mentionedUserIds).toEqual([]);
  });

  it('updateChatMessageSchema rejects empty content', async () => {
    const { updateChatMessageSchema } = await import('@flow-desk/shared/chat');
    expect(() => updateChatMessageSchema.parse({ content: '' })).toThrow();
  });
});
