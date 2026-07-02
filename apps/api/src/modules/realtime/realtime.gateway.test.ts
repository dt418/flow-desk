import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Redis } from 'ioredis';

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
  prisma: {
    workspaceMember: { findUnique: vi.fn() },
  },
  env: { REDIS_URL: 'redis://localhost:6379', LOG_LEVEL: 'info', NODE_ENV: 'test' },
}));

function createMockSocket(userId?: string) {
  const rooms = new Set<string>();
  return {
    id: 'socket-1',
    data: userId !== undefined ? { userId, userName: 'Test User', userAvatar: null } : {},
    rooms,
    join: vi.fn((room: string) => { rooms.add(room); }),
    leave: vi.fn((room: string) => { rooms.delete(room); }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
  };
}

function createMockNamespace() {
  const emitted: Record<string, unknown[]> = {};
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    emitted,
    handlers,
    to: vi.fn().mockReturnValue({
      emit: vi.fn((event: string, ...args: unknown[]) => {
        emitted[event] = args;
      }),
    }),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      handlers.set(event, cb);
    }),
  };
}

function createMockRedis() {
  const store: Record<string, Record<string, string>> = {};
  return {
    store,
    hgetall: vi.fn(async (key: string) => store[key] ?? {}),
    hset: vi.fn(async (key: string, field: string, value: string) => {
      if (!store[key]) store[key] = {};
      store[key][field] = value;
    }),
    hdel: vi.fn(async (key: string, ...fields: string[]) => {
      if (!store[key]) return;
      for (const f of fields) delete store[key][f];
    }),
    expire: vi.fn(async () => 1),
    scan: vi.fn(async (_cursor: string, _cmd: string, pattern: string, _countCmd: string, _count: number) => {
      const keys = Object.keys(store).filter((k) => {
        if (pattern === 'presence:*') return k.startsWith('presence:');
        return k === pattern;
      });
      return ['0', keys];
    }),
  };
}

describe('RealtimeGateway', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let namespace: ReturnType<typeof createMockNamespace>;
  let mockIo: { of: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    redis = createMockRedis();
    namespace = createMockNamespace();
    mockIo = { of: vi.fn().mockReturnValue(namespace) };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('attachPresenceHandlers', () => {
    it('registers connection handler on namespace', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);
      expect(mockIo.of).toHaveBeenCalledWith('/tasks');
      expect(namespace.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('uses custom namespace name', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis, '/custom');
      expect(mockIo.of).toHaveBeenCalledWith('/custom');
    });

    it('returns stop function that clears sweeper', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      const { stop } = attachPresenceHandlers(mockIo as any, redis as unknown as Redis);
      expect(typeof stop).toBe('function');
      stop();
    });
  });

  describe('connection without userId', () => {
    it('disconnects socket and emits unauthorized', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket();
      (socket.data as any) = {};

      connectionHandler(socket);

      expect(socket.emit).toHaveBeenCalledWith('unauthorized', { message: 'missing user context' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects socket when userId is empty string', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('');
      (socket.data as any).userId = '';

      connectionHandler(socket);

      expect(socket.emit).toHaveBeenCalledWith('unauthorized', { message: 'missing user context' });
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('presence:join', () => {
    it('joins room and upserts presence with valid membership', async () => {
      const { prisma } = await import('../../shared/lib/prisma');
      (prisma.workspaceMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 'user-1' });

      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      const joinHandler = eventHandlers.get('presence:join')!;
      await joinHandler({ workspaceId: 'ws-1' });

      expect(socket.join).toHaveBeenCalledWith('workspace:ws-1');
      expect(redis.hset).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalled();
    });

    it('does not join room without membership', async () => {
      const { prisma } = await import('../../shared/lib/prisma');
      (prisma.workspaceMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      const joinHandler = eventHandlers.get('presence:join')!;
      await joinHandler({ workspaceId: 'ws-1' });

      expect(socket.join).not.toHaveBeenCalled();
      expect(redis.hset).not.toHaveBeenCalled();
    });

    it('does nothing with invalid payload', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      const joinHandler = eventHandlers.get('presence:join')!;
      await joinHandler({});

      expect(socket.join).not.toHaveBeenCalled();
      expect(redis.hset).not.toHaveBeenCalled();
    });

    it('does nothing with null payload', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      const joinHandler = eventHandlers.get('presence:join')!;
      await joinHandler(null);

      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('presence:heartbeat', () => {
    it('upserts presence on heartbeat', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      const heartbeatHandler = eventHandlers.get('presence:heartbeat')!;
      await heartbeatHandler({ workspaceId: 'ws-1' });

      expect(redis.hset).toHaveBeenCalled();
      expect(redis.expire).toHaveBeenCalled();
    });

    it('does nothing with invalid payload', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      const heartbeatHandler = eventHandlers.get('presence:heartbeat')!;
      await heartbeatHandler({});

      expect(redis.hset).not.toHaveBeenCalled();
    });
  });

  describe('presence:leave', () => {
    it('removes presence and broadcasts', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      const leaveHandler = eventHandlers.get('presence:leave')!;
      await leaveHandler({ workspaceId: 'ws-1' });

      expect(redis.hdel).toHaveBeenCalledWith('presence:ws-1', 'socket-1');
    });

    it('does nothing with invalid payload', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      const leaveHandler = eventHandlers.get('presence:leave')!;
      await leaveHandler({});

      expect(redis.hdel).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('removes presence from all joined rooms', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      // Simulate joining rooms
      socket.rooms.add('workspace:ws-1');
      socket.rooms.add('workspace:ws-2');

      const disconnectHandler = eventHandlers.get('disconnect')!;
      await disconnectHandler();

      expect(redis.hdel).toHaveBeenCalledWith('presence:ws-1', 'socket-1');
      expect(redis.hdel).toHaveBeenCalledWith('presence:ws-2', 'socket-1');
    });

    it('ignores non-workspace rooms', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const connectionHandler = namespace.handlers.get('connection')!;
      const socket = createMockSocket('user-1');

      const eventHandlers = new Map<string, (...args: unknown[]) => void>();
      socket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
        eventHandlers.set(event, cb);
      });

      connectionHandler(socket);

      socket.rooms.add('some-other-room');
      socket.rooms.add('socket-1');

      const disconnectHandler = eventHandlers.get('disconnect')!;
      await disconnectHandler();

      expect(redis.hdel).not.toHaveBeenCalled();
    });
  });

  describe('sweeper', () => {
    it('removes stale presence entries', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      // Add stale entry (older than 30s TTL)
      const staleTime = Date.now() - 35_000;
      redis.store['presence:ws-1'] = {
        'socket-1': JSON.stringify({
          socketId: 'socket-1',
          userId: 'user-1',
          name: 'Test',
          avatarUrl: null,
          lastSeen: staleTime,
        }),
      };

      vi.advanceTimersByTime(10_000);

      await vi.waitFor(() => {
        expect(redis.hdel).toHaveBeenCalledWith('presence:ws-1', 'socket-1');
      });
    });

    it('does not remove fresh presence entries', async () => {
      const { attachPresenceHandlers } = await import('./realtime.gateway');
      attachPresenceHandlers(mockIo as any, redis as unknown as Redis);

      const freshTime = Date.now() - 5_000;
      redis.store['presence:ws-1'] = {
        'socket-1': JSON.stringify({
          socketId: 'socket-1',
          userId: 'user-1',
          name: 'Test',
          avatarUrl: null,
          lastSeen: freshTime,
        }),
      };

      vi.advanceTimersByTime(10_000);

      await vi.waitFor(() => {
        expect(redis.hdel).not.toHaveBeenCalledWith('presence:ws-1', 'socket-1');
      });
    });
  });
});
