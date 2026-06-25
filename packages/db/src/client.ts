import { PrismaClient } from '../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (process.env.NODE_ENV !== 'production' && globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
  }

  return prisma;
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    throw new Error('Prisma not initialized. Call createPrismaClient first.');
  }
  return globalForPrisma.prisma;
}
