# Plan 022 — Realtime Gateway Tests

**Findings:** TC-01
**Commit:** `732acb4`
**Effort:** L | **Risk:** MED | **Files:** 2

## Problem

Realtime gateway (realtime.gateway.ts, 183 lines) has zero tests. Security-critical Socket.IO presence join/leave/heartbeat and workspace membership checks are untested.

## Prerequisites

- Plan 020 (CI unit tests) — test infrastructure.

## Changes

### 1. Create gateway test file

**New file:** `apps/api/src/modules/realtime/realtime.gateway.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSocket, createMockIO } from '../../test-utils';

// Mock prisma
vi.mock('../../shared/lib/prisma', () => ({
  prisma: {
    workspaceMember: { findUnique: vi.fn() },
    // ... other mocks
  },
}));

describe('RealtimeGateway', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    mockSocket = createMockSocket({ userId: 'user-1', data: {} });
    mockIO = createMockIO();
  });

  describe('connection', () => {
    it('disconnects if no userId', () => {
      mockSocket.data.userId = undefined;
      // Simulate connection handler
      // Assert socket.disconnect called
    });
  });

  describe('join-workspace', () => {
    it('joins room if user is member', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue({
        id: 'mem-1',
        role: 'MEMBER',
      });

      // Emit join-workspace
      // Assert socket.join called with 'workspace:ws-1'
      // Assert socket.emit('workspace:joined', ...)
    });

    it('rejects if user is not member', async () => {
      vi.mocked(prisma.workspaceMember.findUnique).mockResolvedValue(null);

      // Emit join-workspace
      // Assert socket.emit('error', ...)
      // Assert socket.join NOT called
    });
  });

  describe('leave-workspace', () => {
    it('leaves room', () => {
      // Emit leave-workspace
      // Assert socket.leave called
    });
  });

  describe('presence', () => {
    it('joins presence room', () => {
      // Emit presence:join
      // Assert presence data stored
    });

    it('sweep removes stale entries', () => {
      // Mock old presence entries
      // Trigger sweep
      // Assert stale entries removed
    });
  });
});
```

### 2. Create test utilities

**New file:** `apps/api/src/test-utils.ts`

```typescript
import { vi } from 'vitest';
import { EventEmitter } from 'events';

export function createMockSocket(data: Record<string, unknown> = {}) {
  const emitter = new EventEmitter();
  return {
    id: `socket-${Math.random().toString(36).slice(2)}`,
    data,
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      emitter.on(event, handler);
      return { socket: mockSocket };
    }),
    _emit: (event: string, ...args: unknown[]) => emitter.emit(event, ...args),
  };
}

export function createMockIO() {
  return {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
    in: vi.fn().mockReturnThis(),
  };
}
```

### 3. Test the actual gateway

Read `apps/api/src/modules/realtime/realtime.gateway.ts` to understand the handler structure. The gateway likely exports a function that takes an IO instance and registers handlers. Mock the IO and test each handler.

Key test cases:

- Connection with missing userId → disconnect
- `join-workspace` with valid membership → joins room
- `join-workspace` without membership → rejects
- `leave-workspace` → leaves room
- `presence:join` → stores presence
- Sweep interval → removes stale entries

## Verification

```bash
# 1. Run gateway tests
pnpm --filter @flow-desk/api test -- --grep "RealtimeGateway"

# 2. Run all unit tests
pnpm --filter @flow-desk/api test
```

## Scope

- `apps/api/src/modules/realtime/realtime.gateway.test.ts` (new)
- `apps/api/src/test-utils.ts` (new, shared mock utilities)

## Risk

- Mocking Socket.IO: the gateway may use IO methods that are hard to mock (rooms, adapters). If so, test at the integration level with a real Socket.IO server instead.
