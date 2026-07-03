import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../packages/db/generated/client';
import { softDeleteExtension } from '../../src/shared/lib/prisma-extension';

function detectDbPort(): number {
  const envPort = process.env.TEST_DB_PORT;
  if (envPort) return parseInt(envPort, 10);

  // Check if postgres is listening on 5432 (native or Docker)
  try {
    execSync('pg_isready -h 127.0.0.1 -p 5432 -t 2', { stdio: 'ignore' });
    return 5432;
  } catch {
    // not on 5432
  }

  // Try Docker container port binding
  try {
    const out = execSync(
      'docker inspect flow-desk-postgres-1 --format "{{json .HostConfig.PortBindings}}"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    ).trim();
    const bindings = JSON.parse(out);
    return parseInt(bindings['5432/tcp']?.[0]?.HostPort ?? '5432', 10);
  } catch {
    return 5432;
  }
}

const DB_PORT = detectDbPort();

export const TEST_DB_URL =
  process.env.TEST_DB_URL ??
  `postgresql://flowdesk:postgres@localhost:${DB_PORT}/flowdesk_test?schema=public`;
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

export async function migrateTestDb() {
  const { execSync } = await import('node:child_process');
  execSync('pnpm exec prisma db push', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    cwd: WORKSPACE_ROOT,
    stdio: 'inherit',
  });
}
