import { beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestPrisma, resetTestDb, TEST_DB_URL } from './db';
import { redis } from '../../src/shared/lib/redis';
import type { PrismaClient } from '../../../../packages/db/generated/client';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';

let prisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    // Schema is migrated by globalSetup (tests/setup/global-setup.ts) once
    // before all files. Per-file beforeAll just creates the prisma client.
    prisma = createTestPrisma();
  }
  return prisma;
}

beforeAll(async () => {
  prisma = createTestPrisma();
});

afterAll(async () => {
  await prisma?.$disconnect();
  prisma = null;
});

beforeEach(async () => {
  if (!prisma) prisma = createTestPrisma();
  await redis.flushdb();
  await resetTestDb(prisma);
});
