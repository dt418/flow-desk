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

# --- Web build ---
FROM base AS web-build
COPY .npmrc ./
COPY pnpm-workspace.yaml package.json ./
COPY --from=shared /app/packages/shared packages/shared
COPY --from=env-build /app/packages/env packages/env
COPY apps/web/package.json packages/shared/package.json packages/env/package.json ./
RUN pnpm install --no-frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @flow-desk/web build

# --- Runtime ---
FROM nginx:1.27-alpine AS runtime
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY docker/web.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
