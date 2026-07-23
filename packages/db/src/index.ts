export { createPrismaClient, getPrisma, resolvePgPoolMax } from './client';
export { softDeleteExtension, SOFT_DELETE_MODEL_NAMES } from './prisma-extension';
export type { PrismaClient } from '../generated/client';
export * from '../generated/client';
