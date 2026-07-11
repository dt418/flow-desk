import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import {
  cleanDatabase,
  createUser,
  createWorkspace,
  getAuthCookie,
  createColumn,
} from '../setup/factories';
import { buildApp } from '../../src/app';

describe('Boards multi (P4-2)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  it('lists default Main board and creates Marketing + Engineering', async () => {
    const owner = await createUser(prisma, 'board@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Board WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const app = buildApp();

    const list1 = await app.request(`/api/workspaces/${w.id}/boards`, {
      headers: { Cookie: cookie },
    });
    expect(list1.status).toBe(200);
    const initial = await list1.json();
    expect(initial.data.length).toBeGreaterThanOrEqual(1);
    expect(initial.data[0].name).toBe('Main');

    for (const name of ['Marketing', 'Engineering']) {
      const res = await app.request(`/api/workspaces/${w.id}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ name }),
      });
      expect(res.status).toBe(201);
    }

    const list2 = await app.request(`/api/workspaces/${w.id}/boards`, {
      headers: { Cookie: cookie },
    });
    const names = (await list2.json()).data.map((b: { name: string }) => b.name);
    expect(names).toEqual(expect.arrayContaining(['Main', 'Marketing', 'Engineering']));
  });

  it('partitions tasks by boardId on list', async () => {
    const owner = await createUser(prisma, 'part@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Part WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const col = await createColumn(prisma, w.id, 'Todo', 0);
    const app = buildApp();

    const mktRes = await app.request(`/api/workspaces/${w.id}/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Marketing' }),
    });
    const engRes = await app.request(`/api/workspaces/${w.id}/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Engineering' }),
    });
    const mkt = await mktRes.json();
    const eng = await engRes.json();

    await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        workspaceId: w.id,
        columnId: col.id,
        title: 'Campaign brief',
        boardId: mkt.id,
      }),
    });
    await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        workspaceId: w.id,
        columnId: col.id,
        title: 'API rewrite',
        boardId: eng.id,
      }),
    });

    const mktList = await app.request(`/api/tasks?workspaceId=${w.id}&boardId=${mkt.id}&limit=50`, {
      headers: { Cookie: cookie },
    });
    expect(mktList.status).toBe(200);
    const mktTasks = (await mktList.json()).data;
    expect(mktTasks.every((t: { title: string }) => t.title === 'Campaign brief')).toBe(true);
    expect(mktTasks).toHaveLength(1);

    const engList = await app.request(`/api/tasks?workspaceId=${w.id}&boardId=${eng.id}&limit=50`, {
      headers: { Cookie: cookie },
    });
    const engTasks = (await engList.json()).data;
    expect(engTasks).toHaveLength(1);
    expect(engTasks[0].title).toBe('API rewrite');
  });

  it('GET /board partitions tasks by boardId', async () => {
    const owner = await createUser(prisma, 'kanban@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Kanban WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const col = await createColumn(prisma, w.id, 'Todo', 0);
    const app = buildApp();

    const mktRes = await app.request(`/api/workspaces/${w.id}/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Marketing' }),
    });
    const engRes = await app.request(`/api/workspaces/${w.id}/boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Engineering' }),
    });
    const mkt = await mktRes.json();
    const eng = await engRes.json();

    for (const t of [
      { title: 'Campaign brief', boardId: mkt.id },
      { title: 'API rewrite', boardId: eng.id },
      { title: 'No board', boardId: null },
    ]) {
      await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          workspaceId: w.id,
          columnId: col.id,
          title: t.title,
          ...(t.boardId ? { boardId: t.boardId } : {}),
        }),
      });
    }

    const mktBoard = await app.request(`/api/workspaces/${w.id}/board?boardId=${mkt.id}`, {
      headers: { Cookie: cookie },
    });
    expect(mktBoard.status).toBe(200);
    const mktColumns = (await mktBoard.json()).columns;
    const mktTasks = mktColumns.flatMap((c: { tasks: { title: string }[] }) => c.tasks);
    expect(mktTasks.map((t: { title: string }) => t.title)).toEqual(['Campaign brief']);

    const engBoard = await app.request(`/api/workspaces/${w.id}/board?boardId=${eng.id}`, {
      headers: { Cookie: cookie },
    });
    const engTasks = (await engBoard.json()).columns.flatMap(
      (c: { tasks: { title: string }[] }) => c.tasks,
    );
    expect(engTasks.map((t: { title: string }) => t.title)).toEqual(['API rewrite']);

    const allBoard = await app.request(`/api/workspaces/${w.id}/board`, {
      headers: { Cookie: cookie },
    });
    const allTasks = (await allBoard.json()).columns.flatMap(
      (c: { tasks: { title: string }[] }) => c.tasks,
    );
    expect(allTasks.map((t: { title: string }) => t.title).sort()).toEqual([
      'API rewrite',
      'Campaign brief',
      'No board',
    ]);
  });
});
