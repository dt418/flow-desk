import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const USERS = [
  { email: 'demo@flow-desk.app', name: 'Demo User', password: 'demo1234' },
  { email: 'alice@flow-desk.app', name: 'alice', password: 'password123' },
  { email: 'bob@flow-desk.app', name: 'bob', password: 'password123' },
  { email: 'carol@flow-desk.app', name: 'carol', password: 'password123' },
  { email: 'dave@flow-desk.app', name: 'dave', password: 'password123' },
];

const TASK_TEMPLATES = [
  { title: 'Design landing page', priority: 'HIGH' as const, status: 'IN_PROGRESS' as const },
  { title: 'Implement auth flow', priority: 'URGENT' as const, status: 'DONE' as const },
  { title: 'Setup CI/CD pipeline', priority: 'MEDIUM' as const, status: 'IN_PROGRESS' as const },
  { title: 'Write API documentation', priority: 'LOW' as const, status: 'TODO' as const },
  { title: 'Add unit tests for auth module', priority: 'HIGH' as const, status: 'TODO' as const },
  { title: 'Refactor task repository', priority: 'LOW' as const, status: 'BACKLOG' as const },
  { title: 'Migrate to PostgreSQL 16', priority: 'MEDIUM' as const, status: 'DONE' as const },
  { title: 'Add real-time notifications', priority: 'HIGH' as const, status: 'IN_REVIEW' as const },
  { title: 'Improve drag-and-drop UX', priority: 'MEDIUM' as const, status: 'TODO' as const },
  { title: 'Setup error monitoring', priority: 'LOW' as const, status: 'BACKLOG' as const },
  { title: 'Optimize Prisma queries', priority: 'MEDIUM' as const, status: 'BLOCKED' as const },
  { title: 'Add keyboard shortcuts', priority: 'LOW' as const, status: 'BACKLOG' as const },
];

const COMMENT_TEMPLATES = [
  'Started looking into this, will update soon.',
  'Should we use the shared package for types?',
  'I think this can be split into subtasks for better tracking.',
  'Blocker: waiting on design review.',
  'Pushed a fix for the main issue, ready for review.',
  'Tests are passing locally, deploying to staging.',
];

async function main() {
  console.log('🌱 Seeding database…');

  // Clear existing data
  await prisma.taskDependency.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskLabel.deleteMany();
  await prisma.column.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const users = await Promise.all(
    USERS.map(async (u) =>
      prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash: await bcrypt.hash(u.password, 10),
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name)}`,
        },
      }),
    ),
  );
  console.log(`  ✓ ${users.length} users`);

  // Create demo workspace
  const demoWs = await prisma.workspace.create({
    data: {
      name: 'Demo Workspace',
      slug: 'demo',
      description: 'Sample workspace for exploring FlowDesk',
      ownerId: users[0]!.id,
      members: {
        create: users.map((u, i) => ({
          userId: u.id,
          role: i === 0 ? ('OWNER' as const) : ('MEMBER' as const),
        })),
      },
      columns: {
        create: [
          { name: 'Backlog', position: 0, isDoneColumn: false },
          { name: 'Todo', position: 1, isDoneColumn: false },
          { name: 'In Progress', position: 2, isDoneColumn: false },
          { name: 'In Review', position: 3, isDoneColumn: false },
          { name: 'Done', position: 4, isDoneColumn: true },
        ],
      },
    },
    include: { columns: { orderBy: { position: 'asc' } } },
  });
  console.log(`  ✓ workspace: ${demoWs.name}`);

  // Create a second personal workspace
  await prisma.workspace.create({
    data: {
      name: 'Personal',
      slug: `personal-${users[1]!.id.slice(-6)}`,
      description: 'Personal tasks',
      ownerId: users[1]!.id,
      members: { create: [{ userId: users[1]!.id, role: 'OWNER' as const }] },
      columns: {
        create: [
          { name: 'Backlog', position: 0, isDoneColumn: false },
          { name: 'Todo', position: 1, isDoneColumn: false },
          { name: 'In Progress', position: 2, isDoneColumn: false },
          { name: 'Done', position: 3, isDoneColumn: true },
        ],
      },
    },
  });

  // Create tasks distributed across columns
  const statusToColName: Record<string, string> = {
    BACKLOG: 'Backlog',
    TODO: 'Todo',
    IN_PROGRESS: 'In Progress',
    IN_REVIEW: 'In Review',
    DONE: 'Done',
    BLOCKED: 'In Progress',
  };
  const columnByName = new Map(demoWs.columns.map((c) => [c.name, c]));

  const tasks: Array<{ id: string; title: string; status: string }> = [];
  for (let i = 0; i < TASK_TEMPLATES.length * 2; i++) {
    const tpl = TASK_TEMPLATES[i % TASK_TEMPLATES.length]!;
    const assignee = users[i % users.length]!;
    const col = columnByName.get(statusToColName[tpl.status]!)!;
    const due = i % 3 === 0 ? new Date(Date.now() + (i + 1) * 24 * 60 * 60 * 1000) : null;

    const task = await prisma.task.create({
      data: {
        workspaceId: demoWs.id,
        columnId: col.id,
        title: `${tpl.title} #${Math.floor(i / TASK_TEMPLATES.length) + 1}`,
        description: `Task description for ${tpl.title}. Lorem ipsum dolor sit amet.`,
        priority: tpl.priority,
        status: tpl.status,
        assigneeId: assignee.id,
        createdById: users[0]!.id,
        dueDate: due,
        position: i,
        labels:
          i % 4 === 0
            ? ['frontend']
            : i % 4 === 1
              ? ['backend']
              : i % 4 === 2
                ? ['design']
                : ['devops'],
        ...(tpl.status === 'DONE' ? { completedAt: new Date() } : {}),
      },
    });
    tasks.push({ id: task.id, title: task.title, status: task.status });
  }
  console.log(`  ✓ ${tasks.length} tasks`);

  // Add some subtasks
  for (let i = 0; i < 5; i++) {
    const parent = tasks[i]!;
    const col = demoWs.columns[1]!;
    await prisma.task.create({
      data: {
        workspaceId: demoWs.id,
        columnId: col.id,
        parentTaskId: parent.id,
        title: `Subtask: ${parent.title}`,
        createdById: users[0]!.id,
        priority: 'LOW',
        status: 'TODO',
        position: 0,
      },
    });
  }
  console.log(`  ✓ 5 subtasks`);

  // Add a few dependencies
  for (let i = 0; i < 4; i++) {
    const blocker = tasks[i]!;
    const blocked = tasks[i + 6]!;
    if (blocker.id !== blocked.id) {
      try {
        await prisma.taskDependency.create({
          data: { blockingTaskId: blocker.id, blockedTaskId: blocked.id },
        });
      } catch {
        // ignore unique constraint
      }
    }
  }
  console.log(`  ✓ dependencies`);

  // Add comments
  let commentCount = 0;
  for (const t of tasks.slice(0, 15)) {
    for (let j = 0; j < 2; j++) {
      await prisma.comment.create({
        data: {
          taskId: t.id,
          authorId: users[(commentCount + j) % users.length]!.id,
          content: COMMENT_TEMPLATES[(commentCount + j) % COMMENT_TEMPLATES.length]!,
          mentionedUserIds: j % 2 === 0 ? [users[(commentCount + 1) % users.length]!.id] : [],
        },
      });
      commentCount++;
    }
  }
  console.log(`  ✓ ${commentCount} comments`);

  // Add some notifications for the demo user
  for (let i = 0; i < 5; i++) {
    await prisma.notification.create({
      data: {
        userId: users[0]!.id,
        type: i % 2 === 0 ? 'TASK_ASSIGNED' : 'COMMENT_REPLY',
        title: i % 2 === 0 ? 'You were assigned a task' : 'You were mentioned in a comment',
        body: `Sample notification #${i + 1}`,
        data: { taskId: tasks[i]?.id },
        ...(i > 1 ? { readAt: new Date() } : {}),
      },
    });
  }
  console.log(`  ✓ notifications`);

  console.log('✅ Seed complete. Login: demo@flow-desk.app / demo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
