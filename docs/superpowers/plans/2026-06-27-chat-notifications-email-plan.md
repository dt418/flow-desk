# Chat + Notifications + Email System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement chat (workspace channels + task threads), realtime task-assignment notifications, and email system (instant/delayed/digest/reminder) with configurable preferences.

**Architecture:** BullMQ workers process 4 email types. Chat system extends existing Socket.IO `/collab` namespace. Notification preferences resolved: user-specific > user-global > workspace > system default. Task-level chat via `Comment.isChat` flag.

**Tech Stack:** BullMQ, nodemailer, resend, Socket.IO, Prisma, Redis.

---

## Global Constraints

- Prisma models must have `id` (cuid), `createdAt`, `updatedAt`, `deletedAt?` for soft-delete; `@@@index` on all FKs
- All Zod schemas in `packages/shared/src/`; inferred types exported
- Socket.IO events emitted AFTER successful DB writes only
- Email providers wrapped in try/catch; failures never crash API response
- Rate limits: auth: strict, API: moderate (60/min/user)
- All secrets in `.env` — never committed

---

## Phase 1: Database Schema + Shared Schemas

### Task 1.1: Prisma — Add Chat + NotificationPreference + EmailJob models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Changes:**

Add after `model Notification {`:
```prisma
model ChatChannel {
  id          String   @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation("WorkspaceChannels", fields: [workspaceId], references: [id])
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
  id              String       @id @default(cuid())
  channelId       String
  channel         ChatChannel  @relation("ChannelMessages", fields: [channelId], references: [id])
  authorId        String
  author          User         @relation(fields: [authorId], references: [id])
  content         String
  mentionedUserIds String[]
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  deletedAt       DateTime?
  @@index([channelId, createdAt])
  @@index([authorId])
}

model WorkspaceNotificationSetting {
  id                   String    @id @default(cuid())
  workspaceId          String    @unique
  workspace            Workspace @relation(fields: [workspaceId], references: [id])
  taskAssignedEmail    Boolean   @default(true)
  taskMentionedEmail   Boolean   @default(true)
  taskDueReminderEmail Boolean   @default(true)
  taskDueReminderHours Int       @default(24)
  commentReplyEmail    Boolean   @default(true)
  commentMentionEmail  Boolean   @default(true)
  dailyDigest          Boolean   @default(false)
  weeklyDigest        Boolean   @default(true)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}

model UserNotificationPreference {
  id                   String    @id @default(cuid())
  userId               String
  user                 User      @relation(fields: [userId], references: [id])
  workspaceId          String?   // null = global preference
  workspace            Workspace? @relation(fields: [workspaceId], references: [id])
  taskAssignedEmail    Boolean?
  taskMentionedEmail   Boolean?
  taskDueReminderEmail Boolean?
  taskDueReminderHours Int?
  dailyDigest          Boolean?
  weeklyDigest         Boolean?
  emailDelayMinutes    Int       @default(0)
  @@unique([userId, workspaceId])
  @@index([userId])
}

model EmailJob {
  id          String   @id @default(cuid())
  userId      String
  type        String   // INSTANT|DELAYED|DIGEST|REMINDER
  payload     Json
  status      String   @default('pending') // pending|processing|completed|failed
  attempts    Int      @default(0)
  maxAttempts Int      @default(3)
  scheduledAt DateTime @default(now())
  completedAt DateTime?
  failedAt    DateTime?
  error       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId, status])
  @@index([scheduledAt])
}
```

Add to `Workspace` model:
```prisma
channels        ChatChannel @relation("WorkspaceChannels")
notificationSetting WorkspaceNotificationSetting?
```

Add to `WorkspaceMember` model:
```prisma
notificationSetting UserNotificationPreference[]
```

Add `Comment` model:
```prisma
isChat Boolean @default(false)
```

**Step: Run migration**
```bash
./scripts/prisma-exec.sh migrate dev --name chat-email-preferences
```

---

### Task 1.2: Shared — Chat schemas

**Files:**
- Create: `packages/shared/src/chat.ts`

**Content:**
```typescript
import { z } from 'zod';

export const ChatChannelSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  isPrivate: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateChannelSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().default(false),
});

export const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  isPrivate: z.boolean().optional(),
});

export const ChatMessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  authorId: z.string(),
  content: z.string(),
  mentionedUserIds: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export type ChatChannel = z.infer<typeof ChatChannelSchema>;
export type CreateChannelInput = z.infer<typeof CreateChannelSchema>;
export type UpdateChannelInput = z.infer<typeof UpdateChannelSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
```

**Step: Add export to `packages/shared/src/index.ts`**
```typescript
export * from './chat';
```

---

### Task 1.3: Shared — Notification preferences schemas

**Files:**
- Create: `packages/shared/src/notification-preferences.ts`

**Content:**
```typescript
import { z } from 'zod';

export const WorkspaceNotificationSettingSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  taskAssignedEmail: z.boolean(),
  taskMentionedEmail: z.boolean(),
  taskDueReminderEmail: z.boolean(),
  taskDueReminderHours: z.number().int().min(1).max(168),
  commentReplyEmail: z.boolean(),
  commentMentionEmail: z.boolean(),
  dailyDigest: z.boolean(),
  weeklyDigest: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const UpdateWorkspaceNotificationSettingSchema = z.object({
  taskAssignedEmail: z.boolean().optional(),
  taskMentionedEmail: z.boolean().optional(),
  taskDueReminderEmail: z.boolean().optional(),
  taskDueReminderHours: z.number().int().min(1).max(168).optional(),
  commentReplyEmail: z.boolean().optional(),
  commentMentionEmail: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
});

export const UserNotificationPreferenceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string().nullable(),
  taskAssignedEmail: z.boolean().nullable(),
  taskMentionedEmail: z.boolean().nullable(),
  taskDueReminderEmail: z.boolean().nullable(),
  taskDueReminderHours: z.number().int().min(1).max(168).nullable(),
  dailyDigest: z.boolean().nullable(),
  weeklyDigest: z.boolean().nullable(),
  emailDelayMinutes: z.number().int().min(0).max(60),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const UpdateUserNotificationPreferenceSchema = z.object({
  workspaceId: z.string().nullable().optional(),
  taskAssignedEmail: z.boolean().nullable().optional(),
  taskMentionedEmail: z.boolean().nullable().optional(),
  taskDueReminderEmail: z.boolean().nullable().optional(),
  taskDueReminderHours: z.number().int().min(1).max(168).nullable().optional(),
  dailyDigest: z.boolean().nullable().optional(),
  weeklyDigest: z.boolean().nullable().optional(),
  emailDelayMinutes: z.number().int().min(0).max(60).optional(),
});

export type WorkspaceNotificationSetting = z.infer<typeof WorkspaceNotificationSettingSchema>;
export type UpdateWorkspaceNotificationSetting = z.infer<typeof UpdateWorkspaceNotificationSettingSchema>;
export type UserNotificationPreference = z.infer<typeof UserNotificationPreferenceSchema>;
export type UpdateUserNotificationPreference = z.infer<typeof UpdateUserNotificationPreferenceSchema>;

export interface EffectivePreferences {
  taskAssignedEmail: boolean;
  taskMentionedEmail: boolean;
  taskDueReminderEmail: boolean;
  taskDueReminderHours: number;
  commentReplyEmail: boolean;
  commentMentionEmail: boolean;
  dailyDigest: boolean;
  weeklyDigest: boolean;
  emailDelayMinutes: number;
}
```

**Step: Add export to `packages/shared/src/index.ts`**
```typescript
export * from './notification-preferences';
```

**Step: Build shared package**
```bash
cd packages/shared && pnpm build
```

---

## Phase 2: Email Provider + Scheduler

### Task 2.1: Email Provider Interface + Implementations

**Files:**
- Create: `apps/api/src/modules/email/email.provider.ts`
- Create: `apps/api/src/modules/email/email.nodemailer.ts`
- Create: `apps/api/src/modules/email/email.resend.ts`
- Create: `apps/api/src/modules/email/email.service.ts`
- Create: `apps/api/src/modules/email/index.ts`

**Content — `email.provider.ts`:**
```typescript
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
  sendTemplate(to: string, template: EmailTemplate): Promise<void>;
}
```

**Content — `email.nodemailer.ts`:**
```typescript
import nodemailer from 'nodemailer';
import type { EmailProvider, EmailTemplate } from './email.provider';

let transporter: nodemailer.Transporter | null = null;

export function getNodemailerTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587'),
      secure: parseInt(process.env.SMTP_PORT ?? '587') === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export class NodemailerProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<void> {
    const t = getNodemailerTransporter();
    await t.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    });
  }

  async sendTemplate(to: string, template: EmailTemplate): Promise<void> {
    const t = getNodemailerTransporter();
    await t.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }
}
```

**Content — `email.resend.ts`:**
```typescript
import { Resend } from 'resend';
import type { EmailProvider, EmailTemplate } from './email.provider';

let client: Resend | null = null;

export function getResendClient() {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

export class ResendProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<void> {
    const r = getResendClient();
    await r.emails.send({
      from: process.env.RESEND_FROM ?? 'FlowDesk <noreply@flow-desk.app>',
      to,
      subject,
      text: body,
      html: body.replace(/\n/g, '<br>'),
    });
  }

  async sendTemplate(to: string, template: EmailTemplate): Promise<void> {
    const r = getResendClient();
    await r.emails.send({
      from: process.env.RESEND_FROM ?? 'FlowDesk <noreply@flow-desk.app>',
      to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }
}
```

**Content — `email.service.ts`:**
```typescript
import type { EmailProvider } from './email.provider';
import { NodemailerProvider } from './email.nodemailer';
import { ResendProvider } from './email.resend';

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const type = process.env.EMAIL_PROVIDER ?? 'nodemailer';
  if (type === 'resend') {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set');
    }
    provider = new ResendProvider();
  } else {
    if (!process.env.SMTP_HOST) {
      throw new Error('SMTP_HOST is not set');
    }
    provider = new NodemailerProvider();
  }
  return provider;
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  try {
    await getEmailProvider().send(to, subject, body);
  } catch (err) {
    console.error('[email] send failed:', err);
  }
}

export async function sendEmailTemplate(to: string, template: { subject: string; html: string; text: string }): Promise<void> {
  try {
    await getEmailProvider().sendTemplate(to, template);
  } catch (err) {
    console.error('[email] sendTemplate failed:', err);
  }
}
```

**Step: Install dependencies**
```bash
cd apps/api && pnpm add nodemailer && pnpm add -D @types/nodemailer && pnpm add resend
```

---

### Task 2.2: Email Templates

**Files:**
- Create: `apps/api/src/modules/email/templates/task-assigned.ts`
- Create: `apps/api/src/modules/email/templates/task-due-reminder.ts`
- Create: `apps/api/src/modules/email/templates/digest.ts`

**Content — `task-assigned.ts`:**
```typescript
import type { EmailTemplate } from '../email.provider';

export function taskAssignedTemplate(
  assigneeName: string,
  taskTitle: string,
  workspaceName: string,
  taskUrl: string,
  assignedByName: string,
): EmailTemplate {
  return {
    subject: `[${workspaceName}] Task assigned: ${taskTitle}`,
    text: `Hi ${assigneeName},\n\n${assignedByName} assigned you the task "${taskTitle}" in ${workspaceName}.\n\nView task: ${taskUrl}`,
    html: `<p>Hi ${assigneeName},</p><p><strong>${assignedByName}</strong> assigned you the task <strong>"${taskTitle}"</strong> in ${workspaceName}.</p><p><a href="${taskUrl}">View task →</a></p>`,
  };
}
```

**Content — `task-due-reminder.ts`:**
```typescript
import type { EmailTemplate } from '../email.provider';

export function taskDueReminderTemplate(
  userName: string,
  taskTitle: string,
  workspaceName: string,
  dueDate: string,
  taskUrl: string,
): EmailTemplate {
  return {
    subject: `[${workspaceName}] Reminder: "${taskTitle}" is due soon`,
    text: `Hi ${userName},\n\nYour task "${taskTitle}" in ${workspaceName} is due on ${dueDate}.\n\nView task: ${taskUrl}`,
    html: `<p>Hi ${userName},</p><p>Your task <strong>"${taskTitle}"</strong> in ${workspaceName} is due on <strong>${dueDate}</strong>.</p><p><a href="${taskUrl}">View task →</a></p>`,
  };
}
```

**Content — `digest.ts`:**
```typescript
import type { EmailTemplate } from '../email.provider';

export interface DigestNotification {
  type: string;
  title: string;
  body: string;
  createdAt: string;
}

export function digestTemplate(
  userName: string,
  notifications: DigestNotification[],
  digestType: 'daily' | 'weekly',
): EmailTemplate {
  const greeting = digestType === 'daily' ? 'Good morning' : 'Happy Monday';
  const period = digestType === 'daily' ? 'today' : 'this week';
  const items = notifications
    .map((n) => `<li><strong>${n.title}</strong> — ${n.body}</li>`)
    .join('');
  return {
    subject: `FlowDesk Digest — ${period}`,
    text: `${greeting} ${userName},\n\nHere's what happened ${period}:\n\n${notifications.map((n) => `• ${n.title}: ${n.body}`).join('\n')}`,
    html: `<p>${greeting} ${userName},</p><p>Here's what happened ${period}:</p><ul>${items}</ul>`,
  };
}
```

---

## Phase 3: Email Worker

### Task 3.1: Email Worker — Queue Setup + Instant Processor

**Files:**
- Create: `apps/email-worker/package.json`
- Create: `apps/email-worker/tsconfig.json`
- Create: `apps/email-worker/src/index.ts`
- Create: `apps/email-worker/src/queues/index.ts`
- Create: `apps/email-worker/src/processors/instant.processor.ts`
- Create: `apps/email-worker/src/lib/prisma.ts`
- Create: `apps/email-worker/src/lib/email-provider.ts`

**Content — `package.json`:**
```json
{
  "name": "@flow-desk/email-worker",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup src/index.ts --format cjs",
    "start": "node dist/index.cjs",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@flow-desk/shared": "workspace:*",
    "bullmq": "^5.1.0",
    "ioredis": "^5.3.0",
    "nodemailer": "^6.9.0",
    "resend": "^3.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/nodemailer": "^6.4.0",
    "tsx": "^4.7.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0"
  }
}
```

**Content — `src/lib/redis.ts`:**
```typescript
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379');

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});
```

**Content — `src/lib/prisma.ts`:**
```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

**Content — `src/lib/email-provider.ts`:**
```typescript
import type { EmailProvider } from '@flow-desk/shared'; // re-export interface

// In worker, re-implement or import from a shared module
export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}
```

**Content — `src/queues/index.ts`:**
```typescript
import { Queue, Worker, JobsOptions } from 'bullmq';
import { redis } from '../lib/redis';

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

export const instantQueue = new Queue('email:instant', {
  connection: redis,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const delayedQueue = new Queue('email:delayed', {
  connection: redis,
  defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, removeOnComplete: false },
});

export const reminderQueue = new Queue('email:reminder', {
  connection: redis,
  defaultJobOptions: { ...DEFAULT_JOB_OPTIONS, removeOnComplete: false },
});
```

**Content — `src/processors/instant.processor.ts`:**
```typescript
import { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import type { EmailTemplate } from '../lib/email-provider';

// Inline provider (same as API, avoids shared package circular dep)
import nodemailer from 'nodemailer';

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendTemplate(to: string, template: EmailTemplate) {
  const t = getTransporter();
  await t.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

interface InstantJobData {
  userId: string;
  email: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function processInstant(job: Job<InstantJobData>) {
  const { userId, email, type, payload } = job.data;

  // Log job
  await prisma.emailJob.create({
    data: { userId, type, payload, status: 'processing' },
  });

  try {
    const templates: Record<string, (p: Record<string, unknown>) => EmailTemplate> = {
      TASK_ASSIGNED: (p) => ({
        subject: `[${p.workspaceName}] Task assigned: ${p.taskTitle}`,
        text: `Hi ${p.assigneeName},\n\n${p.assignedByName} assigned you the task "${p.taskTitle}" in ${p.workspaceName}.\n\nView task: ${p.taskUrl}`,
        html: `<p>Hi ${p.assigneeName},</p><p><strong>${p.assignedByName}</strong> assigned you the task <strong>"${p.taskTitle}"</strong> in ${p.workspaceName}.</p><p><a href="${p.taskUrl}">View task →</a></p>`,
      }),
      TASK_DUE_REMINDER: (p) => ({
        subject: `[${p.workspaceName}] Reminder: "${p.taskTitle}" is due soon`,
        text: `Hi ${p.userName},\n\nYour task "${p.taskTitle}" in ${p.workspaceName} is due on ${p.dueDate}.\n\nView task: ${p.taskUrl}`,
        html: `<p>Hi ${p.userName},</p><p>Your task <strong>"${p.taskTitle}"</strong> in ${p.workspaceName} is due on <strong>${p.dueDate}</strong>.</p><p><a href="${p.taskUrl}">View task →</a></p>`,
      }),
    };

    const fn = templates[type];
    if (!fn) return;

    const template = fn(payload);
    await sendTemplate(email, template);

    await prisma.emailJob.updateMany({
      where: { userId, type, status: 'processing' },
      data: { status: 'completed', completedAt: new Date() },
    });
  } catch (err) {
    await prisma.emailJob.updateMany({
      where: { userId, type, status: 'processing' },
      data: { status: 'failed', failedAt: new Date(), error: String(err) },
    });
    throw err;
  }
}
```

**Content — `src/index.ts`:**
```typescript
import { Worker } from 'bullmq';
import { redis } from './lib/redis';
import { instantQueue, delayedQueue, reminderQueue } from './queues';
import { processInstant } from './processors/instant.processor';

const PORT = parseInt(process.env.EMAIL_WORKER_PORT ?? '3002');

new Worker('email:instant', processInstant, { connection: redis, concurrency: 5 }).on('failed', (job, err) => {
  console.error(`[email:instant] job ${job?.id} failed:`, err.message);
});

// Delayed + reminder workers stub — fill in Tasks 3.2+3.3
new Worker('email:delayed', async (job) => { /* TODO */ }, { connection: redis, concurrency: 2 });
new Worker('email:reminder', async (job) => { /* TODO */ }, { connection: redis, concurrency: 2 });

console.log(`[email-worker] listening on port ${PORT}`);
```

**Step: Add to workspace `pnpm-workspace.yaml` if not already**
```yaml
packages:
  - 'apps/email-worker'
```

---

### Task 3.2: Email Worker — Delayed Processor

**Files:**
- Modify: `apps/email-worker/src/queues/index.ts` — add `scheduleDelayed` helper
- Modify: `apps/email-worker/src/index.ts` — wire delayed processor
- Create: `apps/email-worker/src/processors/delayed.processor.ts`

**Step: Add `scheduleDelayed` to queues/index.ts**
```typescript
import { Queue, Worker } from 'bullmq';
import { redis } from '../lib/redis';

export async function scheduleDelayed(
  userId: string,
  email: string,
  type: string,
  payload: Record<string, unknown>,
  delayMs: number,
) {
  const scheduledAt = new Date(Date.now() + delayMs);
  await delayedQueue.add(
    `${type}:${userId}:${Date.now()}`,
    { userId, email, type, payload, scheduledAt: scheduledAt.toISOString() },
    { delay: delayMs },
  );
  return scheduledAt;
}
```

**Step: Create `delayed.processor.ts`**
```typescript
import { Job } from 'bullmq';
import { processInstant } from './instant.processor';

interface DelayedJobData {
  userId: string;
  email: string;
  type: string;
  payload: Record<string, unknown>;
  scheduledAt: string;
}

export async function processDelayed(job: Job<DelayedJobData>) {
  // Reuse instant processor logic
  await processInstant({
    data: job.data,
    id: job.id ?? 'unknown',
  } as Job<{ userId: string; email: string; type: string; payload: Record<string, unknown> }>);
}
```

---

### Task 3.3: Email Worker — Reminder + Digest Processor

**Files:**
- Create: `apps/email-worker/src/processors/reminder.processor.ts`
- Create: `apps/email-worker/src/processors/digest.processor.ts`
- Modify: `apps/email-worker/src/index.ts` — add digest cron

**Content — `reminder.processor.ts`:**
```typescript
import { Job } from 'bullmq';
import { prisma } from '../lib/prisma';
import { taskDueReminderTemplate } from '../templates/task-due-reminder';
import nodemailer from 'nodemailer';
import type { EmailTemplate } from '../lib/email-provider';

interface ReminderJobData {
  userId: string;
  email: string;
  taskId: string;
  taskTitle: string;
  workspaceName: string;
  dueDate: string;
  taskUrl: string;
}

async function sendTemplate(to: string, template: EmailTemplate) {
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await t.sendMail({ from: process.env.SMTP_FROM, to, ...template });
}

export async function processReminder(job: Job<ReminderJobData>) {
  const { userId, email, taskId, taskTitle, workspaceName, dueDate, taskUrl } = job.data;

  await prisma.emailJob.create({
    data: { userId, type: 'REMINDER', payload: job.data as any, status: 'processing' },
  });

  try {
    const template = taskDueReminderTemplate(email.split('@')[0], taskTitle, workspaceName, dueDate, taskUrl);
    await sendTemplate(email, template);
    await prisma.emailJob.updateMany({
      where: { userId, type: 'REMINDER', status: 'processing' },
      data: { status: 'completed', completedAt: new Date() },
    });
  } catch (err) {
    await prisma.emailJob.updateMany({
      where: { userId, type: 'REMINDER', status: 'processing' },
      data: { status: 'failed', failedAt: new Date(), error: String(err) },
    });
    throw err;
  }
}
```

**Content — `digest.processor.ts`:**
```typescript
import { prisma } from '../lib/prisma';
import { digestTemplate } from '../templates/digest';
import nodemailer from 'nodemailer';
import type { EmailTemplate } from '../lib/email-provider';

async function sendTemplate(to: string, template: EmailTemplate) {
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await t.sendMail({ from: process.env.SMTP_FROM, to, ...template });
}

export async function runDigest(digestType: 'daily' | 'weekly') {
  const users = await prisma.user.findMany();

  for (const user of users) {
    const prefs = await getEffectivePrefs(user.id);
    const wantsDigest = digestType === 'daily' ? prefs.dailyDigest : prefs.weeklyDigest;
    if (!wantsDigest) continue;

    const since = digestType === 'daily'
      ? new Date(Date.now() - 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id, createdAt: { gte: since }, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (notifications.length === 0) continue;

    const template = digestTemplate(
      user.name,
      notifications.map((n) => ({
        type: n.type,
        title: n.title,
        body: n.body ?? '',
        createdAt: n.createdAt.toISOString(),
      })),
      digestType,
    );

    try {
      await sendTemplate(user.email, template);
      await prisma.emailJob.create({
        data: { userId: user.id, type: digestType.toUpperCase() + '_DIGEST', payload: { count: notifications.length }, status: 'completed', completedAt: new Date() },
      });
    } catch (err) {
      console.error(`[digest] failed for user ${user.id}:`, err);
    }
  }
}

async function getEffectivePrefs(userId: string) {
  const pref = await prisma.userNotificationPreference.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: null } },
  });
  return {
    dailyDigest: pref?.dailyDigest ?? false,
    weeklyDigest: pref?.weeklyDigest ?? true,
  };
}
```

**Modify `src/index.ts`** — add digest cron:
```typescript
import { Worker } from 'bullmq';
import cron from 'node-cron';
import { redis } from './lib/redis';
import { runDigest } from './processors/digest.processor';

// Daily digest at 8am
cron.schedule('0 8 * * *', () => runDigest('daily'));
// Weekly digest Monday 8am
cron.schedule('0 8 * * 1', () => runDigest('weekly'));
```

---

## Phase 4: Chat System

### Task 4.1: Chat Channel API

**Files:**
- Create: `apps/api/src/modules/chat/chat.channel.repository.ts`
- Create: `apps/api/src/modules/chat/chat.channel.service.ts`
- Create: `apps/api/src/modules/chat/chat.channel.routes.ts`
- Create: `apps/api/src/modules/chat/chat.channel.schema.ts`
- Create: `apps/api/src/modules/chat/chat.channel.types.ts`
- Create: `apps/api/src/modules/chat/index.ts`

**Content — `chat.channel.repository.ts`:**
```typescript
import type { PrismaClient } from '../../shared/lib/prisma';

export async function findChannels(prisma: PrismaClient, workspaceId: string) {
  return prisma.chatChannel.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function findChannelById(prisma: PrismaClient, id: string) {
  return prisma.chatChannel.findFirst({ where: { id, deletedAt: null } });
}

export async function createChannel(
  prisma: PrismaClient,
  data: { workspaceId: string; name: string; description?: string; isPrivate: boolean },
) {
  return prisma.chatChannel.create({ data });
}

export async function updateChannel(
  prisma: PrismaClient,
  id: string,
  data: { name?: string; description?: string | null; isPrivate?: boolean },
) {
  return prisma.chatChannel.update({ where: { id }, data });
}

export async function deleteChannel(prisma: PrismaClient, id: string) {
  return prisma.chatChannel.update({ where: { id }, data: { deletedAt: new Date() } });
}
```

**Content — `chat.channel.service.ts`:**
```typescript
import type { PrismaClient } from '../../shared/lib/prisma';
import * as repo from './chat.channel.repository';
import { NotFoundError } from '../../shared/errors';

export async function listChannels(prisma: PrismaClient, workspaceId: string) {
  return repo.findChannels(prisma, workspaceId);
}

export async function getChannel(prisma: PrismaClient, id: string) {
  const channel = await repo.findChannelById(prisma, id);
  if (!channel) throw new NotFoundError('Channel');
  return channel;
}

export async function createChannel(
  prisma: PrismaClient,
  data: { workspaceId: string; name: string; description?: string; isPrivate: boolean },
) {
  return repo.createChannel(prisma, data);
}

export async function updateChannel(
  prisma: PrismaClient,
  id: string,
  data: { name?: string; description?: string | null; isPrivate?: boolean },
) {
  await getChannel(prisma, id);
  return repo.updateChannel(prisma, id, data);
}

export async function deleteChannel(prisma: PrismaClient, id: string) {
  await getChannel(prisma, id);
  return repo.deleteChannel(prisma, id);
}
```

**Content — `chat.channel.schema.ts`:**
```typescript
import { z } from 'zod';
import { CreateChannelSchema, UpdateChannelSchema } from '@flow-desk/shared/chat';

export { CreateChannelSchema, UpdateChannelSchema };
```

**Content — `chat.channel.routes.ts`:**
```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Variables } from '../../app';
import { requireAuth } from '../../shared/middleware/auth';
import { requireWorkspaceRole } from '../../shared/middleware/workspace-auth';
import { assertMembership } from '../../shared/lib/access';
import { safeEmit } from '../../shared/lib/socket';
import * as service from './chat.channel.service';
import { CreateChannelSchema, UpdateChannelSchema } from './chat.channel.schema';

const channels = new Hono<{ Variables: Variables }>();

channels.use('/*', requireAuth());

channels.get('/', async (c) => {
  const user = c.get('auth');
  const workspaceId = c.req.query('workspaceId');
  if (!workspaceId) return c.json({ message: 'workspaceId required' }, 400);
  await assertMembership(workspaceId, user.id);
  const data = await service.listChannels(c.get('prisma'), workspaceId);
  return c.json({ data });
});

channels.post('/', zValidator('json', CreateChannelSchema), async (c) => {
  const user = c.get('auth');
  const body = c.req.valid('json');
  await assertMembership(body.workspaceId, user.id);
  const channel = await service.createChannel(c.get('prisma'), body);
  safeEmit('collab', 'channel:new', { channel });
  return c.json({ data: channel }, 201);
});

channels.patch('/:id', zValidator('json', UpdateChannelSchema), async (c) => {
  const user = c.get('auth');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const channel = await service.getChannel(c.get('prisma'), id);
  await assertMembership(channel.workspaceId, user.id);
  const updated = await service.updateChannel(c.get('prisma'), id, body);
  safeEmit('collab', 'channel:updated', { channel: updated });
  return c.json({ data: updated });
});

channels.delete('/:id', async (c) => {
  const user = c.get('auth');
  const id = c.req.param('id');
  const channel = await service.getChannel(c.get('prisma'), id);
  await assertMembership(channel.workspaceId, user.id);
  await service.deleteChannel(c.get('prisma'), id);
  safeEmit('collab', 'channel:deleted', { channelId: id });
  return c.json({ ok: true });
});

export default channels;
```

---

### Task 4.2: Chat Message API

**Files:**
- Create: `apps/api/src/modules/chat/chat.message.repository.ts`
- Create: `apps/api/src/modules/chat/chat.message.service.ts`
- Create: `apps/api/src/modules/chat/chat.message.routes.ts`
- Create: `apps/api/src/modules/chat/chat.message.schema.ts`
- Create: `apps/api/src/modules/chat/chat.message.types.ts`
- Create: `apps/api/src/modules/chat/chat.types.ts`
- Modify: `apps/api/src/modules/chat/index.ts` — wire routes
- Modify: `apps/api/src/app.ts` — register channel + message routers

**Content — `chat.message.repository.ts`:**
```typescript
import type { PrismaClient } from '../../shared/lib/prisma';

export async function findMessages(
  prisma: PrismaClient,
  channelId: string,
  limit: number,
  cursor?: { createdAt: Date; id: string },
) {
  return prisma.chatMessage.findMany({
    where: { channelId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { createdAt: cursor.createdAt, id: cursor.id } } : {}),
  });
}

export async function createMessage(
  prisma: PrismaClient,
  data: { channelId: string; authorId: string; content: string; mentionedUserIds: string[] },
) {
  return prisma.chatMessage.create({ data });
}
```

**Content — `chat.message.service.ts`:**
```typescript
import type { PrismaClient } from '../../shared/lib/prisma';
import * as repo from './chat.message.repository';
import { encodeCursor } from '@flow-desk/shared/pagination';

export async function listMessages(
  prisma: PrismaClient,
  channelId: string,
  limit: number,
  cursor?: { createdAt: Date; id: string },
) {
  const items = await repo.findMessages(prisma, channelId, limit, cursor);
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;
  return { data: data.reverse(), nextCursor }; // chronological order
}

export async function sendMessage(
  prisma: PrismaClient,
  data: { channelId: string; authorId: string; content: string },
) {
  const mentionedUserIds = extractMentions(data.content);
  return repo.createMessage(prisma, { ...data, mentionedUserIds });
}

function extractMentions(content: string): string[] {
  const matches = content.match(/@(\w+)/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}
```

**Content — `chat.message.routes.ts`:**
```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Variables } from '../../app';
import { requireAuth } from '../../shared/middleware/auth';
import { assertMembership } from '../../shared/lib/access';
import { safeEmit } from '../../shared/lib/socket';
import { getChannel } from './chat.channel.service';
import * as service from './chat.message.service';
import { SendMessageSchema } from '@flow-desk/shared/chat';
import { decodeCursor } from '@flow-desk/shared/pagination';

const messages = new Hono<{ Variables: Variables }>();

messages.use('/*', requireAuth());

messages.get('/', async (c) => {
  const user = c.get('auth');
  const channelId = c.req.query('channelId');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 100);
  const cursorParam = c.req.query('cursor');
  const cursor = cursorParam ? decodeCursor(cursorParam) : undefined;

  if (!channelId) return c.json({ message: 'channelId required' }, 400);
  const channel = await getChannel(c.get('prisma'), channelId);
  await assertMembership(channel.workspaceId, user.id);

  const result = await service.listMessages(c.get('prisma'), channelId, limit, cursor);
  return c.json(result);
});

messages.post('/', zValidator('json', SendMessageSchema), async (c) => {
  const user = c.get('auth');
  const body = c.req.valid('json');
  const channelId = c.req.query('channelId');
  if (!channelId) return c.json({ message: 'channelId required' }, 400);

  const channel = await getChannel(c.get('prisma'), channelId);
  await assertMembership(channel.workspaceId, user.id);

  const message = await service.sendMessage(c.get('prisma'), {
    channelId,
    authorId: user.id,
    content: body.content,
  });

  safeEmit('collab', 'message:new', { channelId, message });
  return c.json({ data: message }, 201);
});

export default messages;
```

---

### Task 4.3: Task-level Chat

**Files:**
- Modify: `apps/api/src/modules/comment/comment.routes.ts` — add `isChat` param to create
- Modify: `apps/api/src/modules/comment/comment.service.ts` — filter by `isChat`
- Modify: `apps/api/src/modules/task/task.routes.ts` — add chat tab endpoint

**Step: Modify comment routes** — on POST, accept optional `isChat: boolean` in body:
```typescript
const bodySchema = CreateCommentSchema.extend({ isChat: z.boolean().optional() });
```

**Step: Add `getTaskChat` endpoint** in task.routes.ts:
```typescript
taskChat.get('/:id/chat', async (c) => {
  const user = c.get('auth');
  const taskId = c.req.param('id');
  const task = await service.getTask(c.get('prisma'), taskId);
  await assertMembership(task.workspaceId, user.id);
  const messages = await commentService.listComments(c.get('prisma'), taskId, 50, true);
  return c.json({ data: messages });
});
```

---

## Phase 5: Notification Preferences + Assignment Trigger

### Task 5.1: Notification Preferences API

**Files:**
- Create: `apps/api/src/modules/notification-preferences/notification-preferences.repository.ts`
- Create: `apps/api/src/modules/notification-preferences/notification-preferences.service.ts`
- Create: `apps/api/src/modules/notification-preferences/notification-preferences.routes.ts`
- Create: `apps/api/src/modules/notification-preferences/notification-preferences.schema.ts`
- Create: `apps/api/src/modules/notification-preferences/index.ts`

**Content — `notification-preferences.service.ts`:**
```typescript
import type { PrismaClient } from '../../shared/lib/prisma';
import type { EffectivePreferences } from '@flow-desk/shared/notification-preferences';

const DEFAULTS: EffectivePreferences = {
  taskAssignedEmail: true,
  taskMentionedEmail: true,
  taskDueReminderEmail: true,
  taskDueReminderHours: 24,
  commentReplyEmail: true,
  commentMentionEmail: true,
  dailyDigest: false,
  weeklyDigest: true,
  emailDelayMinutes: 0,
};

export async function getEffectivePreferences(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<EffectivePreferences> {
  const [userPref, globalPref, workspaceSetting] = await Promise.all([
    prisma.userNotificationPreference.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } }),
    prisma.userNotificationPreference.findUnique({ where: { userId_workspaceId: { userId, workspaceId: null } } }),
    prisma.workspaceNotificationSetting.findUnique({ where: { workspaceId } }),
  ]);

  return {
    taskAssignedEmail: userPref?.taskAssignedEmail ?? globalPref?.taskAssignedEmail ?? workspaceSetting?.taskAssignedEmail ?? DEFAULTS.taskAssignedEmail,
    taskMentionedEmail: userPref?.taskMentionedEmail ?? globalPref?.taskMentionedEmail ?? workspaceSetting?.taskMentionedEmail ?? DEFAULTS.taskMentionedEmail,
    taskDueReminderEmail: userPref?.taskDueReminderEmail ?? globalPref?.taskDueReminderEmail ?? workspaceSetting?.taskDueReminderEmail ?? DEFAULTS.taskDueReminderEmail,
    taskDueReminderHours: userPref?.taskDueReminderHours ?? globalPref?.taskDueReminderHours ?? workspaceSetting?.taskDueReminderHours ?? DEFAULTS.taskDueReminderHours,
    commentReplyEmail: userPref?.commentReplyEmail ?? globalPref?.commentReplyEmail ?? workspaceSetting?.commentReplyEmail ?? DEFAULTS.commentReplyEmail,
    commentMentionEmail: userPref?.commentMentionEmail ?? globalPref?.commentMentionEmail ?? workspaceSetting?.commentMentionEmail ?? DEFAULTS.commentMentionEmail,
    dailyDigest: userPref?.dailyDigest ?? globalPref?.dailyDigest ?? workspaceSetting?.dailyDigest ?? DEFAULTS.dailyDigest,
    weeklyDigest: userPref?.weeklyDigest ?? globalPref?.weeklyDigest ?? workspaceSetting?.weeklyDigest ?? DEFAULTS.weeklyDigest,
    emailDelayMinutes: userPref?.emailDelayMinutes ?? globalPref?.emailDelayMinutes ?? DEFAULTS.emailDelayMinutes,
  };
}

export async function upsertUserPreference(
  prisma: PrismaClient,
  userId: string,
  data: { workspaceId?: string | null; [key: string]: unknown },
) {
  const { workspaceId = null, ...rest } = data;
  return prisma.userNotificationPreference.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    update: rest,
    create: { userId, workspaceId, ...rest },
  });
}

export async function getOrCreateWorkspaceSetting(prisma: PrismaClient, workspaceId: string) {
  return prisma.workspaceNotificationSetting.upsert({
    where: { workspaceId },
    update: {},
    create: { workspaceId },
  });
}

export async function updateWorkspaceSetting(
  prisma: PrismaClient,
  workspaceId: string,
  data: Record<string, unknown>,
) {
  return prisma.workspaceNotificationSetting.upsert({
    where: { workspaceId },
    update: data,
    create: { workspaceId, ...data },
  });
}
```

**Content — `notification-preferences.routes.ts`:**
```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Variables } from '../../app';
import { requireAuth } from '../../shared/middleware/auth';
import { requireWorkspaceRole } from '../../shared/middleware/workspace-auth';
import { assertMembership } from '../../shared/lib/access';
import * as service from './notification-preferences.service';
import { UpdateWorkspaceNotificationSettingSchema, UpdateUserNotificationPreferenceSchema } from '@flow-desk/shared/notification-preferences';

const prefs = new Hono<{ Variables: Variables }>();
prefs.use('/*', requireAuth());

// Workspace settings (admin only)
prefs.get('/:workspaceId/settings', async (c) => {
  const user = c.get('auth');
  const workspaceId = c.req.param('workspaceId');
  await assertMembership(workspaceId, user.id);
  const setting = await service.getOrCreateWorkspaceSetting(c.get('prisma'), workspaceId);
  return c.json({ data: setting });
});

prefs.patch('/:workspaceId/settings', requireWorkspaceRole(['OWNER', 'ADMIN']), zValidator('json', UpdateWorkspaceNotificationSettingSchema), async (c) => {
  const user = c.get('auth');
  const workspaceId = c.req.param('workspaceId');
  const body = c.req.valid('json');
  const setting = await service.updateWorkspaceSetting(c.get('prisma'), workspaceId, body);
  return c.json({ data: setting });
});

// User preferences
prefs.get('/', async (c) => {
  const user = c.get('auth');
  const workspaceId = c.req.query('workspaceId');
  const effective = await service.getEffectivePreferences(c.get('prisma'), user.id, workspaceId ?? '');
  const prefs = workspaceId
    ? await c.get('prisma').userNotificationPreference.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId } } })
    : await c.get('prisma').userNotificationPreference.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: null } } });
  return c.json({ data: { effective, current: prefs } });
});

prefs.patch('/', zValidator('json', UpdateUserNotificationPreferenceSchema), async (c) => {
  const user = c.get('auth');
  const body = c.req.valid('json');
  const pref = await service.upsertUserPreference(c.get('prisma'), user.id, body);
  return c.json({ data: pref });
});

export default prefs;
```

---

### Task 5.2: Task Assignment → Notification + Email

**Files:**
- Modify: `apps/api/src/modules/notification/notification.service.ts` — add `createTaskAssignmentNotification`
- Modify: `apps/api/src/modules/task/task.service.ts` — trigger notification + email on assign
- Create: `apps/api/src/modules/notification/notification-email.service.ts`

**Step: Add to `notification.service.ts`:**
```typescript
export async function createTaskAssignmentNotification(
  prisma: PrismaClient,
  data: { taskId: string; taskTitle: string; workspaceId: string; assigneeId: string; assignedById: string; workspaceName: string },
) {
  const notification = await prisma.notification.create({
    data: {
      userId: data.assigneeId,
      type: 'TASK_ASSIGNED',
      title: `You were assigned: ${data.taskTitle}`,
      body: `in ${data.workspaceName}`,
      data: { taskId: data.taskId, assignedById: data.assignedById },
    },
  });
  return notification;
}
```

**Step: Modify `task.service.ts`** — in `updateTask`, when `assigneeId` changes:
```typescript
// After successful update where assigneeId changed:
if (previousAssigneeId !== updatedTask.assigneeId && updatedTask.assigneeId) {
  const assignee = await prisma.user.findUnique({ where: { id: updatedTask.assigneeId } });
  if (assignee) {
    // Create in-app notification
    await notificationService.createTaskAssignmentNotification(prisma, {
      taskId: updatedTask.id,
      taskTitle: updatedTask.title,
      workspaceId: updatedTask.workspaceId,
      assigneeId: updatedTask.assigneeId,
      assignedById: authUserId,
      workspaceName: workspace.name,
    });

    // Emit realtime to assignee
    safeEmit('notifications', `notification:new`, { notification });
    safeEmit('tasks', `task:assigned`, { taskId: updatedTask.id, assigneeId: updatedTask.assigneeId });

    // Enqueue email job
    const prefs = await notificationPreferencesService.getEffectivePreferences(prisma, assignee.id, updatedTask.workspaceId);
    if (prefs.taskAssignedEmail) {
      if (prefs.emailDelayMinutes > 0) {
        await scheduleDelayed(assignee.id, assignee.email, 'TASK_ASSIGNED', {
          assigneeName: assignee.name,
          taskTitle: updatedTask.title,
          workspaceName: workspace.name,
          taskUrl: `${process.env.APP_URL}/tasks/${updatedTask.id}`,
          assignedByName: authUser.name,
        }, prefs.emailDelayMinutes * 60 * 1000);
      } else {
        await instantQueue.add('task-assigned', {
          userId: assignee.id,
          email: assignee.email,
          type: 'TASK_ASSIGNED',
          payload: {
            assigneeName: assignee.name,
            taskTitle: updatedTask.title,
            workspaceName: workspace.name,
            taskUrl: `${process.env.APP_URL}/tasks/${updatedTask.id}`,
            assignedByName: authUser.name,
          },
        });
      }
    }
  }
}
```

---

## Phase 6: Frontend

### Task 6.1: Chat Frontend Components

**Files:**
- Create: `apps/web/src/features/chat/types.ts`
- Create: `apps/web/src/features/chat/api.ts`
- Create: `apps/web/src/features/chat/hooks/useChannels.ts`
- Create: `apps/web/src/features/chat/hooks/useMessages.ts`
- Create: `apps/web/src/features/chat/hooks/useSendMessage.ts`
- Create: `apps/web/src/features/chat/hooks/useRealtimeChat.ts`
- Create: `apps/web/src/features/chat/components/ChatSidebar.tsx`
- Create: `apps/web/src/features/chat/components/ChannelItem.tsx`
- Create: `apps/web/src/features/chat/components/ChannelView.tsx`
- Create: `apps/web/src/features/chat/components/MessageBubble.tsx`
- Create: `apps/web/src/features/chat/components/ChatInput.tsx`
- Create: `apps/web/src/features/chat/index.ts`
- Create: `apps/web/src/features/chat/components/TaskChat.tsx`

**Step: Add to `ChatSidebar.tsx`** — left sidebar with:
- Workspace channel list
- `#general` channel auto-created
- Create channel button
- Selected channel highlight

**Step: Socket.IO** — `useRealtimeChat.ts`:
```typescript
import { useEffect } from 'react';
import { useNamespacedSocket } from '@/lib/socket';

export function useRealtimeChat(channelId: string | null, onMessage: (msg: unknown) => void) {
  const socket = useNamespacedSocket('/collab');
  useEffect(() => {
    if (!channelId) return;
    socket.emit('join', `channel:${channelId}`);
    socket.on('message:new', onMessage);
    return () => {
      socket.off('message:new', onMessage);
      socket.emit('leave', `channel:${channelId}`);
    };
  }, [channelId]);
}
```

---

### Task 6.2: Notification Preferences UI

**Files:**
- Create: `apps/web/src/features/notification-preferences/types.ts`
- Create: `apps/web/src/features/notification-preferences/api.ts`
- Create: `apps/web/src/features/notification-preferences/hooks/useNotificationPreferences.ts`
- Create: `apps/web/src/features/notification-preferences/components/NotificationSettingsTab.tsx`
- Create: `apps/web/src/features/notification-preferences/index.ts`

**Step: Wire into workspace settings page** — add tab "Notifications"

---

## Phase 7: Docker Compose

### Task 7.1: Email Worker in Docker Compose

**Files:**
- Modify: `docker-compose.yml` — add `email-worker` service
- Create: `docker/email-worker.Dockerfile`

**Content — `docker/email-worker.Dockerfile`:**
```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/email-worker/package.json ./apps/email-worker/
RUN npm install -g pnpm && pnpm install --frozen-lockfile

FROM base AS build
COPY . .
RUN pnpm --filter @flow-desk/email-worker build

FROM base AS runtime
COPY --from=build /app/apps/email-worker/dist/index.cjs ./
ENV NODE_ENV=production
CMD ["node", "index.cjs"]
```

**Modify `docker-compose.yml`**:
```yaml
email-worker:
  build:
    context: .
    dockerfile: docker/email-worker.Dockerfile
  environment:
    REDIS_HOST: redis
    REDIS_PORT: 6379
    SMTP_HOST: ${SMTP_HOST}
    SMTP_PORT: ${SMTP_PORT:-587}
    SMTP_USER: ${SMTP_USER}
    SMTP_PASS: ${SMTP_PASS}
    SMTP_FROM: ${SMTP_FROM:-FlowDesk <noreply@flow-desk.app>}
    RESEND_API_KEY: ${RESEND_API_KEY}
    RESEND_FROM: ${RESEND_FROM}
  depends_on:
    redis:
      condition: service_healthy
```

---

## Phase 8: Integration Tests

### Task 8.1: API Integration Tests

**Files:**
- Create: `apps/api/tests/integration/chat-channel.test.ts`
- Create: `apps/api/tests/integration/chat-message.test.ts`
- Create: `apps/api/tests/integration/notification-preferences.test.ts`
- Create: `apps/api/tests/integration/email-queue.test.ts`

**Content:** 10 tests per file covering CRUD + edge cases (soft-delete, permission enforcement, cursor pagination).

---

## Summary: Phases

| Phase | Tasks | Scope |
|-------|-------|-------|
| 1 | 1.1–1.3 | Prisma schema + shared schemas |
| 2 | 2.1–2.2 | Email provider + templates |
| 3 | 3.1–3.3 | Email worker (BullMQ) |
| 4 | 4.1–4.3 | Chat channels + messages + task chat |
| 5 | 5.1–5.2 | Notification preferences + assignment trigger |
| 6 | 6.1–6.2 | Frontend chat + preferences UI |
| 7 | 7.1 | Docker Compose email-worker |
| 8 | 8.1 | Integration tests |

**Total: 18 tasks across 8 phases.**

---

## Spec Gaps Checklist

- [x] Chat channels CRUD
- [x] Chat messages with @mentions
- [x] Realtime Socket.IO on chat events
- [x] Task-level chat via Comment.isChat
- [x] TASK_ASSIGNED → realtime notification
- [x] Email providers (nodemailer + resend)
- [x] 4 email types (instant/delayed/digest/reminder)
- [x] BullMQ queue with retry
- [x] Workspace + user notification preferences
- [x] Effective preference resolution
- [x] Docker Compose email-worker

---

## Open Questions

- **Digest timezone:** User timezone stored in User model or derived from? → Defer, use UTC for v1
- **Private channels:** Members tracked how? → Skip v1 (all workspace members can see all channels)
- **Task URL:** `APP_URL` env var needed → add to docker-compose env

