import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildTestDbUrl, detectDbPort } from './db-port';

// Run once before all integration test files. Applies pending migrations
// idempotently (no drop). Per-file TRUNCATE in resetTestDb keeps tests
// isolated without racing against a destructive schema reset.
const WORKSPACE_ROOT = resolve(__dirname, '../../../..');

const DB_PORT = detectDbPort();
const TEST_DB_URL = process.env.TEST_DB_URL ?? buildTestDbUrl(DB_PORT);

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
