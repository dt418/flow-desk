import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  addMember,
  createColumn,
  createTask,
  getAuthCookie,
} from '../setup/factories';
import { buildApp } from '../../src/app';
import { encodeCursor, decodeCursor } from '@flow-desk/shared/pagination';
import { workspaceService } from '../../src/modules/workspace/workspace.service';
import { memberService } from '../../src/modules/workspace/member.service';
import { taskService } from '../../src/modules/task/task.service';

describe('R-30 cursor pagination', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let app: ReturnType<typeof buildApp>;
  let ownerId: string;
  let wid: string;
  let cookie: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    app = buildApp();
    const u = await createUser(prisma);
    ownerId = u.id;
    const w = await createWorkspace(prisma, u.id, 'WS');
    wid = w.id;
    cookie = await getAuthCookie(prisma, ownerId);
  });

  describe('encode/decode roundtrip', () => {
    it('roundtrips a cursor', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const id = 'cuid_abc123';
      const encoded = encodeCursor(date, id);
      const decoded = decodeCursor(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded!.id).toBe(id);
      expect(decoded!.createdAt.toISOString()).toBe(date.toISOString());
    });

    it('returns null for invalid cursor', () => {
      expect(decodeCursor('!!!not-base64!!!')).toBeNull();
      expect(decodeCursor(Buffer.from('no_underscore_here', 'utf8').toString('base64url'))).toBeNull();
      expect(decodeCursor(Buffer.from('_missingid', 'utf8').toString('base64url'))).toBeNull();
    });
  });

  describe('GET /api/workspaces (list workspaces)', () => {
    it('returns envelope with nextCursor when more than limit', async () => {
      for (let i = 0; i < 5; i++) {
        await createWorkspace(prisma, ownerId, `WS-${i}`);
      }
      const res = await app.request('/api/workspaces?limit=2', { headers: { Cookie: cookie } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      expect(body.nextCursor).not.toBeNull();
    });

    it('returns null nextCursor on last page', async () => {
      await createWorkspace(prisma, ownerId, 'A');
      const res = await app.request('/api/workspaces?limit=20', { headers: { Cookie: cookie } });
      const body = await res.json();
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.nextCursor).toBeNull();
    });

    it('service.list returns paginated envelope with no overlap', async () => {
      for (let i = 0; i < 5; i++) {
        await createWorkspace(prisma, ownerId, `WS-${i}`);
      }
      const first = await workspaceService.list({ limit: 2 }, ownerId);
      expect(first.data).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await workspaceService.list({ limit: 10, cursor: first.nextCursor! }, ownerId);
      const ids = new Set([...first.data, ...second.data].map((w) => w.id));
      expect(ids.size).toBe(first.data.length + second.data.length);
    });
  });

  describe('GET /api/workspaces/:wid/members', () => {
    it('paginates members with cursor', async () => {
      for (let i = 0; i < 5; i++) {
        const u = await createUser(prisma);
        await addMember(prisma, wid, u.id, 'MEMBER');
      }
      const res = await app.request(`/api/workspaces/${wid}/members?limit=2`, { headers: { Cookie: cookie } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBe(2);
      expect(body.nextCursor).not.toBeNull();
    });

    it('memberService.list returns no-overlap cursored pages', async () => {
      for (let i = 0; i < 5; i++) {
        const u = await createUser(prisma);
        await addMember(prisma, wid, u.id, 'MEMBER');
      }
      const first = await memberService.list({ limit: 2 }, wid, ownerId);
      expect(first.data).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await memberService.list({ limit: 10, cursor: first.nextCursor! }, wid, ownerId);
      const ids = new Set([...first.data, ...second.data].map((m) => m.id));
      expect(ids.size).toBe(first.data.length + second.data.length);
    });
  });

  describe('GET /api/tasks (list tasks)', () => {
    it('paginates tasks with cursor', async () => {
      const col = await prisma.column.findFirst({ where: { workspaceId: wid } });
      for (let i = 0; i < 5; i++) {
        await createTask(prisma, wid, col!.id, ownerId, `T-${i}`);
      }
      const first = await taskService.list({ workspaceId: wid, limit: 2 } as never, ownerId);
      expect(first.data).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await taskService.list({ workspaceId: wid, limit: 10, cursor: first.nextCursor! } as never, ownerId);
      const ids = new Set([...first.data, ...second.data].map((t) => t.id));
      expect(ids.size).toBe(first.data.length + second.data.length);
    });
  });

  describe('GET /api/comments (list comments)', () => {
    it('paginates comments with cursor', async () => {
      const col = await prisma.column.findFirst({ where: { workspaceId: wid } });
      const task = await createTask(prisma, wid, col!.id, ownerId);
      for (let i = 0; i < 5; i++) {
        await prisma.comment.create({
          data: { taskId: task.id, authorId: ownerId, content: `c${i}` },
        });
      }
      const mod = await import('../../src/modules/comment/comment.service');
      const first = await mod.listComments(prisma, ownerId, { taskId: task.id, limit: 2 } as never);
      expect(first.data).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await mod.listComments(prisma, ownerId, {
        taskId: task.id,
        limit: 10,
        cursor: first.nextCursor!,
      } as never);
      const ids = new Set([...first.data, ...second.data].map((c) => c.id));
      expect(ids.size).toBe(first.data.length + second.data.length);
    });
  });

  describe('GET /api/attachments (list attachments)', () => {
    it('paginates attachments with cursor', async () => {
      const col = await prisma.column.findFirst({ where: { workspaceId: wid } });
      const task = await createTask(prisma, wid, col!.id, ownerId);
      for (let i = 0; i < 5; i++) {
        await prisma.attachment.create({
          data: {
            taskId: task.id,
            uploadedById: ownerId,
            filename: `f${i}.txt`,
            mimeType: 'text/plain',
            size: 10,
            type: 'OTHER',
            storagePath: `/tmp/${i}`,
          },
        });
      }
      const mod = await import('../../src/modules/attachment/attachment.service');
      const first = await mod.listAttachments(prisma, ownerId, {
        taskId: task.id,
        limit: 2,
      } as never);
      expect(first.data).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await mod.listAttachments(prisma, ownerId, {
        taskId: task.id,
        limit: 10,
        cursor: first.nextCursor!,
      } as never);
      const ids = new Set([...first.data, ...second.data].map((a) => a.id));
      expect(ids.size).toBe(first.data.length + second.data.length);
    });
  });

  describe('GET /api/notifications (list notifications)', () => {
    it('paginates notifications with cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await prisma.notification.create({
          data: {
            userId: ownerId,
            type: 'TASK_ASSIGNED',
            title: `n${i}`,
            body: 'b',
            data: null,
          },
        });
      }
      const mod = await import('../../src/modules/notification/notification.service');
      const first = await mod.listNotifications(prisma, ownerId, { limit: 2 } as never);
      expect(first.data).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await mod.listNotifications(prisma, ownerId, {
        limit: 10,
        cursor: first.nextCursor!,
      } as never);
      const ids = new Set([...first.data, ...second.data].map((n) => n.id));
      expect(ids.size).toBe(first.data.length + second.data.length);
    });
  });

  describe('GET /api/workspaces/:wid/board (cursor on outer column list)', () => {
    it('returns envelope with nextCursor when more columns than limit', async () => {
      await prisma.column.create({ data: { workspaceId: wid, name: 'C1', position: 4, isDoneColumn: false } });
      await prisma.column.create({ data: { workspaceId: wid, name: 'C2', position: 5, isDoneColumn: false } });
      const res = await app.request(`/api/workspaces/${wid}/board?limit=2`, { headers: { Cookie: cookie } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.columns).toBeDefined();
      expect(body.nextCursor).not.toBeNull();
    });
  });
});
