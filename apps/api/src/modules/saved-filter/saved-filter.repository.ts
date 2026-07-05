import { prisma } from '../../shared/lib/prisma';
import type { Prisma } from '@flowdesk/db';
import type { SavedFilterQuery } from '@flow-desk/shared/saved-filter';

type PrismaClient = typeof prisma;

export interface SavedFilterRow {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  query: Prisma.JsonValue;
  isShared: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateInput {
  userId: string;
  workspaceId: string;
  name: string;
  query: SavedFilterQuery;
  isShared: boolean;
}

export interface UpdateInput {
  name?: string;
  query?: SavedFilterQuery;
  isShared?: boolean;
}

// All queries go through the softDeleteExtension (SavedFilter is in
// SOFT_DELETE_MODELS) — no manual deletedAt IS NULL filter needed.
export async function listOwned(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<SavedFilterRow[]> {
  return prisma.savedFilter.findMany({
    where: { userId, workspaceId },
    orderBy: { createdAt: 'asc' },
  });
}

// Visible = owned by user OR shared by anyone in the workspace.
export async function listVisible(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<SavedFilterRow[]> {
  return prisma.savedFilter.findMany({
    where: {
      workspaceId,
      OR: [{ userId }, { isShared: true }],
    },
    orderBy: [{ isShared: 'asc' }, { name: 'asc' }],
  });
}

export async function findOwnedById(
  prisma: PrismaClient,
  id: string,
  userId: string,
): Promise<SavedFilterRow | null> {
  return prisma.savedFilter.findFirst({
    where: { id, userId },
  });
}

export async function findById(
  prisma: PrismaClient,
  id: string,
): Promise<SavedFilterRow | null> {
  return prisma.savedFilter.findUnique({ where: { id } });
}

export async function create(prisma: PrismaClient, input: CreateInput): Promise<SavedFilterRow> {
  return prisma.savedFilter.create({ data: input });
}

export async function update(
  prisma: PrismaClient,
  id: string,
  input: UpdateInput,
): Promise<SavedFilterRow> {
  return prisma.savedFilter.update({ where: { id }, data: input });
}

export async function softDelete(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.savedFilter.update({ where: { id }, data: { deletedAt: new Date() } });
}
