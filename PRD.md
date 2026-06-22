# FlowDesk — Product Requirements Document

## Problem Statement

Teams need a self-hosted, AI-augmented task management platform that goes beyond basic Kanban. AI should proactively suggest assignments, auto-schedule based on capacity and dependencies, and extract tasks from meeting notes. Existing tools either lack AI integration, lock users into SaaS, or don't support multi-workspace collaboration.

## Goals

1. **Core task management** — Kanban board + List/Table view with drag-and-drop
2. **Collaboration** — Real-time updates via Socket.IO, comments with @mentions
3. **Task structure** — Subtasks, dependencies (A blocks B), priorities, due dates
4. **AI assistance** — Suggest task assignments based on workload/capacity; auto-schedule respecting dependencies and deadlines; natural language task creation; meeting summarization → tasks
5. **File attachments** — Upload and preview common file types (images, PDFs, docs)
6. **Notifications** — In-app real-time notifications
7. **Multi-workspace** — Organizations with members and role-based access (Owner/Admin/Member/Guest)
8. **Self-hosted** — Single Docker Compose deployment

## Non-Goals

- Mobile native apps (web-only MVP)
- Complex time tracking / billing
- Gantt charts / resource leveling (Phase 2)
- AI chatbot interface (Phase 2)
- Public sharing of workspaces

## User Stories

| As a...     | I want to...                                | So that...                            |
| ----------- | ------------------------------------------- | ------------------------------------- |
| Team member | Create tasks with subtasks and dependencies | Break down work into manageable units |
| Team member | Drag tasks between Kanban columns           | Update status quickly                 |
| Team member | @mention colleagues in comments             | Get their attention on specific tasks |
| Team lead   | See AI suggestions for task assignments     | Balance workload across team          |
| Team lead   | View tasks in List/Table for reporting      | Filter and export data easily         |
| Org admin   | Manage workspace members and roles          | Control access appropriately          |
| System      | Send real-time notifications                | Keep team synced without polling      |

## Success Metrics

- **Completion rate**: ≥80% tasks completed by due date
- **AI adoption**: ≥50% assignment suggestions accepted within 30 days
- **Engagement**: ≥5 comments/task average
- **Performance**: <200ms board load, <100ms drag-drop feedback, <500ms real-time propagation

## Tech Stack

| Layer      | Technology                                                 |
| ---------- | ---------------------------------------------------------- |
| Frontend   | React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui |
| Backend    | Hono + Node.js + TypeScript                                |
| Database   | PostgreSQL 16                                              |
| Cache      | Redis 7                                                    |
| ORM        | Prisma                                                     |
| Realtime   | Socket.IO (Redis adapter)                                  |
| Auth       | JWT in httpOnly cookie (bcrypt + Google OAuth)             |
| AI         | OpenAI-compatible (custom baseUrl + model)                 |
| Deployment | Docker Compose (self-hosted)                               |
