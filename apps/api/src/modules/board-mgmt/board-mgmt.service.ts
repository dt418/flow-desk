import { prisma } from '../../shared/lib/prisma';
import { assertMembership, assertRole } from '../../shared/lib/access';
import { NotFoundError, BadRequestError } from '../../shared/errors';

function serialize(b: {
  id: string;
  workspaceId: string;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: b.id,
    workspaceId: b.workspaceId,
    name: b.name,
    position: b.position,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    deletedAt: b.deletedAt?.toISOString() ?? null,
  };
}

export const boardMgmtService = {
  async list(userId: string, workspaceId: string) {
    await assertMembership(workspaceId, userId);
    let rows = await prisma.board.findMany({
      where: { workspaceId },
      orderBy: { position: 'asc' },
    });
    // Ensure at least one default board
    if (rows.length === 0) {
      const created = await prisma.board.create({
        data: { workspaceId, name: 'Main', position: 0 },
      });
      rows = [created];
    }
    return rows.map(serialize);
  },

  async create(userId: string, workspaceId: string, name: string) {
    await assertRole(workspaceId, userId, ['OWNER', 'ADMIN', 'MEMBER']);
    if (!name.trim()) throw new BadRequestError('name required');
    const max = await prisma.board.aggregate({
      where: { workspaceId, deletedAt: null },
      _max: { position: true },
    });
    const row = await prisma.board.create({
      data: {
        workspaceId,
        name: name.trim(),
        position: (max._max.position ?? -1) + 1,
      },
    });
    return serialize(row);
  },

  async remove(userId: string, id: string) {
    const row = await prisma.board.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw new NotFoundError('Board');
    await assertRole(row.workspaceId, userId, ['OWNER', 'ADMIN']);
    const count = await prisma.board.count({
      where: { workspaceId: row.workspaceId, deletedAt: null },
    });
    if (count <= 1) throw new BadRequestError('Cannot delete the last board');
    await prisma.board.update({ where: { id }, data: { deletedAt: new Date() } });
    await prisma.task.updateMany({ where: { boardId: id }, data: { boardId: null } });
  },
};
