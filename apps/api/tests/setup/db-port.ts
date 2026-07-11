import { execSync } from 'node:child_process';

// FlowDesk docker postgres credentials. Mirror docker-compose.yml.
const FLOWDESK_TEST_USER = 'flowdesk';
const FLOWDESK_TEST_PASSWORD = 'postgres';

function tryPostgresAuth(host: string, port: number): boolean {
  // pg_isready only confirms the TCP port is open — it does not prove the
  // listener accepts the FlowDesk user/password. Use a real auth probe so
  // a stray postgres on 5432 (with different credentials) does not get
  // picked over our docker container on a different host port.
  try {
    execSync(
      `PGCONNECT_TIMEOUT=2 PGPASSWORD=${FLOWDESK_TEST_PASSWORD} psql -h ${host} -p ${port} -U ${FLOWDESK_TEST_USER} -d postgres -tAc "SELECT 1" >/dev/null 2>&1`,
      { stdio: 'ignore', shell: '/bin/bash' },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the host port for the FlowDesk test database.
 *
 * Priority:
 *   1. TEST_DB_PORT env var (explicit override)
 *   2. 127.0.0.1:5432 if it accepts the FlowDesk credentials
 *   3. flow-desk-postgres-1 docker container's published host port
 *   4. 5432 (will fail loudly — explicit fallback)
 */
export function detectDbPort(): number {
  const envPort = process.env.TEST_DB_PORT;
  if (envPort) return parseInt(envPort, 10);
  if (tryPostgresAuth('127.0.0.1', 5432)) return 5432;
  try {
    const out = execSync(
      'docker inspect flow-desk-postgres-1 --format "{{json .HostConfig.PortBindings}}"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
    ).trim();
    const bindings = JSON.parse(out);
    const port = parseInt(bindings['5432/tcp']?.[0]?.HostPort ?? '5432', 10);
    if (tryPostgresAuth('127.0.0.1', port)) return port;
  } catch {
    // docker not available; fall through
  }
  return 5432;
}

export function buildTestDbUrl(port: number = detectDbPort()): string {
  return `postgresql://${FLOWDESK_TEST_USER}:${FLOWDESK_TEST_PASSWORD}@localhost:${port}/flowdesk_test?schema=public`;
}
