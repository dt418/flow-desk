# FlowDesk — Deploy runbook

Self-host checklist for **single-node** demos and **careful production**. Code paths assume Docker Compose (`docker-compose.yml`) unless noted.

## 1. Secrets (required)

Generate strong values **before** first `docker compose up`:

```bash
# JWT (min 32 chars, high entropy — placeholder and low-alphabet secrets rejected in production)
openssl rand -hex 32

# Prometheus scrape token (min 16 chars) — required for GET /metrics in production
openssl rand -hex 16

# Postgres
openssl rand -hex 16
```

| Variable            | Required in production     | Notes                                                           |
| ------------------- | -------------------------- | --------------------------------------------------------------- |
| `JWT_SECRET`        | **Yes**                    | Compose fails without it; rejects default / low-entropy secrets |
| `LLM_API_KEY`       | **Yes**                    | Compose fails without a real key (placeholders rejected by env) |
| `POSTGRES_PASSWORD` | **Yes**                    | Compose fails without it                                        |
| `METRICS_TOKEN`     | **Strongly yes**           | Without it, `GET /metrics` returns **503** in production        |
| `SENTRY_DSN`        | Recommended                | Unhandled errors not reported if empty (warn at boot)           |
| `APP_URL`           | Yes for email/OAuth        | Public URL used in links                                        |
| `CORS_ORIGINS`      | Yes if custom domain       | Comma-separated; include web origin                             |
| `REDIS_PASSWORD`    | Recommended for multi-host | See Redis AUTH below                                            |

Never commit `.env`. Rotate any secret that appeared in chat, CI logs, or a public repo.

## 2. Single-node topology (default)

```
[browser] → web (nginx:80) → api:3000
                api ──► postgres:5432
                api ──► redis:6379
         email-worker ──► postgres + redis (+ SMTP/Resend)
```

```bash
cp .env.example .env
# set JWT_SECRET, LLM_API_KEY, POSTGRES_PASSWORD, METRICS_TOKEN, APP_URL, CORS_ORIGINS
pnpm stack:up-build
pnpm db:seed   # optional demo user
```

Health:

| Endpoint          | Meaning                                |
| ----------------- | -------------------------------------- |
| `GET /api/health` | Process up                             |
| `GET /api/ready`  | Postgres + Redis answering             |
| `GET /metrics`    | Prometheus text; bearer when token set |

## 3. Observability

### Metrics

- **Production + no `METRICS_TOKEN`:** `/metrics` → **503** `METRICS_DISABLED` (not world-readable).
- **With `METRICS_TOKEN`:** scrape with  
  `Authorization: Bearer <METRICS_TOKEN>`.
- **Development / test:** open when token unset (convenient local scrape).

### Sentry

Set `SENTRY_DSN` so the API reports unhandled errors (`@sentry/node`). Optional locally; recommended for any shared deploy.

## 4. Redis AUTH (optional)

1. Set `REDIS_PASSWORD` in `.env`.
2. Set  
   `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379`  
   (same password for api + email-worker via compose `REDIS_URL`).
3. Compose redis service enables `--requirepass` when `REDIS_PASSWORD` is non-empty.

Without a password, Redis is bound to `127.0.0.1` on the host — acceptable only for single-host trusted networks.

## 5. Postgres pool & scale (R-14)

**Single replica API:** default Prisma/pg adapter is fine.

**Multiple API replicas:**

1. Put **PgBouncer** (transaction mode) in front of Postgres — not bundled by default.
2. Point `DATABASE_URL` at PgBouncer.
3. Cap pool per process, e.g.  
   `?schema=public&connection_limit=5`  
   so `replicas × connection_limit` stays under Postgres `max_connections`.
4. Keep **one** email-worker replica unless you have partitioned queues.

Socket.IO already uses the Redis adapter for multi-instance fan-out.

## 6. Backups

Compose mounts `postgres_data` and `attachments_data` volumes. Operators own backups.

Example nightly dump (host cron):

```bash
docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-flowdesk}" "${POSTGRES_DB:-flowdesk}" \
  | gzip > "flowdesk-$(date +%F).sql.gz"
```

Also back up the attachments volume (`docker volume inspect flow-desk_attachments_data`) if users upload files.

Test restore on a staging stack before relying on backups.

## 7. Email worker

- Healthcheck probes Redis TCP from the worker container.
- Configure `EMAIL_PROVIDER` + SMTP or Resend secrets; otherwise jobs fail after queue.
- Logs: `pnpm stack:logs` / `docker compose logs -f email-worker`.

## 8. Pre-flight checklist

- [ ] `JWT_SECRET` from `openssl rand -hex 32` (not the example string)
- [ ] `LLM_API_KEY` real; stack boots without env schema errors
- [ ] `POSTGRES_PASSWORD` strong; ports not exposed publicly if avoidable
- [ ] `METRICS_TOKEN` set; Prometheus uses bearer auth
- [ ] `SENTRY_DSN` set for shared deploys
- [ ] `APP_URL` + `CORS_ORIGINS` match public web origin
- [ ] `GET /api/ready` → 200 after start
- [ ] Backup cron documented and tested once
- [ ] OAuth secrets only if using Google/GitHub/Slack/GitLab

## 9. Related docs

- Root [README.md](../README.md) — quick start
- [DEV.md](./DEV.md) — local development
- [AGENTS.md](../AGENTS.md) — engineering gates (`pnpm verify`)

---
