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
});
