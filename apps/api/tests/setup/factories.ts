import type { PrismaClient, UserRole } from '../../../../packages/db/generated/client';
import { signAccessToken } from '../../src/shared/lib/jwt';

let idCounter = 0;
function uniq(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
      const tables = await tx.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_%'
      `;
      for (const { tablename } of tables) {
        await tx.$executeRawUnsafe(`DELETE FROM "${tablename}"`);
      }
      await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    },
    { timeout: 30000 },
  );
}

export async function createUser(
  prisma: PrismaClient,
  email: string = `user-${uniq('u')}@test.local`,
  name: string = 'Test User',
): Promise<{ id: string; email: string; name: string }> {
  const user = await prisma.user.create({ data: { email, name } });
  return { id: user.id, email: user.email, name: user.name };
}

export async function createWorkspace(
  prisma: PrismaClient,
  ownerId: string,
  name: string = 'Test Workspace',
): Promise<{ id: string; name: string; ownerId: string }> {
  const slug = `ws-${uniq('s')}`.toLowerCase();
  const ws = await prisma.workspace.create({
    data: {
      name,
      slug,
      ownerId,
      members: { create: { userId: ownerId, role: 'OWNER' } },
      columns: {
        create: [
          { name: 'Backlog', position: 0, isDoneColumn: false },
          { name: 'Todo', position: 1, isDoneColumn: false },
          { name: 'In Progress', position: 2, isDoneColumn: false },
          { name: 'Done', position: 3, isDoneColumn: true },
        ],
      },
    },
  });
  return { id: ws.id, name: ws.name, ownerId: ws.ownerId };
}

export async function addMember(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
  role: UserRole = 'MEMBER',
): Promise<void> {
  await prisma.workspaceMember.create({ data: { workspaceId, userId, role } });
}

export async function createColumn(
  prisma: PrismaClient,
  workspaceId: string,
  name: string = 'Todo',
  position: number = 0,
): Promise<{ id: string; name: string; workspaceId: string }> {
  const col = await prisma.column.create({
    data: { workspaceId, name, position, isDoneColumn: false },
  });
  return { id: col.id, name: col.name, workspaceId: col.workspaceId };
}

export async function createTask(
  prisma: PrismaClient,
  workspaceId: string,
  columnId: string,
  createdById: string,
  title: string = 'Test Task',
): Promise<{ id: string; title: string; workspaceId: string; columnId: string }> {
  const t = await prisma.task.create({
    data: {
      workspaceId,
      columnId,
      title,
      createdById,
    },
  });
  return { id: t.id, title: t.title, workspaceId: t.workspaceId, columnId: t.columnId };
}

export async function getAuthCookie(prisma: PrismaClient, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User not found: ${userId}`);
  const token = signAccessToken({ userId: user.id, email: user.email });
  return `access_token=${token}`;
}

export async function createComment(
  prisma: PrismaClient,
  taskId: string,
  authorId: string,
  content: string = 'Test comment',
): Promise<{ id: string; content: string }> {
  const c = await prisma.comment.create({
    data: { taskId, authorId, content },
  });
  return { id: c.id, content: c.content };
}

export async function createAttachment(
  prisma: PrismaClient,
  taskId: string,
  uploadedById: string,
  filename: string = 'report.pdf',
): Promise<{ id: string; filename: string }> {
  const a = await prisma.attachment.create({
    data: {
      taskId,
      uploadedById,
      filename,
      mimeType: 'application/pdf',
      size: 1024,
      type: 'DOCUMENT',
      storagePath: `/data/${filename}`,
    },
  });
  return { id: a.id, filename: a.filename };
}
