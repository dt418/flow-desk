import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../packages/db/generated/client';
import { softDeleteExtension } from '@flowdesk/db';
import { buildTestDbUrl, detectDbPort } from './db-port';

const DB_PORT = detectDbPort();

export const TEST_DB_URL = process.env.TEST_DB_URL ?? buildTestDbUrl(DB_PORT);
const WORKSPACE_ROOT = resolve(__dirname, '../../../..');

export function createTestPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DB_URL }),
  }).$extends(softDeleteExtension);
}

export async function resetTestDb(prisma: PrismaClient) {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
      const tables = await tx.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\\_%'
      `;
      for (const { tablename } of tables) {
        await tx.$executeRawUnsafe(`DELETE FROM "${tablename}"`);
      }
      await tx.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
    },
    { timeout: 30000 },
  );
}
