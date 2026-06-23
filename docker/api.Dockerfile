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

FROM base AS api-build
RUN apk add --no-cache openssl
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY --from=shared /app/packages/shared packages/shared
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --no-frozen-lockfile
COPY apps/api apps/api
COPY prisma prisma
COPY prisma.config.ts ./
# Prisma 7 reads prisma.config.ts from CWD; run from workspace root.
# prisma.config.ts references DATABASE_URL via env(), so we set a dummy
# placeholder for the generate step — runtime migration uses real value.
ENV DATABASE_URL=postgresql://flowdesk:flowdesk@postgres:5432/flowdesk?schema=public
RUN pnpm exec prisma generate
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
COPY --from=api-build /app/apps/api/generated apps/api/generated
COPY --from=api-build /app/apps/api/package.json apps/api/
COPY --from=api-build /app/packages/shared packages/shared
COPY --from=api-build /app/prisma prisma
COPY --from=api-build /app/prisma.config.ts ./
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node apps/api/dist/index.js"]
