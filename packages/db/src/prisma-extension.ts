import { Prisma } from '../../generated/client';

const SOFT_DELETE_MODELS = new Set<string>([
  'User',
  'Workspace',
  'Task',
  'TaskLabel',
  'TaskLabelAssignment',
  'Comment',
]);

type ReadArgs = { where?: Record<string, unknown> };

function injectDeletedAtNull<T extends ReadArgs>(args: T, model: string | undefined): T {
  if (!model || !SOFT_DELETE_MODELS.has(model)) return args;
  if (args.where && Object.prototype.hasOwnProperty.call(args.where, 'deletedAt')) return args;
  return { ...args, where: { ...(args.where ?? {}), deletedAt: null } };
}

export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
      async findFirst({ model, args, query }) {
        return query(injectDeletedAtNull(args ?? {}, model));
      },
      async findMany({ model, args, query }) {
        return query(injectDeletedAtNull(args ?? {}, model));
      },
      async count({ model, args, query }) {
        return query(injectDeletedAtNull(args ?? {}, model));
      },
      async aggregate({ model, args, query }) {
        return query(injectDeletedAtNull(args ?? {}, model));
      },
      async groupBy({ model, args, query }) {
        return query(injectDeletedAtNull(args ?? {}, model));
      },
    },
  },
});

export const SOFT_DELETE_MODEL_NAMES = [...SOFT_DELETE_MODELS];
