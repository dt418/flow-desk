import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, createWorkspace, getAuthCookie } from '../setup/factories';
import { buildApp } from '../../src/app';

describe('GET /api/workspaces/:wid/labels', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let ownerId: string, wid: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    const u = await createUser(prisma);
    ownerId = u.id;
    const w = await createWorkspace(prisma, u.id);
    wid = w.id;
  });

  it('returns [] for empty workspace', async () => {
    const app = buildApp();
    const cookie = await getAuthCookie(prisma, ownerId);
    const res = await app.request(`/api/workspaces/${wid}/labels`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ labels: [] });
  });

  it('400 for non-member', async () => {
    const outsider = await createUser(prisma, 'out@x.com');
    const app = buildApp();
    const cookie = await getAuthCookie(prisma, outsider.id);
    const res = await app.request(`/api/workspaces/${wid}/labels`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('BAD_REQUEST');
  });

  it('POST / returns 201 with label JSON', async () => {
    const app = buildApp();
    const cookie = await getAuthCookie(prisma, ownerId);
    const res = await app.request(`/api/workspaces/${wid}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'bug', color: 'red' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.label).toMatchObject({ name: 'bug', color: 'red' });
  });

  it('POST invalid color → 400 INVALID_LABEL_COLOR', async () => {
    const app = buildApp();
    const cookie = await getAuthCookie(prisma, ownerId);
    const res = await app.request(`/api/workspaces/${wid}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'x', color: 'puce' }),
    });
    expect(res.status).toBe(400);
  });
});
