import type { prisma } from '../../shared/lib/prisma';
type PrismaClient = typeof prisma;
import type { CreateLabelInput, UpdateLabelInput } from '@flow-desk/shared';
import { NotFoundError } from '../../shared/errors';
import { ErrorCode, withCode } from '../../shared/errors/codes';
import * as repo from './label.repository';
import { assertMembership, assertRole } from '../../shared/lib/access';
import { emitToWorkspace } from '../../shared/lib/socket-events';
import { clearWorkspaceLabelsCache } from './label.cache';

const LABEL_LIMIT_PER_WORKSPACE = 100;

async function assertOwnerOrAdmin(prisma: PrismaClient, wid: string, userId: string) {
  return assertRole(wid, userId, ['OWNER', 'ADMIN']);
}

export async function createLabel(
  prisma: PrismaClient,
  userId: string,
  wid: string,
  input: CreateLabelInput,
) {
  await assertOwnerOrAdmin(prisma, wid, userId);
  const count = await repo.countByWorkspace(prisma, wid);
  if (count >= LABEL_LIMIT_PER_WORKSPACE) {
    throw withCode(400, ErrorCode.LABEL_LIMIT_REACHED, 'Workspace label limit reached', {
      limit: LABEL_LIMIT_PER_WORKSPACE,
    });
  }
  const existing = await prisma.taskLabel.findUnique({
    where: { workspaceId_name: { workspaceId: wid, name: input.name } },
  });
  if (existing) throw withCode(409, ErrorCode.LABEL_NAME_TAKEN, 'Label name already taken');
  const label = await repo.createLabel(prisma, {
    workspaceId: wid,
    name: input.name,
    color: input.color,
  });
  emitToWorkspace(wid, 'label:created', { label });
  return label;
}

export async function listLabels(prisma: PrismaClient, userId: string, wid: string) {
  await assertMembership(wid, userId);
  return repo.findByWorkspace(prisma, wid);
}

export async function updateLabel(
  prisma: PrismaClient,
  userId: string,
  wid: string,
  labelId: string,
  input: UpdateLabelInput,
) {
  await assertOwnerOrAdmin(prisma, wid, userId);
  const existing = await repo.findById(prisma, labelId);
  if (!existing || existing.workspaceId !== wid) throw new NotFoundError('Label not found');
  if (existing.deletedAt) throw new NotFoundError('Label not found');
  if (input.name && input.name !== existing.name) {
    const dup = await prisma.taskLabel.findUnique({
      where: { workspaceId_name: { workspaceId: wid, name: input.name } },
    });
    if (dup) throw withCode(409, ErrorCode.LABEL_NAME_TAKEN, 'Label name already taken');
  }
  const updated = await repo.update(prisma, labelId, input);
  emitToWorkspace(wid, 'label:updated', { label: updated });
  await clearWorkspaceLabelsCache(wid);
  return updated;
}

export async function deleteLabel(
  prisma: PrismaClient,
  userId: string,
  wid: string,
  labelId: string,
) {
  await assertOwnerOrAdmin(prisma, wid, userId);
  const existing = await repo.findById(prisma, labelId);
  if (!existing || existing.workspaceId !== wid) throw new NotFoundError('Label not found');
  const inUse = await repo.countAssignments(prisma, labelId);
  if (inUse > 0) {
    throw withCode(409, ErrorCode.LABEL_IN_USE, 'Label is in use by tasks', { assignments: inUse });
  }
  await repo.deleteLabel(prisma, labelId);
  emitToWorkspace(wid, 'label:deleted', { labelId });
  await clearWorkspaceLabelsCache(wid);
}

export async function assignToTask(
  prisma: PrismaClient,
  userId: string,
  taskId: string,
  labelIds: string[],
) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    include: { column: { select: { workspaceId: true } } },
  });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.column.workspaceId, userId);

  if (labelIds.length === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.taskLabelAssignment.deleteMany({ where: { taskId } });
      await tx.task.update({ where: { id: taskId }, data: { labelsDeprecated: [] } });
    });
    emitToWorkspace(task.column.workspaceId, 'task:labels-changed', { taskId, labelIds: [] });
    return { taskId, labelIds: [] };
  }

  const labels = await repo.findManyByIds(prisma, labelIds);
  if (labels.length !== labelIds.length) throw new NotFoundError('One or more labels not found');
  const crossWs = labels.find((l) => l.workspaceId !== task.column.workspaceId);
  if (crossWs) {
    throw withCode(
      400,
      ErrorCode.TASK_LABEL_CROSS_WORKSPACE,
      'Labels must belong to the same workspace as the task',
      {
        crossWorkspaceLabelId: crossWs.id,
      },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.taskLabelAssignment.deleteMany({ where: { taskId } });
    if (labelIds.length > 0) {
      await tx.taskLabelAssignment.createMany({
        data: labelIds.map((lid) => ({ taskId, labelId: lid })),
      });
    }
    await tx.task.update({
      where: { id: taskId },
      data: { labelsDeprecated: labels.map((l) => l.name) },
    });
  });

  emitToWorkspace(task.column.workspaceId, 'task:labels-changed', { taskId, labelIds });
  return { taskId, labelIds };
}

export async function getTaskLabels(prisma: PrismaClient, userId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, deletedAt: null },
    select: { column: { select: { workspaceId: true } } },
  });
  if (!task) throw new NotFoundError('Task not found');
  await assertMembership(task.column.workspaceId, userId);
  const assignments = await prisma.taskLabelAssignment.findMany({
    where: { taskId, deletedAt: null },
    include: { label: true },
    orderBy: { label: { name: 'asc' } },
  });
  return assignments.map((a) => a.label);
}
