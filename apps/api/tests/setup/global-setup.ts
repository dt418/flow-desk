import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// Run once before all integration test files. Applies pending migrations
// idempotently (no drop). Per-file TRUNCATE in resetTestDb keeps tests
// isolated without racing against a destructive schema reset.
const WORKSPACE_ROOT = resolve(__dirname, '../../../..');

function detectDbPort(): number {
  const envPort = process.env.TEST_DB_PORT;
  if (envPort) return parseInt(envPort, 10);
  try {
    execSync('pg_isready -h 127.0.0.1 -p 5432 -t 2', { stdio: 'ignore' });
    return 5432;
  } catch {
    // not on 5432
  }
  try {
    const out = execSync(
      'docker inspect flow-desk-postgres-1 --format "{{json .HostConfig.PortBindings}}"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    )
      .toString()
      .trim();
    const bindings = JSON.parse(out);
    return parseInt(bindings['5432/tcp']?.[0]?.HostPort ?? '5432', 10);
  } catch {
    return 5432;
  }
}

const DB_PORT = detectDbPort();
const TEST_DB_URL =
  process.env.TEST_DB_URL ??
  `postgresql://flowdesk:postgres@localhost:${DB_PORT}/flowdesk_test?schema=public`;

export async function setup() {
  // migrate reset (drop + recreate + migrate) runs ONCE before all
  // integration test files. This replaces the per-file beforeAll reset
  // that raced when multiple files' vitest workers hit the DB while
  // another was mid-reset. The schema only needs to be current once;
  // per-test isolation is provided by resetTestDb's TRUNCATE.
  // reset (not deploy) because it creates the flowdesk_test database
  // if missing and applies the tsvector GENERATED column migrations
  // that db push can't express.
  execSync('pnpm exec prisma migrate reset --force', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    cwd: WORKSPACE_ROOT,
    stdio: 'inherit',
  });
}
