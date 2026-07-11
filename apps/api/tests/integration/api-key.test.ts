import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  getAuthCookie,
  createTask,
  createColumn,
} from '../setup/factories';
import { buildApp } from '../../src/app';

describe('API keys + public v1 (P4-4)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  it('creates key, reveals once, lists without secret, v1 tasks with Bearer', async () => {
    const owner = await createUser(prisma, 'apikey@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Key WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const col = await createColumn(prisma, w.id, 'Todo', 0);
    await createTask(prisma, w.id, col.id, owner.id, 'Public task');
    const app = buildApp();

    const createRes = await app.request('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'CI', scopes: ['read'] }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.key).toMatch(/^fdkey_/);
    expect(created.prefix).toBeTruthy();

    const listRes = await app.request('/api/api-keys', { headers: { Cookie: cookie } });
    const list = await listRes.json();
    expect(list.data).toHaveLength(1);
    expect(list.data[0].key).toBeUndefined();

    const v1 = await app.request(`/api/v1/workspaces/${w.id}/tasks`, {
      headers: { Authorization: `Bearer ${created.key}` },
    });
    expect(v1.status).toBe(200);
    const body = await v1.json();
    expect(body.data.some((t: { title: string }) => t.title === 'Public task')).toBe(true);

    const bad = await app.request(`/api/v1/workspaces/${w.id}/tasks`, {
      headers: { Authorization: 'Bearer fdkey_invalid' },
    });
    expect(bad.status).toBe(401);
  });
});
