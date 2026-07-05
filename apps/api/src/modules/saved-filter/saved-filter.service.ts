import type { prisma } from '../../shared/lib/prisma';
import type {
  CreateSavedFilterInput,
  UpdateSavedFilterInput,
  SavedFilterQuery,
} from '@flow-desk/shared/saved-filter';
import { assertMembership } from '../../shared/lib/access';
import { NotFoundError, ConflictError } from '../../shared/errors';
import * as repo from './saved-filter.repository';

type PrismaClient = typeof prisma;

function toResult(row: Awaited<ReturnType<typeof repo.create>>) {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    name: row.name,
    query: row.query as SavedFilterQuery,
    isShared: row.isShared,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function list(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
) {
  await assertMembership(workspaceId, userId);
  const rows = await repo.listVisible(prisma, userId, workspaceId);
  return { data: rows.map(toResult) };
}

export async function create(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  input: CreateSavedFilterInput,
) {
  await assertMembership(workspaceId, userId);
  // Name uniqueness per (workspaceId, userId) — partial unique index covers
  // soft-deleted rows, so a conflict here means an active filter owns the name.
  const existing = await prisma.savedFilter.findFirst({
    where: { workspaceId, userId, name: input.name },
  });
  if (existing) {
    throw new ConflictError(`A saved filter named "${input.name}" already exists`);
  }
  const row = await repo.create(prisma, {
    userId,
    workspaceId,
    name: input.name,
    query: input.query,
    isShared: input.isShared,
  });
  return toResult(row);
}

export async function update(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  filterId: string,
  input: UpdateSavedFilterInput,
) {
  await assertMembership(workspaceId, userId);
  const owned = await repo.findOwnedById(prisma, filterId, userId);
  if (!owned || owned.workspaceId !== workspaceId) {
    throw new NotFoundError('Saved filter not found');
  }
  // If renaming, check the new name isn't taken by another active filter.
  if (input.name && input.name !== owned.name) {
    const clash = await prisma.savedFilter.findFirst({
      where: { workspaceId, userId, name: input.name, NOT: { id: filterId } },
    });
    if (clash) {
      throw new ConflictError(`A saved filter named "${input.name}" already exists`);
    }
  }
  const row = await repo.update(prisma, filterId, {
    name: input.name,
    query: input.query,
    isShared: input.isShared,
  });
  return toResult(row);
}

export async function remove(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
  filterId: string,
) {
  await assertMembership(workspaceId, userId);
  const owned = await repo.findOwnedById(prisma, filterId, userId);
  if (!owned || owned.workspaceId !== workspaceId) {
    throw new NotFoundError('Saved filter not found');
  }
  await repo.softDelete(prisma, filterId);
  return { ok: true };
}

export const savedFilterService = { list, create, update, remove };
