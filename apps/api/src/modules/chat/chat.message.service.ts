import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { CreateChatMessageInput, UpdateChatMessageInput, ListChatMessagesQuery } from './chat.message.schema';
import { BadRequestError, NotFoundError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
import { emitToRoom } from '../../shared/lib/socket-events';
import { logger } from '../../shared/lib/logger';
import { decodeCursor, encodeCursor } from '@flow-desk/shared/pagination';
import * as channelRepo from './chat.repository';
import * as repo from './chat.message.repository';

function safeEmit(fn: () => void, ctx: Record<string, unknown>): void {
  try {
    fn();
  } catch (err) {
    logger.warn({ err, ...ctx }, 'socket emit failed');
  }
}

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

  const message = await repo.create(prisma, {
    channelId,
    authorId: userId,
    content: body.content,
    mentionedUserIds: body.mentionedUserIds,
  });

  safeEmit(
    () => emitToRoom('/collab', `workspace:${channel.workspaceId}`, 'message:new', {
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
          email: message.author.email,
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
    () => emitToRoom('/collab', `workspace:${channel.workspaceId}`, 'message:updated', {
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
          email: message.author.email,
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
    () => emitToRoom('/collab', `workspace:${channel.workspaceId}`, 'message:deleted', {
      channelId,
      messageId,
    }),
    { event: 'message:deleted', channelId, messageId },
  );
}
