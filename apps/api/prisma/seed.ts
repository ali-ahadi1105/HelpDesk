import { PrismaClient, Role, TaskPriority, TaskStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const LEGACY_DEMO_EMAIL = 'demo@taskflow.local';

/**
 * Rotates the credential of a demo owner created by an earlier release so the
 * documented password can never be used again, and revokes its live sessions.
 */
async function neutralizeLegacyDemoOwner(): Promise<void> {
  const legacy = await prisma.user.findUnique({ where: { email: LEGACY_DEMO_EMAIL } });
  if (!legacy) return;

  await prisma.user.update({
    where: { id: legacy.id },
    data: { passwordHash: await hash(randomBytes(32).toString('hex'), 12) },
  });
  await prisma.refreshToken.updateMany({
    where: { userId: legacy.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  console.log(`Rotated the legacy demo owner credential for ${LEGACY_DEMO_EMAIL}.`);
}

async function main(): Promise<void> {
  const email = process.env.SEED_USER_EMAIL?.trim();
  const password = process.env.SEED_USER_PASSWORD;

  // The demo owner is opt-in: seeding one by default would publish a known
  // credential on every deployment. Both variables must be supplied to run it.
  if (!email || !password) {
    await neutralizeLegacyDemoOwner();
    console.log(
      'Skipping demo seed: set SEED_USER_EMAIL and SEED_USER_PASSWORD to create a demo owner.',
    );
    return;
  }

  if (email.toLowerCase() === LEGACY_DEMO_EMAIL) {
    // The operator explicitly claimed the legacy address, so apply their password.
    await prisma.user.update({
      where: { email: LEGACY_DEMO_EMAIL },
      data: { passwordHash: await hash(password, 12) },
    });
  } else {
    await neutralizeLegacyDemoOwner();
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: process.env.SEED_USER_NAME ?? 'Alex Morgan',
      passwordHash: await hash(password, 12),
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'taskflow-demo' },
    update: {},
    create: {
      name: 'TaskFlow Demo',
      slug: 'taskflow-demo',
      description: 'A real workspace populated with example project work.',
      createdById: user.id,
    },
  });

  await prisma.membership.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: Role.OWNER },
    create: { workspaceId: workspace.id, userId: user.id, role: Role.OWNER },
  });

  const existingProject = await prisma.project.findFirst({
    where: { workspaceId: workspace.id, name: 'Website redesign' },
  });
  if (existingProject) return;

  const project = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      createdById: user.id,
      name: 'Website redesign',
      description: 'Plan and deliver the new marketing site.',
      color: '#6d5dfc',
      columns: {
        create: [
          { title: 'Todo', status: TaskStatus.TODO, color: '#8b95a7', position: 1 },
          { title: 'In Progress', status: TaskStatus.IN_PROGRESS, color: '#f59e0b', position: 2 },
          { title: 'Done', status: TaskStatus.DONE, color: '#22c55e', position: 3 },
        ],
      },
    },
    include: { columns: true },
  });

  const todo = project.columns.find((column) => column.status === TaskStatus.TODO)!;
  const doing = project.columns.find((column) => column.status === TaskStatus.IN_PROGRESS)!;
  const done = project.columns.find((column) => column.status === TaskStatus.DONE)!;

  await prisma.task.createMany({
    data: [
      {
        projectId: project.id,
        columnId: todo.id,
        createdById: user.id,
        title: 'Map the new customer journey',
        description: 'Document the key screens and conversion points.',
        priority: TaskPriority.HIGH,
        status: TaskStatus.TODO,
        position: 1,
        dueDate: new Date(Date.now() + 3 * 86400000),
      },
      {
        projectId: project.id,
        columnId: doing.id,
        createdById: user.id,
        assigneeId: user.id,
        title: 'Design the onboarding flow',
        description: 'Create the first-run experience and welcome screens.',
        priority: TaskPriority.URGENT,
        status: TaskStatus.IN_PROGRESS,
        position: 1,
        dueDate: new Date(Date.now() + 86400000),
      },
      {
        projectId: project.id,
        columnId: done.id,
        createdById: user.id,
        assigneeId: user.id,
        title: 'Approve the visual direction',
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.DONE,
        position: 1,
        completedAt: new Date(),
      },
    ],
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
