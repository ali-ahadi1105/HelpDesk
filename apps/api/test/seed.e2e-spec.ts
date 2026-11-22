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
});
