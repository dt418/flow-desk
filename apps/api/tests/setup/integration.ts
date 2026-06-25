import { beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestPrisma, resetTestDb, migrateTestDb, TEST_DB_URL } from './db';
import type { PrismaClient } from '../../../../packages/db/generated/client';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.NODE_ENV = 'test';

let prisma: PrismaClient | null = null;
let migrationDone = false;

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    if (!migrationDone) {
      throw new Error(
        'getTestPrisma() called before beforeAll completed. Move prisma access inside it/beforeEach/test bodies.',
      );
    }
    prisma = createTestPrisma();
  }
  return prisma;
}

beforeAll(async () => {
  await migrateTestDb();
  migrationDone = true;
  prisma = createTestPrisma();
});

afterAll(async () => {
  await prisma?.$disconnect();
  prisma = null;
  migrationDone = false;
});

beforeEach(async () => {
  if (!prisma) prisma = createTestPrisma();
  await resetTestDb(prisma);
});
