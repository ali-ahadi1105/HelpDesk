import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://taskflow:taskflow@localhost:5432/taskflow?schema=public';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

describe('TaskFlow API (e2e)', () => {
  let app: INestApplication;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const owner = { name: 'E2E Owner', email: `owner-${suffix}@taskflow.local`, password: 'OwnerPass123!' };
  const outsider = {
    name: 'E2E Outsider',
    email: `outsider-${suffix}@taskflow.local`,
    password: 'OutsiderPass123!',
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.REDIS_URL = REDIS_URL;
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'e2e-access-secret-at-least-32-characters';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'e2e-refresh-secret-at-least-32-characters';

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const register = async (user: { name: string; email: string; password: string }) => {
    const response = await request(app.getHttpServer()).post('/auth/register').send(user).expect(201);
    return {
      accessToken: response.body.accessToken as string,
      refreshCookie: (response.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? '',
    };
  };

  it('issues a session and rotates refresh tokens', async () => {
    const session = await register(owner);
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshCookie).toBeDefined();

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(200);
    expect(rotated.body.accessToken).toBeTruthy();
    expect(rotated.body.user.email).toBe(owner.email);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', session.refreshCookie)
      .expect(401);
  });

  it('keeps workspace resources isolated between members', async () => {
    const ownerSession = await register({
      name: owner.name,
      email: `isolation-owner-${suffix}@taskflow.local`,
      password: owner.password,
    });
    const outsiderSession = await register({
      name: outsider.name,
      email: `isolation-outsider-${suffix}@taskflow.local`,
      password: outsider.password,
    });

    const workspace = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .send({ name: 'E2E Workspace', description: 'Workspace isolation coverage' })
      .expect(201);
    const workspaceId = workspace.body.id as string;

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${ownerSession.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${outsiderSession.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/dashboard`)
      .set('Authorization', `Bearer ${outsiderSession.accessToken}`)
      .expect(403);
  });

  it('prevents granting the owner role through invitations or role updates', async () => {
    const session = await register({
      name: owner.name,
      email: `roles-owner-${suffix}@taskflow.local`,
      password: owner.password,
    });
    const workspace = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'E2E Role Workspace' })
      .expect(201);
    const workspaceId = workspace.body.id as string;

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ email: `invitee-${suffix}@taskflow.local`, role: 'OWNER' })
      .expect(400);

    const membership = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const ownerMembership = (membership.body.memberships as { id: string; role: string }[])[0];
    expect(ownerMembership).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/workspaces/${workspaceId}/members/${ownerMembership!.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ role: 'OWNER' })
      .expect(400);
  });

  it('creates a board and manages tasks within the workspace', async () => {
    const session = await register({
      name: owner.name,
      email: `board-owner-${suffix}@taskflow.local`,
      password: owner.password,
    });
    const workspace = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'E2E Board Workspace' })
      .expect(201);
    const workspaceId = workspace.body.id as string;

    const project = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'E2E Project', color: '#336699' })
      .expect(201);
    const projectId = project.body.id as string;
    const todoColumn = (project.body.columns as { id: string; status: string }[]).find(
      (column) => column.status === 'TODO',
    );
    expect(todoColumn).toBeDefined();

    const task = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ title: 'E2E task', columnId: todoColumn!.id, priority: 'HIGH' })
      .expect(201);
    expect(task.body.status).toBe('TODO');

    const board = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/projects/${projectId}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);
    const boardTask = (board.body.columns as { tasks: { id: string }[] }[])
      .flatMap((column) => column.tasks)
      .find((candidate) => candidate.id === task.body.id);
    expect(boardTask).toBeDefined();

    await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/tasks/${task.body.id}/comments`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ body: 'E2E comment' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/workspaces/${workspaceId}/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(404);
  });
});
