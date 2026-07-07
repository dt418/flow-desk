import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type {
  CreateChatMessageInput,
  UpdateChatMessageInput,
  ListChatMessagesQuery,
} from '@flow-desk/shared/chat';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
import { emitToRoom, emitToUser, safeEmit } from '../../shared/lib/socket-events';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import * as channelRepo from './chat.repository';
import * as commentRepo from '../comment/comment.repository';
import * as repo from './chat.message.repository';

export async function listMessages(
  prisma: PrismaClient,
  userId: string,
  channelId: string,
  query: ListChatMessagesQuery,
) {
  const channel = await channelRepo.findUnique(prisma, channelId);
  if (!channel || channel.deletedAt) throw new NotFoundError('Channel not found');
  await assertMembership(channel.workspaceId, userId);

  const decoded = query.cursor ? decodeCursor(query.cursor) : null;

  const rawItems = await prisma.chatMessage.findMany({
    where: { channelId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(decoded ? { skip: 1, cursor: { id: decoded.id, createdAt: decoded.createdAt } } : {}),
    include: {
      author: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  const hasMore = rawItems.length > query.limit;
  const data = hasMore ? rawItems.slice(0, query.limit) : rawItems;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { data: data.reverse(), nextCursor };
}

export async function sendMessage(
  prisma: PrismaClient,
  userId: string,
  channelId: string,
  body: CreateChatMessageInput,
) {
  const channel = await channelRepo.findUnique(prisma, channelId);
  if (!channel || channel.deletedAt) throw new NotFoundError('Channel not found');
  await assertMembership(channel.workspaceId, userId);

  const requestedMentions = body.mentionedUserIds.filter((id) => id !== userId);
  let mentionedUserIds: string[] = [];
  if (requestedMentions.length > 0) {
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: channel.workspaceId,
        userId: { in: requestedMentions },
      },
      select: { userId: true },
    });
    mentionedUserIds = members.map((m) => m.userId);
  }

  const recipientIds = mentionedUserIds;

  const { message } = await prisma.$transaction(async (tx) => {
    let msg;
    try {
      msg = await repo.create(tx, {
        channelId,
        authorId: userId,
        content: body.content,
        mentionedUserIds,
        clientMessageId: body.clientMessageId,
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'P2002' &&
        body.clientMessageId
      ) {
        const existing = await repo.findByAuthorAndClientMessageId(
          tx,
          userId,
          body.clientMessageId,
        );
        if (existing) {
          return { message: existing };
        }
      }
      throw err;
    }

    if (recipientIds.length > 0) {
      await commentRepo.createManyNotifications(
        tx,
        recipientIds.map((rid) => ({
          userId: rid,
          type: 'COMMENT_REPLY' as const,
          title: `You were mentioned in #${channel.name}`,
          body: body.content.slice(0, 200),
          data: {
            channelId,
            messageId: msg.id,
            workspaceId: channel.workspaceId,
            authorId: userId,
          },
        })),
      );
    }

    return { message: msg };
  });

  if (recipientIds.length > 0) {
    const notifications = await repo.findNotificationsForMessage(
      prisma,
      message.id,
    );
    for (const notif of notifications) {
      safeEmit(() => emitToUser(notif.userId, 'notification:new', { notification: notif }), {
        event: 'notification:new',
        notificationId: notif.id,
        userId: notif.userId,
      });
    }
  }

  safeEmit(
    () =>
      emitToRoom('/collab', `conversation:${channelId}`, 'message:new', {
        channelId,
        message: {
          id: message.id,
          channelId: message.channelId,
          authorId: message.authorId,
          content: message.content,
          mentionedUserIds: message.mentionedUserIds,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
          editedAt: null,
          author: {
            id: message.author.id,
            name: message.author.name,
            avatarUrl: message.author.avatarUrl,
          },
        },
      }),
    { event: 'message:new', channelId },
  );

  safeEmit(
    () =>
      emitToUser(userId, 'message:new', {
        channelId,
        message: {
          id: message.id,
          channelId: message.channelId,
          authorId: message.authorId,
          content: message.content,
          mentionedUserIds: message.mentionedUserIds,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
          editedAt: null,
          author: {
            id: message.author.id,
            name: message.author.name,
            avatarUrl: message.author.avatarUrl,
          },
        },
      }),
    { event: 'message:new', channelId },
  );

  return message;
}

export async function updateMessage(
  prisma: PrismaClient,
  userId: string,
  channelId: string,
  messageId: string,
  body: UpdateChatMessageInput,
) {
  const channel = await channelRepo.findUnique(prisma, channelId);
  if (!channel || channel.deletedAt) throw new NotFoundError('Channel not found');
  await assertMembership(channel.workspaceId, userId);

  const existing = await repo.findUnique(prisma, messageId);
  if (!existing || existing.deletedAt || existing.channelId !== channelId) {
    throw new NotFoundError('Message not found');
  }
  if (existing.authorId !== userId) {
    throw new BadRequestError('Cannot edit others messages');
  }

  const message = await repo.updateContent(prisma, messageId, body.content);

  safeEmit(
    () =>
      emitToRoom('/collab', `conversation:${channelId}`, 'message:updated', {
        channelId,
        message: {
          id: message.id,
          channelId: message.channelId,
          authorId: message.authorId,
          content: message.content,
          mentionedUserIds: message.mentionedUserIds,
          createdAt: message.createdAt.toISOString(),
          updatedAt: message.updatedAt.toISOString(),
          editedAt: message.updatedAt.toISOString(),
          author: {
            id: message.author.id,
            name: message.author.name,
            avatarUrl: message.author.avatarUrl,
          },
        },
      }),
    { event: 'message:updated', channelId, messageId },
  );

  return message;
}

export async function deleteMessage(
  prisma: PrismaClient,
  userId: string,
  channelId: string,
  messageId: string,
) {
  const channel = await channelRepo.findUnique(prisma, channelId);
  if (!channel || channel.deletedAt) throw new NotFoundError('Channel not found');
  await assertMembership(channel.workspaceId, userId);

  const existing = await repo.findUnique(prisma, messageId);
  if (!existing || existing.deletedAt || existing.channelId !== channelId) {
    throw new NotFoundError('Message not found');
  }
  if (existing.authorId !== userId) {
    throw new BadRequestError('Cannot delete others messages');
  }

  await repo.softDelete(prisma, messageId);

  safeEmit(
    () =>
      emitToRoom('/collab', `conversation:${channelId}`, 'message:deleted', {
        channelId,
        messageId,
      }),
    { event: 'message:deleted', channelId, messageId },
  );
}
