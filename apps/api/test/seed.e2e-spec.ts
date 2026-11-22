import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { compare, hash } from 'bcryptjs';

const execFileAsync = promisify(execFile);
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://taskflow:taskflow@localhost:5432/taskflow?schema=public';

describe('demo seed (e2e)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const runSeed = async (env: NodeJS.ProcessEnv) => {
    const result = await execFileAsync(
      process.execPath,
      ['../../node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'],
      {
        cwd: `${__dirname}/..`,
        env: {
          ...process.env,
          DATABASE_URL,
          SEED_USER_EMAIL: '',
          SEED_USER_PASSWORD: '',
          SEED_USER_NAME: '',
          ...env,
        },
      },
    );
    return result.stdout;
  };

  it('creates no user when the seed credentials are not supplied', async () => {
    const before = await prisma.user.count();

    const output = await runSeed({});

    expect(output).toContain('Skipping demo seed');
    expect(await prisma.user.count()).toBe(before);
  });

  it('neutralizes a legacy demo owner so the documented password stops working', async () => {
    const legacyEmail = 'demo@taskflow.local';
    const legacy = await prisma.user.findUnique({ where: { email: legacyEmail } });
    if (!legacy) {
      // Seed a legacy owner that still uses the published password.
      await prisma.user.create({
        data: {
          email: legacyEmail,
          name: 'Alex Morgan',
          passwordHash: await hash('DemoPass123!', 12),
        },
      });
    }
    const before = await prisma.user.findUnique({ where: { email: legacyEmail } });

    await runSeed({});

    const after = await prisma.user.findUnique({ where: { email: legacyEmail } });
    expect(after).not.toBeNull();
    expect(after!.passwordHash).not.toBe(before!.passwordHash);
    expect(await compare('DemoPass123!', after!.passwordHash)).toBe(false);
  });

  it('creates no user when only the email is supplied', async () => {
    const before = await prisma.user.count();

    const output = await runSeed({ SEED_USER_EMAIL: `partial-${Date.now()}@taskflow.local` });

    expect(output).toContain('Skipping demo seed');
    expect(await prisma.user.count()).toBe(before);
  });

  it('creates the demo owner when both credentials are supplied', async () => {
    const email = `opted-in-${Date.now()}@taskflow.local`;
    const password = 'OptedInPass123!';

    const output = await runSeed({ SEED_USER_EMAIL: email, SEED_USER_PASSWORD: password });

    expect(output).not.toContain('Skipping demo seed');
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe(password);
  });

  it('opts in with the legacy demo address when no such user exists yet', async () => {
    const legacyEmail = 'demo@taskflow.local';
    const password = 'FreshLegacyPass123!';

    // Reproduce a fresh database, where the legacy row does not exist. The
    // existing row may own workspaces and projects, so move it aside instead
    // of deleting it, then restore it afterwards.
    const existing = await prisma.user.findUnique({ where: { email: legacyEmail } });
    const parkedEmail = `parked-legacy-${Date.now()}@taskflow.local`;
    const seededParkedEmail = `seeded-legacy-${Date.now()}@taskflow.local`;
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { email: parkedEmail } });
    }

    try {
      // The seed must exit zero; before the fix this threw Prisma P2025 and
      // made the Compose migrate step fail, so the API and web never started.
      const output = await runSeed({
        SEED_USER_EMAIL: legacyEmail,
        SEED_USER_PASSWORD: password,
      });

      expect(output).not.toContain('Skipping demo seed');
      const user = await prisma.user.findUnique({ where: { email: legacyEmail } });
      expect(user).not.toBeNull();
      expect(await compare(password, user!.passwordHash)).toBe(true);
    } finally {
      // The seed created the legacy row, so it now occupies the legacy
      // address. Move it aside before restoring the original owner.
      const seeded = await prisma.user.findUnique({ where: { email: legacyEmail } });
      if (seeded && !existing) {
        await prisma.user.delete({ where: { id: seeded.id } });
      } else if (seeded && existing) {
        await prisma.user.update({ where: { id: seeded.id }, data: { email: seededParkedEmail } });
      }
      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { email: legacyEmail } });
      }
    }
  });

  it('stores a mixed-case seed address lowercased so the owner can sign in', async () => {
    const password = 'MixedCasePass123!';
    const local = `mixed-case-${Date.now()}`;
    const mixedCaseEmail = `Owner@${local}.Example.com`;

    const output = await runSeed({
      SEED_USER_EMAIL: mixedCaseEmail,
      SEED_USER_PASSWORD: password,
    });

    expect(output).not.toContain('Skipping demo seed');
    // Login looks the address up trimmed and lowercased, so the stored row
    // must use the same normalized form.
    const stored = await prisma.user.findUnique({ where: { email: mixedCaseEmail.toLowerCase() } });
    expect(stored).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { email: mixedCaseEmail } })).toBeNull();
    expect(await compare(password, stored!.passwordHash)).toBe(true);
  });
});
