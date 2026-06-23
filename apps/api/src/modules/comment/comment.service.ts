import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { CreateCommentInput, UpdateCommentInput, ListCommentsQuery } from '@flow-desk/shared/comment';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
import { emitToTask, emitToUser } from '../../shared/lib/socket-events';
import { logger } from '../../shared/lib/logger';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import * as repo from './comment.repository';

const MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g;

function safeEmit(fn: () => void, ctx: Record<string, unknown>): void {
  try {
    fn();
  } catch (err) {
    logger.warn({ err, ...ctx }, 'socket emit failed');
  }
}

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

export async function listComments(prisma: PrismaClient, userId: string, query: ListCommentsQuery) {
  const task = await prisma.task.findFirst({
    where: { id: query.taskId, deletedAt: null },
    select: { workspaceId: true },
  });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, userId);

  const decoded = query.cursor ? decodeCursor(query.cursor) : null;
  const cursorWhere = decoded
    ? {
        OR: [
          { createdAt: { gt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { gt: decoded.id } },
        ],
      }
    : undefined;
  const items = await prisma.comment.findMany({
    where: { taskId: query.taskId, parentCommentId: null, ...(cursorWhere ?? {}) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: query.limit + 1,
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      _count: { select: { replies: { where: { deletedAt: null } } } },
    },
  });
  const hasMore = items.length > query.limit;
  const data = hasMore ? items.slice(0, query.limit) : items;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { data, nextCursor };
}

export async function createComment(prisma: PrismaClient, userId: string, body: CreateCommentInput) {
  const task = await prisma.task.findFirst({ where: { id: body.taskId, deletedAt: null } });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, userId);

  const members = await repo.listWorkspaceMembers(prisma, task.workspaceId);
  const mentions = extractMentions(body.content, members);
  const mentionedUserIds = mentions.map((m) => m.userId);

  const comment = await repo.create(prisma, {
    taskId: body.taskId,
    authorId: userId,
    parentCommentId: body.parentCommentId ?? null,
    content: body.content,
    mentionedUserIds,
  });

  const recipientIds = mentionedUserIds.filter((id) => id !== userId);
  if (recipientIds.length > 0) {
    await repo.createManyNotifications(
      prisma,
      recipientIds.map((userId) => ({
        userId,
        type: 'COMMENT_REPLY',
        title: 'You were mentioned',
        body: body.content.slice(0, 200),
        data: { taskId: body.taskId, commentId: comment.id },
      })),
    );

    const notifications = await repo.findNotificationsSince(prisma, recipientIds, 'COMMENT_REPLY', comment.createdAt);
    for (const notif of notifications) {
      safeEmit(() => emitToUser(notif.userId, 'notification:new', { notification: notif }), {
        event: 'notification:new',
        notificationId: notif.id,
        userId: notif.userId,
      });
    }
  }

  safeEmit(() => emitToTask(body.taskId, 'comment:created', { comment }), {
    event: 'comment:created',
    commentId: comment.id,
    taskId: body.taskId,
  });
  return comment;
}

export async function updateComment(prisma: PrismaClient, userId: string, id: string, body: UpdateCommentInput) {
  const existing = await repo.findUniqueRaw(prisma, id);
  if (!existing || existing.deletedAt) throw new NotFoundError('Comment not found');
  if (existing.authorId !== userId) {
    throw new BadRequestError('Cannot edit others’ comments');
  }
  const task = await prisma.task.findFirst({ where: { id: existing.taskId, deletedAt: null } });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, userId);

  const comment = await repo.updateContent(prisma, id, body.content);
  safeEmit(() => emitToTask(existing.taskId, 'comment:updated', { comment }), {
    event: 'comment:updated',
    commentId: id,
    taskId: existing.taskId,
  });
  return comment;
}

export async function deleteComment(prisma: PrismaClient, userId: string, id: string) {
  const existing = await repo.findUniqueRaw(prisma, id);
  if (!existing || existing.deletedAt) throw new NotFoundError();
  if (existing.authorId !== userId) {
    throw new BadRequestError('Cannot delete others’ comments');
  }
  const task = await prisma.task.findFirst({ where: { id: existing.taskId, deletedAt: null } });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, userId);

  await repo.softDelete(prisma, id);
  safeEmit(() => emitToTask(existing.taskId, 'comment:deleted', { commentId: id }), {
    event: 'comment:deleted',
    commentId: id,
    taskId: existing.taskId,
  });
}