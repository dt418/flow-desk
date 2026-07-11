import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type {
  CreateChatMessageInput,
  UpdateChatMessageInput,
  ListChatMessagesQuery,
} from '@flow-desk/shared/chat';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { logger } from '../../shared/lib/logger';
import { emitToRoom, emitToUser } from '../../shared/lib/socket-events';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import * as channelRepo from './chat.repository';
import * as commentRepo from '../comment/comment.repository';
import * as repo from './chat.message.repository';

export async function listMessages(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
  query: ListChatMessagesQuery,
) {
  await channelRepo.findAndValidateChannel(prisma, userId, workspaceId, channelId);

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
  workspaceId: string,
  channelId: string,
  body: CreateChatMessageInput,
) {
  const channel = await channelRepo.findAndValidateChannel(prisma, userId, workspaceId, channelId);

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

  // ponytail: pre-check for an existing dedupe key outside the transaction
  // so the P2002 path doesn't leave an aborted tx. The unique index is
  // still the source of truth for the race window between this read and
  // the create below — caught and retried.
  if (body.clientMessageId) {
    const prior = await repo.findByAuthorAndClientMessageId(prisma, userId, body.clientMessageId);
    if (prior) {
      // Idempotent retry — return the existing message without re-broadcasting.
      return prior;
    }
  }

  let message;
  try {
    // Create the message and the mention notifications atomically. The
    // notification insert is in the same tx as the message so a partial
    // failure (e.g. P2002 on the unique clientMessageId) rolls back both
    // and we recover via the catch below.
    message = await prisma.$transaction(async (tx) => {
      const msg = await repo.create(tx, {
        channelId,
        authorId: userId,
        content: body.content,
        mentionedUserIds,
        clientMessageId: body.clientMessageId,
      });
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
      return msg;
    });
  } catch (err: unknown) {
    // Race: another request inserted the same (authorId, clientMessageId)
    // between our pre-check and create. Return that row.
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code: string }).code === 'P2002' &&
      body.clientMessageId
    ) {
      const existing = await repo.findByAuthorAndClientMessageId(
        prisma,
        userId,
        body.clientMessageId,
      );
      if (existing) return existing;
    }
    throw err;
  }

  if (recipientIds.length > 0) {
    const notifications = await repo.findNotificationsForMessage(prisma, message.id);
    for (const notif of notifications) {
      try {
        emitToUser(notif.userId, 'notification:new', { notification: notif });
      } catch (e) {
        logger.warn({ err: e }, 'failed to emit notification:new');
      }
    }
  }

  // Broadcast is the caller's responsibility so the socket handler can
  // exclude the sender (who gets the message via the ack) and the REST
  // route can include all viewers. Emitting here hit the author twice
  // (broadcast + ack) and the dedup race was the source of duplicate
  // message bubbles. See Bug #2.
  return message;
}

export async function updateMessage(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
  body: UpdateChatMessageInput,
) {
  await channelRepo.findAndValidateChannel(prisma, userId, workspaceId, channelId);

  const existing = await repo.findUnique(prisma, messageId);
  if (!existing || existing.deletedAt || existing.channelId !== channelId) {
    throw new NotFoundError('Message not found');
  }
  if (existing.authorId !== userId) {
    throw new BadRequestError('Cannot edit others messages');
  }

  const message = await repo.updateContent(prisma, messageId, body.content);

  try {
    emitToRoom('/collab', `conversation:${channelId}`, 'message:updated', {
      channelId,
      message: {
        id: message.id,
        channelId: message.channelId,
        authorId: message.authorId,
        content: message.content,
        mentionedUserIds: message.mentionedUserIds,
        clientMessageId: message.clientMessageId,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt.toISOString(),
        editedAt: message.updatedAt.toISOString(),
        author: {
          id: message.author.id,
          name: message.author.name,
          email: message.author.email,
          avatarUrl: message.author.avatarUrl,
        },
      },
    });
  } catch (e) {
    logger.warn({ err: e }, 'failed to emit message:updated');
  }

  return message;
}

export async function deleteMessage(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
  messageId: string,
) {
  await channelRepo.findAndValidateChannel(prisma, userId, workspaceId, channelId);

  const existing = await repo.findUnique(prisma, messageId);
  if (!existing || existing.deletedAt || existing.channelId !== channelId) {
    throw new NotFoundError('Message not found');
  }
  if (existing.authorId !== userId) {
    throw new BadRequestError('Cannot delete others messages');
  }

  await repo.softDelete(prisma, messageId);

  try {
    emitToRoom('/collab', `conversation:${channelId}`, 'message:deleted', {
      channelId,
      messageId,
    });
  } catch (e) {
    logger.warn({ err: e }, 'failed to emit message:deleted');
  }
}

export async function markRead(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
  upToMessageId: string,
) {
  await channelRepo.findAndValidateChannel(prisma, userId, workspaceId, channelId);

  const existing = await prisma.chatMessageRead.findUnique({
    where: { userId_messageId: { userId, messageId: upToMessageId } },
  });

  const readAt = new Date();

  if (!existing) {
    try {
      await prisma.chatMessageRead.create({
        data: { userId, channelId, messageId: upToMessageId, readAt },
      });
    } catch (err) {
      // FK violation: the messageId doesn't exist (e.g. a stale optimistic
      // id leaked from the client, or a hard-deleted message). The receipt
      // is best-effort — skip the DB row and still broadcast so the UI can
      // update if it has the message locally.
      logger.warn(
        { err, userId, channelId, messageId: upToMessageId },
        'markRead: create failed, broadcasting receipt anyway',
      );
    }
  }

  try {
    emitToRoom('/collab', `conversation:${channelId}`, 'message:read', {
      userId,
      channelId,
      messageId: upToMessageId,
      readAt: readAt.toISOString(),
    });
  } catch (e) {
    logger.warn({ err: e }, 'failed to emit message:read');
  }
}
