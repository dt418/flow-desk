import { createPrismaClient, softDeleteExtension } from '@flowdesk/db';
import { parseBackendEnv } from '@flowdesk/env';

export const env = parseBackendEnv(process.env);

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createPrismaClient> };

const basePrisma =
  globalForPrisma.prisma ??
  createPrismaClient(env.DATABASE_URL);

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

export const prisma = basePrisma.$extends(softDeleteExtension);
export { basePrisma };
