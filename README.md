# FlowDesk

Self-hosted, AI-augmented task management. Kanban + list view, real-time collaboration, comments, mentions, and OpenAI-compatible AI features (assignment suggestions, auto-scheduling).

## Tech stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend**: Hono + Node.js + TypeScript
- **DB / cache**: PostgreSQL 16 + Redis 7
- **ORM**: Prisma
- **Realtime**: Socket.IO (Redis adapter)
- **Auth**: JWT in httpOnly cookie (bcrypt + Google OAuth)
- **AI**: OpenAI-compatible (custom `baseUrl` + `model`)
- **Deployment**: single `docker compose up`

## Quick start (Docker)

```bash
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET, LLM_API_KEY
docker compose up -d
# Web: http://localhost:5173
# API: http://localhost:3000
```

Seed demo data:

```bash
docker compose exec api pnpm --filter @flow-desk/api db:seed
```

Login: `demo@flow-desk.app` / `demo1234`

## Local dev (without Docker)

```bash
# Start postgres + redis locally, then:
cp .env.example .env
pnpm install
pnpm --filter @flow-desk/shared build
pnpm --filter @flow-desk/api db:generate
pnpm --filter @flow-desk/api db:migrate
pnpm --filter @flow-desk/api db:seed
pnpm dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:3000>

## Repo layout

```
apps/web/        # React + Vite
apps/api/        # Hono + Prisma
packages/shared/ # Zod schemas + types
prisma/          # schema.prisma + seed.ts
docker/          # Dockerfiles + nginx config
PRD.md           # Product requirements
ADR-*.md         # Architecture decisions
TASKS.md         # Sprint backlog
ACCEPTANCE.md    # Testable acceptance criteria
RISKS.md         # Risk register
AGENTS.md        # Agent operating instructions
```

## License

MIT
