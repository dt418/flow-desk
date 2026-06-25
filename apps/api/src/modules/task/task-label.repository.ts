import { Prisma } from '../../../generated/prisma/client';
import { prisma } from '../../shared/lib/prisma';

export const taskLabelRepo = {
  async listForTask(taskId: string) {
    return prisma.taskLabelAssignment.findMany({
      where: { taskId, deletedAt: null },
      include: { label: true },
      orderBy: { createdAt: 'asc' },
    });
  },

  async assign(taskId: string, labelId: string) {
    return prisma.taskLabelAssignment.upsert({
      where: { taskId_labelId: { taskId, labelId } },
      create: { taskId, labelId },
      update: { deletedAt: null },
    });
  },

  async unassign(taskId: string, labelId: string) {
    return prisma.taskLabelAssignment.update({
      where: { taskId_labelId: { taskId, labelId } },
      data: { deletedAt: new Date() },
    });
  },

  async listForTasks(taskIds: string[], tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    return client.taskLabelAssignment.findMany({
      where: { taskId: { in: taskIds }, deletedAt: null },
      include: { label: true },
    });
  },
};
