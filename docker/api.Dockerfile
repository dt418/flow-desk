FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
WORKDIR /app

FROM base AS deps
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --no-frozen-lockfile

FROM base AS shared
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared packages/shared
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @flow-desk/shared build

FROM base AS env-build
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY packages/env packages/env
RUN pnpm install --no-frozen-lockfile

FROM base AS db-build
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY packages/db packages/db
COPY packages/env packages/env
RUN pnpm install --no-frozen-lockfile
ENV DATABASE_URL=postgresql://flowdesk:flowdesk@postgres:5432/flowdesk?schema=public
RUN pnpm --filter @flowdesk/db db:generate

FROM base AS api-build
RUN apk add --no-cache openssl
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY --from=shared /app/packages/shared packages/shared
COPY --from=env-build /app/packages/env packages/env
COPY --from=db-build /app/packages/db packages/db
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/api apps/api
COPY prisma.config.ts ./
ENV DATABASE_URL=postgresql://flowdesk:flowdesk@postgres:5432/flowdesk?schema=public
RUN pnpm --filter @flow-desk/api build

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY --from=api-build /app/node_modules node_modules
COPY --from=api-build /app/apps/api/dist apps/api/dist
COPY --from=api-build /app/packages/shared packages/shared
COPY --from=api-build /app/packages/env packages/env
COPY --from=api-build /app/packages/db packages/db
COPY --from=api-build /app/prisma.config.ts ./
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node apps/api/dist/index.js"]
