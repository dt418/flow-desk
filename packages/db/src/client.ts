import { PrismaClient } from '../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

/** Parse PG_POOL_MAX (positive int). Invalid/empty → undefined (pg default). */
export function resolvePgPoolMax(
  raw: string | undefined = process.env.PG_POOL_MAX,
): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) return undefined;
  return n;
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (process.env.NODE_ENV !== 'production' && globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const poolConfig: { connectionString: string; max?: number } = {
    connectionString: databaseUrl,
  };
  const max = resolvePgPoolMax();
  if (max !== undefined) {
    poolConfig.max = max;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(poolConfig),
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
