# ADR-005: Workspace Settings UI Architecture

## Context

The backend exposes a full workspace management API (workspace.routes.ts): update name/description/visibility, invite/role-change/remove members, manage columns, soft-delete workspace. The web app currently has a placeholder page at `apps/web/src/pages/workspace-settings.tsx` that renders only a static heading. The Settings nav link already exists in AppShell (`/workspaces/:workspaceId/settings`). We need a single page with role-aware tabs (General / Members / Columns / Danger zone) that matches the existing dashboard / board / list visual language, uses TanStack Query for server state, and degrades gracefully when the viewer lacks permissions.

## Decision

A single feature module at `apps/web/src/features/workspace/` follows the architecture standard in AGENTS.md:

```
apps/web/src/features/workspace/
  api.ts          # thin typed wrapper around /api/workspaces + Zod-validated response shapes
  hooks.ts        # TanStack Query: useWorkspace, useMembers, useColumns, mutations
  types.ts        # WorkspaceMemberRow, ColumnRow, role labels
  components/
    GeneralTab.tsx     # name / description / visibility form
    MembersTab.tsx     # member list + invite + role change + remove
    ColumnsTab.tsx     # column list + add / rename / delete
    DangerZoneTab.tsx  # delete workspace (Owner-only)
    SettingsTabs.tsx   # tab nav + role gating
  index.ts        # re-exports for page-level import
apps/web/src/pages/workspace-settings.tsx  # thin shell: route param + tabs container
```

The page is composed of four tabs in a left sidebar; the viewer sees only tabs they are permitted to use. Permission gating lives in `SettingsTabs.tsx` based on the `role` returned by `GET /api/workspaces/:id`.

Each tab uses `react-hook-form` + `zod` for forms (matching login/register), `sonner` for toast feedback (matching dashboard new-workspace CTA), and TanStack Query mutations with `onSuccess` cache invalidation.

## Rationale

- **Single feature module, not four pages** — All workspace settings belong together; they share the same route param, the same header, and the same permission model. Tabs are the natural shape.
- **Feature folder, not pages folder** — AGENTS.md mandates `apps/web/src/features/{feature}/{components,hooks,api,types}`. The page is a thin shell that imports from the feature public API.
- **Permission gate at tab level** — Owner/Admin/Member/Guest see different tabs (Danger zone is Owner-only; Members tab role-change action is Owner-only; Columns tab mutations are Admin+). Same `requireWorkspaceRole` semantics as the API.
- **No new shared schemas** — Reuse `updateWorkspaceSchema`, `inviteMemberSchema`, `updateMemberSchema`, `createColumnSchema` from `@flow-desk/shared/workspace`. The UI infers types via `z.infer` so client and server validate identically.
- **Optimistic updates on column reorder, real-time invalidation on member/role change** — Matches collab-001 pattern: Socket.IO broadcasts already invalidate React Query keys via `qc.invalidateQueries`.

## Alternatives Rejected

| Alternative                                          | Why Rejected                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| **Single long form, no tabs**                        | Settings grows over time; tabs scale better, match GitHub/Linear |
| **Separate pages per setting (`/settings/members`)** | More routes, harder to navigate, no cross-section context        |
| **Reuse dashboard cards inline**                     | Loses permission gating; duplicates layout; couples unrelated UX |
| **New shared schemas just for UI**                   | Drift risk; server already validates — UI uses same Zod schemas  |
| **Optimistic everywhere, no rollback**               | Role-change conflicts (last owner) need accurate server errors   |

## Consequences

- **Positive**: Settings surface is complete; existing nav link works; matches AGENTS.md architecture standard; all mutations have proper feedback (toast on success/failure); permission model is single-source.
- **Negative**: Tabs are routed via local state (`useState`), not URL. Page-level deep links (`/workspaces/:id/settings#members`) deferred — can be added by swapping `useState` for `useSearchParams` later without changing component contracts.
- **Negative**: Column drag-reorder not in this iteration; columns can be added/renamed/deleted but position is server-assigned (matches `createColumnSchema` default of `(lastPos + 1)`).

## Compliance

- No business logic in components — all mutations go through `hooks.ts` → `api.ts`.
- All forms use `react-hook-form` + `zodResolver` + `@flow-desk/shared/*` schemas.
- All mutations show sonner toast on success/failure.
- All queries invalidate the right keys on success.
- All Owner-only actions are double-gated: UI hides button + API returns 403 if forged.
