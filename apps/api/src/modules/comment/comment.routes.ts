import { Hono } from 'hono';
import {
  createCommentSchema,
  updateCommentSchema,
  listCommentsQuerySchema,
} from '@flow-desk/shared/comment';
import { prisma } from '../../shared/lib/prisma';
import { requireAuth } from '../../shared/middleware/auth';
import { NotFoundError, BadRequestError } from '../../shared/errors';

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

  await prisma.notification.createMany({
    data: mentionedUserIds
      .filter((id) => id !== auth.user.id)
      .map((userId) => ({
        userId,
        type: 'COMMENT_REPLY' as const,
        title: 'You were mentioned',
        body: body.content.slice(0, 200),
        data: { taskId: body.taskId, commentId: comment.id },
      })),
  });

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
  const comment = await prisma.comment.update({
    where: { id },
    data: { content: body.content, editedAt: new Date() },
  });
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
  await prisma.comment.update({ where: { id }, data: { deletedAt: new Date() } });
  return c.json({ ok: true });
});
