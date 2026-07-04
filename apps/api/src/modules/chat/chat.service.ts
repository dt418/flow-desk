import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { CreateChannelInput, UpdateChannelInput } from './chat.schema';
import { NotFoundError, ConflictError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
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
  await assertMembership(workspaceId, userId);
  const channel = await repo.findUniqueRaw(prisma, channelId);
  if (!channel || channel.deletedAt || channel.workspaceId !== workspaceId) {
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
  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    isPrivate: channel.isPrivate,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    latestMessage: null,
  };
}

export async function updateChannel(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
  body: UpdateChannelInput,
) {
  await assertMembership(workspaceId, userId);
  const existing = await repo.findUnique(prisma, channelId);
  if (!existing || existing.deletedAt || existing.workspaceId !== workspaceId) {
    throw new NotFoundError('Channel not found');
  }

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
  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    description: channel.description,
    isPrivate: channel.isPrivate,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    latestMessage: null,
  };
}

export async function deleteChannel(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
) {
  await assertMembership(workspaceId, userId);
  const existing = await repo.findUnique(prisma, channelId);
  if (!existing || existing.deletedAt || existing.workspaceId !== workspaceId) {
    throw new NotFoundError('Channel not found');
  }
  await repo.softDelete(prisma, channelId);
}
