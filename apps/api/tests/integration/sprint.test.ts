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

describe('Sprints (P3-1)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  async function setup() {
    const owner = await createUser(prisma, 'sprint@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Sprint WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    return { ownerId: owner.id, wid: w.id, cookie };
  }

  it('creates sprint, assigns tasks with estimates, returns burndown', async () => {
    const { ownerId, wid, cookie } = await setup();
    const app = buildApp();
    const createRes = await app.request(`/api/workspaces/${wid}/sprints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Sprint 1',
        goal: 'Ship core',
        startDate: '2026-07-01T00:00:00.000Z',
        endDate: '2026-07-14T00:00:00.000Z',
      }),
    });
    expect(createRes.status).toBe(201);
    const sprint = await createRes.json();
    expect(sprint.name).toBe('Sprint 1');

    const col = await createColumn(prisma, wid, 'Todo', 10);
    const tasks = [];
    for (let i = 0; i < 5; i++) {
      const t = await createTask(prisma, wid, col.id, ownerId, `Story ${i}`);
      await prisma.task.update({
        where: { id: t.id },
        data: { estimate: i === 0 ? 5 : 4, sprintId: sprint.id },
      });
      tasks.push(t);
    }
    // Mark one done with completedAt
    await prisma.task.update({
      where: { id: tasks[0]!.id },
      data: { status: 'DONE', completedAt: new Date('2026-07-03T12:00:00Z') },
    });

    const burnRes = await app.request(`/api/workspaces/${wid}/sprints/${sprint.id}/burndown`, {
      headers: { Cookie: cookie },
    });
    expect(burnRes.status).toBe(200);
    const burn = await burnRes.json();
    expect(burn.data.length).toBeGreaterThan(5);
    expect(burn.data[0].ideal).toBeGreaterThan(0);
    expect(burn.data[0].remaining).toBe(21); // 5+4*4

    const startRes = await app.request(`/api/workspaces/${wid}/sprints/${sprint.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ status: 'ACTIVE' }),
    });
    expect(startRes.status).toBe(200);
    expect((await startRes.json()).status).toBe('ACTIVE');
  });
});
