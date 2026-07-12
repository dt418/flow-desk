# UI/UX Improvement Plan — Sprints, Templates, Epics, Calendar

## Context

Current implementations are functional but minimal. All four pages use basic list layouts with minimal visual hierarchy. The goal is to polish these into production-quality views that feel cohesive with the rest of FlowDesk.

## Scope

Improve UI/UX only — no backend changes. All features already have working APIs.

---

## 1. Sprints Page

### Current Issues

- 3-column layout feels cramped
- Backlog tasks show "— pts" with no visual distinction
- No sprint progress visualization
- Burndown chart is bare SVG

### Improvements

- **Sprint cards** with progress bar showing task completion
- **Better backlog** with priority dots and estimate badges
- **Sprint header** with date range and goal prominently displayed
- **Burndown chart** polish — grid lines, better labels, tooltip on hover
- **Empty states** using `EmptyState` component

### Files to modify

- `apps/web/src/features/sprint/components/SprintPage.tsx`

---

## 2. Templates Page

### Current Issues

- "No templates yet" is plain text
- Template list items are flat
- No visual preview of what template creates
- Recurring rules section is disconnected

### Improvements

- **Empty state** with `EmptyState` component + icon
- **Template cards** with preview of fields (title, priority, estimate)
- **Better recurring rules** display with status indicator (active/paused)
- **Apply dialog** polish — show template preview before creating

### Files to modify

- `apps/web/src/features/template/components/TemplatesPage.tsx`

---

## 3. Epics Page

### Current Issues

- "No epics yet" is plain text
- No progress visualization for epic completion
- Story list is basic

### Improvements

- **Empty state** with `EmptyState` component
- **Epic cards** with progress bar (done/total stories)
- **Better story list** with status badges and priority dots
- **Visual hierarchy** — epic title larger, stories indented with connector lines

### Files to modify

- `apps/web/src/features/task/components/EpicList.tsx`

---

## 4. Calendar Page

### Current Issues

- Basic grid styling
- Tasks in cells are plain text with dots
- Day view is single column
- No visual distinction for today/weekends

### Improvements

- **Better cell styling** — hover states, today highlight, weekend tint
- **Task chips** with status colors
- **Week view** improvements — time slots
- **Better agenda view** — card styling, priority indicators

### Files to modify

- `apps/web/src/features/calendar/components/CalendarPage.tsx`

---

## Implementation Order

1. Sprints (most complex, highest impact)
2. Templates (simple, high impact)
3. Epics (simple, medium impact)
4. Calendar (medium complexity, medium impact)

## Verification

- `pnpm --filter @flow-desk/web typecheck`
- `pnpm --filter @flow-desk/web lint`
- Visual review in browser
