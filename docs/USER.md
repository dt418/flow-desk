# FlowDesk User Guide

Self-hosted, AI-augmented task management. This guide covers how to use a running FlowDesk instance. For self-host install/admin, see `README.md`. For engineering, see `docs/DEV.md` and `docs/ARCHITECTURE.md`.

Goals and product context: see `PRD.md`. Known issues: see `RISKS.md`.

## Concepts

- **Workspace** — a tenant. Contains members, boards, labels, tasks.
- **Member** — a user belonging to a workspace. Roles: Owner, Admin, Member, Guest.
- **Board** — a Kanban view of tasks within a workspace, grouped by status.
- **Task** — a unit of work. Has status, priority, due date, assignee, labels, subtasks, dependencies.
- **Status** — workflow state: `BACKLOG`, `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `BLOCKED`.
- **Label** — colored tag attached to a task. 8 named colors. Per workspace.
- **Comment** — thread on a task. Supports `@mention`.
- **Mention** — `@username` inside a comment or task description. Triggers an in-app notification.
- **Dependency** — "A blocks B": B cannot move forward until A is done.
- **Attachment** — file (image, PDF, doc) attached to a task.
- **Notification** — in-app event for mentions, assignments, due-soon.

## Quick Start

1. Install: `docker compose up -d` at the repo root. See `README.md` for env setup.
2. URLs: web `http://localhost:5173`, api `http://localhost:3000`.
3. Seed demo data: `pnpm db:seed`.
4. Login: `demo@flow-desk.app` / `demo1234` (seeded demo account).
5. The `Onboarding Wizard` opens on first login and walks through workspace + first task.

## Workspaces

Each user can belong to multiple workspaces. The header switcher (`WorkspaceSwitcher`) toggles the active workspace.

### Create a Workspace

1. Avatar menu → **Create workspace**.
2. Name, optional description.
3. You become Owner.

### Invite Members

Workspace settings → **Members** tab → **Invite**. Email field; role select.

### Roles

| Role   | Can do                                                        |
| ------ | ------------------------------------------------------------- |
| Owner  | Everything, including delete workspace and transfer ownership |
| Admin  | Manage members, labels, settings; cannot delete workspace     |
| Member | Create / edit tasks, comments, attachments; manage own tasks  |
| Guest  | Read-only on tasks; can comment if commentable                |

The Owner of `demo@flow-desk.app` workspace is the seeded demo user.

## Tasks

Create a task: board → `+ New Task` → fill title, status, priority, due, assignee, labels, description → save. Editing follows the same modal pattern.

### Status workflow

```
BACKLOG → TODO → IN_PROGRESS → IN_REVIEW → DONE
                            ↘ BLOCKED → IN_PROGRESS
```

Drag a card on the Kanban board to change status. Other connected users see the move via realtime.

### Subtasks

Inside task detail → **Subtasks** → add checklist items. Each subtask has its own status.

### Dependencies

Inside task detail → **Dependencies** → "Add blocker". The task cannot move to `DONE` while a blocker is open. The board marks blocked tasks with a `BLOCKED` badge.

### Priority and Due Date

Priority: `LOW`, `MEDIUM`, `HIGH`, `URGENT`. Due date: ISO date. Overdue tasks appear red in List view.

## Views

### Kanban

Default board view. Columns are statuses; cards are tasks. Drag cards between columns. Filters in the toolbar: assignee, label, priority, due range.

### List / Table

Toggle via the view switcher. Sortable columns, multi-filter, paginated with cursor (`?cursor=…`). Useful for reporting and bulk edits.

## Collaboration

### Comments

Task detail → **Comments** → write. Markdown supported. `@username` notifies.

### Mentions

Type `@` then pick a member from the suggestion list. The mentioned member receives a notification in the bell menu and a real-time toast.

### Realtime Presence

The header shows a presence bar with avatars of users currently viewing the same workspace. Disconnects fade out within ~30 seconds (R-24-driven TTL).

## Labels

8 named colors (not free hex). Per workspace.

- Workspace settings → **Labels** → **New label** → name + color.
- Click a task card → label chip → pick or create.

Color names: `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`.

## Attachments

Task detail → **Attachments** → drop file or click upload. Preview supported for images, PDFs, and common doc types. Size limit set by `MAX_UPLOAD_SIZE` env (see `README.md`).

## Notifications

Bell icon (header) lists notifications: mentions, assignments, due-soon, etc. Click a notification to deep-link to the task. Real-time toasts appear while a session is active.

## AI Features

FlowDesk is wired to an OpenAI-compatible provider. Configure `LLM_BASE_URL` and `LLM_API_KEY` in `.env` (see `README.md`).

- **Assignment suggestion** — AI ranks workspace members by current workload and returns a recommended assignee. One click applies.
- **Auto-schedule** — given priorities, due dates, dependencies, and per-member capacity, AI proposes an ordered schedule. Review before applying.
- **Natural-language task create** — type "Review PR with alex tomorrow high" and AI drafts a structured task.
- **Meeting notes → tasks** — paste meeting notes and AI extracts candidate tasks.

Caveats: the local LLM proxy used in dev is slow (R-24, ~18–27s per call). The UI surfaces a spinner; do not refresh during a call.

## Settings

- Avatar menu → **Profile** — name, email, avatar.
- Avatar menu → **Change password**.
- Workspace settings — three tabs: **General** (name, description), **Members** (list, roles, invite), **Labels** (CRUD).

## Troubleshooting

| Symptom                            | Fix                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Cannot log in                      | Reset password via `pnpm db:seed` for demo or run a fresh `POST /api/auth/register`. |
| AI features unresponsive           | Check `LLM_BASE_URL`, `LLM_API_KEY` in `.env`. Restart api: `pnpm stack:up-build`.   |
| Attachment upload stuck            | Check max size (`MAX_UPLOAD_SIZE`) and free disk in the api container.               |
| Realtime updates delayed / dropped | Verify redis is up (`pnpm stack:ps`). Disconnect/reconnect by refreshing the page.   |
| Can't see a workspace              | Ask an Owner or Admin to invite you via the Members tab.                             |
| Workspace switcher is empty        | Your account has no membership. Create or be invited to one.                         |

If nothing here matches, capture the request id from the API response (`X-Request-Id` header) when filing a bug — see `RISKS.md`.
