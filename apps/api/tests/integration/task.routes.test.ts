import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  createColumn,
  createTask,
  getAuthCookie,
} from '../setup/factories';
import { buildApp } from '../../src/app';

describe('GET /api/tasks route', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let app: ReturnType<typeof buildApp>;
  let ownerId: string;
  let wid: string;
  let columnId: string;
  let cookie: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    app = buildApp();
    const u = await createUser(prisma);
    ownerId = u.id;
    const w = await createWorkspace(prisma, ownerId, 'WS');
    wid = w.id;
    const col = await createColumn(prisma, wid, 'Todo', 0);
    columnId = col.id;
    cookie = await getAuthCookie(prisma, ownerId);
  });

  it('returns 200 with ISO-string date fields (regression: Date vs z.string())', async () => {
    await createTask(prisma, wid, columnId, ownerId, 'T-1');
    const res = await app.request(`/api/tasks?workspaceId=${wid}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(body.data).toHaveLength(1);
    const task = body.data[0];
    expect(typeof task.createdAt).toBe('string');
    expect(typeof task.updatedAt).toBe('string');
    expect(task.dueDate).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.deletedAt).toBeNull();
  });

  it('returns 400 INVALID_QUERY (not VALIDATION_ERROR) for missing workspaceId', async () => {
    const res = await app.request('/api/tasks', { headers: { Cookie: cookie } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('INVALID_QUERY');
  });

  it('returns assignee relation object in list payload', async () => {
    const member = await createUser(prisma, 'assignee@test.local', 'Assignee User');
    await prisma.workspaceMember.create({
      data: { workspaceId: wid, userId: member.id, role: 'MEMBER' },
    });
    await createTask(prisma, wid, columnId, ownerId, 'T-with-assignee');
    const tasks = await prisma.task.findMany({ where: { workspaceId: wid } });
    await prisma.task.update({
      where: { id: tasks[0]!.id },
      data: { assigneeId: member.id },
    });

    const res = await app.request(`/api/tasks?workspaceId=${wid}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{
        assignee: { id: string; name: string; email: string; avatarUrl: string | null } | null;
      }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.assignee).not.toBeNull();
    expect(body.data[0]!.assignee?.id).toBe(member.id);
    expect(body.data[0]!.assignee?.email).toBe('assignee@test.local');
  });

  it('defaults sort to position ASC so list view mirrors board order', async () => {
    const t1 = await createTask(prisma, wid, columnId, ownerId, 'A');
    const t2 = await createTask(prisma, wid, columnId, ownerId, 'B');
    const t3 = await createTask(prisma, wid, columnId, ownerId, 'C');
    await prisma.task.update({ where: { id: t3.id }, data: { position: 0 } });
    await prisma.task.update({ where: { id: t2.id }, data: { position: 1 } });
    await prisma.task.update({ where: { id: t1.id }, data: { position: 2 } });

    const res = await app.request(`/api/tasks?workspaceId=${wid}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; position: number; title: string }>;
    };
    expect(body.data.map((t) => t.title)).toEqual(['C', 'B', 'A']);
    expect(body.data.map((t) => t.position)).toEqual([0, 1, 2]);
  });
});
