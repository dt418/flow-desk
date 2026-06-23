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

FROM base AS web-build
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY --from=deps /app/node_modules node_modules
COPY --from=shared /app/packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @flow-desk/web build

FROM nginx:1.27-alpine AS runtime
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY docker/web.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
