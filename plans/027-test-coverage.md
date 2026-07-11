# Plan 027: Test coverage on critical paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 870c8ed..HEAD -- apps/api/src/modules/auth apps/api/src/modules/automation apps/api/src/modules/sprint apps/api/src/modules/chat`
> If any in-scope file changed, compare "Current state" excerpts against
> the live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `870c8ed`, 2026-07-11

## Why this matters

Five HIGH/MED-confidence gaps in test coverage of critical paths:

- **TEST-01**: The 2FA + refresh-rotation + Google-callback paths in
  `auth.routes.ts` have only happy-path coverage. A regression in
  token replay protection or `verified_email=false` rejection would
  ship silently.
- **TEST-02**: The automation rule engine has unit tests for the
  condition DSL but no integration test for `processActivity` fan-out
  or the `action.type` execution paths (set-field, assign,
  move-column, send-webhook, send-email).
- **TEST-05**: Sprint burndown has a unit test for `computeBurndown` in
  isolation but no integration test for the full `GET
/sprints/:id/burndown` route with seeded tasks.
- **TEST-07**: Chat channel list `findByWorkspace` includes a
  "latest message" preview but no test pins the behavior — a refactor
  that drops the include would silently break the chat sidebar.
- **TEST-08**: `consumeBackupCode` loops `bcrypt.compare` over up to 16
  backup codes (worst case 1.6s on the 2FA login path at cost 10). No
  test asserts the upper-bound latency, and no test exercises the
  "user has 16 codes" path.

These are all "ship a regression, nobody notices" holes. Adding the
tests is additive; the existing suite stays green.

## Current state

### TEST-01 — Auth login path

`apps/api/src/modules/auth/auth.routes.ts:113-218` (login + refresh +
Google callback) — only the happy path is exercised in
`tests/integration/auth.service.test.ts` (6 tests cover token storage,
refresh success, refresh revoked/expired, OAuth verified/unverified).
The 2FA second-step path, the backup code consumption path, and the
refresh-reuse-after-rotation path are unverified at the integration
level.

The `apps/api/tests/integration/auth-2fa.test.ts` file exists with
4 tests (setup, login challenge, backup once, disable) — but it does
not cover backup code reuse, wrong-TOTP, or refresh-replay.

### TEST-02 — Automation rule engine

`apps/api/src/modules/automation/rule-condition.test.ts` (6 unit tests)
covers the condition DSL only. No `automation.service.test.ts` or
`automation.routes.test.ts` covers the route or the action execution.

`apps/api/tests/integration/automation.test.ts` (3 tests) covers the
basic happy path: create rule, fire activity, assert task updated.
It does not cover each `action.type` (`set-field`, `assign`,
`move-column`, `send-webhook`, `send-email`) or the
"condition does not match → no action" path.

### TEST-05 — Sprint burndown route

`apps/api/src/modules/sprint/burndown.test.ts` (39 lines, 1 test) is a
unit test for `computeBurndown`. No `tests/integration/sprint.test.ts`
covers the full route — and the file at `tests/integration/sprint.test.ts`
exists with 1 test that only verifies sprint creation, not burndown.

### TEST-07 — Chat channel list preview

`tests/integration/chat.test.ts` and `chat.message.test.ts` exist
but no test asserts that the channel list response includes the
`messages[0]` (latest message) preview. The "latest message" subquery
in `chat.repository.ts:24-42` is load-bearing for the chat sidebar UI.

### TEST-08 — bcrypt cost 10 in loop

`apps/api/src/modules/auth/totp.ts:67-78` — `consumeBackupCode` calls
`bcrypt.compare` in a loop. No cap on array size. No test:

- asserts latency stays under the 60s rate-limit window for a user
  with N backup codes
- exercises the "user has 16+ codes" path
- confirms a `null` return (no match) does not mutate the array

### Repo conventions

- Integration test pattern: `buildApp()` from `../../src/app`,
  `app.request(path, { headers: { Cookie } })`, assert on
  `res.status` + `await res.json()`. See
  `tests/integration/auth-2fa.test.ts:1-30` for the canonical shape.
- Factories in `tests/setup/factories.ts`: `createUser`, `createWorkspace`,
  `addMember`, `getAuthCookie`, `createTask`, `createColumn`. New
  helpers go in this file (not a new file).
- 2FA setup helper: `enableTwoFactor(prisma, userId, password)` does
  not exist — add it in this plan.
- Backup code generation already in `apps/api/src/modules/auth/totp.ts` —
  use the same bcrypt cost (10) the production path uses.

## Commands you will need

| Purpose   | Command                                                                                                                                   | Expected on success |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Typecheck | `pnpm typecheck`                                                                                                                          | exit 0              |
| Integ     | `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts`                                    | all pass            |
| Integ 1   | `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts tests/integration/auth-2fa.test.ts` | exit 0              |
| Integ 2   | `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts tests/integration/sprint.test.ts`   | exit 0              |
| Integ 3   | `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts tests/integration/chat.test.ts`     | exit 0              |

## Scope

**In scope**:

- `tests/integration/auth-2fa.test.ts` (TEST-01: 5 new tests)
- `tests/integration/automation.test.ts` (TEST-02: 4 new tests)
- `tests/integration/sprint.test.ts` (TEST-05: 1 new test)
- `tests/integration/chat.test.ts` (TEST-07: 1 new test)
- `tests/setup/factories.ts` (helper additions: `enableTwoFactor`,
  `createAutomationRule`, `createChatMessage`)
- `src/modules/auth/totp.ts` (TEST-08: cap backup codes at 16, add
  one new unit test)

**Out of scope**:

- TEST-03 (P4-3 with mocked automation) — env-dependent, defer.
- TEST-04 (notification unreadCount semantics) — premature.
- TEST-06 (verify baseline split) — process, not a code change.
- TEST-09 (integration revoke O(N)) — premature.
- Adding a `consumeBackupCode` benchmark — the cap at 16 is the
  mitigation; a real perf test would require dedicated infra.

## Git workflow

- Branch: `advisor/027-test-coverage`
- One commit per step.
- Conventional commits: `test(auth): 2FA backup code reuse`, `test(automation): action execution`, etc.

## Steps

### Step 1 — TEST-08: cap backup codes at 16 + regression test

In `apps/api/src/modules/auth/totp.ts`, add a module-level constant
and a guard in `consumeBackupCode`:

```ts
export const MAX_BACKUP_CODES = 16;

export async function consumeBackupCode(code: string, hashes: string[]): Promise<string[] | null> {
  if (hashes.length > MAX_BACKUP_CODES) {
    // Caller has more than the cap — refuse to do the comparison loop.
    // The 2FA setup path should enforce this when generating codes.
    throw new Error(`Too many backup codes: ${hashes.length} > ${MAX_BACKUP_CODES}`);
  }
  for (let i = 0; i < hashes.length; i++) {
    const match = await bcrypt.compare(code, hashes[i]!);
    if (match) {
      return hashes.filter((_, idx) => idx !== i);
    }
  }
  return null;
}
```

In `apps/api/src/modules/auth/totp.ts` `generateBackupCodes`, accept
a `count` argument and clamp to 16:

```ts
export async function generateBackupCodes(count = 8) {
  const safeCount = Math.min(Math.max(count, 1), MAX_BACKUP_CODES);
  // ... existing loop with `safeCount` instead of `count` ...
}
```

In `apps/api/src/modules/auth/totp.test.ts`, add a test:

```ts
it('consumeBackupCode throws if hashes exceed cap', async () => {
  const tooMany = Array.from({ length: 17 }, () => 'hash');
  await expect(consumeBackupCode('12345', tooMany)).rejects.toThrow(/Too many/);
});

it('consumeBackupCode does not mutate input array when no match', async () => {
  const hashes = await (await generateBackupCodes(8)).hashes;
  const before = [...hashes];
  const result = await consumeBackupCode('nonexistent', hashes);
  expect(result).toBeNull();
  expect(hashes).toEqual(before);
});
```

**Verify**: `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts src/modules/auth/totp.test.ts` → 8 tests pass (6 existing + 2 new).

### Step 2 — TEST-01: 5 new 2FA + refresh tests

Add to `apps/api/tests/integration/auth-2fa.test.ts`. Model after the
existing test structure (the file already has `enableTwoFactor` helper
or equivalent; if not, add it as a factory):

```ts
it('backup code is consumed (cannot be reused)', async () => {
  // setup 2FA, get a backup code, use it once → 200; try again → 401
  // ...
});

it('wrong TOTP then correct TOTP', async () => {
  // setup 2FA, login with wrong 6-digit code → 401
  // login with correct code (regenerate from secret) → 200
  // ...
});

it('refresh token reuse after rotation is rejected', async () => {
  // login, get refresh token T1, rotate → T2 issued + T1 revoked
  // try to use T1 again → 401
  // ...
});

it('2FA login flow: password → 2FA challenge → TOTP', async () => {
  // setup 2FA, POST /auth/login with password → 200 + twoFactorRequired
  // POST /auth/login/2fa with TOTP → 200 + cookie
  // ...
});

it('2FA challenge with backup code works', async () => {
  // setup 2FA, get a backup code
  // POST /auth/login/2fa with backup code → 200 + cookie
  // try the same backup code again → 401
  // ...
});
```

Use the same `buildApp()` + `app.request()` + `getAuthCookie()` pattern
as the existing tests. For TOTP generation, use
`generateTotpToken(secret)` from `apps/api/src/modules/auth/totp-engine.ts`.

**Verify**: `TEST_DB_PORT=5433 pnpm exec vitest run --config vitest.integration.config.ts tests/integration/auth-2fa.test.ts` → 9 tests pass (4 existing + 5 new).

### Step 3 — TEST-02: 4 new automation action tests

Add to `apps/api/tests/integration/automation.test.ts`:

```ts
it('assign action: rule assigns the workspace owner when status→IN_REVIEW', async () => {
  // existing pattern, assert task.assigneeId === ownerId after the move
});

it('set-field action: rule sets priority when triggered', async () => {
  // create rule with action { type: 'set-field', field: 'priority', value: 'HIGH' }
  // fire activity, assert task.priority === 'HIGH'
});

it('move-column action: rule moves task to Done column when triggered', async () => {
  // create rule with action { type: 'move-column', columnId: doneColId }
  // fire activity, assert task.columnId === doneColId
});

it('condition does not match: no action runs', async () => {
  // create rule with condition that does NOT match
  // fire activity, assert no side effects
  // (e.g. task.priority unchanged, no email job created)
});
```

**Verify**: `TEST_DB_PORT=5433 pnpm exec vitest run --config vitest.integration.config.ts tests/integration/automation.test.ts` → 7 tests pass (3 existing + 4 new).

### Step 4 — TEST-05: sprint burndown route integration

Add to `apps/api/tests/integration/sprint.test.ts`:

```ts
it('GET /sprints/:id/burndown returns ideal + actual lines', async () => {
  // create workspace + sprint (3 days, start=today, end=today+2)
  // create 5 tasks: 2 DONE with completedAt set, 3 TODO
  // GET the burndown route
  // assert response shape: { ideal: number[], actual: number[], startDate, endDate }
  // assert: 2 of the actual points are "burned" (sum 2 done * estimate)
});
```

**Verify**: `TEST_DB_PORT=5433 pnpm exec vitest run --config vitest.integration.config.ts tests/integration/sprint.test.ts` → 2 tests pass (1 existing + 1 new).

### Step 5 — TEST-07: chat channel list preview

Add to `tests/integration/chat.test.ts`:

```ts
it('GET /chat channels includes latest message preview', async () => {
  // create workspace + 2 channels
  // send 3 messages to channel 1, 1 message to channel 2
  // GET /chat channels
  // assert channel 1's `latestMessage.content === messages[3].content`
  // assert channel 2's `latestMessage.content === messages[1].content`
});
```

**Verify**: `TEST_DB_PORT=5433 pnpm exec vitest run --config vitest.integration.config.ts tests/integration/chat.test.ts` → exit 0; count increases by 1.

### Step 6 — full gate

`pnpm verify` — all 4 stages green. New tests:

- 2 unit (TEST-08)
- 5 integration 2FA (TEST-01)
- 4 integration automation (TEST-02)
- 1 integration sprint (TEST-05)
- 1 integration chat (TEST-07)
- Total: +13 tests

Integration count: ≥ 263 (250 baseline + 13 new — but plan 026 adds 4
more, so the actual total after both plans run is ≥ 267 if 026 lands
first; 263 if 027 lands first; either way the gate verifies the count).

## Test plan

All work in this plan is test addition. Each step is its own test
file's worth of coverage:

- TEST-08: `src/modules/auth/totp.test.ts` (+2 unit)
- TEST-01: `tests/integration/auth-2fa.test.ts` (+5 integration)
- TEST-02: `tests/integration/automation.test.ts` (+4 integration)
- TEST-05: `tests/integration/sprint.test.ts` (+1 integration)
- TEST-07: `tests/integration/chat.test.ts` (+1 integration)

No existing tests should change. The new tests follow the
`describe` / `it` / `beforeEach(cleanDatabase)` pattern of the
existing files.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm --filter @flow-desk/api exec vitest run --config vitest.config.ts` exits 0; unit count ≥ 146 (was 144)
- [ ] `TEST_DB_PORT=5433 pnpm --filter @flow-desk/api exec vitest run --config vitest.integration.config.ts` exits 0; integration count ≥ 263
- [ ] `pnpm build` exits 0
- [ ] `grep -n "MAX_BACKUP_CODES" apps/api/src/modules/auth/totp.ts` returns ≥ 1
- [ ] `git status` shows only in-scope files
- [ ] `plans/README.md` row for 027 updated to `DONE`

## STOP conditions

- `enableTwoFactor` factory does not exist in
  `tests/setup/factories.ts` — add it (in scope) following the
  pattern of `getAuthCookie`.
- TOTP generation for the "correct TOTP" test requires the secret to
  be visible to the test — confirm `enableTwoFactor` returns the
  secret, or generate it client-side from the QR.
- The automation `send-email` action triggers a real BullMQ enqueue;
  if no email worker is running in the test env, the test passes
  (the enqueue is the assertion) but the email never sends — that's
  expected, document it.
- The chat latest-message subquery may have changed shape in plan
  024 (PERF-02: `DISTINCT ON` rewrite) — re-read the post-024 code
  before writing the test, the field name may have changed.

## Maintenance notes

- TEST-01 covers the 2FA challenge path end-to-end. If the
  `login/2fa` route changes signature (e.g. adds `deviceFingerprint`),
  these tests break first — that's the point.
- TEST-02's 4 new tests together cover all 5 `action.type` values
  except `send-webhook` (which is covered by the existing
  `tests/integration/webhook.test.ts`). If a new action type is
  added, add a test here.
- TEST-08's `MAX_BACKUP_CODES = 16` cap is a defense against
  accidentally-generated arrays. If the product team wants 32 codes
  (e.g. for shared accounts), bump the constant AND add a perf
  measurement test.
- The chat latest-message test pins the public contract. If the FE
  starts reading a different field, both this test and the FE break
  at the same time — by design.
