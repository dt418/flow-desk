import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  addMember,
  getAuthCookie,
} from '../setup/factories';
import { buildApp } from '../../src/app';

describe('GET/POST/PATCH/DELETE /api/workspaces/:wid/saved-filters (P1-2)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  async function setup() {
    const owner = await createUser(prisma, 'owner@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Filter WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    return { ownerId: owner.id, wid: w.id, cookie };
  }

  it('creates a saved filter and lists it for the owner', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Hot queue',
        query: { status: 'IN_REVIEW', priority: 'HIGH' },
        isShared: false,
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.name).toBe('Hot queue');
    expect(created.query.status).toBe('IN_REVIEW');

    const listRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].name).toBe('Hot queue');
  });

  it('rejects duplicate name for the same user with 409', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const body = JSON.stringify({
      name: 'Dup',
      query: { status: 'TODO' },
      isShared: false,
    });
    await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    expect(res.status).toBe(409);
  });

  it('isShared filter is visible to other workspace members', async () => {
    const { wid, cookie } = await setup();
    const bob = await createUser(prisma, 'bob@test.local', 'Bob');
    await addMember(prisma, wid, bob.id, 'MEMBER');
    const bobCookie = await getAuthCookie(prisma, bob.id);
    const app = buildApp();
    await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Team view',
        query: { status: 'IN_PROGRESS' },
        isShared: true,
      }),
    });
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: bobCookie },
    });
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Team view');
  });

  it('private filter is NOT visible to other workspace members', async () => {
    const { wid, cookie } = await setup();
    const bob = await createUser(prisma, 'bob@test.local', 'Bob');
    await addMember(prisma, wid, bob.id, 'MEMBER');
    const bobCookie = await getAuthCookie(prisma, bob.id);
    const app = buildApp();
    await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'My private',
        query: { status: 'TODO' },
        isShared: false,
      }),
    });
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: bobCookie },
    });
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it('only the owner can patch their filter (other member gets 404)', async () => {
    const { wid, cookie } = await setup();
    const bob = await createUser(prisma, 'bob@test.local', 'Bob');
    await addMember(prisma, wid, bob.id, 'MEMBER');
    const bobCookie = await getAuthCookie(prisma, bob.id);
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Owner only',
        query: { status: 'TODO' },
        isShared: true,
      }),
    });
    const created = await createRes.json();
    const res = await app.request(`/api/workspaces/${wid}/saved-filters/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: bobCookie },
      body: JSON.stringify({ name: 'Hijacked' }),
    });
    expect(res.status).toBe(404);
  });

  it('owner can patch and delete their own filter', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'To edit',
        query: { status: 'TODO' },
        isShared: false,
      }),
    });
    const created = await createRes.json();
    const patchRes = await app.request(`/api/workspaces/${wid}/saved-filters/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Renamed', isShared: true }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.name).toBe('Renamed');
    expect(patched.isShared).toBe(true);

    const delRes = await app.request(`/api/workspaces/${wid}/saved-filters/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(delRes.status).toBe(200);
    const listRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: cookie },
    });
    const listBody = await listRes.json();
    expect(listBody.data).toHaveLength(0);
  });

  it('soft-deleted filter name can be reused', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const body = JSON.stringify({
      name: 'Reusable',
      query: { status: 'TODO' },
      isShared: false,
    });
    const createRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    const created = await createRes.json();
    await app.request(`/api/workspaces/${wid}/saved-filters/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    const recreateRes = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body,
    });
    expect(recreateRes.status).toBe(201);
  });

  it('rejects non-member requests with 400', async () => {
    const { wid } = await setup();
    const outsider = await createUser(prisma, 'outsider@test.local', 'Outsider');
    const outsiderCookie = await getAuthCookie(prisma, outsider.id);
    const app = buildApp();
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`, {
      headers: { Cookie: outsiderCookie },
    });
    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { wid } = await setup();
    const app = buildApp();
    const res = await app.request(`/api/workspaces/${wid}/saved-filters`);
    expect(res.status).toBe(401);
  });
});
