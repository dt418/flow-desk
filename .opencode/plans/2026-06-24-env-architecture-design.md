# Environment Architecture - FlowDesk

## Status

**Phase**: Design Draft v3
**Date**: 2026-06-24
**Owner**: th\*\*
**PRDs**: None

---

## Context

FlowDesk has 3 environment management issues:

1. **`env.ts` inline** — validation only in `apps/api`, not shareable
2. **Prisma at root** — doesn't follow `packages/db` convention
3. **Frontend doesn't validate VITE\_\*** — type-safe but not runtime-safe

Goal: Extract into `packages/env` and `packages/db`, validate both backend and frontend.

---

## Design Principles

1. **packages/env: validation-only** — Zod schemas + parse only, NO dotenv loading
2. **App owns dotenv** — `apps/api` calls `dotenv/config`, package only parses
3. **No singleton cache** — Validation runs once at startup
4. **Prisma client in package** — `packages/db/generated/`, apps import factory
5. **App owns env** — No `.env` or `.env.example` in packages
6. **Prisma 7** — uses `prisma-client` generator + `PrismaPg` adapter

---

## packages/env Responsibilities

**MUST:**

- Define Zod schemas
- Parse environment variables
- Export inferred types

**MUST NOT:**

- Call `dotenv.config()`
- Read .env files
- Cache environment variables
- Decide environment file locations

---

## Proposed Architecture

### 1. packages/env

```
packages/env/
├── src/
│   ├── backend.ts    # Zod schema + parse function
│   ├── frontend.ts   # Zod schema + parse function
│   ├── shared.ts     # NODE_ENV (shared by both)
│   └── index.ts      # Barrel exports
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

#### shared.ts (NODE_ENV)

```typescript
import { z } from 'zod';

export const sharedSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type SharedEnv = z.infer<typeof sharedSchema>;

export function parseSharedEnv(env: Record<string, string | undefined>): SharedEnv {
  return sharedSchema.parse(env);
}
```

#### backend.ts

```typescript
import { z } from 'zod';

export const backendSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim())),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  LLM_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_API_KEY: z.string().default('sk-placeholder'),
  LLM_MODEL: z.string().default('gpt-4o-mini'),
  LLM_MAX_TOKENS: z.coerce.number().int().min(1).default(2048),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  UPLOAD_DIR: z.string().default('/data/attachments'),
  MAX_UPLOAD_SIZE: z.coerce
    .number()
    .int()
    .default(25 * 1024 * 1024),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SKIP_RATE_LIMIT: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

export type BackendEnv = z.infer<typeof backendSchema>;

export function parseBackendEnv(env: Record<string, string | undefined>): BackendEnv {
  return backendSchema.parse(env);
}
```

#### frontend.ts

```typescript
import { z } from 'zod';

export const frontendSchema = z.object({
  VITE_API_URL: z.string().url().default('http://localhost:3000'),
  VITE_APP_NAME: z.string().default('FlowDesk'),
  VITE_STRIPE_PUBLIC_KEY: z.string().optional(),
});

export type FrontendEnv = z.infer<typeof frontendSchema>;

export function parseFrontendEnv(env: Record<string, unknown>): FrontendEnv {
  return frontendSchema.parse(env);
}
```

#### index.ts

```typescript
export { backendSchema, parseBackendEnv } from './backend';
export type { BackendEnv } from './backend';

export { frontendSchema, parseFrontendEnv } from './frontend';
export type { FrontendEnv } from './frontend';

export { sharedSchema, parseSharedEnv } from './shared';
export type { SharedEnv } from './shared';
```

### 2. packages/db

```
packages/db/
├── prisma/
│   └── schema.prisma          # Moved from root prisma/
├── generated/                # Prisma client output (inside package)
├── src/
│   ├── index.ts              # PrismaClient factory exports
│   ├── client.ts             # PrismaClient factory (receives DATABASE_URL)
│   ├── prisma-extension.ts   # Soft-delete extension (moved from api)
│   └── index-test.ts         # Test helper
├── prisma.config.ts          # Moved from root
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
└── .gitignore               # (no .env here)
```

#### prisma/schema.prisma (Prisma 7)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated"
}

datasource db {
  provider = "postgresql"
}
```

**Prisma 7 Notes:**

- Uses `prisma-client` generator (not `prisma-client-js`)
- Uses `@prisma/adapter-pg` for PostgreSQL connection
- Client output: `packages/db/generated/`
- Soft-delete extension in `packages/db/src/prisma-extension.ts`

#### packages/db/src/client.ts (Prisma 7 Factory)

```typescript
import { PrismaClient } from '../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

export function createPrismaClient(databaseUrl: string) {
  // Return existing instance in non-production
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
```

#### packages/db/src/index.ts

```typescript
export * from './client';
export * from './prisma-extension';
```

**Note**: Applications import factory, never import generated client directly.

### 3. apps/api

Dotenv loading at startup:

```typescript
// apps/api/src/index.ts
import 'dotenv/config';

import { parseBackendEnv } from '@flowdesk/env';
import { createPrismaClient } from '@flowdesk/db';

export const env = parseBackendEnv(process.env);

createPrismaClient(env.DATABASE_URL);

const app = new Hono();
app.listen({ port: env.PORT });
```

### 4. apps/web

Frontend validation with `import.meta.env`:

```typescript
// apps/web/src/lib/env.ts
import { parseFrontendEnv } from '@flowdesk/env';

export const env = parseFrontendEnv(import.meta.env);
```

Vite automatically loads `VITE_*` vars into `import.meta.env`.

---

## Docker Strategy

### Build-time vs Runtime Separation

| Type       | Vars                     | Method                      | Example             |
| ---------- | ------------------------ | --------------------------- | ------------------- |
| Build-time | VITE\_\*                 | `build args`                | `VITE_API_URL`      |
| Runtime    | DATABASE_URL, JWT_SECRET | `env_file` or `environment` | All backend secrets |

### Backend Runtime (api service)

```yaml
api:
  env_file:
    - path: .env
      required: true
```

Runtime vars loaded from `.env`:

```env
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
CORS_ORIGINS=
LLM_API_KEY=
```

### Frontend Build-time (web service)

```dockerfile
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
```

```yaml
web:
  build:
    context: .
    dockerfile: docker/web.Dockerfile
    args:
      VITE_API_URL: ${VITE_API_URL:-http://localhost:3000}
```

VITE\_\* vars are baked into the frontend bundle at build time.

### docker/api.Dockerfile

```dockerfile
# Generate Prisma client from packages/db/schema
RUN pnpm exec prisma generate --schema=../packages/db/prisma/schema.prisma

# Copy output to api (or reference from packages/db)
```

**Key Rule**: Backend secrets are runtime variables. VITE\_\* variables are build-time variables.

---

## Turbo Configuration

#### turbo.json

```json
{
  "globalDependencies": ["packages/db/prisma/schema.prisma", "packages/db/prisma.config.ts"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build", "^db:generate"],
      "env": ["VITE_API_URL", "VITE_APP_NAME", "VITE_STRIPE_PUBLIC_KEY"],
      "outputs": ["dist/**", ".vite/**"]
    },
    "db:generate": {
      "cache": false,
      "inputs": ["packages/db/prisma/**/*.prisma"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

**Notes:**

- `.env` NOT in `globalDependencies` — avoids invalidating entire monorepo cache on local .env changes
- `VITE_*` in task `env` ensures web rebuilds when these vars change
- `db:generate` depends on schema changes

---

## .gitignore

```
.env
.env.local
.env.*.local

apps/api/.env
apps/web/.env

packages/db/.env
packages/env/.env
```

**No** `.env.example` in packages.

---

## Migration Phases

### Phase 0: Baseline Verification (REQUIRED)

Before any changes, capture current working state:

```bash
pnpm build
pnpm test
docker compose build
docker compose up -d
```

After each phase, run:

```bash
pnpm build
pnpm test
```

This makes regression detection significantly easier.

---

### Phase 1: Create packages/env

1. Create `packages/env/` directory
2. Write `package.json`, `tsconfig.json`
3. Split schema from `apps/api/src/shared/lib/env.ts` → `backend.ts`, `frontend.ts`, `shared.ts`
4. Write `index.ts` barrel exports
5. Test: `pnpm --filter @flowdesk/env typecheck`

### Phase 2: Create packages/db

1. Create `packages/db/` directory
2. Move `prisma/` from root → `packages/db/prisma/`
3. Update `generator client output` → `../generated`
4. Move `prisma-extension.ts` → `packages/db/src/`
5. Update `prisma.config.ts` path references
6. Test: `pnpm --filter @flowdesk/db db:generate`

### Phase 3: Migrate apps/api

1. Remove `apps/api/src/shared/lib/env.ts`
2. Add `dotenv/config` at top of `apps/api/src/index.ts`
3. Update `apps/api/src/shared/lib/prisma.ts` to use `@flowdesk/db`
4. Update imports in all modules
5. Remove `prisma/.env` (if exists)
6. Update `docker/api.Dockerfile` prisma generate path
7. Test: `pnpm --filter @flow-desk/api typecheck && pnpm --filter @flow-desk/api build`

### Phase 4: Migrate apps/web

1. Add `@flowdesk/env` as dependency
2. Create `apps/web/src/lib/env.ts` with `parseFrontendEnv(import.meta.env)`
3. Update imports where needed
4. Test: `pnpm --filter @flow-desk/web build`

### Phase 5: Cleanup

1. Remove root `prisma/` (moved)
2. Update `.gitignore`
3. Update `docker-compose.yml` if volume paths changed
4. Update `AGENTS.md` if needed
5. Run full verification: `docker compose build && docker compose up -d && pnpm test`

---

## Non-Goals

- Do not change how Docker loads env (env_file still works)
- Do not add new schema validation fields (keep existing fields)
- Do not refactor Prisma queries
- Do not generate `env.d.ts` (use Zod runtime validation)

---

## Risks

| Risk                                 | Likelihood | Impact | Mitigation                         |
| ------------------------------------ | ---------- | ------ | ---------------------------------- |
| Breaking API imports                 | High       | High   | Test each module after migration   |
| Docker build fails on new paths      | Medium     | High   | Update Dockerfile paths in Phase 3 |
| Circular dependency (env → db → env) | Low        | High   | env does not import db             |
| VITE\_\* not in turbo cache          | Low        | Medium | Add to task env array              |

---

## Verification

```bash
# Phase 1
pnpm --filter @flowdesk/env typecheck

# Phase 2
pnpm --filter @flowdesk/db db:generate
pnpm --filter @flowdesk/db typecheck

# Phase 3
pnpm --filter @flow-desk/api typecheck
pnpm --filter @flow-desk/api build

# Phase 4
pnpm --filter @flow-desk/web build

# Full stack
docker compose build
docker compose up -d
pnpm test
```
