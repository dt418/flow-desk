import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { CreateChannelInput, UpdateChannelInput } from '@flow-desk/shared/chat';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/errors';
import { assertMembership } from '../../shared/lib/access';
import { emitToRoom } from '../../shared/lib/socket-events';
import * as repo from './chat.repository';

export async function listChannels(prisma: PrismaClient, userId: string, workspaceId: string) {
  await assertMembership(workspaceId, userId);
  const channels = await repo.findByWorkspace(prisma, workspaceId, userId);
  return channels.map((ch) => ({
    id: ch.id,
    workspaceId: ch.workspaceId,
    scope: ch.scope,
    taskId: ch.taskId,
    name: ch.name,
    description: ch.description,
    isPrivate: ch.isPrivate,
    createdAt: ch.createdAt.toISOString(),
    updatedAt: ch.updatedAt.toISOString(),
    latestMessage: ch.messages[0]
      ? {
          id: ch.messages[0].id,
          authorId: ch.messages[0].authorId,
          authorName: ch.messages[0].author?.name ?? null,
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
    scope: channel.scope,
    taskId: channel.taskId,
    name: channel.name,
    description: channel.description,
    isPrivate: channel.isPrivate,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    latestMessage: channel.messages[0]
      ? {
          id: channel.messages[0].id,
          authorId: channel.messages[0].authorId,
          authorName: channel.messages[0].author?.name ?? null,
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

  // ponytail: Bug #1 — was dropping body.scope/body.taskId. Task channels
  // could only be created via getOrCreateTaskChannel. Pass through the
  // values from the schema so REST POST can create either workspace or
  // task channels.
  //
  // Private channels: creator is added as ChatChannelMember; only members
  // can list/join/send after create.
  const isPrivate = body.isPrivate === true;
  let channel;
  try {
    channel = await repo.create(prisma, {
      workspaceId,
      name: body.name,
      description: body.description ?? null,
      isPrivate,
      scope: body.scope,
      taskId: body.taskId ?? null,
    });
  } catch (err: unknown) {
    // Bug #6 — partial unique index on (workspaceId, name) WHERE deletedAt
    // IS NULL translates to Prisma P2002. Surface as 409 instead of 500.
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002') {
      throw new ConflictError('A channel with this name already exists');
    }
    throw err;
  }
  if (isPrivate) {
    await repo.addChannelMember(prisma, channel.id, userId);
  }
  const result = {
    id: channel.id,
    workspaceId: channel.workspaceId,
    scope: channel.scope,
    taskId: channel.taskId,
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

  let channel;
  try {
    channel = await repo.update(prisma, channelId, {
      name: body.name,
      description: body.description,
      ...(body.isPrivate !== undefined ? { isPrivate: body.isPrivate } : {}),
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002') {
      throw new ConflictError('A channel with this name already exists');
    }
    throw err;
  }
  // Public → private: ensure updater is a channel member so they are not locked out.
  if (body.isPrivate === true) {
    await repo.addChannelMember(prisma, channelId, userId);
  }
  const result = {
    id: channel.id,
    workspaceId: channel.workspaceId,
    scope: channel.scope,
    taskId: channel.taskId,
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

export async function listChannelMembers(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
) {
  const channel = await repo.findAndValidateChannel(prisma, userId, workspaceId, channelId);
  if (!channel.isPrivate) {
    return [];
  }
  const rows = await repo.listChannelMembers(prisma, channelId);
  return rows.map((r) => ({
    userId: r.userId,
    name: r.user.name,
    email: r.user.email,
    avatarUrl: r.user.avatarUrl,
    joinedAt: r.createdAt.toISOString(),
  }));
}

export async function addChannelMember(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
  targetUserId: string,
) {
  const channel = await repo.findAndValidateChannel(prisma, userId, workspaceId, channelId);
  if (!channel.isPrivate) {
    throw new BadRequestError('Channel is not private');
  }
  // Target must be a workspace member.
  await assertMembership(workspaceId, targetUserId);
  await repo.addChannelMember(prisma, channelId, targetUserId);
  return { ok: true as const, channelId, userId: targetUserId };
}

export async function removeChannelMember(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
  targetUserId: string,
) {
  const channel = await repo.findAndValidateChannel(prisma, userId, workspaceId, channelId);
  if (!channel.isPrivate) {
    throw new BadRequestError('Channel is not private');
  }
  const count = await repo.countChannelMembers(prisma, channelId);
  if (count <= 1 && targetUserId === userId) {
    throw new BadRequestError('Cannot remove the last channel member');
  }
  if (count <= 1) {
    throw new BadRequestError('Cannot remove the last channel member');
  }
  // Only existing members may remove others (already validated via findAndValidateChannel).
  await repo.removeChannelMember(prisma, channelId, targetUserId);
  return { ok: true as const };
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
  userId: string,
  workspaceId: string,
  taskId: string,
) {
  await assertMembership(workspaceId, userId);

  // Bind task to workspace so callers cannot attach arbitrary task ids.
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!task) {
    throw new NotFoundError('Task not found');
  }

  const existing = await repo.findByScopeAndTask(prisma, workspaceId, taskId);
  if (existing) return existing;
  try {
    return await repo.create(prisma, {
      workspaceId,
      name: `task-${taskId}`,
      scope: 'TASK',
      taskId,
      isPrivate: false,
    });
  } catch (err: unknown) {
    // Bug #7 — concurrent calls for the same task both passed the
    // findFirst check. The unique index on (workspaceId, name) makes the
    // second insert fail with P2002. Re-read and return the row that
    // the winner just inserted.
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002') {
      const winner = await repo.findByScopeAndTask(prisma, workspaceId, taskId);
      if (winner) return winner;
    }
    throw err;
  }
}
