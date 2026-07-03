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
import * as chatSvc from '../../src/modules/chat/chat.service';
import * as messageSvc from '../../src/modules/chat/chat.message.service';
import { NotFoundError, BadRequestError } from '../../src/shared/errors';

describe('IDOR cross-workspace protection', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  let app: ReturnType<typeof buildApp>;
  let ownerA: { id: string };
  let ownerB: { id: string };
  let wsA: { id: string };
  let wsB: { id: string };
  let colA: { id: string };
  let colB: { id: string };
  let cookieA: string;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
    app = buildApp();

    ownerA = await createUser(prisma, 'ownera@test.local', 'Owner A');
    ownerB = await createUser(prisma, 'ownerb@test.local', 'Owner B');

    const wA = await createWorkspace(prisma, ownerA.id, 'Workspace A');
    const wB = await createWorkspace(prisma, ownerB.id, 'Workspace B');
    wsA = { id: wA.id };
    wsB = { id: wB.id };

    colA = await createColumn(prisma, wsA.id, 'Col A', 10);
    colB = await createColumn(prisma, wsB.id, 'Col B', 10);

    cookieA = await getAuthCookie(prisma, ownerA.id);
  });

  it('rejects column update when column belongs to a different workspace', async () => {
    const res = await app.request(`/api/workspaces/${wsA.id}/columns/${colB.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ name: 'Hacked' }),
    });
    expect(res.status).toBe(404);
    const col = await prisma.column.findUnique({ where: { id: colB.id } });
    expect(col?.name).toBe('Col B');
  });

  it('rejects column delete when column belongs to a different workspace', async () => {
    const res = await app.request(`/api/workspaces/${wsA.id}/columns/${colB.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookieA },
    });
    expect(res.status).toBe(404);
    const col = await prisma.column.findUnique({ where: { id: colB.id } });
    expect(col).not.toBeNull();
  });

  it('rejects dependency delete without auth', async () => {
    const t1 = await createTask(prisma, wsB.id, colB.id, ownerB.id, 'B-1');
    const t2 = await createTask(prisma, wsB.id, colB.id, ownerB.id, 'B-2');
    const dep = await prisma.taskDependency.create({
      data: { blockingTaskId: t1.id, blockedTaskId: t2.id },
    });
    const res = await app.request(`/api/tasks/dependencies/${dep.id}`, { method: 'DELETE' });
    expect(res.status).toBe(401);
    const found = await prisma.taskDependency.findUnique({ where: { id: dep.id } });
    expect(found).not.toBeNull();
  });

  it('rejects dependency delete when user is not a workspace member', async () => {
    const t1 = await createTask(prisma, wsB.id, colB.id, ownerB.id, 'B-1');
    const t2 = await createTask(prisma, wsB.id, colB.id, ownerB.id, 'B-2');
    const dep = await prisma.taskDependency.create({
      data: { blockingTaskId: t1.id, blockedTaskId: t2.id },
    });
    const res = await app.request(`/api/tasks/dependencies/${dep.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookieA },
    });
    expect(res.status).toBe(400);
    const found = await prisma.taskDependency.findUnique({ where: { id: dep.id } });
    expect(found).not.toBeNull();
  });

  it('rejects task creation with a foreign workspace columnId', async () => {
    const res = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ workspaceId: wsA.id, columnId: colB.id, title: 'Foreign col' }),
    });
    expect(res.status).toBe(400);
    const tasks = await prisma.task.findMany({ where: { workspaceId: wsA.id } });
    expect(tasks).toHaveLength(0);
  });

  it('rejects AI suggest-assignee with a foreign workspace taskId', async () => {
    const tB = await createTask(prisma, wsB.id, colB.id, ownerB.id, 'B-Task');
    const res = await app.request('/api/ai/suggest-assignee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ workspaceId: wsA.id, taskId: tB.id }),
    });
    expect(res.status).toBe(404);
  });

  it('filters chat mentions to workspace members only', async () => {
    const member = await createUser(prisma, 'member@test.local', 'Member A');
    await addMember(prisma, wsA.id, member.id, 'MEMBER');
    const outsider = await createUser(prisma, 'outsider@test.local', 'Outsider');

    const channel = await chatSvc.createChannel(prisma, ownerA.id, wsA.id, {
      name: 'general-idor',
      isPrivate: false,
    });

    const message = await messageSvc.sendMessage(prisma, ownerA.id, channel.id, {
      content: 'hello @member @outsider',
      mentionedUserIds: [member.id, outsider.id],
    });

    expect(message.mentionedUserIds).toEqual([member.id]);
    expect(message.mentionedUserIds).not.toContain(outsider.id);

    const outsiderNotifs = await prisma.notification.findMany({
      where: { userId: outsider.id, type: 'COMMENT_REPLY' },
    });
    expect(outsiderNotifs).toHaveLength(0);

    const memberNotifs = await prisma.notification.findMany({
      where: { userId: member.id, type: 'COMMENT_REPLY' },
    });
    expect(memberNotifs.length).toBeGreaterThan(0);
  });

  it('allows column update within same workspace (sanity)', async () => {
    const res = await app.request(`/api/workspaces/${wsA.id}/columns/${colA.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(res.status).toBe(200);
    const col = await prisma.column.findUnique({ where: { id: colA.id } });
    expect(col?.name).toBe('Renamed');
  });

  it('allows dependency delete by workspace member (sanity)', async () => {
    const t1 = await createTask(prisma, wsA.id, colA.id, ownerA.id, 'A-1');
    const t2 = await createTask(prisma, wsA.id, colA.id, ownerA.id, 'A-2');
    const dep = await prisma.taskDependency.create({
      data: { blockingTaskId: t1.id, blockedTaskId: t2.id },
    });
    const res = await app.request(`/api/tasks/dependencies/${dep.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookieA },
    });
    expect(res.status).toBe(200);
    const found = await prisma.taskDependency.findUnique({ where: { id: dep.id } });
    expect(found).toBeNull();
  });

  it('throws NotFoundError/BadRequestError classes are exported', () => {
    expect(new NotFoundError('x').status).toBe(404);
    expect(new BadRequestError('y').status).toBe(400);
  });
});
