# Design — Workspace CRUD + Kanban Polish (shadcn)

**Date**: 2026-06-30
**Status**: approved
**Scope**: 2 bounded improvements, single plan

## Problem 1 — Dashboard workspace CRUD broken

`apps/web/src/pages/dashboard.tsx`:

- Line 303–309: "New workspace" hero button has no `onClick` — click does nothing.
- Line 400–407: "Create your first" empty-state button — same.
- `api.ts` has no `workspaceApi.create()`.
- `hooks.ts` has no `useCreateWorkspace` mutation.

Backend is fine: `POST /api/workspaces` (workspace.routes.ts:42) already validates with `createWorkspaceSchema`, creates the workspace + 4 default columns + OWNER membership.

## Problem 2 — Kanban polish (drag/sort)

- (`board.tsx`) Optimistic + rollback already implemented (snapshot + invalidate). dnd-kit's `isDragging` style on source card (kanban.tsx:237) sets `opacity-30`, causing flicker while DragOverlay flies.
- `KeyboardSensor` is registered (kanban.tsx:66) but ships with no announcements. Screen readers get nothing.
- Column header has no menu: "Add task", "Rename column", "Delete column" all require leaving the board for settings.

## Solution

### P1 — Dashboard create-workspace hook + dialog

**Files**:
1. `apps/web/src/features/workspace/api.ts` — add `create(body)`: POST /api/workspaces, returns `{ workspace: WorkspaceDetail }`.
2. `apps/web/src/features/workspace/hooks.ts` — add `useCreateWorkspace()` mutation. `mutationFn: (body: CreateWorkspaceInput) => workspaceApi.create(body)`. `onSuccess`: invalidate `['workspaces']` so dashboard re-queries; `useNavigate('/board/' + data.workspace.id)` if caller passed redirect handler (return id via mutation result).
3. `apps/web/src/components/ui/workspace-create-dialog.tsx` (new) — shadcn Dialog + Form (react-hook-form) + Input + Select (visibility). Fields: `name` (required), `slug` (auto-from-name, editable), `description` (optional), `visibility` (PRIVATE | WORKSPACE | PUBLIC). Reuses `@flow-desk/shared/workspace` `createWorkspaceSchema`.
4. `apps/web/src/pages/dashboard.tsx` — local `const [createOpen, setCreateOpen] = useState(false)`. Wire both buttons → `setCreateOpen(true)`. Render `<WorkspaceCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(ws) => navigate('/board/' + ws.id)} />`.

**No backend change.**

### P2 — Kanban polish

1. **No-flicker drag** (`kanban.tsx`): change source-card opacity behavior. Source-card slot still receives `setNodeRef`, but we set `visibility: hidden` (not opacity) when `activeId === id` so the slot stays laid-out (no reflow) but empty — overlay handles visuals. Keep `isOtherDragging` opacity unchanged. ~5 LOC.
2. **Keyboard announcements** (`kanban.tsx`): pass `accessibility={{ announcements, screenReaderInstructions }}` to `<DndContext>`. Built-in dnd-kit default strings render into the live region. ~2 LOC — dnd-kit ships the strings.
3. **Column header kebab** (`board.tsx` + `kanban.tsx`): extend `KanbanColumn` header to render a `<DropdownMenu>` (from shadcn) with "Add task" (sets a local default-column state consumed by NewTaskModal which already exists) and "Rename column" (inline-edit via `useUpdateColumn`). Delete column stays in settings tab to limit risk.

**Out of scope**: virtualization, multi-select drag, theme pass on every primitive, cross-column drag of selected set.

## Architecture

```
dashboard.tsx
  └─ <WorkspaceCreateDialog open={createOpen}>
       ├─ RHF form + zodResolver(createWorkspaceSchema)
       └─ onSubmit → useCreateWorkspace → POST /api/workspaces
            onSuccess → invalidate(['workspaces']) → onCreated(ws) → navigate('/board/'+ws.id)

board.tsx
  └─ <Kanban accessibility={{ announcements }}>
       └─ <KanbanColumn>
            ├─ header kebab <DropdownMenu>
            │   ├─ "Add task" → setCreateColumn(colId) on board
            │   └─ "Rename" → inline edit → useUpdateColumn
            └─ cards...

kanban.tsx
  └─ pointer/keyboard sensors + announcements (dnd-kit built-in)
  └─ visible:hidden source-card-slot trick (no flicker)
```

## Data flow

- Dialog submits → `useCreateWorkspace` mutation fires. On `201`, query cache for `['workspaces']` invalidated, dialog closes, dashboard navigates to `/board/{newWorkspace.id}`.
- Rename column (board inline-edit) → `useUpdateColumn` invalidates `workspaceKeys.columns(id)` + `workspaceKeys.board(id)` (already wired in hooks.ts). Existing realtime 'column:updated' event re-syncs.
- a11y announcements: dnd-kit renders into `aria-live=assertive` region automatically once `accessibility.announcements` is passed.

## Error handling

- Schema validation errors → RHF + zodResolver surfaces per-field. No submission.
- API 409 (slug taken) → toast via sonner; dialog stays open with field error.
- Rename conflict → same.
- Drag/move revert path already in place (`board.tsx:170 moveMutation.onError`).

## Testing

- Backend untouched: 190/190 API tests unchanged.
- New: `apps/web/tests/components/workspace-create-dialog.test.tsx` — mount with createWorkspace schema mock, type name/slug, submit, assert POST url hit and onCalled with id. Vitest + Testing Library already present (verify in package.json).
- Manual e2e:
  - Dashboard "New workspace" button → opens dialog → submit → lands on /board/{id}.
  - Create workspace with slug collision → inline field error.
  - Board: drag a card fast → no source-slot flicker.
  - Board: keyboard tab to card, space to lift, arrow keys move, announcements read by screen reader.
  - Board: column kebab → Add task opens NewTaskModal with default column = clicked column.

## Files / LOC

| File | LOC |
|------|-----|
| apps/web/src/features/workspace/api.ts | +5 |
| apps/web/src/features/workspace/hooks.ts | +12 |
| apps/web/src/components/ui/workspace-create-dialog.tsx (new) | ~80 |
| apps/web/src/pages/dashboard.tsx | +15 |
| apps/web/src/components/ui/kanban.tsx | +10 |
| apps/web/src/pages/board.tsx | +30 |
| apps/web/tests/components/workspace-create-dialog.test.tsx (new) | ~50 |

Total: ~200 LOC across 7 files.

## Verification gates

- `pnpm --filter @flow-desk/web typecheck` → exit 0
- `pnpm --filter @flow-desk/web build` → exit 0
- `pnpm exec vitest run --config vitest.integration.config.ts` → 190/190 (no backend change)
- `rg "data-no-drag" apps/web/src/features/task/components/TaskCard.tsx` → ≥1 (preserve kanban-click-eating fix from prior session)
- New `createWorkspaceDialog.test.tsx` passes
