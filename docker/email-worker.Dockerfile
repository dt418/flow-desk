FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app
ENV NODE_OPTIONS="--max-old-space-size=4096"

# --- Shared package build ---
FROM base AS shared
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared packages/shared
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @flow-desk/shared build

# --- Env package build ---
FROM base AS env-build
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY packages/env packages/env
RUN pnpm install --no-frozen-lockfile

# --- Prisma generate ---
FROM base AS db-build
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY packages/db packages/env packages/env
RUN pnpm install --no-frozen-lockfile
ENV DATABASE_URL=postgresql://flowdesk:flowdesk@postgres:5432/flowdesk?schema=public
RUN pnpm --filter @flowdesk/db db:generate

# --- Build ---
FROM base AS worker-build
RUN apk add --no-cache openssl
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY --from=shared /app/packages/shared packages/shared
COPY --from=env-build /app/packages/env packages/env
COPY --from=db-build /app/packages/db packages/db
COPY apps/api/package.json apps/web/package.json packages/shared/package.json packages/env/package.json packages/db/package.json ./
RUN pnpm install --no-frozen-lockfile
COPY apps/api apps/api
COPY prisma.config.ts ./
ENV DATABASE_URL=postgresql://flowdesk:flowdesk@postgres:5432/flowdesk?schema=public
RUN pnpm --filter @flow-desk/api build

# --- Runtime ---
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY --from=worker-build /app/node_modules node_modules
COPY --from=worker-build /app/apps/api/dist apps/api/dist
COPY --from=worker-build /app/packages/shared packages/shared
COPY --from=worker-build /app/packages/env packages/env
COPY --from=worker-build /app/packages/db packages/db
COPY --from=worker-build /app/prisma.config.ts ./
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node apps/api/dist/workers/email/email-worker.js"]
