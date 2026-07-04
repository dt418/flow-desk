import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  createTask,
  createComment,
  createAttachment,
  getAuthCookie,
} from '../setup/factories';
import { buildApp } from '../../src/app';

describe('GET /api/search (P1-1)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  async function setup() {
    const owner = await createUser(prisma);
    const w = await createWorkspace(prisma, owner.id, 'Search WS');
    const cols = await prisma.column.findMany({
      where: { workspaceId: w.id },
      orderBy: { position: 'asc' },
    });
    const todoCol = cols.find((c) => c.name === 'Todo')!;
    const cookie = await getAuthCookie(prisma, owner.id);
    return { ownerId: owner.id, wid: w.id, colId: todoCol.id, cookie };
  }

  it('returns tasks matching the query', async () => {
    const { ownerId, wid, colId, cookie } = await setup();
    await createTask(prisma, wid, colId, ownerId, 'Quarterly report draft');
    await createTask(prisma, wid, colId, ownerId, 'Unrelated chore');
    const app = buildApp();
    const res = await app.request('/api/search?q=report', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].type).toBe('task');
    expect(body.data[0].title).toContain('report');
  });

  it('returns comments matching the query', async () => {
    const { ownerId, wid, colId, cookie } = await setup();
    const t = await createTask(prisma, wid, colId, ownerId, 'Task X');
    await createComment(prisma, t.id, ownerId, 'The budget breakdown looks off');
    const app = buildApp();
    const res = await app.request('/api/search?q=budget', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const commentHits = body.data.filter((r: { type: string }) => r.type === 'comment');
    expect(commentHits).toHaveLength(1);
    expect(commentHits[0].taskId).toBe(t.id);
  });

  it('returns attachments matching the filename', async () => {
    const { ownerId, wid, colId, cookie } = await setup();
    const t = await createTask(prisma, wid, colId, ownerId, 'Task Y');
    await createAttachment(prisma, t.id, ownerId, 'invoice-2026.xlsx');
    const app = buildApp();
    const res = await app.request('/api/search?q=invoice', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const attHits = body.data.filter((r: { type: string }) => r.type === 'attachment');
    expect(attHits).toHaveLength(1);
    expect(attHits[0].title).toBe('invoice-2026.xlsx');
  });

  it('excludes results from workspaces the user is not a member of', async () => {
    const { ownerId, wid, colId } = await setup();
    const outsider = await createUser(prisma, 'outsider@test.local', 'Outsider');
    const outsiderCookie = await getAuthCookie(prisma, outsider.id);
    await createTask(prisma, wid, colId, ownerId, 'Secret report');
    const app = buildApp();
    const res = await app.request('/api/search?q=secret', {
      headers: { Cookie: outsiderCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('excludes soft-deleted tasks', async () => {
    const { ownerId, wid, colId, cookie } = await setup();
    const t = await createTask(prisma, wid, colId, ownerId, 'Deleted report');
    await prisma.task.update({ where: { id: t.id }, data: { deletedAt: new Date() } });
    const app = buildApp();
    const res = await app.request('/api/search?q=report', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('scopes to workspaceId when provided', async () => {
    const owner = await createUser(prisma);
    const w1 = await createWorkspace(prisma, owner.id, 'WS One');
    const w2 = await createWorkspace(prisma, owner.id, 'WS Two');
    const cols1 = await prisma.column.findMany({ where: { workspaceId: w1.id } });
    const cols2 = await prisma.column.findMany({ where: { workspaceId: w2.id } });
    await createTask(prisma, w1.id, cols1[0].id, owner.id, 'Shared keyword report');
    await createTask(prisma, w2.id, cols2[0].id, owner.id, 'Shared keyword report');
    const cookie = await getAuthCookie(prisma, owner.id);
    const app = buildApp();
    const res = await app.request(`/api/search?q=report&workspaceId=${w1.id}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].workspaceId).toBe(w1.id);
  });

  it('rejects empty query with 400', async () => {
    const { cookie } = await setup();
    const app = buildApp();
    const res = await app.request('/api/search?q=', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const app = buildApp();
    const res = await app.request('/api/search?q=anything');
    expect(res.status).toBe(401);
  });
});
