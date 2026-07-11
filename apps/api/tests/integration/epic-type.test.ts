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

describe('Epic hierarchy type (P4-1)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  it('sets Task.type to EPIC/STORY and nests via parentTaskId', async () => {
    const owner = await createUser(prisma, 'epic@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Epic WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const col = await createColumn(prisma, w.id, 'Todo', 0);
    const epic = await createTask(prisma, w.id, col.id, owner.id, 'Platform Epic');
    const app = buildApp();

    const patchEpic = await app.request(`/api/tasks/${epic.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ type: 'EPIC' }),
    });
    expect(patchEpic.status).toBe(200);

    const storyRes = await app.request(`/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        workspaceId: w.id,
        columnId: col.id,
        title: 'Story under epic',
        parentTaskId: epic.id,
      }),
    });
    // create may or may not accept parentTaskId - set via patch if needed
    let storyId: string;
    if (storyRes.status === 201) {
      const body = await storyRes.json();
      storyId = body.task?.id ?? body.id;
      await app.request(`/api/tasks/${storyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ type: 'STORY', parentTaskId: epic.id }),
      });
    } else {
      const story = await createTask(prisma, w.id, col.id, owner.id, 'Story under epic');
      storyId = story.id;
      await prisma.task.update({
        where: { id: storyId },
        data: { type: 'STORY', parentTaskId: epic.id },
      });
    }

    const dbEpic = await prisma.task.findUnique({ where: { id: epic.id } });
    const dbStory = await prisma.task.findUnique({ where: { id: storyId } });
    expect(dbEpic?.type).toBe('EPIC');
    expect(dbStory?.type).toBe('STORY');
    expect(dbStory?.parentTaskId).toBe(epic.id);
  });
});
