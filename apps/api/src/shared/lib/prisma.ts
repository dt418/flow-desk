import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { softDeleteExtension } from './prisma-extension';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

export const prisma = basePrisma.$extends(softDeleteExtension);
export { basePrisma };
