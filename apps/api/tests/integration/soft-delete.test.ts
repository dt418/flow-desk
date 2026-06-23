import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, createWorkspace, addMember, createTask, getAuthCookie } from '../setup/factories';
import { buildApp } from '../../src/app';

describe('soft-delete gap audit (R-29)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  async function setupOwnerWorkspace(): Promise<{ ownerId: string; wid: string; cookie: string; colId: string }> {
    const owner = await createUser(prisma);
    const w = await createWorkspace(prisma, owner.id, 'Soft WS');
    const cols = await prisma.column.findMany({ where: { workspaceId: w.id }, orderBy: { position: 'asc' } });
    const todoCol = cols.find((c) => c.name === 'Todo');
    if (!todoCol) throw new Error('Todo column missing in factory');
    return { ownerId: owner.id, wid: w.id, cookie: await getAuthCookie(prisma, owner.id), colId: todoCol.id };
  }

  async function setupMember(workspaceId: string, ownerId: string) {
    const m = await createUser(prisma);
    await addMember(prisma, workspaceId, m.id, 'MEMBER');
    return { memberId: m.id, memberCookie: await getAuthCookie(prisma, m.id) };
  }

  async function makeTask(workspaceId: string, columnId: string, createdById: string, title: string) {
    return createTask(prisma, workspaceId, columnId, createdById, title);
  }

  async function softDeleteTask(id: string) {
    await prisma.$executeRawUnsafe(`UPDATE "Task" SET "deletedAt" = NOW() WHERE id = '${id}'`);
  }

  async function softDeleteComment(id: string) {
    await prisma.$executeRawUnsafe(`UPDATE "Comment" SET "deletedAt" = NOW() WHERE id = '${id}'`);
  }

  async function softDeleteWorkspace(id: string) {
    await prisma.$executeRawUnsafe(`UPDATE "Workspace" SET "deletedAt" = NOW() WHERE id = '${id}'`);
  }

  // ─── Task module ─────────────────────────────────────────────────────────

  describe('task module', () => {
    it('PATCH /api/tasks/:id on soft-deleted task → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task to delete');
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request(`/api/tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ title: 'new title' }),
      });
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe('NOT_FOUND');
    });

    it('DELETE /api/tasks/:id on already soft-deleted task → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task to delete');
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request(`/api/tasks/${t.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(404);
    });

    it('POST /api/tasks/:id/move on soft-deleted task → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task to delete');
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request(`/api/tasks/${t.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ columnId: colId, position: 0, version: 0 }),
      });
      expect(res.status).toBe(404);
    });

    it('POST /api/tasks/:id/subtasks when parent soft-deleted → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Parent');
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request(`/api/tasks/${t.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ workspaceId: wid, title: 'sub', columnId: colId, status: 'TODO', priority: 'MEDIUM' }),
      });
      expect(res.status).toBe(404);
    });

    it('POST /api/tasks/dependencies where blocking task soft-deleted → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const blocking = await makeTask(wid, colId, ownerId, 'Blocking');
      const blocked = await makeTask(wid, colId, ownerId, 'Blocked');
      await softDeleteTask(blocking.id);
      const app = buildApp();
      const res = await app.request(`/api/tasks/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ blockingTaskId: blocking.id, blockedTaskId: blocked.id }),
      });
      expect(res.status).toBe(404);
    });

    it('POST /api/tasks/dependencies where blocked task soft-deleted → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const blocking = await makeTask(wid, colId, ownerId, 'Blocking');
      const blocked = await makeTask(wid, colId, ownerId, 'Blocked');
      await softDeleteTask(blocked.id);
      const app = buildApp();
      const res = await app.request(`/api/tasks/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ blockingTaskId: blocking.id, blockedTaskId: blocked.id }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Attachment module ───────────────────────────────────────────────────

  describe('attachment module', () => {
    it('GET /api/attachments?taskId=<soft-deleted> → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task');
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request(`/api/attachments?taskId=${t.id}`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(404);
    });

    it('POST /api/attachments to soft-deleted task → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task');
      await softDeleteTask(t.id);
      const app = buildApp();
      const form = new FormData();
      form.set('file', new File(['hi'], 'a.txt', { type: 'text/plain' }));
      form.set('taskId', t.id);
      const res = await app.request('/api/attachments', {
        method: 'POST',
        headers: { Cookie: cookie },
        body: form,
      });
      expect(res.status).toBe(404);
    });

    it('GET /api/attachments/:id/download when parent task soft-deleted → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task');
      const att = await prisma.attachment.create({
        data: {
          taskId: t.id,
          uploadedById: ownerId,
          filename: 'a.txt',
          mimeType: 'text/plain',
          size: 2,
          type: 'DOCUMENT',
          storagePath: '/tmp/flowdesk-test-a.txt',
        },
      });
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request(`/api/attachments/${att.id}/download`, {
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Comment module ──────────────────────────────────────────────────────

  describe('comment module', () => {
    it('POST /api/comments to soft-deleted task → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task');
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ taskId: t.id, content: 'hi' }),
      });
      expect(res.status).toBe(404);
    });

    it('PATCH /api/comments/:id when parent task soft-deleted → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task');
      const c = await prisma.comment.create({
        data: { taskId: t.id, authorId: ownerId, content: 'old' },
      });
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request(`/api/comments/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ content: 'new' }),
      });
      expect(res.status).toBe(404);
    });

    it('DELETE /api/comments/:id when comment itself soft-deleted → 404 (idempotent)', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task');
      const c = await prisma.comment.create({
        data: { taskId: t.id, authorId: ownerId, content: 'old' },
      });
      await softDeleteComment(c.id);
      const app = buildApp();
      const res = await app.request(`/api/comments/${c.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── AI module ───────────────────────────────────────────────────────────

  describe('ai module', () => {
    it('POST /api/ai/suggest-assignee with soft-deleted taskId → 404', async () => {
      const { ownerId, wid, colId, cookie } = await setupOwnerWorkspace();
      const t = await makeTask(wid, colId, ownerId, 'Task');
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request('/api/ai/suggest-assignee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ workspaceId: wid, taskId: t.id }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Workspace module ────────────────────────────────────────────────────

  describe('workspace module', () => {
    it('PATCH /api/workspaces/:id on soft-deleted workspace → 404', async () => {
      const { wid, cookie } = await setupOwnerWorkspace();
      await softDeleteWorkspace(wid);
      const app = buildApp();
      const res = await app.request(`/api/workspaces/${wid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ name: 'hacked' }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ─── Member-side sanity ──────────────────────────────────────────────────

  describe('non-owner member', () => {
    it('member gets 404 (not 403) when reading soft-deleted entity', async () => {
      const ctx = await setupOwnerWorkspace();
      const { memberCookie } = await setupMember(ctx.wid, ctx.ownerId);
      const t = await makeTask(ctx.wid, ctx.colId, ctx.ownerId, 'Task');
      await softDeleteTask(t.id);
      const app = buildApp();
      const res = await app.request(`/api/tasks/${t.id}`, {
        headers: { Cookie: memberCookie },
      });
      expect(res.status).toBe(404);
    });
  });
});
