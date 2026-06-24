# Kanban Task CRUD + Soft-Delete w/ Undo — Design

**Date:** 2026-06-24
**Status:** Draft → awaiting approval
**Scope:** Kanban CRUD this cycle. List page CRUD, workspace CRUD, dashboard charts each get their own spec later.

---

## Problem

The Kanban board (`/board/:workspaceId`) supports drag-to-reorder and the "New task" button, but users cannot:

- edit a task directly from the board (no click handler on `TaskCard`, no kebab menu, no edit modal).
- delete a task from the board.
- nowhere in the app can a deletion be undone.

The backend already supports soft-delete (`taskService.delete` → `repo.softDelete` → sets `deletedAt`). What's missing:

- A way to **restore** a soft-deleted task (no service method, no route, no schema validation).
- A board snapshot that already filters out `deletedAt != null` on the server response so users can't see "ghosts".
- Frontend hooks/glue (`update`, `restore`, edit modal reuse, delete affordance, undo toast, realtime `task:restored`).

## Non-Goals

- List page inline edit, list page filter UI (next cycle).
- Workspace create/edit/delete/switch (next cycle).
- Dashboard charts/stats (next cycle).
- Kanban column management (add/delete/rename column). Out of scope for "Kanban CRUD" — only tasks.
- Bulk operations (multi-select, drag-many, delete-many).
- Subtask full pane in edit modal — `description` field is a textarea only. Subtask widget is Phase 2.
- Dependency editing inside modal. Phase 2.

## User Stories

| ID  | Story                                                                                                  | Acceptance                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| U1  | As a member, I can click a task card on the board to open its edit modal.                              | Click on any card body opens `TaskEditModal` populated with the task's current values.            |
| U2  | As a member, I can change any field and save; the change reflects on the board without a full reload.  | Save button PATCHes `/api/tasks/:id` and board re-snapshots via cache invalidation.              |
| U3  | As a member, I can right-click or open a kebab menu on a card and choose "Delete".                     | Kebab menu offers Edit, Delete. Click Delete → toast with Undo (5s window).                       |
| U4  | As a member, if I accidentally delete, I click Undo within 5 s and the card comes back as before.     | Undo POSTs `/api/tasks/:id/restore`. Card reappears at its prior column/position.                  |
| U5  | As a member, I see realtime updates from other users: task edited, deleted, restored.                  | `useRealtime` already listens to workspace events; new handlers for `task:updated`, `task:restored` invalidate board. |
| U6  | As a member, deleting a card fails (e.g., 409 version conflict) — the card stays; undo does not appear. | Mutation onError reverts optimistic delete; no toast on Undo failure.                              |

## Success Metrics

- Inline modal reachable from any card in <2 clicks (click body OR kebab → Edit).
- Edit save round-trip <500ms p95 on localhost (cache invalidation + TanStack refetch).
- Undo covers 0–5s after delete; cards remain visually faded-out for the duration.
- 100% of new endpoints covered by integration tests in `apps/api/tests/integration/task.routes.test.ts` + `task.service.test.ts`.

## Architecture (high-level)

Two-sided change:

**Backend (`apps/api`):**

1. New service method `taskService.restore(userId, id)` → reuse existing soft-delete patterns: assert active by id (excludes deleted), assert membership, `prisma.task.update({where:{id}, data:{deletedAt: null}})`, emit `task:restored` socket event to workspace + task room.
2. New schema `restoreTaskSchema` (Zod, empty body — just id in URL).
3. New route `POST /api/tasks/:id/restore` mounted in `taskRouter`.
4. `taskService.update` already returns updated task; check if it emits `task:updated` — if not, add it (mirror move/list pattern).

**Frontend (`apps/web`):**

1. Extend `apps/web/src/features/task/api.ts`: add `update(id, body)` and `restore(id)`.
2. Refactor `apps/web/src/features/task/components/NewTaskModal.tsx` → rename to `TaskEditModal.tsx`; accept `initial?: Task | null`. When null → "Create" mode; when set → "Edit" mode. Same fields, same validation, same NetworkX submit.
3. Set up a kebab menu component (existing shadcn dropdown menu primitive) on `TaskCard`. Items: Edit, Delete. (No "Delete column" — out of scope.)
4. Click on card body opens modal in edit mode. Wire via React onClick + checkbox to stop propagation from kebab.
5. Two new hooks in `apps/web/src/features/task/hooks.ts`: `useUpdateTask(workspaceId)` and `useRestoreTask(workspaceId)` — `useMutation` with optimistic updates + `onSettled` invalidate `['board', workspaceId]` + `[..., 'tasks', workspaceId]`.
6. Delete hook: `useDeleteTask(workspaceId)` → optimistic remove from local state + sonner toast with Undo button firing restore mutation. On restore failure (e.g., task expired), surface toast error.
7. Realtime: extend `useRealtime` subscriptions in `board.tsx` to also listen `task:updated` and `task:restored` and invalidate the board query.

## Data Flow

```
USER                         BOARD                          TASK HOOKS                 API                       PG
 │                              │                                │                       │                         │
 │ click card                   │                                │                       │                         │
 ├──────────────────────────────▶ GET /api/workspaces/:id/board                          │                         │
 │                              ◀──────────────────────────────  200 {columns:[]}                                       │
 │                              │                                │                       │                         │
 │ click body                   │                                │                       │                         │
 ├─────────────► TaskEditModal opens with initial=task            │                       │                         │
 │ edit + Save                  │                                │                       │                         │
 ├─────────────► submit ────────▶ useUpdateTask ─────────────────▶ api.update            │                         │
 │                              │                                │ PATCH /api/tasks/:id ──▶                         │
 │                              │                                │                       │───── Prisma.update ────▶│
 │                              │                                │                       │◀──── updated row ───────│
 │                              │                                │ emit task:updated      │                         │
 │                              │◀─ invalidate board ───────────│◀────── socket ────────│                         │
 │                              │─── refetch board ──▶          │                       │                         │
 │                              ◀── fresh snapshot ───          │                       │                         │
 │                              │                                │                       │                         │
 │ click kebab → Delete         │                                │                       │                         │
 ├─────────────► optimistic setLocal hide ──── useDeleteTask ────▶ api.delete            │                         │
 │                              │                                │ DELETE /api/tasks/:id ▶                         │
 │                              │                                │                       │─── repo.softDelete ───▶│
 │                              │                                │                       ││ emit task:deleted      │
 │                              │                                │◀──── 200 ok ──────────│                         │
 │                              │                                │ toast "Task deleted  │                         │
 │                              │                                │   [Undo]" (5s)       │                         │
 │                              │                                │                       │                         │
 │ click Undo                   │                                │                       │                         │
 │                              │                                │ api.restore           │                         │
 │                              │                                │ POST .../restore ────▶                         │
 │                              │                                │                       │─── Prisma.update ────▶│
 │                              │                                │                       ││ emit task:restored    │
 │                              │                                │◀──── 200 ok ──────────│                         │
 │                              │                                │ dismiss toast         │                         │
 │                              │◀─ invalidate board ───────────│                       │                         │
```

## Files Touched

| Layer | File | Action | Why |
|---|---|---|---|
| shared | `packages/shared/src/task.ts` | Modify (add `restoreTaskSchema`) | request validation mirror |
| api | `apps/api/src/modules/task/task.routes.ts` | Modify (add POST `/:id/restore`) | expose endpoint |
| api | `apps/api/src/modules/task/task.service.ts` | Modify (add `restore`, emit `task:updated` from `update`) | backend business logic |
| api | `apps/api/tests/integration/task.routes.test.ts` | Modify (add restore route tests) | AC for new endpoints |
| api | `apps/api/tests/integration/task.service.test.ts` | Modify (add restore service tests) | unit-level service coverage |
| web | `apps/web/src/features/task/api.ts` | Modify (add `update`, `restore`) | client SDK |
| web | `apps/web/src/features/task/components/NewTaskModal.tsx` | Modify (rename file usage; will move file to TaskEditModal.tsx) | share modal between create + edit |
| web | `apps/web/src/features/task/components/TaskEditModal.tsx` | Create (refactor out of NewTaskModal) | above |
| web | `apps/web/src/features/task/hooks.ts` | Modify (add `useUpdateTask`, `useDeleteTask`, `useRestoreTask`) | mutation layer |
| web | `apps/web/src/features/task/index.ts` | Modify (barrel exports) | export new modal + hooks |
| web | `apps/web/src/features/task/components/TaskCard.tsx` | Modify (kebab menu + click handler) | UI affordance |
| web | `apps/web/src/pages/board.tsx` | Modify (modal state, realtime handlers, optimistic delete wiring) | wire it all |

11 files touched / created. No DB migration (existing `deletedAt`). No new deps (uses shadcn dropdown-menu already shipped).

## Error Handling

- `400 INVALID_QUERY` when restore called on a non-existent task id → 404 from `findActiveById`.
- `409 CONFLICT` not used — restore is idempotent (already-restored task → 200 with existing record).
- Optimistic update failure → revert cache; show toast.
- Network failure on Undo → toast `"Restore failed. Task may have been permanently removed."`
- Realtime disconnect → board falls back to last cached snapshot; logout/disconnect surfaces in toast (handled by existing `useRealtime`).

## Testing Strategy

- Backend:
  - `task.service.test.ts`: `restore()` happy path + missing task + non-member → throw.
  - `task.routes.test.ts`: `POST /:id/restore` 200/404/403 + emits `task:restored` event.
  - `update()`: emits `task:updated` (assert via mocked socket broadcaster).
- Frontend:
  - `pnpm --filter @flow-desk/web typecheck` must pass.
  - `pnpm --filter @flow-desk/web build` must pass.
  - Manual e2e via http://localhost:5173/board/:id: click card → modal opens → edit title → save → board reflects. Kebab → Delete → toast with Undo → click Undo → card returns within 5s.
- Manual: refresh board while tab unrelated; verify realtime invalidation fires.

## Acceptance Criteria (concrete)

A1. Clicking any task card body on `/board/:workspaceId` opens `TaskEditModal` pre-filled with current title/desc/status/priority/assignee/dueDate/labels.
A2. Saving the modal PATCHes the task and the board reflects changes within 1s.
A3. TaskCard kebab menu lists Edit and Delete only.
A4. Delete click removes the card optimistically and shows a sonner toast titled "Task deleted" with an "Undo" button. After 5s the toast dismisses.
A5. Click Undo within 5s POSTs to `/api/tasks/:id/restore`; the card reappears at its original column at the position it occupied before delete.
A6. If delete API returns error, the card re-appears and no Undo toast is shown.
A7. Two browser windows editing same board show edits within 1s of each other (sockets working).
A8. Backend integration tests pass; pre-push gates green.

## Risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| Restore race: cache invalidation may undo two-clients editing the same task | M | M | Restore uses optimistic UI + invalidates board — second client sees fresh snapshot. |
| Undo window expired → can't undo | M | L | Toast copy: "Deleted. Undo for 5 s." Editor can undo manually by recreating. |
| Kebab menu clicking accidentally toggles delete | L | M | Confirm Undo via toast instead of native confirm() — soft pressure, opt-in restore. |
| Click handler conflicts with drag start | M | M | Click body only fires if not drag; use `@dnd-kit` `isDragging` state to suppress. |
| `task:updated` event not currently emitted → missed by other clients | M | H | Add emit in `update()`; covered by service test. |
