import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type {
  CreateCommentInput,
  UpdateCommentInput,
  ListCommentsQuery,
} from '@flow-desk/shared/comment';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
import { emitToTask, emitToUser } from '../../shared/lib/socket-events';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import { activityService } from '../activity';
import { handleTaskMentionEmail } from '../notification/notification-email.service';
import { logger } from '../../shared/lib/logger';
import * as repo from './comment.repository';

const MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g;

const MAX_MENTIONS = 10;

function extractMentions(content: string, members: Array<{ user: { id: string; name: string } }>) {
  const out: Array<{ userId: string; username: string }> = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = MENTION_REGEX.exec(content)) !== null && out.length < MAX_MENTIONS) {
    const username = match[1]!.toLowerCase();
    const member = members.find((m) => m.user.name.toLowerCase() === username);
    if (member && !seen.has(member.user.id)) {
      seen.add(member.user.id);
      out.push({ userId: member.user.id, username: member.user.name });
    }
  }
  return out;
}

export async function listComments(
  prisma: PrismaClient,
  userId: string,
  query: ListCommentsQuery,
  isChat?: boolean,
) {
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
    where: {
      taskId: query.taskId,
      parentCommentId: null,
      ...(isChat !== undefined ? { isChat } : {}),
      ...(cursorWhere ?? {}),
    },
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

export async function createComment(
  prisma: PrismaClient,
  userId: string,
  body: CreateCommentInput & { isChat?: boolean },
) {
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
    ...(body.isChat !== undefined ? { isChat: body.isChat } : {}),
  });

  const recipientIds = mentionedUserIds.filter((id) => id !== userId);
  if (recipientIds.length > 0) {
    await repo.createManyNotifications(
      prisma,
      recipientIds.map((uid) => ({
        userId: uid,
        type: 'COMMENT_REPLY',
        title: 'You were mentioned',
        body: body.content.slice(0, 200),
        data: { taskId: body.taskId, commentId: comment.id },
      })),
    );

    const notifications = await repo.findNotificationsSince(
      prisma,
      recipientIds,
      'COMMENT_REPLY',
      comment.createdAt,
    );
    for (const notif of notifications) {
      emitToUser(notif.userId, 'notification:new', { notification: notif });
    }

    // P2-2: email fan-out for mentions
    try {
      const [workspace, author, recipients] = await Promise.all([
        prisma.workspace.findUnique({
          where: { id: task.workspaceId },
          select: { name: true },
        }),
        prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
        prisma.user.findMany({
          where: { id: { in: recipientIds } },
          select: { id: true, name: true, email: true },
        }),
      ]);
      if (workspace && author) {
        const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
        await Promise.all(
          recipients.map((r) =>
            handleTaskMentionEmail(prisma, {
              recipientId: r.id,
              recipientName: r.name,
              recipientEmail: r.email,
              authorName: author.name,
              taskId: task.id,
              taskTitle: task.title,
              taskUrl: `${appUrl}/tasks/${task.id}`,
              workspaceId: task.workspaceId,
              workspaceName: workspace.name,
              snippet: body.content.slice(0, 200),
            }),
          ),
        );
      }
    } catch (err) {
      logger.warn({ err, taskId: task.id }, 'failed to enqueue mention emails');
    }
  }

  emitToTask(body.taskId, 'comment:created', { comment });

  if (!body.isChat) {
    await activityService.record({
      taskId: body.taskId,
      userId,
      action: 'COMMENT_ADDED',
      metadata: { commentId: comment.id },
    });
  }

  return comment;
}

export async function updateComment(
  prisma: PrismaClient,
  userId: string,
  id: string,
  body: UpdateCommentInput,
) {
  const existing = await repo.findUniqueRaw(prisma, id);
  if (!existing || existing.deletedAt) throw new NotFoundError('Comment not found');
  if (existing.authorId !== userId) {
    throw new BadRequestError('Cannot edit others’ comments');
  }
  const task = await prisma.task.findFirst({ where: { id: existing.taskId, deletedAt: null } });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.workspaceId, userId);

  const comment = await repo.updateContent(prisma, id, body.content);
  emitToTask(existing.taskId, 'comment:updated', { comment });
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
  emitToTask(existing.taskId, 'comment:deleted', { commentId: id });
}
