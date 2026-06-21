import { Hono } from 'hono';
import type { UserRole } from '@prisma/client';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberSchema,
  createColumnSchema,
  updateColumnSchema,
} from '@flow-desk/shared/workspace';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth, requireWorkspaceRole } from '../../shared/middleware/auth';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';

export const workspaceRouter = new Hono();

workspaceRouter.use('*', requireAuth());

workspaceRouter.get('/', async (c) => {
  const auth = c.get('auth');
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: auth.user.id, workspace: { deletedAt: null } },
    include: {
      workspace: {
        include: {
          _count: { select: { members: true, tasks: { where: { deletedAt: null } } } },
        },
      },
    },
  });
  const workspaces = memberships.map((m: {
    role: UserRole;
    workspace: {
      id: string;
      name: string;
      slug: string;
      _count: { members: number; tasks: number };
    };
  }) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role,
    _count: m.workspace._count,
  }));
  return c.json({ workspaces });
});

workspaceRouter.post('/', async (c) => {
  const auth = c.get('auth');
  const body = createWorkspaceSchema.parse(await c.req.json());

  const slugTaken = await prisma.workspace.findUnique({ where: { slug: body.slug } });
  if (slugTaken) throw new ConflictError('Slug already taken');

  const workspace = await prisma.workspace.create({
    data: {
      name: body.name,
      slug: body.slug,
      description: body.description,
      visibility: body.visibility,
      ownerId: auth.user.id,
      members: { create: { userId: auth.user.id, role: 'OWNER' } },
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
  return c.json({ workspace }, 201);
});

workspaceRouter.get('/:workspaceId', requireWorkspaceRole(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']), async (c) => {
  const id = c.req.param('workspaceId')!;
  const workspace = await prisma.workspace.findFirst({
    where: { id, deletedAt: null },
    include: { columns: { orderBy: { position: 'asc' } } },
  });
  if (!workspace) throw new NotFoundError('Workspace not found');
  return c.json({ workspace });
});

workspaceRouter.patch('/:workspaceId', requireWorkspaceRole(['OWNER', 'ADMIN']), async (c) => {
  const id = c.req.param('workspaceId')!;
  const body = updateWorkspaceSchema.parse(await c.req.json());
  const workspace = await prisma.workspace.update({ where: { id }, data: body });
  return c.json({ workspace });
});

workspaceRouter.delete('/:workspaceId', requireWorkspaceRole(['OWNER']), async (c) => {
  const id = c.req.param('workspaceId')!;
  await prisma.workspace.update({ where: { id }, data: { deletedAt: new Date() } });
  return c.json({ ok: true });
});

workspaceRouter.get('/:workspaceId/board', requireWorkspaceRole(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']), async (c) => {
  const id = c.req.param('workspaceId')!;
  const columns = await prisma.column.findMany({
    where: { workspaceId: id },
    orderBy: { position: 'asc' },
    include: {
      tasks: {
        where: { deletedAt: null },
        orderBy: { position: 'asc' },
        include: {
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        take: 50,
      },
    },
  });
  return c.json({ columns });
});

workspaceRouter.get('/:workspaceId/members', requireWorkspaceRole(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']), async (c) => {
  const id = c.req.param('workspaceId')!;
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: id },
    include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  return c.json({ members });
});

workspaceRouter.post('/:workspaceId/members', requireWorkspaceRole(['OWNER', 'ADMIN']), async (c) => {
  const id = c.req.param('workspaceId')!;
  const body = inviteMemberSchema.parse(await c.req.json());
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) throw new NotFoundError('User not registered');

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: user.id } },
  });
  if (existing) throw new ConflictError('User already a member');

  const member = await prisma.workspaceMember.create({
    data: { workspaceId: id, userId: user.id, role: body.role },
  });
  return c.json({ member }, 201);
});

workspaceRouter.patch('/:workspaceId/members/:userId', requireWorkspaceRole(['OWNER']), async (c) => {
  const id = c.req.param('workspaceId')!;
  const userId = c.req.param('userId')!;
  const body = updateMemberSchema.parse(await c.req.json());

  if (body.role !== 'OWNER') {
    const ownerCount = await prisma.workspaceMember.count({ where: { workspaceId: id, role: 'OWNER' } });
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId } },
    });
    if (target?.role === 'OWNER' && ownerCount <= 1) {
      throw new ForbiddenError('Cannot demote the last owner');
    }
  }

  const member = await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId: id, userId } },
    data: { role: body.role },
  });
  return c.json({ member });
});

workspaceRouter.delete('/:workspaceId/members/:userId', requireWorkspaceRole(['OWNER', 'ADMIN']), async (c) => {
  const id = c.req.param('workspaceId')!;
  const userId = c.req.param('userId')!;
  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId } },
  });
  if (target?.role === 'OWNER') {
    const ownerCount = await prisma.workspaceMember.count({ where: { workspaceId: id, role: 'OWNER' } });
    if (ownerCount <= 1) throw new ForbiddenError('Cannot remove the last owner');
  }
  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId: id, userId } },
  });
  return c.json({ ok: true });
});

workspaceRouter.post('/:workspaceId/columns', requireWorkspaceRole(['OWNER', 'ADMIN']), async (c) => {
  const id = c.req.param('workspaceId')!;
  const body = createColumnSchema.parse(await c.req.json());
  const lastCol = await prisma.column.findFirst({
    where: { workspaceId: id },
    orderBy: { position: 'desc' },
  });
  const column = await prisma.column.create({
    data: {
      workspaceId: id,
      name: body.name,
      position: body.position ?? (lastCol ? lastCol.position + 1 : 0),
      color: body.color ?? null,
      isDoneColumn: body.isDoneColumn ?? false,
    },
  });
  return c.json({ column }, 201);
});

workspaceRouter.patch('/:workspaceId/columns/:columnId', requireWorkspaceRole(['OWNER', 'ADMIN']), async (c) => {
  const columnId = c.req.param('columnId')!;
  const body = updateColumnSchema.parse(await c.req.json());
  const column = await prisma.column.update({ where: { id: columnId }, data: body });
  return c.json({ column });
});

workspaceRouter.delete('/:workspaceId/columns/:columnId', requireWorkspaceRole(['OWNER', 'ADMIN']), async (c) => {
  const columnId = c.req.param('columnId')!;
  await prisma.column.delete({ where: { id: columnId } });
  return c.json({ ok: true });
});
