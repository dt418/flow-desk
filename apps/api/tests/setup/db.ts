import { PrismaClient } from '@prisma/client';

export const TEST_DB_URL = 'postgresql://flowdesk:flowdesk@localhost:5432/flowdesk_test?schema=public';

export function createTestPrisma() {
  return new PrismaClient({ datasourceUrl: TEST_DB_URL });
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

export async function migrateTestDb() {
  const { execSync } = await import('node:child_process');
  execSync('pnpm exec prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}
