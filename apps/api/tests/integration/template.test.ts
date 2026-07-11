import { describe, it, expect, beforeEach } from 'vitest';
import { getTestPrisma } from '../setup/integration';
import { cleanDatabase, createUser, createWorkspace, getAuthCookie } from '../setup/factories';
import { buildApp } from '../../src/app';
import { templateService } from '../../src/modules/template/template.service';

describe('Task templates + recurring (P3-2)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;
  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  it('creates template + recurring and processDue creates task', async () => {
    const owner = await createUser(prisma, 'tpl@test.local', 'Owner');
    const w = await createWorkspace(prisma, owner.id, 'Tpl WS');
    const cookie = await getAuthCookie(prisma, owner.id);
    const app = buildApp();

    const tplRes = await app.request(`/api/workspaces/${w.id}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: 'Weekly status writeup',
        fields: { title: 'Weekly status writeup', priority: 'MEDIUM' },
      }),
    });
    expect(tplRes.status).toBe(201);
    const tpl = await tplRes.json();

    const recRes = await app.request(`/api/workspaces/${w.id}/templates/recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ templateId: tpl.id, cron: 'daily', isActive: true }),
    });
    expect(recRes.status).toBe(201);
    const rec = await recRes.json();
    expect(rec.nextRunAt).toBeTruthy();

    // Force due
    await prisma.recurringRule.update({
      where: { id: rec.id },
      data: { nextRunAt: new Date('2020-01-01T00:00:00Z') },
    });
    const n = await templateService.processDue(new Date());
    expect(n).toBe(1);
    const tasks = await prisma.task.findMany({
      where: { workspaceId: w.id, title: 'Weekly status writeup' },
    });
    expect(tasks).toHaveLength(1);
  });
});
