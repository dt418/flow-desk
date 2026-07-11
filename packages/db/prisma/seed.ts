/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/client';

import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const USERS = [
  { email: 'demo@flow-desk.app', name: 'Demo User', role: 'OWNER' as const },
  { email: 'alice@flow-desk.app', name: 'Alice Chen', role: 'MEMBER' as const },
  { email: 'bob@flow-desk.app', name: 'Bob Martinez', role: 'MEMBER' as const },
  { email: 'carol@flow-desk.app', name: 'Carol Nguyen', role: 'ADMIN' as const },
  { email: 'dave@flow-desk.app', name: 'Dave Patel', role: 'MEMBER' as const },
  { email: 'eve@flow-desk.app', name: 'Eve Johansson', role: 'MEMBER' as const },
  { email: 'frank@flow-desk.app', name: 'Frank Okafor', role: 'GUEST' as const },
  { email: 'grace@flow-desk.app', name: 'Grace Liu', role: 'MEMBER' as const },
  { email: 'henry@flow-desk.app', name: 'Henry Müller', role: 'MEMBER' as const },
  { email: 'ivy@flow-desk.app', name: 'Ivy Ramirez', role: 'ADMIN' as const },
  { email: 'jack@flow-desk.app', name: 'Jack Thompson', role: 'MEMBER' as const },
  { email: 'kara@flow-desk.app', name: 'Kara Singh', role: 'MEMBER' as const },
  { email: 'leo@flow-desk.app', name: 'Leo Becker', role: 'GUEST' as const },
  { email: 'mia@flow-desk.app', name: 'Mia Andersen', role: 'MEMBER' as const },
  { email: 'noah@flow-desk.app', name: 'Noah Kim', role: 'MEMBER' as const },
];

const WORKSPACES: Array<{
  name: string;
  slug: string;
  description: string;
  ownerIdx: number;
  columns: string[];
  members: Array<{ userIdx: number; role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST' }>;
  labels: Array<{ name: string; color: string }>;
}> = [
  {
    name: 'Demo Workspace',
    slug: 'demo',
    description:
      'Sample workspace for exploring FlowDesk — covers product, design, and engineering',
    ownerIdx: 0,
    columns: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done'],
    members: [
      { userIdx: 0, role: 'OWNER' },
      { userIdx: 1, role: 'ADMIN' },
      { userIdx: 2, role: 'MEMBER' },
      { userIdx: 3, role: 'MEMBER' },
      { userIdx: 4, role: 'MEMBER' },
      { userIdx: 5, role: 'MEMBER' },
      { userIdx: 6, role: 'GUEST' },
    ],
    labels: [
      { name: 'frontend', color: 'blue' },
      { name: 'backend', color: 'green' },
      { name: 'design', color: 'purple' },
      { name: 'devops', color: 'orange' },
      { name: 'bug', color: 'red' },
      { name: 'docs', color: 'yellow' },
      { name: 'urgent', color: 'pink' },
    ],
  },
  {
    name: 'Personal',
    slug: 'personal-alice',
    description: 'Alice personal task tracker',
    ownerIdx: 1,
    columns: ['Backlog', 'Todo', 'In Progress', 'Done'],
    members: [{ userIdx: 1, role: 'OWNER' }],
    labels: [
      { name: 'home', color: 'green' },
      { name: 'errand', color: 'yellow' },
      { name: 'learning', color: 'blue' },
    ],
  },
  {
    name: 'Mobile App v2',
    slug: 'mobile-v2',
    description: 'Native iOS + Android rewrite of the customer app',
    ownerIdx: 3,
    columns: ['Backlog', 'Todo', 'In Progress', 'In Review', 'Done'],
    members: [
      { userIdx: 3, role: 'OWNER' },
      { userIdx: 1, role: 'ADMIN' },
      { userIdx: 2, role: 'MEMBER' },
      { userIdx: 7, role: 'MEMBER' },
      { userIdx: 8, role: 'MEMBER' },
      { userIdx: 13, role: 'MEMBER' },
    ],
    labels: [
      { name: 'ios', color: 'blue' },
      { name: 'android', color: 'green' },
      { name: 'design', color: 'purple' },
      { name: 'api', color: 'orange' },
      { name: 'p0', color: 'red' },
    ],
  },
  {
    name: 'Q3 Marketing Campaign',
    slug: 'q3-marketing',
    description: 'Cross-functional launch for Q3 product release',
    ownerIdx: 9,
    columns: ['Ideas', 'Planning', 'In Progress', 'Shipped'],
    members: [
      { userIdx: 9, role: 'OWNER' },
      { userIdx: 4, role: 'ADMIN' },
      { userIdx: 5, role: 'MEMBER' },
      { userIdx: 10, role: 'MEMBER' },
      { userIdx: 11, role: 'MEMBER' },
    ],
    labels: [
      { name: 'social', color: 'pink' },
      { name: 'email', color: 'blue' },
      { name: 'blog', color: 'purple' },
      { name: 'launch', color: 'red' },
    ],
  },
  {
    name: 'Infrastructure',
    slug: 'infra',
    description: 'Backend infra, monitoring, and deployment automation',
    ownerIdx: 12,
    columns: ['Backlog', 'Todo', 'In Progress', 'Done'],
    members: [
      { userIdx: 12, role: 'OWNER' },
      { userIdx: 14, role: 'ADMIN' },
      { userIdx: 2, role: 'MEMBER' },
      { userIdx: 6, role: 'GUEST' },
    ],
    labels: [
      { name: 'kubernetes', color: 'blue' },
      { name: 'observability', color: 'purple' },
      { name: 'security', color: 'red' },
      { name: 'cost', color: 'yellow' },
    ],
  },
  {
    name: 'Customer Success',
    slug: 'customer-success',
    description: 'Onboarding, support tooling, and customer feedback',
    ownerIdx: 11,
    columns: ['Triage', 'In Progress', 'Awaiting Reply', 'Resolved'],
    members: [
      { userIdx: 11, role: 'OWNER' },
      { userIdx: 5, role: 'MEMBER' },
      { userIdx: 7, role: 'MEMBER' },
    ],
    labels: [
      { name: 'bug', color: 'red' },
      { name: 'feature-request', color: 'blue' },
      { name: 'onboarding', color: 'green' },
    ],
  },
];

const TASK_TITLES: Array<{
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED';
}> = [
  { title: 'Design landing page', priority: 'HIGH', status: 'IN_PROGRESS' },
  { title: 'Implement auth flow', priority: 'URGENT', status: 'DONE' },
  { title: 'Setup CI/CD pipeline', priority: 'MEDIUM', status: 'IN_PROGRESS' },
  { title: 'Write API documentation', priority: 'LOW', status: 'TODO' },
  { title: 'Add unit tests for auth module', priority: 'HIGH', status: 'TODO' },
  { title: 'Refactor task repository', priority: 'LOW', status: 'BACKLOG' },
  { title: 'Migrate to PostgreSQL 16', priority: 'MEDIUM', status: 'DONE' },
  { title: 'Add real-time notifications', priority: 'HIGH', status: 'IN_REVIEW' },
  { title: 'Improve drag-and-drop UX', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Setup error monitoring', priority: 'LOW', status: 'BACKLOG' },
  { title: 'Optimize Prisma queries', priority: 'MEDIUM', status: 'BLOCKED' },
  { title: 'Add keyboard shortcuts', priority: 'LOW', status: 'BACKLOG' },
  { title: 'Review Q3 roadmap with stakeholders', priority: 'HIGH', status: 'IN_PROGRESS' },
  { title: 'Write release notes for v2.4', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Investigate p95 latency spike', priority: 'URGENT', status: 'IN_PROGRESS' },
  { title: 'Migrate auth to refresh-token rotation', priority: 'HIGH', status: 'IN_REVIEW' },
  { title: 'Add export to CSV feature', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Polish onboarding wizard copy', priority: 'LOW', status: 'BACKLOG' },
  { title: 'Set up A/B test framework', priority: 'MEDIUM', status: 'IN_PROGRESS' },
  { title: 'Audit S3 bucket policies', priority: 'HIGH', status: 'TODO' },
  { title: 'Reduce docker image size by 30%', priority: 'LOW', status: 'BACKLOG' },
  { title: 'Implement search across workspace', priority: 'HIGH', status: 'IN_PROGRESS' },
  { title: 'Add multi-language support to emails', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Document deployment runbook', priority: 'LOW', status: 'BACKLOG' },
  { title: 'Add rate limiting per workspace', priority: 'HIGH', status: 'DONE' },
  { title: 'Migrate legacy cron jobs to BullMQ', priority: 'MEDIUM', status: 'IN_PROGRESS' },
  { title: 'Build admin dashboard', priority: 'MEDIUM', status: 'BACKLOG' },
  { title: 'Add webhook delivery retry policy', priority: 'HIGH', status: 'IN_REVIEW' },
  { title: 'Customer interview: design teams', priority: 'MEDIUM', status: 'DONE' },
  { title: 'Roll out feature flag system', priority: 'HIGH', status: 'IN_PROGRESS' },
  { title: 'Write postmortem for June 12 outage', priority: 'URGENT', status: 'DONE' },
  { title: 'Reduce bundle size on /board page', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Add keyboard nav to kanban', priority: 'LOW', status: 'BACKLOG' },
  { title: 'Migrate from Yarn to pnpm', priority: 'LOW', status: 'DONE' },
  { title: 'Quarterly OKR review', priority: 'HIGH', status: 'IN_PROGRESS' },
  { title: 'Set up Sentry for FE error tracking', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Add audit log to admin actions', priority: 'HIGH', status: 'IN_REVIEW' },
  { title: 'Decommission old staging cluster', priority: 'LOW', status: 'BLOCKED' },
  { title: 'Customer success playbook v3', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Design new empty states', priority: 'LOW', status: 'BACKLOG' },
  { title: 'Implement SSO for enterprise tier', priority: 'URGENT', status: 'IN_PROGRESS' },
  { title: 'Fix flaky E2E test in checkout flow', priority: 'HIGH', status: 'TODO' },
  { title: 'Migrate email templates to React Email', priority: 'MEDIUM', status: 'IN_REVIEW' },
  { title: 'Add Slack integration', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Write RFC: realtime architecture v2', priority: 'HIGH', status: 'IN_PROGRESS' },
  { title: 'Quarterly security review', priority: 'URGENT', status: 'TODO' },
  { title: 'Reduce cold-start time on lambdas', priority: 'MEDIUM', status: 'BACKLOG' },
  { title: 'Add CSV import for bulk task creation', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Implement comment threading', priority: 'LOW', status: 'BACKLOG' },
  {
    title: 'Bug: notifications duplicated on reconnect',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
  },
  { title: 'Refactor billing module', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Add per-workspace data retention policy', priority: 'HIGH', status: 'IN_REVIEW' },
  { title: 'Write engineering blog: scaling websockets', priority: 'LOW', status: 'BACKLOG' },
  { title: 'Migrate from REST to tRPC for internal APIs', priority: 'MEDIUM', status: 'TODO' },
  { title: 'Onboard 5 new engineers', priority: 'HIGH', status: 'IN_PROGRESS' },
  { title: 'Hire senior frontend engineer', priority: 'URGENT', status: 'IN_PROGRESS' },
  { title: 'Plan 2027 company offsite', priority: 'LOW', status: 'BACKLOG' },
  { title: 'GDPR compliance audit', priority: 'URGENT', status: 'TODO' },
  { title: 'Migrate Postgres to managed service', priority: 'HIGH', status: 'IN_REVIEW' },
  { title: 'Reduce SaaS spend by 20%', priority: 'MEDIUM', status: 'IN_PROGRESS' },
  { title: 'Set up design system Figma library', priority: 'LOW', status: 'DONE' },
  { title: 'Refactor onboarding flow', priority: 'MEDIUM', status: 'TODO' },
];

const COMMENT_TEMPLATES = [
  'Started looking into this, will update soon.',
  'Should we use the shared package for types here?',
  'I think this can be split into subtasks for better tracking.',
  'Blocker: waiting on design review from @user.',
  'Pushed a fix for the main issue, ready for review.',
  'Tests are passing locally, deploying to staging.',
  'Nice work on the architecture! One nit on the naming.',
  'Could we get this in front of a customer before EOW?',
  'I added a follow-up task for the migration script.',
  'Let me know if you need a pairing session on this.',
  'Reproduced on my end — looks like a race in the socket handler.',
  'Approved! Merging now.',
  'Heads up: this might break the legacy import endpoint.',
  'I left a few inline comments on the PR, mostly nitpicks.',
  'Tracking in the incident doc — pinging @user to take a look.',
  'Closing in favor of the new approach in #TASK.',
  'Updated with the agreed approach. PTAL @user.',
];

const NOTIFICATION_TEMPLATES = [
  {
    type: 'TASK_ASSIGNED',
    title: 'You were assigned a task',
    body: 'Open the task to view details',
  },
  {
    type: 'COMMENT_REPLY',
    title: 'New comment on your task',
    body: 'A teammate replied to your comment',
  },
  {
    type: 'TASK_MENTIONED',
    title: 'You were mentioned',
    body: 'Someone mentioned you in a comment',
  },
  { type: 'TASK_DUE_SOON', title: 'Task due tomorrow', body: 'A task assigned to you is due soon' },
  { type: 'TASK_COMPLETED', title: 'Task marked done', body: 'A task you watch was completed' },
  {
    type: 'WORKSPACE_INVITE',
    title: 'Added to a workspace',
    body: 'You have been added to a new workspace',
  },
] as const;

function pickFrom<T>(arr: readonly T[], idx: number): T {
  return arr[idx % arr.length]!;
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log('🌱 Seeding database with realistic data…');

  // Clear existing data (order matters for FK constraints)
  await prisma.taskLabelAssignment.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskLabel.deleteMany();
  await prisma.column.deleteMany();
  // P4-3 integrations have FK to Workspace via Cascade — safe to wipe before Workspace
  await prisma.integration.deleteMany();
  // Chat + notification settings have FK to Workspace without onDelete: Cascade
  await prisma.chatMessage.deleteMany();
  await prisma.chatChannel.deleteMany();
  await prisma.userNotificationPreference.deleteMany();
  await prisma.workspaceNotificationSetting.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.emailJob.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // --- Users ---
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const altHash = await bcrypt.hash('password123', 10);
  const users = await Promise.all(
    USERS.map((u, i) =>
      prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash: i === 0 ? passwordHash : altHash,
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name)}`,
        },
      }),
    ),
  );
  console.log(`  ✓ ${users.length} users`);

  // --- Workspaces + columns + members + labels ---
  const allWorkspaces: Array<{
    id: string;
    name: string;
    columns: Array<{ id: string; name: string; isDoneColumn: boolean }>;
    memberIds: number[];
    ownerIdx: number;
  }> = [];

  for (const ws of WORKSPACES) {
    const owner = users[ws.ownerIdx]!;
    const created = await prisma.workspace.create({
      data: {
        name: ws.name,
        slug: `${ws.slug}-${owner.id.slice(-6)}`,
        description: ws.description,
        ownerId: owner.id,
        members: {
          create: ws.members.map((m) => ({
            user: { connect: { id: users[m.userIdx]!.id } },
            role: m.role,
          })),
        },
        columns: {
          create: ws.columns.map((name, i) => ({
            name,
            position: i,
            isDoneColumn: i === ws.columns.length - 1,
          })),
        },
      },
    });
    const createdColumns = await prisma.column.findMany({
      where: { workspaceId: created.id },
      orderBy: { position: 'asc' },
      select: { id: true, name: true, isDoneColumn: true },
    });
    allWorkspaces.push({
      id: created.id,
      name: created.name,
      columns: createdColumns,
      memberIds: ws.members.map((m) => m.userIdx),
      ownerIdx: ws.ownerIdx,
    });

    // Labels per workspace
    for (const lbl of ws.labels) {
      await prisma.taskLabel.create({
        data: {
          workspaceId: created.id,
          name: lbl.name,
          color: lbl.color,
        },
      });
    }
    console.log(
      `  ✓ ${ws.name} (${ws.members.length} members, ${ws.columns.length} cols, ${ws.labels.length} labels)`,
    );
  }

  // --- Tasks (distributed across workspaces, columns, statuses) ---
  const statusToColName: Record<string, string> = {
    BACKLOG: 'Backlog',
    TODO: 'Todo',
    IN_PROGRESS: 'In Progress',
    IN_REVIEW: 'In Review',
    DONE: 'Done',
    BLOCKED: 'In Progress',
  };

  const allTasks: Array<{
    id: string;
    workspaceId: string;
    title: string;
    status: string;
    columnId: string;
    assigneeId: string | null;
  }> = [];
  let taskCounter = 0;

  for (const ws of allWorkspaces) {
    const colByName = new Map(ws.columns.map((c) => [c.name, c]));
    const labels = await prisma.taskLabel.findMany({ where: { workspaceId: ws.id } });
    const wsMemberIds = ws.memberIds.map((i) => users[i]!.id);

    // 18-25 tasks per workspace, distributed
    const taskCount = 18 + (ws.name.length % 8);
    for (let i = 0; i < taskCount; i++) {
      const tpl = pickFrom(TASK_TITLES, taskCounter);
      const targetColName = statusToColName[tpl.status] ?? 'Todo';
      const col = colByName.get(targetColName);
      if (!col) continue;

      const assigneeId = i % 3 === 0 ? null : pickFrom(wsMemberIds, taskCounter + i);
      const due = (() => {
        const r = taskCounter % 7;
        if (r === 0) return daysFromNow(-2 - (i % 5));
        if (r === 1) return daysFromNow(0);
        if (r === 2) return daysFromNow(1);
        if (r === 3) return daysFromNow(7 + (i % 14));
        return null;
      })();

      // Assign 0-2 labels to this task
      const taskLabels =
        i % 2 === 0 && labels.length > 0
          ? [
              pickFrom(labels, taskCounter).id,
              i % 4 === 0 && labels.length > 1 ? pickFrom(labels, taskCounter + 1).id : null,
            ].filter((x): x is string => Boolean(x))
          : [];
      const labelsDeprecated = taskLabels
        .map((id) => labels.find((l) => l.id === id))
        .filter((l): l is NonNullable<typeof l> => Boolean(l))
        .map((l) => l.name);

      const created = await prisma.task.create({
        data: {
          workspaceId: ws.id,
          columnId: col.id,
          title: tpl.title,
          description: `${tpl.title} — see acceptance criteria in linked PRD. Use shared package for types where possible.`,
          priority: tpl.priority,
          status: tpl.status,
          assigneeId,
          createdById: users[ws.ownerIdx]!.id,
          dueDate: due,
          position: i,
          labelsDeprecated: labelsDeprecated,
          version: 0,
          ...(tpl.status === 'DONE' ? { completedAt: daysFromNow(-1 * (1 + (i % 5))) } : {}),
        },
      });
      allTasks.push({
        id: created.id,
        workspaceId: ws.id,
        title: created.title,
        status: created.status,
        columnId: created.columnId,
        assigneeId: created.assigneeId,
      });

      // Persist label assignments
      for (const labelId of taskLabels) {
        await prisma.taskLabelAssignment.create({
          data: { taskId: created.id, labelId },
        });
      }
      taskCounter++;
    }
  }
  console.log(`  ✓ ${allTasks.length} tasks across ${allWorkspaces.length} workspaces`);

  // --- Subtasks (a few per major workspace) ---
  let subtaskCount = 0;
  for (const t of allTasks.slice(0, 30)) {
    const subtaskTitles = ['Spec out requirements', 'Write tests', 'Code review', 'Update docs'];
    for (let i = 0; i < 1 + (subtaskCount % 2); i++) {
      const parentCol = await prisma.column.findUnique({ where: { id: t.columnId } });
      if (!parentCol) continue;
      await prisma.task.create({
        data: {
          workspaceId: t.workspaceId,
          columnId: t.columnId,
          parentTaskId: t.id,
          title: `Subtask: ${pickFrom(subtaskTitles, subtaskCount + i)}`,
          createdById: users[0]!.id,
          priority: 'LOW',
          status: 'TODO',
          position: subtaskCount,
          version: 0,
        },
      });
      subtaskCount++;
    }
  }
  console.log(`  ✓ ${subtaskCount} subtasks`);

  // --- Dependencies ---
  let depCount = 0;
  for (let i = 0; i < Math.min(40, allTasks.length - 1); i += 3) {
    const blocker = allTasks[i]!;
    const blocked = allTasks[i + 1]!;
    if (blocker.workspaceId !== blocked.workspaceId) continue;
    try {
      await prisma.taskDependency.create({
        data: { blockingTaskId: blocker.id, blockedTaskId: blocked.id },
      });
      depCount++;
    } catch {
      // skip unique violation
    }
  }
  console.log(`  ✓ ${depCount} task dependencies`);

  // --- Comments (with @mentions) ---
  let commentCount = 0;
  for (const t of allTasks.slice(0, 80)) {
    const numComments = 1 + (commentCount % 4);
    for (let j = 0; j < numComments; j++) {
      const author = pickFrom(users, commentCount);
      const mentionedIdx = (commentCount + 1) % users.length;
      const mentioned = users[mentionedIdx]!;
      await prisma.comment.create({
        data: {
          taskId: t.id,
          authorId: author.id,
          content: pickFrom(COMMENT_TEMPLATES, commentCount).replace(
            '@user',
            `@${mentioned.name.split(' ')[0]}`,
          ),
          mentionedUserIds: j % 2 === 0 ? [mentioned.id] : [],
        },
      });
      commentCount++;
    }
  }
  console.log(`  ✓ ${commentCount} comments (with mentions)`);

  // --- Notifications (mix of read/unread, per user) ---
  let notifCount = 0;
  for (const u of users) {
    const userTasks = allTasks.filter((t) => t.assigneeId === u.id);
    for (let i = 0; i < 8; i++) {
      const tpl = pickFrom(NOTIFICATION_TEMPLATES, notifCount);
      const ref =
        userTasks[i % Math.max(1, userTasks.length)] ?? allTasks[notifCount % allTasks.length]!;
      await prisma.notification.create({
        data: {
          userId: u.id,
          type: tpl.type,
          title: tpl.title,
          body: `${tpl.body} — ${ref.title}`,
          data: { taskId: ref.id, workspaceId: ref.workspaceId } as Prisma.InputJsonValue,
          readAt: i > 4 ? daysFromNow(-1 * (1 + (i % 5))) : null,
        },
      });
      notifCount++;
    }
  }
  console.log(`  ✓ ${notifCount} notifications`);

  // --- Attachments (small placeholders) ---
  let attachCount = 0;
  for (const t of allTasks.slice(0, 25)) {
    if (t.assigneeId) {
      await prisma.attachment.create({
        data: {
          taskId: t.id,
          uploadedById: t.assigneeId,
          filename: `${t.title.toLowerCase().replace(/\s+/g, '-')}.png`,
          mimeType: 'image/png',
          size: 1024 * (50 + attachCount * 17),
          type: 'IMAGE',
          storagePath: `/data/attachments/seed-${attachCount}.png`,
        },
      });
      attachCount++;
    }
  }
  console.log(`  ✓ ${attachCount} attachments`);

  console.log('\n✅ Seed complete.');
  console.log('   Login as demo@flow-desk.app / demo1234');
  console.log('   Other users: alice@... bob@... carol@... etc. — password: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
