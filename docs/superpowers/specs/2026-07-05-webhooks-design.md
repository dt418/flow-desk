# Design — P1-4 Outgoing Webhooks

**Date**: 2026-07-05
**Status**: pending-approval
**Scope**: 1 bounded feature, single plan (~1d)
**Roadmap source**: ROADMAP.md §Phase 1 P1-4 (priority 87)
**Brainstorming**: 5-question grill, all locks recorded below
**Dependencies**: shipped `TaskActivity` event stream (activity-log feature, commit `db9615a`), F7 BullMQ email infra (shipped)

## Problem

FlowDesk records a `TaskActivity` row on every task mutation (16 `ActivityAction` values: CREATED, TITLE_CHANGED, STATUS_CHANGED, …, LABEL_REMOVED) but has no way to push those events to external systems. ROADMAP P1-4 calls for workspace-scoped outgoing webhooks: register a URL + secret + event filter, receive HMAC-signed POSTs on matching activity, with a delivery log for retry + audit.

## Locked decisions (from brainstorming)

### D1 — Worker topology: reuse `email-worker` container

Webhook delivery runs as a second BullMQ worker in the existing `email-worker` container process. Separate `webhook` Redis queue (independent concurrency/retry config), same Redis connection, same shutdown handler (one new `worker.close()` call). No new docker service, no new tsup entry, no new Dockerfile.

Why: both are outbound delivery workers with identical lifecycle. Failure isolation at the queue level (BullMQ), not the process level — sufficient for P1-4's audience (D: portfolio + small-team). Forward-compat: splitting out a `webhook-worker` container later is a one-line docker-compose + tsup entry addition.

### D2 — Emission mechanism: `record()` enqueues directly

`activityService.record()` is the single choke point (9 call sites across task.service + comment.service). Extend it to (1) write the `TaskActivity` row (existing), (2) fetch `workspaceId` via `prisma.task.findUnique({where:{id:taskId}, select:{workspaceId:true}})` — one extra cheap query, zero call-site changes, (3) look up active webhooks for that workspace whose `events` array includes the `action`, (4) enqueue one `WebhookDeliveryJob { webhookId, activityId }` per matching webhook onto the `webhook` queue.

`record()` is already fire-and-forget (catches errors, returns null). Webhook enqueue failure doesn't roll back the activity row — best-effort, not transactional. Correct: a slow webhook endpoint shouldn't block the task mutation.

### D3 — Delivery semantics + HMAC

- **Queue `defaultJobOptions`:** `attempts: 5`, `backoff: { type: 'exponential', delay: 2000 }` (2s → 4s → 8s → 16s → 32s; ~62s span). More attempts than email's 3 because webhook endpoints are flakier than SMTP.
- **Worker:** `concurrency: 3`, `limiter: { max: 30, duration: 60_000 }` — 30 deliveries/min, conservative to avoid hammering slow endpoints.
- **Per-request timeout:** 10s via `AbortController`. `AbortError` → throw → BullMQ retry.
- **HMAC header:** `X-FlowDesk-Signature: sha256=<hex>` — HMAC-SHA256 of raw JSON body using `Webhook.secret` as key, hex-encoded, `sha256=` prefix (GitHub/Stripe convention).
- **Additional headers:** `X-FlowDesk-Event: <ActivityAction>` (routing without body parse), `X-FlowDesk-Delivery: <WebhookDelivery.id>` (idempotency — BullMQ redelivers on retry, receivers dedupe).
- **Body:** `Content-Type: application/json`, UTF-8.
- **`WebhookDelivery` state machine:** `PENDING` (enqueued) → `PROCESSING` (worker picked up) → `SUCCESS` (2xx) | `FAILED` (all attempts exhausted, non-2xx) | `ERROR` (network/abort exception after retries).
- **No snapshot in body** — receiver fetches by `taskId` if it needs current state. Snapshots bloat the body and go stale.

### D4 — Webhook model + CRUD scope

**`Webhook` model:**

```prisma
model Webhook {
  id          String   @id @default(cuid())
  workspaceId String
  url         String
  secret      String              // HMAC key, generated server-side, revealed once on create
  events      String[]            // subset of ActivityAction enum values, validated by Zod at API boundary
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  workspace   Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  deliveries  WebhookDelivery[]  @relation("WebhookDeliveries")

  @@index([workspaceId, isActive])
  @@index([workspaceId, deletedAt])
}
```

- `events String[]`: stores enum values as strings (Prisma can't model `ActivityAction[]` directly). `events: []` = fires on none (explicit empty, not "all"; "all" would be a future `isCatchAll` flag, YAGNI).
- `secret`: 32-byte cryptographic random, hex. Never returned in list/get — only the create response reveals it once. PATCH cannot change it (rotate endpoint deferred, YAGNI). Stored plaintext (it's an HMAC key, needs to be usable for signing; hashing would prevent signing).
- `isActive`: pause/resume without delete. Fan-out query filters `where: { workspaceId, isActive: true, deletedAt: null }`.
- No `userId`/owner — workspace-scoped resource, Admin+ managed.
- Soft-delete via `deletedAt` (covered by `softDeleteExtension` — add `Webhook` + `WebhookDelivery` to `SOFT_DELETE_MODELS`).

**`WebhookDelivery` model:**

```prisma
model WebhookDelivery {
  id            String   @id @default(cuid())
  webhookId     String
  activityId    String
  status        String   // PENDING | PROCESSING | SUCCESS | FAILED | ERROR
  attemptCount  Int      @default(0)
  responseCode  Int?
  responseBody  String?  // truncated to 1KB
  deliveredAt   DateTime?
  error         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  webhook       Webhook       @relation("WebhookDeliveries", fields: [webhookId], references: [id], onDelete: Cascade)
  activity      TaskActivity  @relation("WebhookDeliveries", fields: [activityId], references: [id], onDelete: Cascade)

  @@index([webhookId, createdAt])
  @@index([status, createdAt])
}
```

- Add `deliveries WebhookDelivery[] @relation("WebhookDeliveries")` to `TaskActivity`.

**CRUD routes (mirror saved-filter mount):**

```
POST   /api/workspaces/:wid/webhooks              — Admin+ ; create + return webhook WITH secret (one-time)
GET    /api/workspaces/:wid/webhooks              — Member+ ; list (secret stripped)
GET    /api/workspaces/:wid/webhooks/:id          — Member+ ; single (secret stripped)
PATCH  /api/workspaces/:wid/webhooks/:id          — Admin+ ; update url/events/isActive (NOT secret)
DELETE /api/workspaces/:wid/webhooks/:id          — Admin+ ; soft-delete
GET    /api/workspaces/:wid/webhooks/:id/deliveries — Member+ ; delivery log (cursor-paginated)
```

- `requireWorkspaceRole(['OWNER', 'ADMIN'])` for mutate; `['OWNER', 'ADMIN', 'MEMBER']` for read.
- Mount in `app.ts`: `app.route('/api/workspaces/:wid/webhooks', webhookRouter)`.

**Body shape (JSON):**

```json
{
  "event": "STATUS_CHANGED",
  "deliveryId": "<WebhookDelivery.id>",
  "timestamp": "<TaskActivity.createdAt ISO UTC>",
  "data": {
    "activityId": "<TaskActivity.id>",
    "taskId": "<TaskActivity.taskId>",
    "userId": "<TaskActivity.userId>",
    "field": "status",
    "oldValue": "TODO",
    "newValue": "IN_PROGRESS",
    "metadata": null
  }
}
```

### D5 — Web UI scope

One `WebhooksTab` in `SettingsTabs` with three sections:

1. **Webhook list (table):** URL, Events (badges), Status (Active/Paused badge), Actions. Admin+ row actions: Edit, Pause/Resume, Delete (AlertDialog confirm by typing the URL). Member+ read-only.
2. **Add webhook (Admin+):** Dialog with URL input + events multi-select (toggle Badges for 16 `ActivityAction` values) + isActive default true. On 201 → secret revealed ONCE in a follow-up Dialog with copy button + "store securely" warning. Close → secret gone from UI state.
3. **Delivery log (per webhook):** "View deliveries" → Dialog with cursor-paginated table (Time, Status badge, AttemptCount, ResponseCode, truncated Error in Tooltip).

- Tab visible to: Member+. Actions gated by `canManageMembers(role)` (Admin+).
- No new shadcn primitives — toggle Badge for events, Button for pause/resume, existing Dialog/Table/AlertDialog/Tooltip/Input. `ponytail: switch/checkbox deferred`.
- Web feature module: `apps/web/src/features/webhook/` with types/api/hooks/components/index.

## Solution

### Backend — `apps/api/src/modules/webhook/` (new module)

```
webhook/
  webhook.repository.ts    # Prisma: list, findOwned, create, update, remove, listDeliveries
  webhook.service.ts       # membership + role checks, secret gen, secret-strip, delivery log
  webhook.routes.ts        # CRUD + deliveries, requireWorkspaceRole gating
  webhook.test.ts          # unit tests (secret handling, role logic)
  index.ts
```

### Backend — `apps/api/src/modules/activity/activity.service.ts` (modify)

Extend `record()`:

1. Write `TaskActivity` row (existing).
2. `const task = await prisma.task.findUnique({ where: { id: input.taskId }, select: { workspaceId: true } })` — if not found, return the activity row (no webhooks for a deleted task).
3. `const webhooks = await prisma.webhook.findMany({ where: { workspaceId: task.workspaceId, isActive: true, deletedAt: null } })` — fetch all active webhooks for the workspace (small N per workspace).
4. Filter in-process: `webhooks.filter(w => w.events.includes(input.action))` — events array check.
5. For each matching webhook: create a `WebhookDelivery` row (status `PENDING`), then `webhookQueue.add('deliver', { webhookId, activityId, deliveryId }, { jobId: deliveryId })` — `jobId` = delivery id for idempotency.
6. All inside the existing try/catch — enqueue failure logs + returns null, doesn't throw.

### Backend — `apps/api/src/workers/webhook/` (new worker dir)

```
workers/webhook/
  queue.ts                 # createWebhookQueue + enqueueWebhook, WEBHOOK_QUEUE_NAME = 'webhook'
  processors/deliver.ts    # Worker: fetch Webhook + TaskActivity, build body, HMAC-sign, POST with 10s timeout, update WebhookDelivery
  webhook-worker.ts        # NOT a new entry — imported into email-worker.ts
```

`email-worker.ts` (modify): import `webhookWorker` from `./processors/deliver` (or a re-export), add `webhookWorker.close()` to the shutdown handler's `Promise.all`. No new tsup entry, no new docker service.

`tsup.config.ts`: NO CHANGE (webhook worker code is bundled via the existing `email-worker.ts` entry since it's imported there).

### Shared — `packages/shared/src/webhook.ts` (new)

- `activityActionEnumSchema` — re-export from `@flow-desk/shared/task` (the 16 values).
- `createWebhookSchema`: `{ url: z.string().url(), events: z.array(activityActionEnumSchema), isActive?: z.boolean().default(true) }`.
- `updateWebhookSchema`: `{ url?: ..., events?: ..., isActive?: ... }` (no secret).
- `webhookSchema` (response, no secret), `webhookWithSecretSchema` (create response only), `webhookListResponseSchema`.
- `webhookDeliverySchema`, `webhookDeliveryListResponseSchema` (cursor-paginated, reuse `CursorPaginationQuery`).
- Wire in `packages/shared/package.json` + `tsup.config.ts` + `index.ts`.

### Frontend — `apps/web/src/features/webhook/` (new)

```
webhook/
  types.ts
  api.ts                   # webhookApi.{list, create, get, update, delete, listDeliveries}
  hooks.ts                 # useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook, useWebhookDeliveries
  components/
    WebhooksTab.tsx        # the settings tab: list + add button + role gating
    WebhookFormDialog.tsx  # create/edit form (URL + events toggle Badges + isActive)
    WebhookSecretRevealDialog.tsx  # one-time secret reveal + copy + warning
    WebhookDeliveryLogDialog.tsx   # cursor-paginated delivery table
    WebhooksTab.test.tsx
    WebhookDeliveryLogDialog.test.tsx
  index.ts
```

### Frontend — `apps/web/src/features/workspace/components/SettingsTabs.tsx` (modify)

Add `'webhooks'` to `TabId`, add tab def `{ id: 'webhooks', label: 'Webhooks', icon: Webhook, visible: (r) => r !== null }` (Member+ visible). Add `<WebhooksTab>` to the `children` record in `workspace-settings.tsx`.

## Architecture

```
task.service / comment.service (9 call sites, unchanged)
  └─ activityService.record({ taskId, userId, action, field, oldValue, newValue, metadata })
       ├─ repo.create(prisma, input)  → TaskActivity row  (existing)
       ├─ prisma.task.findUnique → workspaceId             (new, one cheap query)
       ├─ prisma.webhook.findMany → active webhooks         (new)
       ├─ filter webhooks by events.includes(action)        (new, in-process)
       └─ for each match: create WebhookDelivery(PENDING) + webhookQueue.add  (new)
            └─ webhookWorker (in email-worker container) pulls job
                 ├─ fetch Webhook (url, secret) + TaskActivity (action, field, values, metadata, task)
                 ├─ build JSON body { event, deliveryId, timestamp, data }
                 ├─ HMAC-SHA256 sign → X-FlowDesk-Signature: sha256=<hex>
                 ├─ POST url with X-FlowDesk-Signature + X-FlowDesk-Event + X-FlowDesk-Delivery, 10s timeout
                 ├─ update WebhookDelivery: SUCCESS (2xx) | throw → retry (non-2xx / AbortError)
                 └─ on final failure: FAILED (non-2xx) | ERROR (exception)
```

## Data flow

- Create webhook → POST → service generates `secret` (32 bytes hex) → DB row → response includes `secret` once.
- Task mutation → `record()` → activity row + webhook fan-out (PENDING deliveries + BullMQ jobs).
- Worker pulls job → fetches webhook + activity → signs + POSTs → updates delivery (SUCCESS/FAILED/ERROR).
- Web UI → list/get (secret stripped) → delivery log dialog (cursor-paginated).
- Pause webhook → PATCH `isActive: false` → fan-out query skips it (no new deliveries while paused; existing queued jobs still attempt).
- Delete webhook → DELETE → soft-delete (`deletedAt` set) → fan-out query skips it; delivery log retained (FK cascade only on hard delete of webhook, which soft-delete doesn't do).

## Error handling

- `url` invalid → Zod 400.
- Non-Admin mutate → 401 (via `requireWorkspaceRole`).
- Non-member read → 401.
- `record()` webhook enqueue failure → caught, logged, activity row still written. Webhook delivery is best-effort.
- Worker delivery timeout (10s) → `AbortError` → throw → BullMQ retry (up to 5 attempts).
- Worker delivery non-2xx → throw → BullMQ retry. After 5 attempts: `FAILED` + `responseCode` + `error`.
- Worker delivery network exception → throw → BullMQ retry. After 5 attempts: `ERROR` + `error`.
- Webhook URL unreachable / DNS fail → same as network exception.
- `WebhookDelivery.responseBody` truncated to 1KB to bound DB storage.

## Testing

**Backend integration (`apps/api/tests/integration/webhook.test.ts`):**

- Create webhook → 201, response includes `secret`, list response strips `secret`.
- Create with invalid URL → 400.
- Non-Admin mutate (POST/PATCH/DELETE) → 401.
- Member+ can GET list + single + deliveries.
- Update webhook (url, events, isActive) → 200, secret unchanged + not in response.
- Delete webhook → 200, soft-deleted (excluded from list).
- Delivery log cursor pagination.

**Backend integration (`apps/api/tests/integration/webhook-delivery.test.ts`):**

- Trigger a task mutation matching a webhook's `events` → `WebhookDelivery` row created (PENDING) + BullMQ job enqueued.
- `record()` fan-out: webhook with `events: ['STATUS_CHANGED']` + task status change → delivery created; webhook with `events: ['COMMENT_ADDED']` + status change → no delivery (event filter).
- `isActive: false` webhook → no delivery (paused).
- Soft-deleted webhook → no delivery.
- Mock the worker's `fetch` (or extract a `deliverWebhook` function + unit-test it): 2xx → SUCCESS + responseCode + deliveredAt; 500 → throw → retry → FAILED after attempts; timeout → ERROR.
- HMAC signature verification: recompute HMAC-SHA256 of body with secret, assert matches `X-FlowDesk-Signature` header.
- `X-FlowDesk-Event` + `X-FlowDesk-Delivery` headers present.
- Body shape: `{ event, deliveryId, timestamp, data: { activityId, taskId, userId, field, oldValue, newValue, metadata } }`.

**Web component tests (F8 pattern):**

- `WebhooksTab.test.tsx` — renders list, role-gates "Add webhook" (Member hidden, Admin visible), create dialog opens, secret reveal dialog shows secret + copy button.
- `WebhookDeliveryLogDialog.test.tsx` — renders delivery rows with status badges (SUCCESS green, PENDING amber, FAILED red).

## Verification gates

- `pnpm --filter @flow-desk/shared build` → exit 0
- `pnpm --filter @flow-desk/api typecheck` → exit 0
- `pnpm --filter @flow-desk/api lint` → exit 0
- `pnpm --filter @flow-desk/api test:unit` → all pass
- `pnpm --filter @flow-desk/api test:integration` → all pass (existing + new webhook + delivery tests)
- `pnpm --filter @flow-desk/web typecheck` → exit 0
- `pnpm --filter @flow-desk/web lint` → exit 0
- `pnpm --filter @flow-desk/web test -- --run` → all pass (existing + new)
- `pnpm --filter @flow-desk/web build` → exit 0
- `pnpm verify` → green
- Prisma migration applies cleanly (`prisma migrate dev` or direct psql)
- Smoke: create webhook via curl → trigger task mutation → `WebhookDelivery` row appears → (with a mock endpoint) delivery succeeds

## Acceptance seed (ROADMAP)

Register webhook for `TASK_UPDATED` on Demo workspace → update a task → webhook receives signed POST within 2s; delivery log shows 200.

(Note: `TASK_UPDATED` isn't a literal `ActivityAction` value — the enum has `TITLE_CHANGED`, `STATUS_CHANGED`, etc. The acceptance seed will use `STATUS_CHANGED` as the concrete event. ROADMAP's "TASK_UPDATED" is shorthand for "any task-update action"; the implementation exposes all 16 granular actions.)

## Files / LOC (rough)

- `packages/db/prisma/migrations/<timestamp>_webhook/migration.sql` — Webhook + WebhookDelivery tables + indexes + FKs.
- `packages/db/prisma/schema.prisma` — +Webhook model, +WebhookDelivery model, +deliveries relation on TaskActivity.
- `apps/api/src/shared/lib/prisma-extension.ts` — add `Webhook`, `WebhookDelivery` to `SOFT_DELETE_MODELS`.
- `packages/shared/src/webhook.ts` — ~80 LOC (schemas + types).
- `packages/shared/package.json` + `tsup.config.ts` + `index.ts` — add `./webhook` export.
- `apps/api/src/modules/webhook/` — ~250 LOC (repository + service + routes + index).
- `apps/api/src/modules/activity/activity.service.ts` — +40 LOC (fan-out in `record()`).
- `apps/api/src/workers/webhook/` — ~120 LOC (queue + deliver processor).
- `apps/api/src/workers/email/email-worker.ts` — +5 LOC (import + shutdown close).
- `apps/api/tests/integration/webhook.test.ts` — ~150 LOC (CRUD + role tests).
- `apps/api/tests/integration/webhook-delivery.test.ts` — ~180 LOC (fan-out + delivery + HMAC tests).
- `apps/web/src/features/webhook/` — ~350 LOC (types + api + hooks + 4 components).
- `apps/web/src/features/workspace/components/SettingsTabs.tsx` — +5 LOC (tab def).
- `apps/web/src/pages/workspace-settings.tsx` — +5 LOC (children wiring).
- `apps/web/src/features/webhook/components/*.test.tsx` — ~120 LOC (2 test files).

Total ~1450 LOC + test infra. Larger than P1-3 (which was ~275 LOC) because of the new model + worker + 4 web components.

## Out of scope

- Per-user / personal webhooks (workspace-scoped only).
- `isCatchAll` flag (events=[] = none, not all).
- Webhook secret rotation endpoint.
- Separate `webhook-worker` docker container (reuses email-worker; split later if volume grows).
- Task/workspace snapshot in webhook body (receiver fetches by taskId).
- Slack/Slack-specific formatting (P4-3 Slack integration).
- Webhook retry dashboard / manual redelivery button (delivery log is read-only; manual redelivery deferred).
- Webhook test-send button (deferred — nice-to-have, not in ROADMAP scope).

## Schema-hygiene checklist (AGENTS.md §Future-Sprint)

- [x] No `board` in names — `Webhook`, `WebhookDelivery`, `webhookQueue`, `/api/workspaces/:wid/webhooks`.
- [x] Structural fields stay minimal — touches no `Task` fields; new `Webhook` + `WebhookDelivery` models are additive.
- [x] Filter by parameter, not hardcoded scope — `record()` fan-out queries by `workspaceId` parameter; CRUD routes path-scoped under `/api/workspaces/:wid/...` (matches saved-filter pattern; `requireWorkspaceRole` resolves `wid` from path).
- [x] Migration stays additive — new tables + nullable FKs + `@@index`, no rewrite of existing queries.
- [x] Epic/Sprint/Board deferred — no new models for those.

## Risks (to add to RISKS.md)

| ID   | Risk                                                                                                                             | Likelihood | Impact   | Mitigation                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-45 | **Webhook endpoint abuse** — user registers webhook pointing at an internal address (SSRF) or a victim endpoint (amplification)  | Medium     | High     | URL validation: reject private/loopback/link-local IPs + non-http(s) schemes (resolve host, check IP range). Rate limit per-webhook deliveries (30/min limiter already). Document acceptable-use.                     |
| R-46 | **Webhook secret leak** — `secret` exposed in logs, error messages, or git                                                       | Low        | Critical | Secret returned only on create response; stripped from list/get/update; never logged; `.env`-style secrets policy applies.                                                                                            |
| R-47 | **Webhook fan-out N+1 in `record()`** — workspace with many webhooks, every activity triggers a `findMany` + per-webhook enqueue | Medium     | Medium   | `findMany` is one query (bounded by webhook count per workspace, expected <100). Enqueue is a fast Redis op. Monitor; if hot, cache active webhooks per workspace in Redis with 60s TTL + invalidate on webhook CRUD. |
| R-48 | **Stuck PENDING/PROCESSING deliveries** — worker crashes mid-delivery, delivery stays PROCESSING forever                         | Low        | Low      | BullMQ's `attempts` + `backoff` retry exhausted → status becomes FAILED/ERROR. A periodic sweeper (future) could mark stale PROCESSING as ERROR; deferred (YAGNI for P1-4).                                           |
