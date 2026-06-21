FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
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
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY --from=deps /app/node_modules node_modules
COPY --from=shared /app/packages/shared packages/shared
COPY apps/api apps/api
COPY prisma prisma
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @flow-desk/api prisma generate
RUN pnpm --filter @flow-desk/api build

FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY --from=api-build /app/node_modules node_modules
COPY --from=api-build /app/apps/api/dist apps/api/dist
COPY --from=api-build /app/apps/api/package.json apps/api/
COPY --from=api-build /app/packages/shared packages/shared
COPY --from=api-build /app/prisma prisma
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @flow-desk/api prisma migrate deploy && node apps/api/dist/index.js"]
