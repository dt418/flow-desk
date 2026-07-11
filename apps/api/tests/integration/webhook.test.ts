import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  addMember,
  getAuthCookie,
  createTask,
  createColumn,
} from '../setup/factories';
import { buildApp } from '../../src/app';

// Mock BullMQ so activity.record fan-out does not need a live Redis worker.
// vi.hoisted ensures the mock fn is available when the hoisted vi.mock factory runs.
const { mockWebhookQueueAdd } = vi.hoisted(() => ({
  mockWebhookQueueAdd: vi.fn().mockResolvedValue({ id: 'job-1' }),
}));
vi.mock('../../src/workers/webhook/queue', () => ({
  webhookQueue: { add: mockWebhookQueueAdd },
  createWebhookWorker: vi.fn(),
}));

describe('POST/GET/PATCH/DELETE /api/workspaces/:wid/webhooks (P1-4)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    mockWebhookQueueAdd.mockClear();
  });

  async function setup() {
    const owner = await createUser(prisma, 'owner@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Webhook WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    return { ownerId: owner.id, wid: w.id, cookie };
  }

  it('creates a webhook and returns secret once (201)', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const res = await app.request(`/api/workspaces/${wid}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        url: 'https://example.com/hooks/flowdesk',
        events: ['TITLE_CHANGED', 'STATUS_CHANGED'],
        isActive: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.url).toBe('https://example.com/hooks/flowdesk');
    expect(body.events).toEqual(['TITLE_CHANGED', 'STATUS_CHANGED']);
    expect(body.isActive).toBe(true);
    expect(typeof body.secret).toBe('string');
    expect(body.secret.length).toBeGreaterThanOrEqual(32);
    expect(typeof body.createdAt).toBe('string');
    expect(typeof body.updatedAt).toBe('string');
  });

  it('lists webhooks without secrets', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    await app.request(`/api/workspaces/${wid}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        url: 'https://example.com/a',
        events: ['CREATED'],
      }),
    });
    const listRes = await app.request(`/api/workspaces/${wid}/webhooks`, {
      headers: { Cookie: cookie },
    });
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.data).toHaveLength(1);
    expect(list.data[0].url).toBe('https://example.com/a');
    expect(list.data[0].secret).toBeUndefined();
  });

  it('rejects MEMBER create with 403', async () => {
    const { wid } = await setup();
    const member = await createUser(prisma, 'member@test.local', 'Member');
    await addMember(prisma, wid, member.id, 'MEMBER');
    const memberCookie = await getAuthCookie(prisma, member.id);
    const app = buildApp();
    const res = await app.request(`/api/workspaces/${wid}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
      body: JSON.stringify({
        url: 'https://example.com/x',
        events: ['CREATED'],
      }),
    });
    expect(res.status).toBe(403);
  });

  it('patches events and isActive', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        url: 'https://example.com/b',
        events: ['CREATED'],
        isActive: true,
      }),
    });
    const created = await createRes.json();
    const patchRes = await app.request(`/api/workspaces/${wid}/webhooks/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ events: ['MOVED'], isActive: false }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.events).toEqual(['MOVED']);
    expect(patched.isActive).toBe(false);
    expect(patched.secret).toBeUndefined();
  });

  it('soft-deletes webhook so it no longer lists', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        url: 'https://example.com/c',
        events: ['CREATED'],
      }),
    });
    const created = await createRes.json();
    const delRes = await app.request(`/api/workspaces/${wid}/webhooks/${created.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(delRes.status).toBe(200);
    const listRes = await app.request(`/api/workspaces/${wid}/webhooks`, {
      headers: { Cookie: cookie },
    });
    const list = await listRes.json();
    expect(list.data).toHaveLength(0);
  });

  it('rejects invalid URL with 400', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const res = await app.request(`/api/workspaces/${wid}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        url: 'not-a-url',
        events: ['CREATED'],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('lists empty deliveries for a new webhook', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        url: 'https://example.com/d',
        events: ['TITLE_CHANGED'],
      }),
    });
    const created = await createRes.json();
    const delRes = await app.request(
      `/api/workspaces/${wid}/webhooks/${created.id}/deliveries?limit=20`,
      { headers: { Cookie: cookie } },
    );
    expect(delRes.status).toBe(200);
    const body = await delRes.json();
    expect(body.data).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it('activity.record enqueues webhook job when event matches (fan-out)', async () => {
    const { ownerId, wid } = await setup();
    // Create webhook via prisma so secret is known and isActive
    const webhook = await prisma.webhook.create({
      data: {
        workspaceId: wid,
        url: 'https://hooks.example.com/fd',
        secret: 'deadbeefdeadbeefdeadbeefdeadbeef',
        events: ['TITLE_CHANGED'],
        isActive: true,
      },
    });
    const col = await createColumn(prisma, wid, 'Todo', 0);
    const task = await createTask(prisma, wid, col.id, ownerId, 'Hook target');

    // Import after mocks are registered
    const { activityService } = await import('../../src/modules/activity/activity.service');
    const activity = await activityService.record({
      taskId: task.id,
      userId: ownerId,
      action: 'TITLE_CHANGED',
      field: 'title',
      oldValue: 'Hook target',
      newValue: 'Hooked',
    });
    expect(activity).not.toBeNull();
    expect(mockWebhookQueueAdd).toHaveBeenCalledTimes(1);
    const [jobName, payload] = mockWebhookQueueAdd.mock.calls[0];
    expect(jobName).toBe('webhook');
    expect(payload.webhookId).toBe(webhook.id);
    expect(payload.activityId).toBe(activity!.id);
    expect(payload.webhookUrl).toBe('https://hooks.example.com/fd');
    expect(payload.activity.action).toBe('TITLE_CHANGED');
  });

  it('activity.record does not enqueue when event is not subscribed', async () => {
    const { ownerId, wid } = await setup();
    await prisma.webhook.create({
      data: {
        workspaceId: wid,
        url: 'https://hooks.example.com/fd',
        secret: 'deadbeefdeadbeefdeadbeefdeadbeef',
        events: ['STATUS_CHANGED'],
        isActive: true,
      },
    });
    const col = await createColumn(prisma, wid, 'Todo', 0);
    const task = await createTask(prisma, wid, col.id, ownerId, 'No match');
    const { activityService } = await import('../../src/modules/activity/activity.service');
    await activityService.record({
      taskId: task.id,
      userId: ownerId,
      action: 'TITLE_CHANGED',
      field: 'title',
      newValue: 'x',
    });
    expect(mockWebhookQueueAdd).not.toHaveBeenCalled();
  });
});
