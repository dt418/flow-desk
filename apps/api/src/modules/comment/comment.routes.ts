import { Hono } from 'hono';
import {
  createCommentSchema,
  updateCommentSchema,
  listCommentsQuerySchema,
} from '@flow-desk/shared/comment';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { NotFoundError, BadRequestError } from '../../shared/errors';
import { emitToTask, emitToUser } from '../../shared/lib/socket-events';
import { logger } from '../../shared/lib/logger';

async function assertMembership(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new BadRequestError('Not a member of this workspace');
  return member;
}

function safeEmit(fn: () => void, ctx: Record<string, unknown>): void {
  try {
    fn();
  } catch (err) {
    logger.warn({ err, ...ctx }, 'socket emit failed');
  }
}

export const commentRouter = new Hono();
commentRouter.use('*', requireAuth());

const MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g;

function extractMentions(content: string, members: Array<{ user: { id: string; name: string } }>) {
  const out: Array<{ userId: string; username: string }> = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    const username = match[1]!.toLowerCase();
    const member = members.find((m) => m.user.name.toLowerCase() === username);
    if (member && !seen.has(member.user.id)) {
      seen.add(member.user.id);
      out.push({ userId: member.user.id, username: member.user.name });
    }
  }
  return out;
}

commentRouter.get('/', async (c) => {
  const query = listCommentsQuerySchema.parse(c.req.query());
  const comments = await prisma.comment.findMany({
    where: { taskId: query.taskId, deletedAt: null, parentCommentId: null },
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      _count: { select: { replies: { where: { deletedAt: null } } } },
    },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });
  return c.json({ comments });
});

commentRouter.post('/', async (c) => {
  const auth = c.get('auth');
  const body = createCommentSchema.parse(await c.req.json());
  const task = await prisma.task.findUnique({ where: { id: body.taskId } });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, auth.user.id);

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: task.workspaceId },
    include: { user: { select: { id: true, name: true } } },
  });
  const mentions = extractMentions(body.content, members);
  const mentionedUserIds = mentions.map((m) => m.userId);

  const comment = await prisma.comment.create({
    data: {
      taskId: body.taskId,
      authorId: auth.user.id,
      parentCommentId: body.parentCommentId ?? null,
      content: body.content,
      mentionedUserIds,
    },
  });

  const recipientIds = mentionedUserIds.filter((id) => id !== auth.user.id);
  await prisma.notification.createMany({
    data: recipientIds.map((userId) => ({
      userId,
      type: 'COMMENT_REPLY' as const,
      title: 'You were mentioned',
      body: body.content.slice(0, 200),
      data: { taskId: body.taskId, commentId: comment.id },
    })),
  });

  const notifications = await prisma.notification.findMany({
    where: {
      userId: { in: recipientIds },
      type: 'COMMENT_REPLY',
      createdAt: { gte: comment.createdAt },
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const notif of notifications) {
    safeEmit(
      () => emitToUser(notif.userId, 'notification:new', { notification: notif }),
      { event: 'notification:new', notificationId: notif.id, userId: notif.userId },
    );
  }

  safeEmit(
    () => emitToTask(body.taskId, 'comment:created', { comment }),
    { event: 'comment:created', commentId: comment.id, taskId: body.taskId },
  );
  return c.json({ comment }, 201);
});

commentRouter.patch('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const body = updateCommentSchema.parse(await c.req.json());
  const existing = await prisma.comment.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) throw new NotFoundError('Comment not found');
  if (existing.authorId !== auth.user.id) {
    throw new BadRequestError('Cannot edit others’ comments');
  }
  const task = await prisma.task.findUnique({ where: { id: existing.taskId } });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, auth.user.id);
  const comment = await prisma.comment.update({
    where: { id },
    data: { content: body.content, editedAt: new Date() },
  });
  safeEmit(
    () => emitToTask(existing.taskId, 'comment:updated', { comment }),
    { event: 'comment:updated', commentId: id, taskId: existing.taskId },
  );
  return c.json({ comment });
});

commentRouter.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const id = c.req.param('id')!;
  const existing = await prisma.comment.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError();
  if (existing.authorId !== auth.user.id) {
    throw new BadRequestError('Cannot delete others’ comments');
  }
  const task = await prisma.task.findUnique({ where: { id: existing.taskId } });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, auth.user.id);
  await prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
  safeEmit(
    () => emitToTask(existing.taskId, 'comment:deleted', { commentId: id }),
    { event: 'comment:deleted', commentId: id, taskId: existing.taskId },
  );
  return c.json({ ok: true });
});
