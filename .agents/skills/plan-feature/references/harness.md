# FlowDesk harness reference

Load when plan-feature steps need repo-specific paths or conventions. **AGENTS.md wins on conflict.**

## Artifact map

| Artifact                                             | Role                                   |
| ---------------------------------------------------- | -------------------------------------- |
| `feature_list.json`                                  | Source of truth for feature status     |
| `claude-progress.md`                                 | Session log + verified state           |
| `ROADMAP.md`                                         | Sequenced backlog (`P1-…`, `P2-…`)     |
| `PRD.md` / `TASKS.md` / `ACCEPTANCE.md` / `RISKS.md` | Engineering pipeline inputs            |
| `docs/superpowers/specs/`                            | Design specs (`brainstorming`)         |
| `docs/superpowers/plans/`                            | Implementation plans (`writing-plans`) |
| `init.sh`                                            | Restart path for next session          |
| `AGENTS.md`                                          | Conventions, gates, schema hygiene     |

## feature_list.json

Rules (also in file `rules`):

- `single_active_feature` — only one `in_progress`
- `passing_requires_evidence` — no empty evidence
- `do_not_skip_verification`

Entry fields: `id`, `priority`, `area`, `title`, `user_visible_behavior`, `status`, `verification[]`, `evidence[]`, `notes`.

Statuses: `not_started` | `in_progress` | `blocked` | `passing`.

ROADMAP item missing from list: create entry at **execution** start; mark `passing` only after verify + evidence.

## Module layout (execute)

**API** `apps/api/src/modules/{feature}/`:

- `{feature}.routes.ts` — HTTP/WS registration only
- `{feature}.service.ts` — business logic
- `{feature}.repository.ts` — Prisma only
- `{feature}.schema.ts` / `.types.ts` / `.test.ts`

Shared Zod: `packages/shared`.

**Web** `apps/web/src/features/{feature}/`:

- `components/`, `hooks/`, `api.ts`, `types.ts`, `index.ts`

Web UI change → component test using **F8** pattern:

`apps/web/src/components/ui/workspace-create-dialog.test.tsx`

(RHF + zodResolver + QueryClientProvider + MemoryRouter + mocked `@/lib/api`).

## Future-Sprint Schema Hygiene

Do not paint corners for Board/Epic/Sprint:

- No `board` in query/repo/service names — use `workspace`
- Structural fields only: `Task.columnId`, `Task.parentTaskId`
- Filters by parameter, not hardcoded SQL scope
- Epic later = `parentTaskId` depth, not a new model now
- Sprint + estimation deferred together
- Migrations additive only

## Caveman auto-toggle

| Phase                                                   | Verbosity |
| ------------------------------------------------------- | --------- |
| Brainstorm / design                                     | full      |
| writing-plans / execute narration                       | caveman   |
| Commits, PR, `claude-progress.md`, `feature_list` notes | normal    |

## Verify gate

Before every commit and before `passing`:

```bash
pnpm verify
```

Quick per-package checks OK mid-task; full verify before commit / `passing`.

## ROADMAP pull

If user says next item / plan from ROADMAP:

1. Open current phase in `ROADMAP.md`
2. First unstarted item (no ✅ / not `passing` in feature_list)
3. Confirm id + title with user
4. Continue plan-feature from step 1

## Closing session (minimum)

1. `feature_list.json` updated
2. `claude-progress.md` session record
3. Unresolved risks in `RISKS.md` if any
4. Commit only when user asks (or plan step says commit)
5. Clean enough for `./init.sh` next session
