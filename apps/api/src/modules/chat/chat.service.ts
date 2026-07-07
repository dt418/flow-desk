import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { CreateChannelInput, UpdateChannelInput } from '@flow-desk/shared/chat';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
import { emitToRoom } from '../../shared/lib/socket-events';
import * as repo from './chat.repository';

export async function listChannels(prisma: PrismaClient, userId: string, workspaceId: string) {
  await assertMembership(workspaceId, userId);
  const channels = await repo.findByWorkspace(prisma, workspaceId);
  return channels.map((ch) => ({
    id: ch.id,
    workspaceId: ch.workspaceId,
    name: ch.name,
    description: ch.description,
    isPrivate: ch.isPrivate,
    createdAt: ch.createdAt.toISOString(),
    updatedAt: ch.updatedAt.toISOString(),
    latestMessage: ch.messages[0]
      ? {
          id: ch.messages[0].id,
          authorId: ch.messages[0].authorId,
          content: ch.messages[0].content,
          createdAt: ch.messages[0].createdAt.toISOString(),
        }
      : null,
  }));
}

export async function getChannel(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
) {
  await repo.findAndValidateChannel(prisma, userId, workspaceId, channelId);
  const channel = await repo.findUniqueRaw(prisma, channelId);
  if (!channel) {
    throw new NotFoundError('Channel not found');
  }
  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    isPrivate: channel.isPrivate,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    latestMessage: channel.messages[0]
      ? {
          id: channel.messages[0].id,
          authorId: channel.messages[0].authorId,
          content: channel.messages[0].content,
          createdAt: channel.messages[0].createdAt.toISOString(),
        }
      : null,
  };
}

export async function createChannel(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  body: CreateChannelInput,
) {
  await assertMembership(workspaceId, userId);

  const channel = await repo.create(prisma, {
    workspaceId,
    name: body.name,
    description: body.description ?? null,
    isPrivate: body.isPrivate,
  });
  const result = {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    isPrivate: channel.isPrivate,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    latestMessage: null,
  };
  emitToRoom('/collab', `workspace:${workspaceId}`, 'conversation:updated', {
    type: 'created',
    channel: result,
  });
  return result;
}

export async function updateChannel(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
  body: UpdateChannelInput,
) {
  const existing = await repo.findAndValidateChannel(prisma, userId, workspaceId, channelId);

  if (body.name && body.name !== existing.name) {
    const dup = await prisma.chatChannel.findFirst({
      where: { workspaceId, name: body.name, deletedAt: null, id: { not: channelId } },
    });
    if (dup) throw new ConflictError('A channel with this name already exists');
  }

  const channel = await repo.update(prisma, channelId, {
    name: body.name,
    description: body.description,
    isPrivate: body.isPrivate,
  });
  const result = {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    isPrivate: channel.isPrivate,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    latestMessage: null,
  };
  emitToRoom('/collab', `workspace:${workspaceId}`, 'conversation:updated', {
    type: 'updated',
    channel: result,
  });
  return result;
}

export async function deleteChannel(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
) {
  await repo.findAndValidateChannel(prisma, userId, workspaceId, channelId);
  await repo.softDelete(prisma, channelId);
  emitToRoom('/collab', `workspace:${workspaceId}`, 'conversation:updated', {
    type: 'deleted',
    channelId,
  });
}

export async function getOrCreateTaskChannel(
  prisma: PrismaClient,
  workspaceId: string,
  taskId: string,
) {
  const existing = await repo.findByScopeAndTask(prisma, workspaceId, taskId);
  if (existing) return existing;
  return repo.create(prisma, {
    workspaceId,
    name: `task-${taskId}`,
    scope: 'TASK',
    taskId,
    isPrivate: false,
  });
}
