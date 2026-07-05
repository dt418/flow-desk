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

// P1-3: CSV export of filtered task list.
// GET /api/tasks/export?workspaceId=…&<filters> → text/csv stream, RFC 4180.
describe('GET /api/tasks/export (P1-3)', () => {
  let prisma: ReturnType<typeof getTestPrisma>;

  beforeEach(async () => {
    prisma = getTestPrisma();
    await cleanDatabase(prisma);
  });

  async function setup() {
    const owner = await createUser(prisma, 'owner@test.local', 'Owner');
    const assignee = await createUser(prisma, 'assignee@test.local', 'Assignee');
    const outsider = await createUser(prisma, 'outsider@test.local', 'Outsider');
    const w = await createWorkspace(prisma, owner.id, 'Export WS');
    await addMember(prisma, w.id, assignee.id, 'MEMBER');
    const col = await createColumn(prisma, w.id, 'Todo', 0);
    const cookie = await getAuthCookie(prisma, owner.id);
    const outsiderCookie = await getAuthCookie(prisma, outsider.id);
    return {
      ownerId: owner.id,
      assigneeId: assignee.id,
      outsiderId: outsider.id,
      wid: w.id,
      columnId: col.id,
      cookie,
      outsiderCookie,
    };
  }

  async function exportRequest(app: ReturnType<typeof buildApp>, query: string, cookie: string) {
    return app.request(`/api/tasks/export?${query}`, {
      method: 'GET',
      headers: { Cookie: cookie },
    });
  }

  async function readCsv(res: Response): Promise<string> {
    return res.text();
  }

  it('exports all tasks in a workspace with correct headers and row count', async () => {
    const { wid, columnId, ownerId, cookie } = await setup();
    const app = buildApp();
    await createTask(prisma, wid, columnId, ownerId, 'Task A');
    await createTask(prisma, wid, columnId, ownerId, 'Task B');

    const res = await exportRequest(app, `workspaceId=${wid}`, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="tasks-.*\.csv"$/,
    );

    const csv = await readCsv(res);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    // BOM + header line: first line starts with BOM then "Status,..."
    expect(lines[0]).toContain('Status,Title,Assignee Email,Priority,Due Date,Labels');
    // 2 data rows
    expect(lines.length).toBe(3); // header + 2
    expect(csv).toContain('Task A');
    expect(csv).toContain('Task B');
  });

  it('filters by status=IN_REVIEW', async () => {
    const { wid, columnId, ownerId, cookie } = await setup();
    const app = buildApp();
    const t1 = await createTask(prisma, wid, columnId, ownerId, 'In Review Task');
    const t2 = await createTask(prisma, wid, columnId, ownerId, 'Todo Task');
    await prisma.task.update({ where: { id: t1.id }, data: { status: 'IN_REVIEW' } });
    await prisma.task.update({ where: { id: t2.id }, data: { status: 'TODO' } });

    const res = await exportRequest(app, `workspaceId=${wid}&status=IN_REVIEW`, cookie);
    expect(res.status).toBe(200);
    const csv = await readCsv(res);
    expect(csv).toContain('In Review Task');
    expect(csv).not.toContain('Todo Task');
  });

  it('filters by priority=HIGH', async () => {
    const { wid, columnId, ownerId, cookie } = await setup();
    const app = buildApp();
    const t1 = await createTask(prisma, wid, columnId, ownerId, 'High Task');
    const t2 = await createTask(prisma, wid, columnId, ownerId, 'Low Task');
    await prisma.task.update({ where: { id: t1.id }, data: { priority: 'HIGH' } });
    await prisma.task.update({ where: { id: t2.id }, data: { priority: 'LOW' } });

    const res = await exportRequest(app, `workspaceId=${wid}&priority=HIGH`, cookie);
    expect(res.status).toBe(200);
    const csv = await readCsv(res);
    expect(csv).toContain('High Task');
    expect(csv).not.toContain('Low Task');
  });

  it('filters by assigneeId and excludes unassigned tasks', async () => {
    const { wid, columnId, ownerId, assigneeId, cookie } = await setup();
    const app = buildApp();
    const t1 = await createTask(prisma, wid, columnId, ownerId, 'Assigned Task');
    const t2 = await createTask(prisma, wid, columnId, ownerId, 'Unassigned Task');
    await prisma.task.update({ where: { id: t1.id }, data: { assigneeId } });
    // t2 left unassigned

    const res = await exportRequest(app, `workspaceId=${wid}&assigneeId=${assigneeId}`, cookie);
    expect(res.status).toBe(200);
    const csv = await readCsv(res);
    expect(csv).toContain('Assigned Task');
    expect(csv).not.toContain('Unassigned Task');
  });

  it('returns header row only for an empty result set', async () => {
    const { wid, cookie } = await setup();
    const app = buildApp();

    const res = await exportRequest(app, `workspaceId=${wid}&status=IN_REVIEW`, cookie);
    expect(res.status).toBe(200);
    const csv = await readCsv(res);
    const lines = csv.split('\r\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Status,Title,Assignee Email,Priority,Due Date,Labels');
  });

  it('renders empty Assignee Email column for unassigned task', async () => {
    const { wid, columnId, ownerId, cookie } = await setup();
    const app = buildApp();
    await createTask(prisma, wid, columnId, ownerId, 'Nobody Task');

    const res = await exportRequest(app, `workspaceId=${wid}`, cookie);
    const csv = await readCsv(res);
    // Row: TODO,Nobody Task,,MEDIUM,,\r\n  (empty email + empty dueDate + empty labels)
    expect(csv).toContain('TODO,Nobody Task,,MEDIUM,,');
  });

  it('renders empty Due Date column when dueDate is null', async () => {
    const { wid, columnId, ownerId, cookie } = await setup();
    const app = buildApp();
    await createTask(prisma, wid, columnId, ownerId, 'No Due Task');

    const res = await exportRequest(app, `workspaceId=${wid}`, cookie);
    const csv = await readCsv(res);
    // dueDate column empty between priority and labels
    expect(csv).toContain('TODO,No Due Task,,MEDIUM,,');
  });

  it('joins multiple labels with semicolon', async () => {
    const { wid, columnId, ownerId, cookie } = await setup();
    const app = buildApp();
    const t = await createTask(prisma, wid, columnId, ownerId, 'Labeled Task');
    const labelA = await prisma.taskLabel.create({
      data: { workspaceId: wid, name: 'bug', color: 'red' },
    });
    const labelB = await prisma.taskLabel.create({
      data: { workspaceId: wid, name: 'urgent', color: 'orange' },
    });
    await prisma.taskLabelAssignment.create({ data: { taskId: t.id, labelId: labelA.id } });
    await prisma.taskLabelAssignment.create({ data: { taskId: t.id, labelId: labelB.id } });

    const res = await exportRequest(app, `workspaceId=${wid}`, cookie);
    const csv = await readCsv(res);
    expect(csv).toContain('bug;urgent');
  });

  it('quotes a label name containing a comma', async () => {
    const { wid, columnId, ownerId, cookie } = await setup();
    const app = buildApp();
    const t = await createTask(prisma, wid, columnId, ownerId, 'Comma Label Task');
    const label = await prisma.taskLabel.create({
      data: { workspaceId: wid, name: 'foo, bar', color: 'blue' },
    });
    await prisma.taskLabelAssignment.create({ data: { taskId: t.id, labelId: label.id } });

    const res = await exportRequest(app, `workspaceId=${wid}`, cookie);
    const csv = await readCsv(res);
    // The whole Labels field must be quoted: ..."foo, bar"...
    expect(csv).toContain('"foo, bar"');
  });

  it('RFC 4180-escapes title with comma and embedded quote', async () => {
    const { wid, columnId, ownerId, cookie } = await setup();
    const app = buildApp();
    await createTask(prisma, wid, columnId, ownerId, 'He said "hi", then left');

    const res = await exportRequest(app, `workspaceId=${wid}`, cookie);
    const csv = await readCsv(res);
    expect(csv).toContain('"He said ""hi"", then left"');
  });

  it('rejects non-member with 400', async () => {
    const { wid, outsiderCookie } = await setup();
    const app = buildApp();

    const res = await exportRequest(app, `workspaceId=${wid}`, outsiderCookie);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/not a member/i);
  });

  it('rejects missing workspaceId with 400', async () => {
    const { cookie } = await setup();
    const app = buildApp();

    const res = await exportRequest(app, '', cookie);
    expect(res.status).toBe(400);
  });

  it('emits a UTF-8 BOM as the first bytes of the body', async () => {
    const { wid, columnId, ownerId, cookie } = await setup();
    const app = buildApp();
    await createTask(prisma, wid, columnId, ownerId, 'BOM Task');

    const res = await exportRequest(app, `workspaceId=${wid}`, cookie);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // BOM = 0xEF 0xBB 0xBF
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });
});
