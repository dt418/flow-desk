import type { prisma } from '../../shared/lib/prisma';
import type { Prisma } from '@flowdesk/db';
type PrismaClient = typeof prisma;
import { NotFoundError, ForbiddenError } from '../../shared/errors';

type ChannelWithLatest = Omit<
  Prisma.ChatChannelGetPayload<{
    include: {
      messages: {
        select: {
          id: true;
          authorId: true;
          content: true;
          createdAt: true;
          author: { select: { name: true } };
        };
      };
    };
  }>,
  'messages'
> & {
  messages: Array<{
    id: string;
    authorId: string;
    content: string;
    createdAt: Date;
    author: { name: string | null };
  }>;
};

export async function findAndValidateChannel(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  channelId: string,
) {
  const channel = await prisma.chatChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.deletedAt || channel.workspaceId !== workspaceId) {
    throw new NotFoundError('Channel not found');
  }
  // Always require workspace membership — public channels are still tenant-scoped.
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) {
    throw new ForbiddenError('Not a workspace member');
  }
  // Private channels: require explicit channel membership.
  if (channel.isPrivate) {
    const channelMember = await prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!channelMember) {
      throw new ForbiddenError('Not a channel member');
    }
  }
  return channel;
}

export async function findByWorkspace(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<ChannelWithLatest[]> {
  const channels = await prisma.chatChannel.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      OR: [{ isPrivate: false }, { members: { some: { userId } } }],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (channels.length === 0) {
    return channels.map((ch) => ({ ...ch, messages: [] }));
  }
  const channelIds = channels.map((c) => c.id);
  const latest = await prisma.$queryRaw<
    Array<{
      channelId: string;
      id: string;
      authorId: string;
      content: string;
      createdAt: Date;
    }>
  >`
    SELECT DISTINCT ON ("channelId") "channelId", "id", "authorId", "content", "createdAt"
    FROM "ChatMessage"
    WHERE "channelId" = ANY(${channelIds}::text[])
      AND "deletedAt" IS NULL
    ORDER BY "channelId", "createdAt" DESC
  `;
  const authorIds = Array.from(new Set(latest.map((m) => m.authorId)));
  const authors =
    authorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true },
        })
      : [];
  const authorById = new Map<string, string | null>(authors.map((a) => [a.id, a.name]));
  const latestByChannel = new Map(
    latest.map((m) => [
      m.channelId,
      {
        id: m.id,
        authorId: m.authorId,
        author: { name: authorById.has(m.authorId) ? (authorById.get(m.authorId) ?? null) : null },
        content: m.content,
        createdAt: m.createdAt,
      },
    ]),
  );
  return channels.map((ch) => ({
    ...ch,
    messages: latestByChannel.has(ch.id) ? [latestByChannel.get(ch.id)!] : [],
  }));
}

export function findUnique(prisma: PrismaClient, id: string) {
  return prisma.chatChannel.findUnique({ where: { id } });
}

export function findUniqueRaw(prisma: PrismaClient, id: string) {
  return prisma.chatChannel.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          authorId: true,
          content: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      },
    },
  });
}

export function create(
  prisma: PrismaClient,
  data: {
    workspaceId: string;
    name: string;
    description?: string | null;
    isPrivate: boolean;
    scope?: string;
    taskId?: string | null;
  },
) {
  return prisma.chatChannel.create({ data });
}

export function addChannelMember(prisma: PrismaClient, channelId: string, userId: string) {
  return prisma.chatChannelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId },
    update: {},
  });
}

export function removeChannelMember(prisma: PrismaClient, channelId: string, userId: string) {
  return prisma.chatChannelMember.deleteMany({ where: { channelId, userId } });
}

export function listChannelMembers(prisma: PrismaClient, channelId: string) {
  return prisma.chatChannelMember.findMany({
    where: { channelId },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export function countChannelMembers(prisma: PrismaClient, channelId: string) {
  return prisma.chatChannelMember.count({ where: { channelId } });
}

export function findByScopeAndTask(prisma: PrismaClient, workspaceId: string, taskId: string) {
  return prisma.chatChannel.findFirst({
    where: { workspaceId, scope: 'TASK', taskId, deletedAt: null },
  });
}

export function update(
  prisma: PrismaClient,
  id: string,
  data: {
    name?: string;
    description?: string | null;
    isPrivate?: boolean;
  },
) {
  return prisma.chatChannel.update({ where: { id }, data });
}

export function softDelete(prisma: PrismaClient, id: string) {
  return prisma.chatChannel.update({ where: { id }, data: { deletedAt: new Date() } });
}
