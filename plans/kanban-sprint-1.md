# Kanban Sprint 1 — a11y, Click-Bubble, Sensor Tuning

## Problem

Kanban board audit found 15 bugs across 6 root-cause clusters. Sprint 1 targets the three highest-impact clusters that block basic usability.

## Scope

- `apps/web/src/components/ui/kanban.tsx` — exported primitives + sensor config
- `apps/web/src/features/task/components/TaskCard.tsx` — a11y + click handling
- **Out of scope**: Sprint 1.5 (optimistic reorder race, same-position move, overlay drift, list page sync)

## Changes

### kanban.tsx

1. **INTERACTIVE_SELECTOR** — exported constant `button, [href], input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])` used by KanbanCard to skip drag activation when clicking interactive children.
2. **NoCardClick** — exported wrapper component; `onPointerDown` calls `e.stopPropagation()` to prevent card-level drag activation. Used by TaskCard's kebab menu and label select.
3. **Sensors** — `PointerSensor {distance:8}` (no delay, eliminates 80ms click lag). `TouchSensor {delay:150, tolerance:8}` (better mobile than previous 200/5).
4. **DropAnimation** — `{duration:120}` for subtle drop snap.
5. **useDraggable refactor** — `attributes` + `listeners` spread on inner div (not outer wrapper). Eliminates nested `role="button"` + `tabIndex={0}` on wrapper while article also has role.
6. **KanbanCard filter** — uses `INTERACTIVE_SELECTOR` instead of hardcoded `button, input, textarea, a` list.

### TaskCard.tsx

1. **Remove `role="button"`** from `<article>`. Replace with `aria-roledescription="draggable"` + `aria-label={"Task: " + task.title}`.
2. **Unify whitelists** — 3 separate interactive-element checks (onClick, onKeyDown, pointer-event guard) consolidated to single `INTERACTIVE_SELECTOR` match.
3. **Wrap kebab** — `<DropdownMenuTrigger>` inside `<NoCardClick>` with `aria-label={"Actions for " + task.title}`.
4. **Wrap label select** — `<TaskLabelSelect>` inside `<NoCardClick>`.
5. **Remove `data-no-drag`** attributes — superseded by INTERACTIVE_SELECTOR pattern.

## Verification

| Gate      | Command                                  | Result                                   |
| --------- | ---------------------------------------- | ---------------------------------------- |
| Typecheck | `pnpm --filter @flow-desk/web typecheck` | exit 0                                   |
| Build     | `pnpm --filter @flow-desk/web build`     | exit 0 (908KB JS / 93KB CSS, 272KB gzip) |
| Secrets   | `pnpm check:secrets`                     | exit 0                                   |

## Risks

- R-36 (click bubbling) — mitigated by NoCardClick + INTERACTIVE_SELECTOR
- R-37 (80ms lag) — mitigated by PointerSensor distance:8, no delay
- R-38 (nested role=button) — mitigated by attributes on inner div + aria on article

## Deferred (Sprint 1.5)

- RC3: Optimistic reorder + Socket.IO invalidation race (#3, #10)
- RC5: Move-to-same-position early-return (#4)
- RC6: DragOverlay animation drift (#6)
- List page sync (TaskCard changes not yet reflected in list.tsx)
