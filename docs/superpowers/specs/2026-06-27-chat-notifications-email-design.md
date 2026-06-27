# Chat + Notifications + Email System Design

**Date:** 2026-06-27
**Feature ID:** F7
**Status:** Approved

---

## 1. Problem & Goals

**Problem:**
- No workspace-wide chat or task-level chat threads beyond comments
- Task assignment does not emit realtime notifications to assignee
- No email notifications when tasks are assigned or due
- No digest or scheduled email capabilities

**Goals:**
- Chat system: workspace channels + task-level threads (extends comments)
- Realtime notifications on task assignment via Socket.IO
- Email system: instant, delayed, digest, reminder — all configurable per-user and per-workspace

**Non-goals:**
- Direct message (DM) chat between users
- Push notifications (mobile)
- Email templates with rich HTML editor

---

## 2. Architecture

### 2.1 Chat System

**Data Models (Prisma)**

```prisma
model ChatChannel {
  id          String   @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(...)
  name        String
  description String?
  isPrivate   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
  messages    ChatMessage[]
  @@unique([workspaceId, name])
  @@index([workspaceId])
}

model ChatMessage {
  id          String   @id @default(cuid())
  channelId   String
  channel     ChatChannel @relation(...)
  authorId    String
  author      User     @relation(...)
  content     String
  mentionedUserIds String[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
  @@index([channelId, createdAt])
  @@index([authorId])
}
```

**Task-level chat:** Comment model has existing `mentionedUserIds`. Add `isChat: Boolean @default(false)`. Task detail page filters comments where `isChat = true` for chat tab, `isChat = false` for comments tab.

**API Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/channels | List workspace channels |
| POST | /api/channels | Create channel |
| PATCH | /api/channels/:id | Update channel (name, description, isPrivate) |
| DELETE | /api/channels/:id | Soft-delete channel |
| GET | /api/channels/:id/messages | List messages (cursor paginated) |
| POST | /api/channels/:id/messages | Send message |

**Socket.IO Events (namespace: /collab)**

| Event | Direction | Payload |
|-------|-----------|---------|
| channel:new | server → client | ChatChannel |
| channel:updated | server → client | ChatChannel |
| channel:deleted | server → client | { channelId } |
| message:new | server → client | ChatMessage |
| message:updated | server → client | ChatMessage |
| message:deleted | server → client | { messageId } |

Room pattern: `channel:{channelId}`

**Frontend Components:**
- `ChatSidebar.tsx` — left sidebar with channel list + DM list (future)
- `ChannelView.tsx` — message list + input for selected channel
- `TaskChat.tsx` — task-level chat (extends comments, shows `isChat = true`)
- `ChatInput.tsx` — textarea with @mention autocomplete

### 2.2 Realtime Notification on Task Assignment

**Trigger:** When `assigneeId` is set or changed on a Task.

**Flow:**
1. `task.service.ts: assignTask(assigneeId)` is called
2. DB write succeeds → `notification.create()`
3. `emitToUser(assigneeId, 'task:assigned', { taskId, taskTitle, workspaceName, assignedBy })`
4. `emitToWorkspace(workspaceId, 'task:assigned', { taskId, taskTitle, assigneeId })` for board sync

**Frontend:** `useNotificationsRealtime()` (existing) listens for `notification:new` + existing `task:assigned` event already handled for board refresh.

### 2.3 Email System

**Provider Interface (Strategy Pattern)**

```typescript
interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
  sendTemplate(to: string, template: EmailTemplate, data: Record<string, unknown>): Promise<void>;
}
```

**Implementations:**
- `NodemailerProvider` — uses `nodemailer` with SMTP config from env
- `ResendProvider` — uses `resend` SDK with `RESEND_API_KEY` env

**Env Config:**

```env
EMAIL_PROVIDER=nodemailer       # or 'resend'
# Nodemailer
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=xxx
SMTP_FROM="FlowDesk <noreply@flow-desk.app>"
# Resend
RESEND_API_KEY=re_xxx
RESEND_FROM=FlowDesk <noreply@flow-desk.app>
```

### 2.4 Email Scheduling

**4 Email Types:**

| Type | Trigger | Queue |
|------|---------|-------|
| INSTANT | TASK_ASSIGNED, TASK_MENTIONED, WORKSPACE_INVITE | Email sent immediately after DB write |
| DELAYED | Configurable per-user delay (0-60 min, default 0) | Redis sorted set, score = scheduled_at |
| DIGEST | Daily (08:00 user timezone) or Weekly (Monday 08:00) | Cron, aggregate unread notifications |
| REMINDER | N hours before task due date (configurable, default 24h) | Redis sorted set, score = due_date - reminderHours |

**Queue Implementation: BullMQ**

```
apps/email-worker/
  src/
    index.ts          # BullMQ worker entry
    queues/
      instant.ts      # Queue: 'email:instant'
      delayed.ts      # Queue: 'email:delayed'
      digest.ts       # Queue: 'email:digest'
      reminder.ts     # Queue: 'email:reminder'
    processors/
      instant.processor.ts
      delayed.processor.ts
      digest.processor.ts
      reminder.processor.ts
    templates/
      task-assigned.ts
      task-due-reminder.ts
      daily-digest.ts
      weekly-digest.ts
```

**BullMQ Queues:**
- `email:instant` — high priority, processes immediately
- `email:delayed` — sorted set `scheduledAt`, worker checks every 30s
- `email:digest` — cron: `0 8 * * *` (daily), `0 8 * * 1` (weekly)
- `email:reminder` — sorted set keyed by `dueAt - reminderHours`

**Retry Policy:** 3 attempts, exponential backoff (1s, 5s, 30s). Failed jobs → `email:failed` queue for manual inspection.

### 2.5 Notification Preferences

**Data Models:**

```prisma
model WorkspaceNotificationSetting {
  id                     String  @id @default(cuid())
  workspaceId            String  @unique
  workspace              Workspace @relation(...)
  taskAssignedEmail      Boolean @default(true)
  taskMentionedEmail     Boolean @default(true)
  taskDueReminderEmail   Boolean @default(true)
  taskDueReminderHours   Int     @default(24)
  commentReplyEmail      Boolean @default(true)
  commentMentionEmail    Boolean @default(true)
  dailyDigest            Boolean @default(false)
  weeklyDigest           Boolean @default(true)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
}

model UserNotificationPreference {
  id                     String  @id @default(cuid())
  userId                 String
  workspaceId            String?  // null = global preference
  user                   User @relation(...)
  workspace              Workspace? @relation(...)
  taskAssignedEmail      Boolean?
  taskMentionedEmail     Boolean?
  taskDueReminderEmail   Boolean?
  taskDueReminderHours   Int?
  dailyDigest            Boolean?
  weeklyDigest           Boolean?
  emailDelayMinutes      Int     @default(0)
  @@unique([userId, workspaceId])  // null workspaceId = global
  @@index([userId])
}
```

**Resolution order:**
1. `UserNotificationPreference` for specific workspace (most specific)
2. `UserNotificationPreference` for global (userId, workspaceId = null)
3. `WorkspaceNotificationSetting` for the workspace
4. System defaults (see table above)

**API Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/notification-settings | Get workspace settings (admin) |
| PATCH | /api/notification-settings | Update workspace settings (admin) |
| GET | /api/notification-preferences | Get user preferences |
| PATCH | /api/notification-preferences | Update user preferences |

**Email Trigger Logic:**

```typescript
async function shouldSendEmail(userId: string, workspaceId: string, type: NotificationType): Promise<boolean> {
  const prefs = await getEffectivePreferences(userId, workspaceId);
  switch (type) {
    case 'TASK_ASSIGNED': return prefs.taskAssignedEmail;
    case 'TASK_MENTIONED': return prefs.taskMentionedEmail;
    case 'TASK_DUE_SOON': return prefs.taskDueReminderEmail;
    case 'COMMENT_REPLY': return prefs.commentReplyEmail;
    default: return false;
  }
}
```

---

## 3. File Map

### Backend (apps/api/src/modules/)

```
chat/
  chat.channel.repository.ts
  chat.channel.service.ts
  chat.channel.routes.ts
  chat.channel.schema.ts
  chat.channel.types.ts
  chat.message.repository.ts
  chat.message.service.ts
  chat.message.routes.ts
  chat.message.schema.ts
  chat.message.types.ts
  index.ts

email/
  email.provider.ts        # interface
  email.nodemailer.ts     # nodemailer implementation
  email.resend.ts         # resend implementation
  email.service.ts        # orchestrator
  email.scheduler.ts      # enqueues jobs
  email.routes.ts         # admin: test email, send now
  index.ts

notification-preferences/
  notification-preferences.repository.ts
  notification-preferences.service.ts
  notification-preferences.routes.ts
  notification-preferences.schema.ts
  index.ts

notification/
  notification.service.ts  # MODIFY: add email trigger on task assignment
```

### Email Worker (apps/email-worker/)

```
src/
  index.ts
  queues/
    index.ts
  processors/
    instant.processor.ts
    delayed.processor.ts
    digest.processor.ts
    reminder.processor.ts
  templates/
    task-assigned.ts
    task-due-reminder.ts
    digest.ts
  lib/
    prisma.ts
    email-provider.ts
package.json
tsconfig.json
vitest.config.ts
```

### Shared (packages/shared/src/)

```
chat.ts
email-preferences.ts    # WorkspaceNotificationSetting + UserNotificationPreference schemas
index.ts
```

### Frontend (apps/web/src/features/)

```
chat/
  types.ts
  api.ts
  hooks/
    useChannels.ts
    useMessages.ts
    useSendMessage.ts
    useRealtimeChat.ts
  components/
    ChatSidebar.tsx
    ChannelItem.tsx
    ChannelView.tsx
    MessageBubble.tsx
    ChatInput.tsx
    TaskChat.tsx
  index.ts

notification-preferences/
  types.ts
  api.ts
  hooks/
    useNotificationPreferences.ts
    useWorkspaceNotificationSettings.ts
  components/
    NotificationSettingsTab.tsx
    EmailPreferencesForm.tsx
  index.ts
```

### Prisma

New models: `ChatChannel`, `ChatMessage`, `WorkspaceNotificationSetting`, `UserNotificationPreference`, `EmailJob` (optional — for failed job tracking).

---

## 4. Acceptance Criteria

### Chat
- [ ] User can create/edit/delete chat channels in a workspace
- [ ] User can send messages in a channel
- [ ] @mentions in chat messages create notifications
- [ ] Messages appear in real-time across clients via Socket.IO
- [ ] Task detail has a Chat tab (extends Comment model with isChat flag)
- [ ] Private channels only visible to invited members

### Realtime Notification on Assignment
- [ ] Assigning a task to a user emits `notification:new` + `task:assigned` to assignee
- [ ] Assignee sees notification appear in real-time without refresh
- [ ] Board in other tabs updates assignee field immediately

### Email System
- [ ] Nodemailer provider sends emails via SMTP
- [ ] Resend provider sends emails via Resend API
- [ ] `EMAIL_PROVIDER` env selects implementation
- [ ] Email service has `send()` method that abstracts provider

### Email Scheduling
- [ ] Instant emails sent immediately after notification created
- [ ] Delayed emails queued with timestamp, sent after delay
- [ ] Daily digest email aggregates unread notifications at 08:00 local time
- [ ] Weekly digest email sent Monday 08:00
- [ ] Due date reminders sent N hours before due (configurable)
- [ ] Failed jobs retry 3x with exponential backoff
- [ ] Dead letter queue captures permanently failed jobs

### Notification Preferences
- [ ] Workspace admin can set default email preferences for the workspace
- [ ] User can override preferences per workspace
- [ ] User can set global preferences (apply to all workspaces)
- [ ] Preference resolution: user-specific > user-global > workspace > system default

---

## 5. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R-35 | Email worker adds container complexity | Medium | Low | Single BullMQ worker, restartable, connects to existing Redis |
| R-36 | SMTP/Resend credentials missing | High | Medium | Provider throws clear error if credentials absent; feature degrades gracefully |
| R-37 | Digest email large payload | Low | Low | Batch notifications, limit to 50 per digest |
| R-38 | Clock skew in scheduled emails | Low | Medium | Use Redis server time; store user timezone for digest |
| R-39 | Chat message spam | Low | Medium | Rate limit: 20 messages/min/user on channel routes |

---

## 6. Deferred

- Direct messages (DM) between users
- Message editing (v1: immutable messages)
- Message reactions
- Push notifications (mobile)
- Rich email template editor
- Email open/click tracking
